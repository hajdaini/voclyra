import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channels } from '@shared/channels';
import type { HistoryEntry } from '@shared/types';

type Store = Record<string, unknown>;
type IpcHandler = (event: unknown, value?: unknown) => unknown;

let store: Store = {};
const files = new Map<string, Uint8Array>();
const deletedFiles: string[] = [];
const writes = new Map<string, string>();
const handlers = new Map<string, IpcHandler>();
const saveDialogState: { canceled: boolean; filePath?: string } = { canceled: true };

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
const ensureDir = vi.fn(async (...parts: string[]) => ['C:\\test\\.voclyra', ...parts].join('\\'));
const pathMock = vi.fn((...parts: string[]) => ['C:\\test\\.voclyra', ...parts].join('\\'));

vi.mock('@storage/app-storage', () => ({
  AppStorage: class {
    readJson = readJson;
    writeJson = writeJson;
    ensureDir = ensureDir;
    path = pathMock;
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (path: string) => {
    const file = files.get(path);
    if (!file) {
      throw new Error('missing');
    }
    return file;
  }),
  writeFile: vi.fn(async (path: string, value: Uint8Array | string) => {
    if (typeof value === 'string') {
      writes.set(path, value);
      return;
    }
    files.set(path, value);
  }),
  rm: vi.fn(async (path: string) => {
    deletedFiles.push(path);
    files.delete(path);
  }),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  app: {
    isQuitting: false,
    quit: vi.fn(),
  },
  clipboard: {
    readText: vi.fn(() => ''),
    writeText: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(async () => saveDialogState),
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

vi.mock('@services/active-paste-service', () => ({ ActivePasteService: class {} }));
vi.mock('@services/hardware-service', () => ({ HardwareService: class {} }));
vi.mock('@services/hotkey-service', () => ({ HotkeyService: class { register = vi.fn(() => ({ speak: true, improveText: true, transcript: true })); } }));
vi.mock('@services/llama-service', () => ({ LlamaService: class {} }));
vi.mock('@services/llm-model-service', () => ({ LlmModelService: class {} }));
vi.mock('@services/settings-service', () => ({ SettingsService: class { get = vi.fn(async () => ({})); save = vi.fn(async (settings) => settings); } }));
vi.mock('@services/transcript-service', () => ({ TranscriptService: class {} }));
vi.mock('@services/whisper-model-service', () => ({ WhisperModelService: class {} }));
vi.mock('@services/whisper-service', () => ({ WhisperService: class {} }));
vi.mock('@main/window', () => ({
  cancelRecordingFromOverlay: vi.fn(),
  dismissOverlay: vi.fn(),
  getOverlayState: vi.fn(),
  resizeOverlayToContent: vi.fn(),
  sendAppAction: vi.fn(),
  sendImproveResult: vi.fn(),
  setOverlayState: vi.fn(),
  stopFromOverlay: vi.fn(),
}));
vi.mock('@main/tray', () => ({ updateTray: vi.fn() }));

const entry = (partial: Partial<HistoryEntry>): HistoryEntry => ({
  id: '1',
  kind: 'dictation',
  title: 'One',
  text: 'Text',
  createdAt: '2026-01-01T00:00:00.000Z',
  favorite: false,
  ...partial,
});

const setupIpc = async (): Promise<void> => {
  vi.resetModules();
  handlers.clear();
  const { registerIpc } = await import('@main/ipc');
  registerIpc();
};

describe('History', () => {
  beforeEach(() => {
    store = {};
    files.clear();
    writes.clear();
    deletedFiles.length = 0;
    handlers.clear();
    saveDialogState.canceled = true;
    delete saveDialogState.filePath;
    vi.clearAllMocks();
  });

  it('sorts, renames and favorites entries', async () => {
    store['history.json'] = [
      entry({ id: 'new', favorite: false, createdAt: '2026-01-02T00:00:00.000Z' }),
      entry({ id: 'fav', favorite: true, createdAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'old', favorite: false, createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const { HistoryService } = await import('@services/history-service');
    const service = new HistoryService();

    await expect(service.list()).resolves.toMatchObject([{ id: 'fav' }, { id: 'new' }, { id: 'old' }]);

    await expect(service.updateTitle('old', '  New   title  ')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'old', title: 'New title' }),
    ]));

    await expect(service.toggleFavorite('old')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'old', favorite: true }),
    ]));
  });

  it('stores voice audio and ignores Improve audio', async () => {
    const { HistoryService } = await import('@services/history-service');
    const service = new HistoryService();

    const speak = await service.add({ kind: 'dictation', text: 'Hello world', audio: new Uint8Array([1, 2]) }, 100);
    const transcript = await service.add({ kind: 'transcript', text: 'Meeting note', audio: new Uint8Array([1, 2]) }, 100);
    const improve = await service.add({ kind: 'improvement', text: 'Better text', audio: new Uint8Array([1, 2]) }, 100);

    expect(speak).toMatchObject({ kind: 'dictation', title: 'Hello world', audioFileName: expect.stringMatching(/^speak\/.+\.wav$/) });
    expect(transcript).toMatchObject({ kind: 'transcript', audioFileName: expect.stringMatching(/^transcript\/.+\.wav$/) });
    expect(improve.audioFileName).toBeUndefined();
    expect(ensureDir).toHaveBeenCalledWith('audio', 'speak');
    expect(ensureDir).toHaveBeenCalledWith('audio', 'transcript');
    expect(files.size).toBe(2);
  });

  it('deletes and clears entries with audio', async () => {
    store['history.json'] = [entry({ id: '1', audioFileName: 'speak/1.wav' }), entry({ id: '2' })];
    const { HistoryService } = await import('@services/history-service');
    const service = new HistoryService();

    await service.delete('1');
    expect(store['history.json']).toEqual([expect.objectContaining({ id: '2' })]);
    expect(deletedFiles).toEqual(['C:\\test\\.voclyra\\audio\\speak\\1.wav']);

    deletedFiles.length = 0;
    store['history.json'] = [entry({ id: '1', audioFileName: 'speak/1.wav' }), entry({ id: '2', audioFileName: 'transcript/2.wav' })];
    await expect(service.clear()).resolves.toEqual([]);
    expect(store['history.json']).toEqual([]);
    expect(deletedFiles).toEqual(['C:\\test\\.voclyra\\audio\\speak\\1.wav', 'C:\\test\\.voclyra\\audio\\transcript\\2.wav']);
  });

  it('reads only safe audio paths', async () => {
    store['history.json'] = [entry({ id: '1', audioFileName: 'speak/1.wav' })];
    files.set('C:\\test\\.voclyra\\audio\\speak\\1.wav', new Uint8Array([1, 2, 3]));
    const { HistoryService } = await import('@services/history-service');
    const service = new HistoryService();

    await expect(service.audio('1')).resolves.toEqual(new Uint8Array([1, 2, 3]));

    store['history.json'] = [entry({ id: '1', audioFileName: '../bad.wav' })];
    await expect(service.audio('1')).resolves.toBeNull();
  });

  it('validates audio and export IPC actions', async () => {
    store['history.json'] = [entry({ id: '1', title: 'Bad ...', text: 'Text', audioFileName: 'speak/1.wav' })];
    files.set('C:\\test\\.voclyra\\audio\\speak\\1.wav', new Uint8Array([1, 2, 3]));
    await setupIpc();

    await expect(handlers.get(channels.historyUpdateTitle)?.({}, { id: '1', title: '' })).rejects.toThrow();
    await expect(handlers.get(channels.historyAudio)?.({}, '1')).resolves.toEqual(expect.any(ArrayBuffer));

    saveDialogState.canceled = false;
    saveDialogState.filePath = 'C:\\exports\\history.txt';
    await expect(handlers.get(channels.historyExportText)?.({ sender: {} }, '1')).resolves.toBe(true);
    expect(writes.get('C:\\exports\\history.txt')).toBe('Text');

    saveDialogState.canceled = true;
    await expect(handlers.get(channels.historyExportText)?.({ sender: {} }, '1')).resolves.toBe(false);
    await expect(handlers.get(channels.historyExportText)?.({ sender: {} }, 'missing')).rejects.toThrow('History entry not found.');
  });
});
