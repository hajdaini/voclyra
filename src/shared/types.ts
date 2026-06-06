export type AppSection = 'home' | 'settings' | 'history' | 'about';

export type HomeMode = 'speak' | 'improve' | 'transcript';

export type LanguageMode = 'auto' | 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

export type WhisperCudaRuntimeVersion = 'cuda-11' | 'cuda-12';

export type WhisperQualityMode = 'fast' | 'balanced' | 'accurate';

export type SilenceSensitivity = 'low' | 'normal' | 'high';

export type LlmCudaRuntimeVersion = 'cuda-12' | 'cuda-13';

export type LlmMaxTokensMode = 'auto' | 'fixed';

export type LlmContextSize = 2048 | 3072 | 4096;

export type Hotkeys = {
  speak: string;
  improveText: string;
  transcript: string;
};

export type Settings = {
  llmModel: string;
  whisperModel: string;
  whisperCudaRuntimeVersion: WhisperCudaRuntimeVersion;
  whisperLanguage: LanguageMode;
  whisperQualityMode: WhisperQualityMode;
  llmCudaRuntimeVersion: LlmCudaRuntimeVersion;
  llmMaxTokensMode: LlmMaxTokensMode;
  llmMaxTokens: number;
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
};

export type AppStatus = 'ready' | 'listening' | 'processing' | 'error';

export type ResultState = {
  text: string;
  status: AppStatus;
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
  backend: 'gpu' | 'cpu' | 'unknown';
  runtimeAvailable: boolean;
  gpuAvailable: boolean;
  device: string;
  version: WhisperCudaRuntimeVersion;
};

export type HardwareInfo = {
  gpuName: string;
  gpuVramGb: number | null;
};

export type LlmModelId =
  | 'qwen3-0_6b-q8'
  | 'qwen3-1_7b-q8'
  | 'llama3_2-3b-q4'
  | 'smollm3-3b-q4'
  | 'phi4-mini-q4'
  | 'qwen3-4b-q4'
  | 'gemma-e4b-q4'
  | 'qwen3-8b-q4'
  | 'qwen3-14b-q4'
  | 'mistral-small-3_2-24b-iq4'
  | 'qwen3-30b-a3b-q4'
  | 'mistral-small-3_2-24b-q4';

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
  backend: 'gpu' | 'cpu' | 'unknown';
  runtimeAvailable: boolean;
  device: string;
  version: LlmCudaRuntimeVersion;
};

export type OverlayState = {
  active: boolean;
  mode: 'speak' | 'improve' | 'transcript';
  status: 'recording' | 'transcribing' | 'improving' | 'done' | 'warning';
  phase?: 'recording' | 'stopping' | 'preparing' | 'loading' | 'transcribing' | 'thinking' | 'generating' | 'finalizing';
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
  };
  whisper: {
    availableModels: () => Promise<WhisperAvailableModel[]>;
    downloadModel: (id: WhisperModelId) => Promise<WhisperAvailableModel[]>;
    deleteModel: (id: WhisperModelId) => Promise<WhisperAvailableModel[]>;
    runtimeInfo: () => Promise<WhisperRuntimeInfo>;
    onDownloadProgress: (callback: (progress: WhisperDownloadProgress) => void) => () => void;
  };
  llm: {
    availableModels: () => Promise<LlmAvailableModel[]>;
    downloadModel: (id: LlmModelId) => Promise<LlmAvailableModel[]>;
    deleteModel: (id: LlmModelId) => Promise<LlmAvailableModel[]>;
    runtimeInfo: () => Promise<LlmRuntimeInfo>;
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
