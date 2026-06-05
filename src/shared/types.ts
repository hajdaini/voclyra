export type AppSection = 'home' | 'settings' | 'history' | 'about';

export type HomeMode = 'speak' | 'improve' | 'transcript';

export type LanguageMode = 'auto';

export type Hotkeys = {
  speak: string;
  improveText: string;
  transcript: string;
};

export type Settings = {
  ollamaModel: string;
  whisperModel: string;
  correctionPrompt: string;
  pasteAfterDictation: boolean;
  pasteAfterImprovement: boolean;
  improveSelectedText: boolean;
  maxHistoryItems: number;
  hotkeys: Hotkeys;
  language: LanguageMode;
};

export type HistoryKind = 'dictation' | 'improvement' | 'transcript';

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  title: string;
  text: string;
  createdAt: string;
  favorite?: boolean;
};

export type AppStatus = 'ready' | 'listening' | 'processing' | 'error';

export type ResultState = {
  text: string;
  status: AppStatus;
  message: string;
};

export type WhisperModelId = 'tiny' | 'base' | 'small' | 'medium' | 'large';

export type WhisperModelState = 'ready' | 'missing' | 'downloading';

export type WhisperAvailableModel = {
  id: WhisperModelId;
  label: string;
  fileName: string;
  disk: string;
  memory: string;
  state: WhisperModelState;
  progress: number;
};

export type WhisperDownloadProgress = {
  id: WhisperModelId;
  state: WhisperModelState;
  progress: number;
};

export type WhisperRuntimeInfo = {
  backend: 'gpu' | 'cpu' | 'unknown';
  gpuAvailable: boolean;
  device: string;
};

export type OverlayState = {
  active: boolean;
  mode: 'speak' | 'improve' | 'transcript';
  status: 'recording' | 'transcribing' | 'improving' | 'done' | 'warning';
  waveform: number[];
  message?: string;
  messageType?: 'error' | 'success' | 'warning';
};

export type AppApi = {
  settings: {
    get: () => Promise<Settings>;
    save: (settings: Settings) => Promise<Settings>;
  };
  app: {
    openDataFolder: () => Promise<void>;
  };
  models: {
    listOllama: () => Promise<string[]>;
    listWhisper: () => Promise<string[]>;
  };
  dictation: {
    start: (audio: ArrayBuffer) => Promise<ResultState>;
    stop: () => Promise<ResultState>;
  };
  transcript: {
    start: (audio: ArrayBuffer) => Promise<ResultState>;
  };
  text: {
    improve: (text: string) => Promise<ResultState>;
    replaceActive: (text: string) => Promise<void>;
  };
  clipboard: {
    read: () => Promise<string>;
    readSelection: () => Promise<string>;
    write: (text: string) => Promise<void>;
  };
  history: {
    list: () => Promise<HistoryEntry[]>;
    toggleFavorite: (id: string) => Promise<HistoryEntry[]>;
    updateTitle: (id: string, title: string) => Promise<HistoryEntry[]>;
    delete: (id: string) => Promise<void>;
    clear: () => Promise<HistoryEntry[]>;
  };
  whisper: {
    availableModels: () => Promise<WhisperAvailableModel[]>;
    downloadModel: (id: WhisperModelId) => Promise<WhisperAvailableModel[]>;
    deleteModel: (id: WhisperModelId) => Promise<WhisperAvailableModel[]>;
    runtimeInfo: () => Promise<WhisperRuntimeInfo>;
    onDownloadProgress: (callback: (progress: WhisperDownloadProgress) => void) => () => void;
  };
  actions: {
    onSpeak: (callback: () => void) => () => void;
    onImproveText: (callback: () => void) => () => void;
    onTranscript: (callback: () => void) => () => void;
    onImproveResult: (callback: (result: ResultState) => void) => () => void;
    onSection: (callback: (section: AppSection) => void) => () => void;
  };
  overlay: {
    setState: (state: OverlayState) => Promise<void>;
    getState: (mode?: OverlayState['mode']) => Promise<OverlayState>;
    stopSpeak: (mode?: OverlayState['mode']) => Promise<void>;
    dismiss: (mode?: OverlayState['mode']) => Promise<void>;
    onState: (callback: (state: OverlayState) => void) => () => void;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
};
