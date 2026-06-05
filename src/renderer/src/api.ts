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
  },
  models: {
    listOllama: () => Promise.resolve([defaultSettings.ollamaModel]),
    listWhisper: () => Promise.resolve([]),
  },
  dictation: {
    start: () => Promise.resolve(bridgeMissing()),
    stop: () => Promise.resolve(bridgeMissing()),
  },
  transcript: {
    start: () => Promise.resolve(bridgeMissing()),
  },
  text: {
    improve: (text) => Promise.resolve(bridgeMissing(text)),
    replaceActive: () => Promise.resolve(),
  },
  clipboard: {
    read: () => Promise.resolve(''),
    write: () => Promise.resolve(),
  },
  history: {
    list: () => Promise.resolve([]),
    toggleFavorite: () => Promise.resolve([]),
    delete: () => Promise.resolve(),
    clear: () => Promise.resolve([]),
  },
  whisper: {
    availableModels: () => Promise.resolve([]),
    downloadModel: () => Promise.resolve([]),
    deleteModel: () => Promise.resolve([]),
    runtimeInfo: () => Promise.resolve({ backend: 'unknown', gpuAvailable: false, device: 'Auto' }),
    onDownloadProgress: () => () => {},
  },
  actions: {
    onSpeak: () => () => {},
    onImproveText: () => () => {},
    onTranscript: () => () => {},
    onImproveResult: () => () => {},
    onSection: () => () => {},
  },
  overlay: {
    setState: () => Promise.resolve(),
    stopSpeak: () => Promise.resolve(),
    dismiss: () => Promise.resolve(),
    onState: () => () => {},
  },
  window: {
    minimize: () => Promise.resolve(),
    toggleMaximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
  },
};

export const api = window.voclyra ?? fallbackApi;
