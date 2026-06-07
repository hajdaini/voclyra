export type AppSection = 'home' | 'settings' | 'history' | 'about';

export type HomeMode = 'speak' | 'improve' | 'transcript';

export type LanguageMode = 'auto' | 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

export type WhisperQualityMode = 'fast' | 'balanced' | 'accurate';

export type SilenceSensitivity = 'low' | 'normal' | 'high';

export type LlmContextSize = 2048 | 3072 | 4096;

export type Hotkeys = {
  speak: string;
  improveText: string;
  transcript: string;
};

export type Settings = {
  llmModel: string;
  whisperModel: string;
  whisperLanguage: LanguageMode;
  whisperQualityMode: WhisperQualityMode;
  llmContextSize: LlmContextSize;
  llmTemperature: number;
  correctionPrompt: string;
  pasteAfterDictation: boolean;
  pasteAfterImprovement: boolean;
  improveSelectedText: boolean;
  microphoneDeviceId: string;
  microphoneDeviceLabel: string;
  microphoneEchoCancellation: boolean;
  microphoneNoiseSuppression: boolean;
  microphoneAutoGainControl: boolean;
  silenceSensitivity: SilenceSensitivity;
  maxHistoryItems: number;
  hotkeys: Hotkeys;
};

export type HistoryKind = 'dictation' | 'improvement' | 'transcript';

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  title: string;
  text: string;
  createdAt: string;
  favorite?: boolean;
  audioFileName?: string;
};

export type AppStatus = 'ready' | 'listening' | 'processing' | 'error';
export type StatusTone = 'default' | 'info' | 'success' | 'warning' | 'error';

export type ResultState = {
  text: string;
  status: AppStatus;
  tone?: StatusTone;
  actionPhase?: 'ready' | 'loading' | 'recording' | 'processing' | 'done' | 'warning' | 'error';
  message: string;
  durationMs?: number;
  audioDurationMs?: number;
  tokensGenerated?: number;
  tokensPerSecond?: number;
};

export type WhisperModelId = 'tiny' | 'base' | 'small' | 'medium' | 'large';

export type WhisperModelState = 'ready' | 'missing' | 'downloading';

export type WhisperAvailableModel = {
  id: WhisperModelId;
  label: string;
  fileName: string;
  disk: string;
  memory: string;
  vramGb: number;
  state: WhisperModelState;
  progress: number;
};

export type WhisperDownloadProgress = {
  id: WhisperModelId;
  state: WhisperModelState;
  progress: number;
};

export type WhisperRuntimeInfo = {
  runtimeAvailable: boolean;
};

export type HardwareInfo = {
  gpuName: string;
  gpuVramGb: number | null;
  gpuAvailable: boolean;
  gpuDriverVersion: string;
  gpuCudaVersion: string;
  gpuMemoryUsedGb: number | null;
  gpuMemoryFreeGb: number | null;
};

export type LlmModelId =
  | 'gemma4:e2b-it-qat'
  | 'gemma4:e4b-it-qat'
  | 'gemma4:12b-it-qat'
  | 'gemma4:26b-a4b-it-qat'
  | 'gemma4:31b-it-qat';

export type LlmModelState = 'ready' | 'missing' | 'downloading';

export type LlmAvailableModel = {
  id: LlmModelId;
  label: string;
  fileName: string;
  disk: string;
  memory: string;
  vramGb: number;
  state: LlmModelState;
  progress: number;
};

export type LlmDownloadProgress = {
  id: LlmModelId;
  state: LlmModelState;
  progress: number;
};

export type LlmRuntimeInfo = {
  runtimeAvailable: boolean;
};

export type OverlayState = {
  active: boolean;
  mode: 'speak' | 'improve' | 'transcript';
  status: 'recording' | 'transcribing' | 'improving' | 'done' | 'warning';
  phase?: 'recording' | 'stopping' | 'preparing' | 'loading' | 'transcribing' | 'thinking' | 'generating' | 'finalizing';
  actionPhase?: 'ready' | 'loading' | 'recording' | 'processing' | 'done' | 'warning' | 'error';
  waveform: number[];
  progress?: number;
  tokensGenerated?: number;
  progressLabel?: string;
  message?: string;
  messageType?: 'error' | 'success' | 'warning' | 'info';
};

export type AppApi = {
  settings: {
    get: () => Promise<Settings>;
    save: (settings: Settings) => Promise<Settings>;
  };
  app: {
    openDataFolder: () => Promise<void>;
    openLogsFolder: () => Promise<void>;
    importAudio: () => Promise<ArrayBuffer | null>;
    quit: () => Promise<void>;
  };
  models: {
    listLlm: () => Promise<string[]>;
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
    audio: (id: string) => Promise<ArrayBuffer | null>;
    exportText: (id: string) => Promise<boolean>;
  };
  whisper: {
    availableModels: () => Promise<WhisperAvailableModel[]>;
    downloadModel: (id: WhisperModelId) => Promise<WhisperAvailableModel[]>;
    deleteModel: (id: WhisperModelId) => Promise<WhisperAvailableModel[]>;
    runtimeInfo: () => Promise<WhisperRuntimeInfo>;
    warmup: (model: string) => Promise<void>;
    onDownloadProgress: (callback: (progress: WhisperDownloadProgress) => void) => () => void;
  };
  llm: {
    availableModels: () => Promise<LlmAvailableModel[]>;
    downloadModel: (id: LlmModelId) => Promise<LlmAvailableModel[]>;
    deleteModel: (id: LlmModelId) => Promise<LlmAvailableModel[]>;
    runtimeInfo: () => Promise<LlmRuntimeInfo>;
    warmup: (model: string) => Promise<void>;
    onDownloadProgress: (callback: (progress: LlmDownloadProgress) => void) => () => void;
  };
  hardware: {
    info: () => Promise<HardwareInfo>;
  };
  actions: {
    onSpeak: (callback: () => void) => () => void;
    onImproveText: (callback: () => void) => () => void;
    onTranscript: (callback: () => void) => () => void;
    onCancelRecording: (callback: (mode: 'speak' | 'transcript') => void) => () => void;
    onImproveResult: (callback: (result: ResultState) => void) => () => void;
    onSection: (callback: (section: AppSection) => void) => () => void;
  };
  overlay: {
    setState: (state: OverlayState) => Promise<void>;
    getState: (mode?: OverlayState['mode']) => Promise<OverlayState>;
    stopSpeak: (mode?: OverlayState['mode']) => Promise<void>;
    cancelRecording: (mode: 'speak' | 'transcript') => Promise<void>;
    dismiss: (mode?: OverlayState['mode']) => Promise<void>;
    setContentSize: (mode: OverlayState['mode'], size: { width: number; height: number }) => Promise<void>;
    onState: (callback: (state: OverlayState) => void) => () => void;
  };
  window: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
};
