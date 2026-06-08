import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '@shared/channels';
import type { AppApi, LlmDownloadProgress, OverlayState, Settings, WhisperDownloadProgress } from '@shared/types';

const api: AppApi = {
  settings: {
    get: () => ipcRenderer.invoke(channels.settingsGet) as Promise<Settings>,
    save: (settings) => ipcRenderer.invoke(channels.settingsSave, settings) as Promise<Settings>,
  },
  app: {
    openDataFolder: () => ipcRenderer.invoke(channels.appOpenDataFolder) as Promise<void>,
    openLogsFolder: () => ipcRenderer.invoke(channels.appOpenLogsFolder) as Promise<void>,
    openHelp: () => ipcRenderer.invoke(channels.appOpenHelp) as Promise<void>,
    importAudio: () => ipcRenderer.invoke(channels.appImportAudio) as ReturnType<AppApi['app']['importAudio']>,
    quit: () => ipcRenderer.invoke(channels.appQuit) as Promise<void>,
  },
  models: {
    listLlm: () => ipcRenderer.invoke(channels.modelsListLlm) as Promise<string[]>,
    listWhisper: () => ipcRenderer.invoke(channels.whisperListModels) as Promise<string[]>,
  },
  dictation: {
    start: (audio) =>
      ipcRenderer.invoke(channels.dictationStart, audio) as ReturnType<AppApi['dictation']['start']>,
    stop: () => ipcRenderer.invoke(channels.dictationStop) as ReturnType<AppApi['dictation']['stop']>,
  },
  transcript: {
    start: (audio, options) =>
      ipcRenderer.invoke(channels.transcriptStart, { audio, progressive: Boolean(options?.progressive) }) as ReturnType<AppApi['transcript']['start']>,
    preview: (audio) =>
      ipcRenderer.invoke(channels.transcriptPreview, audio) as ReturnType<AppApi['transcript']['preview']>,
    onPartial: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, text: unknown): void => {
        if (typeof text === 'string') {
          callback(text);
        }
      };
      ipcRenderer.on(channels.transcriptPartial, listener);
      return () => {
        ipcRenderer.removeListener(channels.transcriptPartial, listener);
      };
    },
  },
  audioCapture: {
    start: (mode) => ipcRenderer.invoke(channels.audioCaptureStart, mode) as Promise<void>,
    switch: (mode, source) => ipcRenderer.invoke(channels.audioCaptureSwitch, { mode, source }) as Promise<void>,
    stop: (mode) => ipcRenderer.invoke(channels.audioCaptureStop, mode) as Promise<ArrayBuffer>,
    cancel: (mode) => ipcRenderer.invoke(channels.audioCaptureCancel, mode) as Promise<void>,
    previewChunk: (mode, options) =>
      ipcRenderer.invoke(channels.audioCapturePreviewChunk, { mode, ...options }) as ReturnType<AppApi['audioCapture']['previewChunk']>,
    onLevel: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        if (
          value &&
          typeof value === 'object' &&
          'mode' in value &&
          'level' in value &&
          (value.mode === 'speak' || value.mode === 'transcript') &&
          (!('source' in value) || value.source === 'input' || value.source === 'output') &&
          typeof value.level === 'number'
        ) {
          const source = 'source' in value && (value.source === 'input' || value.source === 'output')
            ? value.source
            : undefined;
          callback({
            mode: value.mode,
            source,
            level: value.level,
          });
        }
      };
      ipcRenderer.on(channels.audioCaptureLevel, listener);
      return () => {
        ipcRenderer.removeListener(channels.audioCaptureLevel, listener);
      };
    },
  },
  text: {
    improve: (text) => ipcRenderer.invoke(channels.textImprove, text) as ReturnType<AppApi['text']['improve']>,
    replaceActive: (text) => ipcRenderer.invoke(channels.textReplaceActive, text) as Promise<void>,
  },
  clipboard: {
    read: () => ipcRenderer.invoke(channels.clipboardRead) as Promise<string>,
    readSelection: () => ipcRenderer.invoke(channels.clipboardReadSelection) as Promise<string>,
    write: (text) => ipcRenderer.invoke(channels.clipboardWrite, text) as Promise<void>,
  },
  history: {
    list: () => ipcRenderer.invoke(channels.historyList) as ReturnType<AppApi['history']['list']>,
    toggleFavorite: (id) =>
      ipcRenderer.invoke(channels.historyToggleFavorite, id) as ReturnType<AppApi['history']['toggleFavorite']>,
    updateTitle: (id, title) =>
      ipcRenderer.invoke(channels.historyUpdateTitle, { id, title }) as ReturnType<AppApi['history']['updateTitle']>,
    delete: (id) => ipcRenderer.invoke(channels.historyDelete, id) as Promise<void>,
    clear: () => ipcRenderer.invoke(channels.historyClear) as ReturnType<AppApi['history']['clear']>,
    audio: (id) => ipcRenderer.invoke(channels.historyAudio, id) as ReturnType<AppApi['history']['audio']>,
    exportText: (id) =>
      ipcRenderer.invoke(channels.historyExportText, id) as ReturnType<AppApi['history']['exportText']>,
  },
  whisper: {
    availableModels: () =>
      ipcRenderer.invoke(channels.whisperAvailableModels) as ReturnType<AppApi['whisper']['availableModels']>,
    downloadModel: (id) =>
      ipcRenderer.invoke(channels.whisperDownloadModel, id) as ReturnType<AppApi['whisper']['downloadModel']>,
    deleteModel: (id) =>
      ipcRenderer.invoke(channels.whisperDeleteModel, id) as ReturnType<AppApi['whisper']['deleteModel']>,
    runtimeInfo: () =>
      ipcRenderer.invoke(channels.whisperRuntimeInfo) as ReturnType<AppApi['whisper']['runtimeInfo']>,
    warmup: (model) => ipcRenderer.invoke(channels.whisperWarmup, model) as ReturnType<AppApi['whisper']['warmup']>,
    onDownloadProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: WhisperDownloadProgress): void => {
        callback(progress);
      };
      ipcRenderer.on(channels.whisperDownloadProgress, listener);
      return () => {
        ipcRenderer.removeListener(channels.whisperDownloadProgress, listener);
      };
    },
  },
  llm: {
    availableModels: () =>
      ipcRenderer.invoke(channels.llmAvailableModels) as ReturnType<AppApi['llm']['availableModels']>,
    downloadModel: (id) =>
      ipcRenderer.invoke(channels.llmDownloadModel, id) as ReturnType<AppApi['llm']['downloadModel']>,
    downloadCustomModel: (url) =>
      ipcRenderer.invoke(channels.llmDownloadCustomModel, url) as ReturnType<AppApi['llm']['downloadCustomModel']>,
    deleteModel: (id) =>
      ipcRenderer.invoke(channels.llmDeleteModel, id) as ReturnType<AppApi['llm']['deleteModel']>,
    runtimeInfo: () =>
      ipcRenderer.invoke(channels.llmRuntimeInfo) as ReturnType<AppApi['llm']['runtimeInfo']>,
    warmup: (model) => ipcRenderer.invoke(channels.llmWarmup, model) as ReturnType<AppApi['llm']['warmup']>,
    onDownloadProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: LlmDownloadProgress): void => {
        callback(progress);
      };
      ipcRenderer.on(channels.llmDownloadProgress, listener);
      return () => {
        ipcRenderer.removeListener(channels.llmDownloadProgress, listener);
      };
    },
  },
  hardware: {
    info: () => ipcRenderer.invoke(channels.hardwareInfo) as ReturnType<AppApi['hardware']['info']>,
    usage: () => ipcRenderer.invoke(channels.hardwareUsage) as ReturnType<AppApi['hardware']['usage']>,
  },
  actions: {
    onSpeak: (callback) => {
      const listener = (): void => {
        callback();
      };
      ipcRenderer.on(channels.appSpeak, listener);
      return () => {
        ipcRenderer.removeListener(channels.appSpeak, listener);
      };
    },
    onImproveText: (callback) => {
      const listener = (): void => {
        callback();
      };
      ipcRenderer.on(channels.appImproveText, listener);
      return () => {
        ipcRenderer.removeListener(channels.appImproveText, listener);
      };
    },
    onTranscript: (callback) => {
      const listener = (): void => {
        callback();
      };
      ipcRenderer.on(channels.appTranscript, listener);
      return () => {
        ipcRenderer.removeListener(channels.appTranscript, listener);
      };
    },
    onCancelRecording: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, mode: unknown): void => {
        if (mode === 'speak' || mode === 'transcript') {
          callback(mode);
        }
      };
      ipcRenderer.on(channels.appCancelRecording, listener);
      return () => {
        ipcRenderer.removeListener(channels.appCancelRecording, listener);
      };
    },
    onImproveResult: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, result: Parameters<typeof callback>[0]): void => {
        callback(result);
      };
      ipcRenderer.on(channels.appImproveResult, listener);
      return () => {
        ipcRenderer.removeListener(channels.appImproveResult, listener);
      };
    },
    onSection: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, section: unknown): void => {
        if (
          section === 'home' ||
          section === 'settings' ||
          section === 'history' ||
          section === 'about'
        ) {
          callback(section);
        }
      };
      ipcRenderer.on(channels.navigationSection, listener);
      return () => {
        ipcRenderer.removeListener(channels.navigationSection, listener);
      };
    },
  },
  overlay: {
    setState: (state) => ipcRenderer.invoke(channels.overlaySetState, state) as Promise<void>,
    getState: (mode) => ipcRenderer.invoke(channels.overlayGetState, mode) as Promise<OverlayState>,
    stopSpeak: (mode) => ipcRenderer.invoke(channels.overlayStopSpeak, mode) as Promise<void>,
    cancelRecording: (mode) => ipcRenderer.invoke(channels.overlayCancelRecording, mode) as Promise<void>,
    openSettings: () => ipcRenderer.invoke(channels.overlayOpenSettings) as Promise<void>,
    dismiss: (mode) => ipcRenderer.invoke(channels.overlayDismiss, mode) as Promise<void>,
    setContentSize: (mode, size) => ipcRenderer.invoke(channels.overlayContentSize, { mode, size }) as Promise<void>,
    onState: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: OverlayState): void => {
        callback(state);
      };
      ipcRenderer.on(channels.overlayStateChanged, listener);
      return () => {
        ipcRenderer.removeListener(channels.overlayStateChanged, listener);
      };
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke(channels.windowMinimize) as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke(channels.windowToggleMaximize) as Promise<void>,
    close: () => ipcRenderer.invoke(channels.windowClose) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld('voclyra', api);
