import { defaultSettings } from '@shared/defaults';
import type { AppApi, ResultState } from '@shared/types';

const bridgeMissing = (text = ''): ResultState => ({
  text,
  status: 'error',
  message: 'Desktop bridge is not ready.',
});

const fallbackApi: AppApi = {
  settings: {
    get: () => Promise.resolve(defaultSettings),
    save: (settings) => Promise.resolve(settings),
  },
  app: {
    openDataFolder: () => Promise.resolve(),
    openLogsFolder: () => Promise.resolve(),
    openHelp: () => Promise.resolve(),
    importAudio: () => Promise.resolve(null),
    quit: () => Promise.resolve(),
  },
  models: {
    listLlm: () => Promise.resolve(defaultSettings.llmModel ? [defaultSettings.llmModel] : []),
    listWhisper: () => Promise.resolve([]),
  },
  dictation: {
    start: () => Promise.resolve(bridgeMissing()),
    stop: () => Promise.resolve(bridgeMissing()),
  },
  transcript: {
    start: () => Promise.resolve(bridgeMissing()),
    preview: () => Promise.resolve(''),
    onPartial: () => () => {},
  },
  audioCapture: {
    start: () => Promise.resolve(),
    switch: () => Promise.resolve(),
    stop: () => Promise.resolve(new ArrayBuffer(0)),
    cancel: () => Promise.resolve(),
    previewChunk: () => Promise.resolve(null),
    onLevel: () => () => {},
  },
  text: {
    improve: (text) => Promise.resolve(bridgeMissing(text)),
    replaceActive: () => Promise.resolve(),
  },
  clipboard: {
    read: () => Promise.resolve(''),
    readSelection: () => Promise.resolve(''),
    write: () => Promise.resolve(),
  },
  history: {
    list: () => Promise.resolve([]),
    toggleFavorite: () => Promise.resolve([]),
    updateTitle: () => Promise.resolve([]),
    delete: () => Promise.resolve(),
    clear: () => Promise.resolve([]),
    audio: () => Promise.resolve(null),
    exportText: () => Promise.resolve(false),
  },
  whisper: {
    availableModels: () => Promise.resolve([]),
    downloadModel: () => Promise.resolve([]),
    deleteModel: () => Promise.resolve([]),
    runtimeInfo: () =>
      Promise.resolve({
        runtimeAvailable: false,
      }),
    warmup: () => Promise.resolve(),
    onDownloadProgress: () => () => {},
  },
  llm: {
    availableModels: () => Promise.resolve([]),
    downloadModel: () => Promise.resolve([]),
    downloadCustomModel: () => Promise.resolve([]),
    deleteModel: () => Promise.resolve([]),
    runtimeInfo: () =>
      Promise.resolve({
        runtimeAvailable: false,
      }),
    warmup: () => Promise.resolve(),
    onDownloadProgress: () => () => {},
  },
  hardware: {
    info: () =>
      Promise.resolve({
        gpuName: 'Unknown GPU',
        gpuVramGb: null,
        gpuAvailable: false,
        gpuDriverVersion: 'unknown',
        gpuCudaVersion: 'unknown',
        gpuMemoryUsedGb: null,
        gpuMemoryFreeGb: null,
      }),
    usage: () =>
      Promise.resolve({
        available: false,
        name: 'Unknown GPU',
        memoryUsedGb: null,
        memoryTotalGb: null,
        memoryUsagePercent: null,
        utilizationPercent: null,
      }),
  },
  actions: {
    onSpeak: () => () => {},
    onImproveText: () => () => {},
    onTranscript: () => () => {},
    onCancelRecording: () => () => {},
    onImproveResult: () => () => {},
    onSection: () => () => {},
  },
  overlay: {
    setState: () => Promise.resolve(),
    getState: () =>
      Promise.resolve({
        active: false,
        mode: 'speak',
        status: 'recording',
        waveform: [],
    }),
    stopSpeak: () => Promise.resolve(),
    cancelRecording: () => Promise.resolve(),
    openSettings: () => Promise.resolve(),
    dismiss: () => Promise.resolve(),
    setContentSize: () => Promise.resolve(),
    onState: () => () => {},
  },
  window: {
    minimize: () => Promise.resolve(),
    toggleMaximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
  },
};

export const api = typeof window === 'undefined' ? fallbackApi : window.voclyra ?? fallbackApi;
