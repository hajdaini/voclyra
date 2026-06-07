import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@shared/defaults';

const clipboardState = vi.hoisted(() => ({ text: '' }));
const shortcuts = vi.hoisted(() => ({
  registered: [] as string[],
  blocked: new Set<string>(),
  unregisterAllCalls: 0,
}));
const fsState = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  sizes: new Map<string, number>(),
  entries: new Map<string, string[]>(),
}));
const spawnState = vi.hoisted(() => ({
  calls: [] as { command: string; args: string[] }[],
  nvidiaMode: 'ok' as 'ok' | 'missing' | 'timeout',
}));

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();

  kill(): void {}
}

const nvidiaSummary = [
  'Sun Jun  7 12:18:13 2026',
  '+-----------------------------------------------------------------------------------------+',
  '| NVIDIA-SMI 591.86                 Driver Version: 591.86         CUDA Version: 13.1     |',
  '+-----------------------------------------------------------------------------------------+',
  '|   0  NVIDIA GeForce RTX 5060 Ti   WDDM  |   00000000:07:00.0  On |                  N/A |',
  '|  0%   40C    P8              4W /  180W |    1062MiB /  16311MiB |      0%      Default |',
  '+-----------------------------------------------------------------------------------------+',
].join('\n');

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => 'C:\\project\\voclyra'),
  },
  clipboard: {
    readText: vi.fn(() => clipboardState.text),
    writeText: vi.fn((text: string) => {
      clipboardState.text = text;
    }),
  },
  globalShortcut: {
    register: vi.fn((accelerator: string) => {
      shortcuts.registered.push(accelerator);
      return !shortcuts.blocked.has(accelerator);
    }),
    unregisterAll: vi.fn(() => {
      shortcuts.unregisterAllCalls += 1;
      shortcuts.registered = [];
    }),
  },
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => 'C:\\test-user'),
  cpus: vi.fn(() => Array.from({ length: 16 }, () => ({ model: 'AMD Ryzen 7 5800X 8-Core Processor' }))),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((path: string) => fsState.files.has(path)),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async (path: string) => {
    if (!fsState.files.has(path)) {
      throw new Error('missing');
    }
  }),
  appendFile: vi.fn(async (path: string, value: string) => {
    fsState.files.set(path, `${fsState.files.get(path) ?? ''}${value}`);
    fsState.sizes.set(path, Buffer.byteLength(fsState.files.get(path) ?? '', 'utf8'));
  }),
  mkdir: vi.fn(async (path: string) => {
    fsState.dirs.add(path);
  }),
  readFile: vi.fn(async (path: string) => fsState.files.get(path) ?? ''),
  readdir: vi.fn(async (path: string) => fsState.entries.get(path) ?? []),
  rename: vi.fn(async (from: string, to: string) => {
    const value = fsState.files.get(from) ?? '';
    fsState.files.delete(from);
    fsState.files.set(to, value);
    fsState.sizes.set(to, fsState.sizes.get(from) ?? Buffer.byteLength(value, 'utf8'));
    fsState.sizes.delete(from);
  }),
  rm: vi.fn(async (path: string) => {
    fsState.files.delete(path);
    fsState.sizes.delete(path);
  }),
  stat: vi.fn(async (path: string) => ({ size: fsState.sizes.get(path) ?? Buffer.byteLength(fsState.files.get(path) ?? '', 'utf8') })),
  writeFile: vi.fn(async (path: string, value: string) => {
    fsState.files.set(path, value);
    fsState.sizes.set(path, Buffer.byteLength(value, 'utf8'));
  }),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn((command: string, args: string[]) => {
    spawnState.calls.push({ command, args });
    const child = new FakeChild();

    queueMicrotask(() => {
      if (spawnState.nvidiaMode === 'timeout' && command === 'nvidia-smi') {
        return;
      }

      if (spawnState.nvidiaMode === 'missing' && command === 'nvidia-smi') {
        child.emit('error', new Error('missing'));
        return;
      }

      if (command === 'nvidia-smi' && args.includes('--query-gpu=name,driver_version,memory.total,memory.used,memory.free')) {
        child.stdout.emit('data', Buffer.from('NVIDIA GeForce RTX 5060 Ti, 591.86, 16311, 1062, 15249\n'));
        child.emit('close', 0);
        return;
      }

      if (command === 'nvidia-smi') {
        child.stdout.emit('data', Buffer.from(nvidiaSummary));
        child.emit('close', 0);
        return;
      }

      if (command === 'powershell.exe') {
        child.stdout.emit('data', Buffer.from('8'));
        child.emit('close', 0);
        child.emit('exit', 0);
        return;
      }

      child.emit('exit', 0);
    });

    return child;
  }),
}));

describe('Core services', () => {
  beforeEach(() => {
    clipboardState.text = '';
    shortcuts.registered = [];
    shortcuts.blocked.clear();
    shortcuts.unregisterAllCalls = 0;
    fsState.files.clear();
    fsState.dirs.clear();
    fsState.sizes.clear();
    fsState.entries.clear();
    spawnState.calls = [];
    spawnState.nvidiaMode = 'ok';
    vi.clearAllMocks();
  });

  it('reads and writes clipboard text', async () => {
    const { ClipboardService } = await import('@services/clipboard-service');
    const service = new ClipboardService();

    service.write('hello');

    expect(service.read()).toBe('hello');
  });

  it('registers hotkeys and keeps failed shortcuts visible', async () => {
    const { HotkeyService } = await import('@services/hotkey-service');
    const service = new HotkeyService();
    shortcuts.blocked.add(defaultSettings.hotkeys.improveText);

    const result = service.register(defaultSettings, {
      speak: () => {},
      improveText: () => {},
      transcript: () => {},
    });

    expect(result).toEqual({ speak: true, improveText: false, transcript: true });
    expect(shortcuts.unregisterAllCalls).toBe(1);
    expect(shortcuts.registered).toEqual(['Alt+A', 'Alt+Z', 'Alt+E']);

    service.unregisterAll();

    expect(shortcuts.unregisterAllCalls).toBe(2);
  });

  it('keeps debug logs bounded and formats errors', async () => {
    const { DebugLogBuffer, errorDiagnostics } = await import('@services/debug-log-buffer');
    const buffer = new DebugLogBuffer(5);

    buffer.append('abcdef');

    expect(buffer.text()).toBe('bcdef');
    expect(errorDiagnostics(new Error('broken')).join('\n')).toContain('message: broken');
    expect(errorDiagnostics('plain')).toEqual(['name: unknown', 'message: plain', 'stack: unknown']);
  });

  it('writes process logs and trims large snapshots', async () => {
    const { ProcessLogService } = await import('@services/process-log-service');
    const service = new ProcessLogService();

    await service.append('speak.log', ['line one']);
    await service.writeSnapshot('improve.log', ['a'.repeat(100), 'b'.repeat(100)], 80);

    expect(fsState.files.get('C:\\test-user\\.voclyra\\logs\\speak.log')).toContain('line one');
    expect(fsState.files.get('C:\\test-user\\.voclyra\\logs\\improve.log')).toContain('...[truncated]...');
  });

  it('writes safe error logs and rotates old files', async () => {
    const { ErrorLogService } = await import('@services/error-log-service');
    fsState.files.set('C:\\test-user\\.voclyra\\logs\\errors\\error.log', 'old');
    fsState.sizes.set('C:\\test-user\\.voclyra\\logs\\errors\\error.log', 10_000_000);

    const service = new ErrorLogService();
    service.capture({
      source: 'test',
      type: 'failure',
      error: new Error('bad\0message'),
      context: { path: 'safe', skipped: undefined },
    });

    await vi.waitFor(() => {
      expect(fsState.files.get('C:\\test-user\\.voclyra\\logs\\errors\\error.log')).toContain('message: badmessage');
    });
    expect(fsState.files.get('C:\\test-user\\.voclyra\\logs\\errors\\error.1.log')).toBe('old');
  });

  it('sends copy and paste commands without shell mode', async () => {
    const { ActivePasteService } = await import('@services/active-paste-service');
    const service = new ActivePasteService();

    await service.copySelection();
    await service.paste();

    expect(spawnState.calls.at(-2)).toMatchObject({
      command: 'powershell.exe',
      args: expect.arrayContaining(['-NoProfile', '-STA', '-WindowStyle', 'Hidden']),
    });
    expect(spawnState.calls.at(-2)?.args.at(-1)).toContain("SendWait('^c')");
    expect(spawnState.calls.at(-1)?.args.at(-1)).toContain("SendWait('^v')");
  });

  it('parses NVIDIA hardware output and handles missing GPU tools', async () => {
    const { HardwareService } = await import('@services/hardware-service');
    const service = new HardwareService();

    await expect(service.info()).resolves.toMatchObject({
      gpuAvailable: true,
      gpuName: 'NVIDIA GeForce RTX 5060 Ti',
      gpuDriverVersion: '591.86',
      gpuCudaVersion: '13.1',
      gpuVramGb: 16,
      gpuMemoryUsedGb: 1.1,
      gpuMemoryFreeGb: 14.9,
    });
    await expect(service.cudaMajorVersion()).resolves.toBe(13);

    spawnState.nvidiaMode = 'missing';

    await expect(service.info()).resolves.toMatchObject({
      gpuAvailable: false,
      gpuName: 'Unknown GPU',
      gpuVramGb: null,
    });
  });

  it('creates hardware diagnostics from CPU and GPU checks', async () => {
    const { HardwareService } = await import('@services/hardware-service');

    await expect(new HardwareService().diagnostics()).resolves.toMatchObject({
      cpu: { status: 'ok', value: 'AMD Ryzen 7 5800X 8-Core Processor' },
      cpuCores: { status: 'ok', value: '8 physical / 16 logical' },
      cpuThreads: { status: 'ok', value: '16' },
      gpu: { status: 'ok', value: 'NVIDIA GeForce RTX 5060 Ti' },
      gpuDriver: { status: 'ok', value: '591.86' },
      gpuCuda: { status: 'ok', value: '13.1' },
    });
  });

  it('selects the best available CUDA runtime path', async () => {
    const { RuntimePathService } = await import('@services/runtime-path-service');
    const service = new RuntimePathService();
    fsState.files.set('C:\\project\\voclyra\\resources\\runtimes\\llama\\cuda-12\\win-x64\\llama-server.exe', '');
    fsState.files.set('C:\\project\\voclyra\\resources\\runtimes\\llama\\cuda-13\\win-x64\\llama-server.exe', '');

    await expect(
      service.selectCudaRuntime(
        'llama',
        {
          old: { label: 'CUDA 12.4', directory: 'cuda-12' },
          current: { label: 'CUDA 13.3', directory: 'cuda-13' },
        },
        'win-x64',
        'llama-server.exe',
      ),
    ).resolves.toEqual({
      label: 'CUDA 13.3',
      path: 'C:\\project\\voclyra\\resources\\runtimes\\llama\\cuda-13\\win-x64\\llama-server.exe',
    });
  });

  it('stores JSON and clears storage folders safely', async () => {
    const { AppStorage } = await import('@storage/app-storage');
    const storage = new AppStorage();
    fsState.entries.set('C:\\test-user\\.voclyra\\tmp', ['a.wav', 'b.wav']);

    await storage.writeJson('settings.json', { ok: true });
    await expect(storage.readJson('settings.json', { ok: false })).resolves.toEqual({ ok: true });
    await storage.clearDir('tmp');

    expect(fsState.files.get('C:\\test-user\\.voclyra\\settings.json')).toContain('"ok": true');
    expect(spawnState.calls.some((call) => call.command === 'attrib')).toBe(true);
    expect(fsState.files.has('C:\\test-user\\.voclyra\\tmp\\a.wav')).toBe(false);
  });

  it('keeps JsonStore as a simple in-memory fallback store', async () => {
    const { JsonStore } = await import('@storage/json-store');
    const store = new JsonStore({ value: 'fallback' });

    expect(store.read()).toEqual({ value: 'fallback' });
    expect(store.write({ value: 'next' })).toEqual({ value: 'next' });
  });

  it('transcribes meeting audio and stores non-empty transcript history', async () => {
    const { TranscriptService } = await import('@services/transcript-service');
    const whisperService = {
      transcribeMeeting: vi.fn(async () => 'meeting notes'),
    };
    const historyService = {
      add: vi.fn(async () => undefined),
    };
    const service = new TranscriptService(whisperService as never, historyService as never);
    const audio = new Uint8Array([1, 2, 3]);

    await expect(service.transcribe(audio, 'ggml-large-v3.bin', 25)).resolves.toBe('meeting notes');
    expect(whisperService.transcribeMeeting).toHaveBeenCalledWith(audio, 'ggml-large-v3.bin', {
      timeoutMs: null,
      debugName: 'transcript',
    });
    expect(historyService.add).toHaveBeenCalledWith({ kind: 'transcript', text: 'meeting notes', audio }, 25);

    whisperService.transcribeMeeting.mockResolvedValueOnce('   ');

    await expect(service.transcribe(audio, 'ggml-large-v3.bin', 25)).resolves.toBe('   ');
    expect(historyService.add).toHaveBeenCalledTimes(1);
  });

  it('writes startup diagnostics with storage, hardware, model and runtime paths', async () => {
    const { StartupLogService } = await import('@services/startup-log-service');
    const settings = {
      ...defaultSettings,
      whisperModel: 'ggml-large-v3.bin',
      llmModel: 'gemma-4-e4b-it.Q4_K_M.gguf',
    };
    fsState.files.set('C:\\test-user\\.voclyra\\settings.json', JSON.stringify(settings));
    fsState.files.set('C:\\test-user\\.voclyra\\models\\whisper\\ggml-large-v3.bin', '');
    fsState.files.set('C:\\test-user\\.voclyra\\models\\llm\\gemma-4-e4b-it.Q4_K_M.gguf', '');
    fsState.files.set('C:\\project\\voclyra\\resources\\runtimes\\whisper\\cuda-12\\win-x64\\whisper-server.exe', '');
    fsState.files.set('C:\\project\\voclyra\\resources\\runtimes\\llama\\cuda-13\\win-x64\\llama-server.exe', '');

    await new StartupLogService().write();

    const log = fsState.files.get('C:\\test-user\\.voclyra\\logs\\app.log') ?? '';
    expect(log).toContain('[SYSTEM INFO]');
    expect(log).toContain('[GPU INFO]');
    expect(log).toContain('gpu: NVIDIA GeForce RTX 5060 Ti');
    expect(log).toContain('whisper cuda version: CUDA 12.4');
    expect(log).toContain('llama cuda version: CUDA 13.3');
  });

  it('keeps audio service start and stop as no-op promises', async () => {
    const { AudioService } = await import('@services/audio-service');
    const service = new AudioService();

    await expect(service.start()).resolves.toBeUndefined();
    await expect(service.stop()).resolves.toBeUndefined();
  });
});
