import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shell } from 'electron';
import { channels } from '@shared/channels';
import { actionBlockMessage, type ActionLockState } from '@shared/action-locks';
import { defaultSettings } from '@shared/defaults';

type IpcHandler = (event: unknown, value?: unknown) => unknown;

const handlers = new Map<string, IpcHandler>();
const clipboardState = { text: '' };
const dialogState: { canceled: boolean; filePaths: string[] } = { canceled: false, filePaths: [] };
const files = new Map<string, Buffer>();

const idle: ActionLockState = {
  speakRecording: false,
  speakProcessing: false,
  improveProcessing: false,
  improveLoading: false,
  transcriptRecording: false,
  transcriptProcessing: false,
  whisperLoading: false,
};

const activePasteMock = {
  paste: vi.fn(async () => {}),
  copySelection: vi.fn(async () => {}),
};
const historyMock = {
  add: vi.fn(async () => []),
  list: vi.fn(async () => []),
  toggleFavorite: vi.fn(async () => []),
  updateTitle: vi.fn(async () => []),
  delete: vi.fn(async () => {}),
  clear: vi.fn(async () => []),
  audio: vi.fn(async () => null),
};
const llamaMock = {
  improveText: vi.fn(async () => ({ text: 'Corrected text.', tokensGenerated: 12, tokensPerSecond: 24 })),
  runtimeInfo: vi.fn(async () => ({ runtimeAvailable: true })),
  warmup: vi.fn(async () => {}),
};
const llmModelMock = {
  downloadedModelNames: vi.fn(async () => ['model.gguf']),
  availableModels: vi.fn(async () => []),
  downloadModel: vi.fn(async () => []),
  deleteModel: vi.fn(async () => []),
  modelPath: vi.fn((model: string) => `C:\\models\\llm\\${model}`),
};
const settingsMock = {
  get: vi.fn(),
  save: vi.fn(async (settings) => settings),
};
const whisperModelMock = {
  downloadedModelNames: vi.fn(async () => ['ggml-large-v3.bin']),
  availableModels: vi.fn(async () => []),
  downloadModel: vi.fn(async () => []),
  deleteModel: vi.fn(async () => []),
};
const whisperMock = {
  transcribe: vi.fn(async () => 'Transcribed text.'),
  transcribeMeeting: vi.fn(async () => 'Transcript text.'),
  listModels: vi.fn(async () => []),
  runtimeInfo: vi.fn(async () => ({ runtimeAvailable: true })),
  warmup: vi.fn(async () => {}),
};
const overlayMock = {
  setOverlayState: vi.fn(),
  getOverlayState: vi.fn(),
  resizeOverlayToContent: vi.fn(),
  stopFromOverlay: vi.fn(),
  cancelRecordingFromOverlay: vi.fn(),
  dismissOverlay: vi.fn(),
  sendAppAction: vi.fn(),
  sendBackgroundAppAction: vi.fn(),
  sendImproveResult: vi.fn(),
};

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  app: {
    isQuitting: false,
    quit: vi.fn(),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn(),
  },
  clipboard: {
    readText: vi.fn(() => clipboardState.text),
    writeText: vi.fn((text: string) => {
      clipboardState.text = text;
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(async () => dialogState),
    showSaveDialog: vi.fn(async () => ({ canceled: true })),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),
  },
  shell: {
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (path: string) => {
    const file = files.get(path);
    if (!file) {
      throw new Error('File not found.');
    }
    return file;
  }),
  writeFile: vi.fn(async (path: string, value: string) => {
  }),
}));

vi.mock('@services/active-paste-service', () => ({
  ActivePasteService: class {
    paste = activePasteMock.paste;
    copySelection = activePasteMock.copySelection;
  },
}));

vi.mock('@services/history-service', () => ({
  HistoryService: class {
    add = historyMock.add;
    list = historyMock.list;
    toggleFavorite = historyMock.toggleFavorite;
    updateTitle = historyMock.updateTitle;
    delete = historyMock.delete;
    clear = historyMock.clear;
    audio = historyMock.audio;
  },
}));

vi.mock('@services/hardware-service', () => ({
  HardwareService: class {
    info = vi.fn(async () => ({}));
    usage = vi.fn(async () => ({
      available: true,
      name: 'NVIDIA GeForce RTX 5060 Ti',
      memoryUsedGb: 9.3,
      memoryTotalGb: 15.9,
      memoryUsagePercent: 58,
      utilizationPercent: 47,
    }));
  },
}));

vi.mock('@services/llama-service', () => ({
  LlamaService: class {
    improveText = llamaMock.improveText;
    runtimeInfo = llamaMock.runtimeInfo;
    warmup = llamaMock.warmup;
  },
}));

vi.mock('@services/llm-model-service', () => ({
  LlmModelService: class {
    downloadedModelNames = llmModelMock.downloadedModelNames;
    availableModels = llmModelMock.availableModels;
    downloadModel = llmModelMock.downloadModel;
    deleteModel = llmModelMock.deleteModel;
    modelPath = llmModelMock.modelPath;
  },
}));

vi.mock('@services/settings-service', () => ({
  SettingsService: class {
    get = settingsMock.get;
    save = settingsMock.save;
  },
}));

vi.mock('@services/transcript-service', () => ({
  TranscriptService: class {},
}));

vi.mock('@services/whisper-model-service', () => ({
  WhisperModelService: class {
    downloadedModelNames = whisperModelMock.downloadedModelNames;
    availableModels = whisperModelMock.availableModels;
    downloadModel = whisperModelMock.downloadModel;
    deleteModel = whisperModelMock.deleteModel;
  },
}));

vi.mock('@services/whisper-service', () => ({
  WhisperService: class {
    transcribe = whisperMock.transcribe;
    transcribeMeeting = whisperMock.transcribeMeeting;
    listModels = whisperMock.listModels;
    runtimeInfo = whisperMock.runtimeInfo;
    warmup = whisperMock.warmup;
  },
}));

vi.mock('@services/hotkey-service', () => ({
  HotkeyService: class {
    register = vi.fn(() => ({ speak: true, improveText: true, transcript: true }));
  },
}));

vi.mock('@storage/app-storage', () => ({
  AppStorage: class {
    ensureDir = vi.fn(async () => 'C:\\test\\.voclyra');
  },
}));

vi.mock('@main/window', () => overlayMock);
vi.mock('@main/tray', () => ({ updateTray: vi.fn() }));

const setup = async (): Promise<void> => {
  vi.resetModules();
  handlers.clear();
  clipboardState.text = '';
  dialogState.canceled = false;
  dialogState.filePaths = [];
  files.clear();
  vi.clearAllMocks();
  settingsMock.get.mockResolvedValue({
    llmModel: 'model.gguf',
    whisperModel: 'ggml-large-v3.bin',
    whisperLanguage: 'auto',
    whisperQualityMode: 'balanced',
    llmContextSize: 4096,
    llmTemperature: 0.1,
    correctionPrompt: 'Correct text.',
    pasteAfterDictation: false,
    pasteAfterImprovement: false,
    improveSelectedText: false,
    startAtStartup: false,
    microphoneDeviceId: '',
    microphoneDeviceLabel: '',
    transcriptOutputDeviceId: '',
    transcriptOutputDeviceLabel: '',
    transcriptLiveChunkSeconds: 45,
    silenceSensitivity: 'normal',
    maxHistoryItems: 100,
    hotkeys: {
      speak: 'CommandOrControl+Shift+1',
      improveText: 'CommandOrControl+Shift+2',
      transcript: 'CommandOrControl+Shift+3',
    },
  });
  const { registerIpc } = await import('@main/ipc');
  registerIpc();
  await handlers.get(channels.settingsGet)?.({});
};

const wavBuffer = (): ArrayBuffer => {
  const audio = new Uint8Array(48);
  audio.set([82, 73, 70, 70], 0);
  audio.set([40, 0, 0, 0], 4);
  audio.set([87, 65, 86, 69], 8);
  audio.set([102, 109, 116, 32], 12);
  audio.set([16, 0, 0, 0], 16);
  audio.set([1, 0, 1, 0], 20);
  audio.set([128, 62, 0, 0], 24);
  audio.set([0, 125, 0, 0], 28);
  audio.set([2, 0, 16, 0], 32);
  audio.set([100, 97, 116, 97], 36);
  audio.set([4, 0, 0, 0], 40);
  return audio.buffer;
};

describe('App actions', () => {
  beforeEach(async () => {
    await setup();
  });

  it('runs Speak and saves history', async () => {
    whisperMock.transcribe.mockResolvedValueOnce('Hello\nworld.');

    const result = await handlers.get(channels.dictationStart)?.({}, wavBuffer());

    expect(result).toMatchObject({ status: 'ready', text: 'Hello world.', message: 'Copied to clipboard' });
    expect(whisperMock.transcribe).toHaveBeenCalledWith(expect.any(Uint8Array), 'ggml-large-v3.bin', expect.objectContaining({ debugName: 'speak' }));
    expect(clipboardState.text).toBe('Hello world.');
    expect(historyMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dictation', text: 'Hello world.', audio: expect.any(Uint8Array) }),
      100,
    );
  });

  it('handles Speak guard cases', async () => {
    whisperMock.transcribe.mockResolvedValueOnce('   ');

    const noSpeech = await handlers.get(channels.dictationStart)?.({}, wavBuffer());

    expect(noSpeech).toMatchObject({ status: 'ready', text: '', message: 'No speech detected.' });
    expect(historyMock.add).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const noAudio = await handlers.get(channels.dictationStart)?.({}, new ArrayBuffer(0));
    expect(noAudio).toMatchObject({ status: 'ready', text: '', message: 'No audio captured.' });
    expect(historyMock.add).not.toHaveBeenCalled();

    vi.clearAllMocks();
    whisperModelMock.downloadedModelNames.mockResolvedValueOnce([]);
    const noModel = await handlers.get(channels.dictationStart)?.({}, wavBuffer());
    expect(noModel).toMatchObject({ status: 'ready', text: '', message: 'Select a Whisper model first.' });
    expect(whisperMock.transcribe).not.toHaveBeenCalled();
  });

  it('handles Speak errors', async () => {
    whisperMock.transcribe.mockRejectedValueOnce(new Error('Whisper failed.'));

    await expect(handlers.get(channels.dictationStart)?.({}, wavBuffer())).resolves.toMatchObject({
      status: 'error',
      message: 'Whisper failed.',
    });
  });

  it('runs Transcript and saves audio', async () => {
    whisperMock.transcribeMeeting.mockResolvedValueOnce('Transcript text.');

    const result = await handlers.get(channels.transcriptStart)?.({}, wavBuffer());

    expect(result).toMatchObject({ status: 'ready', text: 'Transcript text.', message: 'Transcript generated.' });
    expect(whisperMock.transcribeMeeting).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'ggml-large-v3.bin',
      expect.objectContaining({ debugName: 'transcript', timeoutMs: null }),
    );
    expect(historyMock.add).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'transcript', text: 'Transcript text.', audio: expect.any(Uint8Array) }),
      100,
    );
  });

  it('handles Transcript guard cases', async () => {
    const noAudio = await handlers.get(channels.transcriptStart)?.({}, new ArrayBuffer(0));

    expect(noAudio).toMatchObject({ status: 'ready', text: '', message: 'No audio captured.' });
    expect(whisperMock.transcribe).not.toHaveBeenCalled();
    expect(historyMock.add).not.toHaveBeenCalled();

    vi.clearAllMocks();
    whisperModelMock.downloadedModelNames.mockResolvedValueOnce([]);
    const noModel = await handlers.get(channels.transcriptStart)?.({}, wavBuffer());
    expect(noModel).toMatchObject({ status: 'ready', text: '', message: 'Select a Whisper model first.' });
    expect(whisperMock.transcribe).not.toHaveBeenCalled();
  });

  it('runs Improve and keeps speed stats', async () => {
    const result = await handlers.get(channels.textImprove)?.({}, 'helo world');

    expect(result).toMatchObject({
      status: 'ready',
      text: 'Corrected text.',
      message: 'Copied to clipboard',
      tokensGenerated: 12,
      tokensPerSecond: 24,
    });
    expect(llamaMock.improveText).toHaveBeenCalledWith('C:\\models\\llm\\model.gguf', 'Correct text.', 'helo world');
    expect(historyMock.add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'improvement', text: 'Corrected text.' }), 100);
  });

  it('falls back to the previous clipboard when Improve selected text is empty', async () => {
    settingsMock.get.mockResolvedValue({
      ...defaultSettings,
      llmModel: 'model.gguf',
      whisperModel: 'ggml-large-v3.bin',
      correctionPrompt: 'Correct text.',
      improveSelectedText: true,
      maxHistoryItems: 100,
    });
    clipboardState.text = 'previous clipboard';
    const { improveClipboardFromHotkey } = await import('@main/ipc');

    await improveClipboardFromHotkey();

    expect(activePasteMock.copySelection).toHaveBeenCalled();
    expect(llamaMock.improveText).toHaveBeenCalledWith(
      'C:\\models\\llm\\model.gguf',
      'Correct text.',
      'previous clipboard',
    );
  });

  it('handles Improve guard and error cases', async () => {
    const emptyText = await handlers.get(channels.textImprove)?.({}, '   ');

    expect(emptyText).toMatchObject({ status: 'ready', text: '', message: 'Enter text to improve.' });
    expect(llamaMock.improveText).not.toHaveBeenCalled();
    expect(historyMock.add).not.toHaveBeenCalled();

    vi.clearAllMocks();
    llamaMock.improveText.mockResolvedValueOnce({ text: '   ', tokensGenerated: 0, tokensPerSecond: 0 });
    const emptyResult = await handlers.get(channels.textImprove)?.({}, 'text');
    expect(emptyResult).toMatchObject({ status: 'error', text: '', message: 'Local AI returned an empty response.' });
    expect(historyMock.add).not.toHaveBeenCalled();

    vi.clearAllMocks();
    llamaMock.improveText.mockRejectedValueOnce(new Error('Llama failed.'));
    const error = await handlers.get(channels.textImprove)?.({}, 'text');
    expect(error).toMatchObject({ status: 'error', text: '', message: 'Llama failed.' });
    expect(historyMock.add).not.toHaveBeenCalled();
  });

  it('blocks Improve twice', async () => {
    let resolveImprove: (value: { text: string; tokensGenerated: number; tokensPerSecond: number }) => void = () => {};
    llamaMock.improveText.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImprove = resolve;
      }),
    );

    const first = handlers.get(channels.textImprove)?.({}, 'first');
    const second = await handlers.get(channels.textImprove)?.({}, 'second');
    resolveImprove({ text: 'Done.', tokensGenerated: 1, tokensPerSecond: 1 });

    expect(second).toMatchObject({ status: 'ready', text: '', message: 'Improve is already running.' });
    await expect(first).resolves.toMatchObject({ text: 'Done.' });
  });

  it('imports only valid WAV files', async () => {
    dialogState.filePaths = ['C:\\audio\\valid.wav'];
    files.set('C:\\audio\\valid.wav', Buffer.from(wavBuffer()));

    await expect(handlers.get(channels.appImportAudio)?.({ sender: {} })).resolves.toEqual(expect.any(ArrayBuffer));

    dialogState.filePaths = ['C:\\audio\\invalid.wav'];
    files.set('C:\\audio\\invalid.wav', Buffer.from('not wav'));

    await expect(handlers.get(channels.appImportAudio)?.({ sender: {} })).rejects.toThrow(
      'Unsupported audio format. Please choose a WAV file.',
    );

    dialogState.filePaths = ['C:\\audio\\missing.wav'];
    await expect(handlers.get(channels.appImportAudio)?.({ sender: {} })).rejects.toThrow('File not found.');
  });

  it('returns live GPU usage through IPC', async () => {
    await expect(handlers.get(channels.hardwareUsage)?.({})).resolves.toMatchObject({
      available: true,
      memoryUsedGb: 9.3,
      memoryTotalGb: 15.9,
      utilizationPercent: 47,
    });
  });

  it('opens the GitHub README from Help', async () => {
    await expect(handlers.get(channels.appOpenHelp)?.({})).resolves.toBeUndefined();

    expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/hajdaini/voclyra#readme');
  });

  it('cancels audio import', async () => {
    dialogState.canceled = true;

    await expect(handlers.get(channels.appImportAudio)?.({ sender: {} })).resolves.toBeNull();
  });
});

describe('Action locks', () => {
  it('blocks only actions that should be blocked', () => {
    expect(actionBlockMessage('speak', idle)).toBeNull();
    expect(actionBlockMessage('transcript', idle)).toBeNull();
    expect(actionBlockMessage('improve', idle)).toBeNull();

    expect(actionBlockMessage('speak', { ...idle, transcriptRecording: true })).toBe('Transcript is already running.');
    expect(actionBlockMessage('speak', { ...idle, transcriptProcessing: true })).toBe('Transcript is already running.');
    expect(actionBlockMessage('transcript', { ...idle, speakRecording: true })).toBe('Speak is already running.');
    expect(actionBlockMessage('transcript', { ...idle, speakProcessing: true })).toBe('Speak is already running.');

    expect(actionBlockMessage('speak', { ...idle, speakRecording: true })).toBe('Speak is already running.');
    expect(actionBlockMessage('speak', { ...idle, speakProcessing: true })).toBe('Speak is already transcribing.');
    expect(actionBlockMessage('transcript', { ...idle, transcriptRecording: true })).toBe('Transcript is already running.');
    expect(actionBlockMessage('transcript', { ...idle, transcriptProcessing: true })).toBe('Transcript is already transcribing.');
    expect(actionBlockMessage('improve', { ...idle, improveProcessing: true })).toBe('Improve is already running.');

    expect(actionBlockMessage('improve', { ...idle, whisperLoading: true })).toBeNull();
    expect(actionBlockMessage('speak', { ...idle, improveProcessing: true })).toBeNull();
    expect(actionBlockMessage('transcript', { ...idle, improveProcessing: true })).toBeNull();
  });

  it('shows loading before running messages', () => {
    expect(actionBlockMessage('speak', { ...idle, whisperLoading: true })).toBe('Speak is loading...');
    expect(actionBlockMessage('transcript', { ...idle, whisperLoading: true })).toBe('Transcript is loading...');
    expect(actionBlockMessage('improve', { ...idle, improveLoading: true })).toBe('Improve is loading...');
    expect(actionBlockMessage('speak', { ...idle, whisperLoading: true, speakRecording: true })).toBe('Speak is loading...');
    expect(actionBlockMessage('speak', { ...idle, whisperLoading: true, transcriptProcessing: true })).toBe('Speak is loading...');
    expect(actionBlockMessage('transcript', { ...idle, whisperLoading: true, transcriptRecording: true })).toBe('Transcript is loading...');
    expect(actionBlockMessage('transcript', { ...idle, whisperLoading: true, speakProcessing: true })).toBe('Transcript is loading...');
    expect(actionBlockMessage('improve', { ...idle, improveLoading: true, improveProcessing: true })).toBe('Improve is loading...');
  });
});

