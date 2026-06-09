import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'electron';
import { channels } from '@shared/channels';
import { defaultSettings } from '@shared/defaults';
import { settingsSchema } from '@shared/schemas';
import { syncModelSettings } from '@renderer/ui/modelSettingsSync';
import { shortcutFromKey, shortcutKey } from '@renderer/ui/views/SettingsView';

type Store = Record<string, unknown>;
type IpcHandler = (event: unknown, value?: unknown) => unknown;
type HotkeyHandlers = { speak: () => void; improveText: () => void; transcript: () => void };

let store: Store = {};
const handlers = new Map<string, IpcHandler>();
let hotkeyResult = { speak: true, improveText: true, transcript: true };
let lastHotkeyHandlers: HotkeyHandlers | null = null;
let startupEnabled = false;

const readJson = vi.fn(async <T>(name: string, fallback: T): Promise<T> => {
  if (!(name in store)) {
    return fallback;
  }
  return store[name] as T;
});
const writeJson = vi.fn(async <T>(name: string, value: T): Promise<T> => {
  store[name] = value;
  return value;
});
const withoutStartup = (settings: typeof defaultSettings): Omit<typeof defaultSettings, 'startAtStartup'> => {
  const { startAtStartup: _startAtStartup, ...rest } = settings;
  return rest;
};

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  app: {
    isQuitting: false,
    quit: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: startupEnabled })),
    setLoginItemSettings: vi.fn(),
  },
  clipboard: {
    readText: vi.fn(() => ''),
    writeText: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),
  },
  shell: {
    openPath: vi.fn(async () => ''),
  },
}));

vi.mock('@storage/app-storage', () => ({
  AppStorage: class {
    readJson = readJson;
    writeJson = writeJson;
    ensureDir = vi.fn(async () => 'C:\\test\\.voclyra');
  },
}));

vi.mock('@services/hotkey-service', () => ({
  HotkeyService: class {
    register = vi.fn((_settings: unknown, handlers: HotkeyHandlers) => {
      lastHotkeyHandlers = handlers;
      return hotkeyResult;
    });
  },
}));

vi.mock('@services/active-paste-service', () => ({ ActivePasteService: class {} }));
vi.mock('@services/history-service', () => ({ HistoryService: class {} }));
vi.mock('@services/hardware-service', () => ({ HardwareService: class {} }));
vi.mock('@services/llama-service', () => ({ LlamaService: class {} }));
vi.mock('@services/llm-model-service', () => ({ LlmModelService: class {} }));
vi.mock('@services/transcript-service', () => ({ TranscriptService: class {} }));
vi.mock('@services/whisper-model-service', () => ({ WhisperModelService: class {} }));
vi.mock('@services/whisper-service', () => ({ WhisperService: class {} }));
vi.mock('@main/window', () => ({
  cancelRecordingFromOverlay: vi.fn(),
  dismissOverlay: vi.fn(),
  getOverlayState: vi.fn(),
  resizeOverlayToContent: vi.fn(),
  sendAppAction: vi.fn(),
  sendBackgroundAppAction: vi.fn(),
  sendImproveResult: vi.fn(),
  setOverlayState: vi.fn(),
  stopFromOverlay: vi.fn(),
}));
vi.mock('@main/tray', () => ({ updateTray: vi.fn() }));

const setupIpc = async (): Promise<void> => {
  vi.resetModules();
  handlers.clear();
  vi.clearAllMocks();
  hotkeyResult = { speak: true, improveText: true, transcript: true };
  lastHotkeyHandlers = null;
  startupEnabled = false;
  const { registerIpc } = await import('@main/ipc');
  registerIpc();
  await handlers.get(channels.settingsGet)?.({});
};

describe('Settings', () => {
  beforeEach(() => {
    store = {};
    readJson.mockClear();
    writeJson.mockClear();
  });

  it('validates every important setting field', () => {
    expect(settingsSchema.safeParse(defaultSettings).success).toBe(true);
    for (const whisperLanguage of ['auto', 'fr', 'en', 'es', 'de', 'it', 'pt']) {
      expect(settingsSchema.safeParse({ ...defaultSettings, whisperLanguage }).success).toBe(true);
    }
    for (const llmContextSize of [512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 32768]) {
      expect(settingsSchema.safeParse({ ...defaultSettings, llmContextSize }).success).toBe(true);
    }
    for (const transcriptLiveChunkSeconds of [30, 60, 120, 300]) {
      expect(settingsSchema.safeParse({ ...defaultSettings, transcriptLiveChunkSeconds }).success).toBe(true);
    }
    expect(settingsSchema.safeParse({ ...defaultSettings, whisperLanguage: 'jp' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, llmContextSize: 9999 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, transcriptLiveChunkSeconds: 29 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, transcriptLiveChunkSeconds: 301 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, correctionPrompt: '' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, maxHistoryItems: 10001 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, hotkeys: { ...defaultSettings.hotkeys, speak: '' } }).success).toBe(false);
  });

  it('stores settings safely', async () => {
    const { SettingsService } = await import('@services/settings-service');
    const service = new SettingsService();

    await expect(service.get()).resolves.toEqual(defaultSettings);
    expect(writeJson).not.toHaveBeenCalled();

    store['settings.json'] = { ...defaultSettings, whisperLanguage: 'invalid' };
    await expect(service.get()).resolves.toEqual(defaultSettings);
    expect(writeJson).toHaveBeenCalledWith('settings.json', withoutStartup(defaultSettings));

    const validSettings = { ...defaultSettings, whisperModel: 'ggml-large-v3.bin', llmModel: 'gemma.gguf' };
    store['settings.json'] = withoutStartup(validSettings);
    writeJson.mockClear();
    await expect(service.get()).resolves.toEqual(validSettings);
    expect(writeJson).not.toHaveBeenCalled();

    store['settings.json'] = { ...defaultSettings, unknownSetting: true };
    const normalized = await service.get();
    expect(normalized).toEqual(defaultSettings);
    expect(normalized).not.toHaveProperty('unknownSetting');

    store['settings.json'] = { startAtStartup: true };
    const partialSettings = await service.get();
    expect(partialSettings).toEqual(defaultSettings);
    expect(writeJson).toHaveBeenCalledWith('settings.json', withoutStartup(defaultSettings));

    const savedSettings = { ...defaultSettings, pasteAfterDictation: true };
    await expect(service.save(savedSettings)).resolves.toEqual(savedSettings);
    await expect(service.get()).resolves.toEqual(savedSettings);
  });

  it('selects LLM and Whisper models from available models', () => {
    expect(syncModelSettings({ ...defaultSettings, llmModel: 'llm.gguf', whisperModel: 'whisper.bin' }, {
      llm: ['llm.gguf'],
      whisper: ['whisper.bin'],
    })).toMatchObject({ llmModel: 'llm.gguf', whisperModel: 'whisper.bin' });

    expect(syncModelSettings({ ...defaultSettings, llmModel: 'old.gguf', whisperModel: 'whisper.bin' }, {
      llm: ['new.gguf'],
      whisper: ['whisper.bin'],
    })).toMatchObject({ llmModel: 'new.gguf', whisperModel: 'whisper.bin' });

    expect(syncModelSettings({ ...defaultSettings, llmModel: 'llm.gguf', whisperModel: 'old.bin' }, {
      llm: ['llm.gguf'],
      whisper: ['new.bin'],
    })).toMatchObject({ llmModel: 'llm.gguf', whisperModel: 'new.bin' });

    expect(syncModelSettings(defaultSettings, {
      llm: ['first.gguf', 'second.gguf'],
      whisper: ['first.bin', 'second.bin'],
    })).toMatchObject({ llmModel: 'first.gguf', whisperModel: 'first.bin' });

    expect(syncModelSettings({ ...defaultSettings, llmModel: 'old.gguf', whisperModel: 'old.bin' }, {
      llm: [],
      whisper: [],
    })).toMatchObject({ llmModel: 'old.gguf', whisperModel: 'old.bin' });
  });

  it('keeps numpad shortcut keys distinct from top row digits', () => {
    expect(shortcutKey('1', 'Digit1')).toBe('1');
    expect(shortcutKey('1', 'Numpad1')).toBe('num1');
    expect(shortcutFromKey('1', 'Numpad1', {
      commandOrControl: true,
      alt: false,
      shift: true,
    })).toBe('CommandOrControl+Shift+num1');
  });

  it('loads saves and rejects shortcut settings through IPC', async () => {
    await setupIpc();

    await expect(handlers.get(channels.settingsGet)?.({})).resolves.toMatchObject({
      transcriptOutputDeviceId: 'all',
      transcriptOutputDeviceLabel: 'All computer audio',
      transcriptLiveChunkSeconds: 60,
      hotkeys: {
        speak: 'CommandOrControl+Shift+1',
        improveText: 'CommandOrControl+Shift+2',
        transcript: 'CommandOrControl+Shift+3',
      },
    });

    startupEnabled = true;
    await expect(handlers.get(channels.settingsGet)?.({})).resolves.toMatchObject({
      startAtStartup: true,
    });

    const nextSettings = {
      ...defaultSettings,
      pasteAfterDictation: true,
      pasteAfterImprovement: true,
      improveSelectedText: true,
      startAtStartup: true,
      microphoneDeviceId: 'mic-1',
      microphoneDeviceLabel: 'Studio Mic',
      transcriptOutputDeviceId: 'out-1',
      transcriptOutputDeviceLabel: 'Studio Headphones',
      transcriptLiveChunkSeconds: 45,
      silenceSensitivity: 'high' as const,
      maxHistoryItems: 25,
      llmModel: 'model.gguf',
      whisperModel: 'ggml-large-v3.bin',
      llmContextSize: 8192 as const,
      llmTemperature: 0.2,
      whisperLanguage: 'fr' as const,
      whisperQualityMode: 'accurate' as const,
      hotkeys: {
        speak: 'Alt+S',
        improveText: 'Alt+I',
        transcript: 'CommandOrControl+Shift+3',
      },
    };
    await expect(handlers.get(channels.settingsSave)?.({}, nextSettings)).resolves.toEqual(nextSettings);
    expect(store['settings.json']).toEqual(withoutStartup(nextSettings));
    const windowApi = await import('@main/window');
    lastHotkeyHandlers?.speak();
    lastHotkeyHandlers?.transcript();
    expect(windowApi.sendBackgroundAppAction).toHaveBeenCalledWith('speak');
    expect(windowApi.sendBackgroundAppAction).toHaveBeenCalledWith('transcript');
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      openAsHidden: false,
    });

    vi.clearAllMocks();
    hotkeyResult = { speak: true, improveText: false, transcript: true };
    const badShortcutSettings = { ...defaultSettings, hotkeys: { ...defaultSettings.hotkeys, improveText: 'CommandOrControl+!' } };
    await expect(handlers.get(channels.settingsSave)?.({}, badShortcutSettings)).resolves.toMatchObject({
      hotkeys: {
        improveText: 'Alt+I',
      },
    });
    expect(store['settings.json']).toEqual(withoutStartup(nextSettings));

    await expect(handlers.get(channels.settingsSave)?.({}, {
      ...defaultSettings,
      hotkeys: { ...defaultSettings.hotkeys, speak: '' },
    })).rejects.toThrow();
    expect(store['settings.json']).toEqual(withoutStartup(nextSettings));
  });
});
