import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type {
  AppSection,
  GpuUsage,
  HardwareInfo,
  HistoryEntry,
  HomeMode,
  LlmAvailableModel,
  LlmRuntimeInfo,
  OverlayMode,
  OverlayState,
  ResultState,
  Settings as SettingsType,
  WhisperAvailableModel,
  WhisperRuntimeInfo,
} from '@shared/types';
import { defaultSettings } from '@shared/defaults';
import { appMessages } from '@shared/GlobalVars';
import { actionMessages } from '@shared/action-messages';
import { actionBlockMessage } from '@shared/action-locks';
import { actionOverlay, actionResult, actionUi } from '@shared/action-ui';
import { customLlmModelUrlError } from '@shared/custom-models';
import { api } from '../api';
import { startTranscriptRecorder, startWavRecorder, type WavRecorder } from '../audio/wav-recorder';
import { AppContent } from './components/AppContent';
import { AppToast, type Toast, type ToastType } from './components/AppToast';
import { AppSidebar } from './components/AppSidebar';
import { AppTopbar } from './components/AppTopbar';
import { AppFooter } from './components/AppFooter';
import { Overlay } from './components/Overlay';
import { syncModelSettings } from './modelSettingsSync';
import { overlayDone, overlayInactive, overlayProcessing, overlayRecording, overlayWarning } from './overlayStates';
import {
  assembleTranscriptLiveSegments,
  createTranscriptLiveSegment,
  enqueueFinalTranscriptLiveSegmentAfterCurrentTask,
  hasFailedTranscriptLiveSegments,
  hasRetryableTranscriptLiveSegments,
  nextTranscriptLiveSegment,
  type TranscriptLiveSegment,
} from './transcript-live-segments';
import {
  improveFallbackResult,
  inactiveOverlayState,
  speakFallbackResult,
  transcriptFallbackResult,
} from './appState';
import { defaultWaveform, nextVisualWaveform, overlayWaveformSize } from './waveform';

export const App = (): JSX.Element => {
  const overlayMode = new URLSearchParams(window.location.search).get('overlay');
  if (
    overlayMode === 'speak' ||
    overlayMode === 'improve' ||
    overlayMode === 'transcript' ||
    overlayMode === 'additional-info'
  ) {
    return <Overlay />;
  }

  const [section, setSection] = useState<AppSection>('home');
  const [speakResult, setSpeakResult] = useState<ResultState>(speakFallbackResult);
  const [improveResult, setImproveResult] = useState<ResultState>(improveFallbackResult);
  const [transcriptResult, setTranscriptResult] = useState<ResultState>(transcriptFallbackResult);
  const [settings, setSettings] = useState<SettingsType>(defaultSettings);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [whisperModels, setWhisperModels] = useState<string[]>([]);
  const [availableWhisperModels, setAvailableWhisperModels] = useState<WhisperAvailableModel[]>([]);
  const [availableLlmModels, setAvailableLlmModels] = useState<LlmAvailableModel[]>([]);
  const [deletingLlmModelIds, setDeletingLlmModelIds] = useState<Set<string>>(new Set());
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo>({
    gpuName: 'Unknown GPU',
    gpuVramGb: null,
    gpuAvailable: false,
    gpuDriverVersion: 'unknown',
    gpuCudaVersion: 'unknown',
    gpuMemoryUsedGb: null,
    gpuMemoryFreeGb: null,
  });
  const [whisperRuntime, setWhisperRuntime] = useState<WhisperRuntimeInfo>({
    runtimeAvailable: false,
  });
  const [gpuUsage, setGpuUsage] = useState<GpuUsage>({
    available: false,
    name: 'Unknown GPU',
    memoryUsedGb: null,
    memoryTotalGb: null,
    memoryUsagePercent: null,
    utilizationPercent: null,
  });
  const [llmRuntime, setLlmRuntime] = useState<LlmRuntimeInfo>({
    runtimeAvailable: false,
  });
  const [runtimeInfoLoaded, setRuntimeInfoLoaded] = useState(false);
  const [mode, setMode] = useState<HomeMode>('speak');
  const [improveInput, setImproveInput] = useState('');
  const [recorder, setRecorder] = useState<WavRecorder | null>(null);
  const [transcriptRecorder, setTranscriptRecorder] = useState<WavRecorder | null>(null);
  const [isSpeakProcessing, setIsSpeakProcessing] = useState(false);
  const [isTranscriptProcessing, setIsTranscriptProcessing] = useState(false);
  const [isImproveProcessing, setIsImproveProcessing] = useState(false);
  const [isWhisperLoading, setIsWhisperLoading] = useState(false);
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [audioServerEnabled, setAudioServerEnabled] = useState(true);
  const [llmServerEnabled, setLlmServerEnabled] = useState(true);
  const [waveform, setWaveform] = useState<number[]>(defaultWaveform);
  const [transcriptMicrophoneWaveform, setTranscriptMicrophoneWaveform] = useState<number[]>(defaultWaveform);
  const [transcriptSystemAudioWaveform, setTranscriptSystemAudioWaveform] = useState<number[]>(defaultWaveform);
  const [settingsFocus, setSettingsFocus] = useState<'improveAi' | 'speechAi' | 'microphone' | 'history' | 'shortcuts' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isShortcutEditing, setIsShortcutEditing] = useState(false);
  const [isImproveInputFocused, setIsImproveInputFocused] = useState(false);
  const [overlayStateByMode, setOverlayStateByMode] = useState<Record<HomeMode, OverlayState>>({
    speak: { ...inactiveOverlayState, mode: 'speak' },
    improve: { ...inactiveOverlayState, mode: 'improve' },
    transcript: { ...inactiveOverlayState, mode: 'transcript' },
  });
  const settingsRef = useRef(defaultSettings);
  const whisperWarmupModelRef = useRef<string | null>(null);
  const whisperWarmupRunRef = useRef(0);
  const llmWarmupModelRef = useRef<string | null>(null);
  const llmWarmupRunRef = useRef(0);
  const improveRunRef = useRef(0);
  const [llmWarmupRevision, setLlmWarmupRevision] = useState(0);
  const loadingOverlayRef = useRef<Record<HomeMode, boolean>>({
    speak: false,
    improve: false,
    transcript: false,
  });
  const overlayNoticeRef = useRef<
    Partial<Record<HomeMode, { message: string; messageType: 'error' | 'success' | 'warning' | 'info' }>>
  >({});
  const overlayWarningTimerRef = useRef<Partial<Record<OverlayMode, number>>>({});
  const overlayHideTimerRef = useRef<Partial<Record<OverlayMode, number>>>({});
  const transcriptLivePreviewTimerRef = useRef<number | null>(null);
  const transcriptLivePreviewRunningRef = useRef(false);
  const transcriptLiveSegmentClosingRef = useRef(false);
  const transcriptLiveSegmentCloseTaskRef = useRef<Promise<void> | null>(null);
  const transcriptLivePreviewTranscribingRef = useRef(false);
  const transcriptLivePreviewTaskRef = useRef<Promise<void> | null>(null);
  const transcriptLivePreviewTaskRunIdRef = useRef(0);
  const transcriptLiveRunIdRef = useRef(0);
  const transcriptLiveSegmentsRef = useRef<TranscriptLiveSegment[]>([]);
  const transcriptLiveNextSegmentIdRef = useRef(1);
  const transcriptLiveTextRef = useRef('');
  const microphoneSettingsKeyRef = useRef('');
  const transcriptOutputSettingsKeyRef = useRef('');
  const recordingActiveRef = useRef<Record<'speak' | 'transcript', boolean>>({
    speak: false,
    transcript: false,
  });
  const recordingStartedAtRef = useRef<Partial<Record<'speak' | 'transcript', number>>>({});
  const audioWarningTimerRef = useRef<Partial<Record<'speakMic' | 'transcriptMic' | 'transcriptSystem', number>>>({});
  const audioWarningShownRef = useRef<Record<'speakMic' | 'transcriptMic' | 'transcriptSystem', boolean>>({
    speakMic: false,
    transcriptMic: false,
    transcriptSystem: false,
  });
  const transcriptMicrophoneWaveformRef = useRef<number[]>(defaultWaveform());
  const transcriptSystemAudioWaveformRef = useRef<number[]>(defaultWaveform());
  const result =
    mode === 'speak' ? speakResult : mode === 'improve' ? improveResult : transcriptResult;
  const useLocalSpeechRuntime = settings.useLocalSpeechRuntime;
  const useLocalImproveRuntime = settings.useLocalImproveRuntime;
  const remoteSpeechReady = Boolean(settings.remoteSpeechBaseUrl.trim() && settings.remoteSpeechModel.trim());
  const remoteImproveReady = Boolean(settings.remoteImproveBaseUrl.trim() && settings.remoteImproveModel.trim());
  const audioLockState = {
    speakRecording: Boolean(recorder),
    speakProcessing: isSpeakProcessing,
    improveProcessing: isImproveProcessing,
    improveLoading: isLlmLoading,
    transcriptRecording: Boolean(transcriptRecorder),
    transcriptProcessing: isTranscriptProcessing,
    whisperLoading: isWhisperLoading,
  };
  const currentActionBlockMessage = serverBlockMessage(mode, useLocalSpeechRuntime, useLocalImproveRuntime, audioServerEnabled, llmServerEnabled)
    ?? actionBlockMessage(mode, audioLockState);
  const localWhisperModelAvailable = Boolean(settings.whisperModel && whisperModels.includes(settings.whisperModel));
  const localLlmModelAvailable = Boolean(settings.llmModel && llmModels.includes(settings.llmModel));
  const whisperModelAvailable = useLocalSpeechRuntime ? localWhisperModelAvailable : remoteSpeechReady;
  const llmModelAvailable = useLocalImproveRuntime ? localLlmModelAvailable : remoteImproveReady;
  const effectiveWhisperRuntime = useLocalSpeechRuntime ? whisperRuntime : { runtimeAvailable: remoteSpeechReady };
  const effectiveLlmRuntime = useLocalImproveRuntime ? llmRuntime : { runtimeAvailable: remoteImproveReady };

  const publishOverlayState = (state: OverlayState): void => {
    if (state.active && state.status !== 'done') {
      clearOverlayHideTimer(state.mode);
    }
    if (state.mode !== 'additional-info') {
      setOverlayStateByMode((current) => ({
        ...current,
        [state.mode]: state,
      }));
    }
    void api.overlay.setState(state);
  };

  const loadModels = async (baseSettings = settingsRef.current): Promise<void> => {
    const [
      nextLlmModels,
      nextWhisperModels,
      nextAvailableWhisperModels,
      nextAvailableLlmModels,
      nextWhisperRuntime,
      nextLlmRuntime,
    ] = await Promise.all([
      api.models.listLlm(),
      api.models.listWhisper(),
      api.whisper.availableModels(),
      api.llm.availableModels(),
      api.whisper.runtimeInfo(),
      api.llm.runtimeInfo(),
    ]);
    setLlmModels(nextLlmModels);
    setWhisperModels(nextWhisperModels);
    setAvailableWhisperModels(nextAvailableWhisperModels);
    setAvailableLlmModels(nextAvailableLlmModels);
    setWhisperRuntime(nextWhisperRuntime);
    setLlmRuntime(nextLlmRuntime);
    setRuntimeInfoLoaded(true);
    const syncedSettings = syncModelSettings(baseSettings, {
      llm: nextLlmModels,
      whisper: nextWhisperModels,
    });
    const nextSettings = settingsAreEqual(baseSettings, syncedSettings)
      ? syncedSettings
      : await api.settings.save(syncedSettings);
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
  };

  useEffect(() => {
    let active = true;
    let cancelInitialLoad: (() => void) | null = null;
    void api.settings.get().then((nextSettings) => {
      if (!active) {
        return;
      }
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      const initialAudioServerEnabled = nextSettings.useLocalSpeechRuntime && nextSettings.startAudioServerOnLaunch;
      const initialLlmServerEnabled = nextSettings.useLocalImproveRuntime && nextSettings.startLlmServerOnLaunch;
      setAudioServerEnabled(initialAudioServerEnabled);
      setLlmServerEnabled(initialLlmServerEnabled);
      void api.server.setEnabled('audio', initialAudioServerEnabled);
      void api.server.setEnabled('llm', initialLlmServerEnabled);
      cancelInitialLoad = scheduleAfterFirstPaint(() => {
        if (!active) {
          return;
        }
        void loadModels(nextSettings);
        void api.history.list().then((nextHistory) => {
          if (active) {
            setHistory(nextHistory);
          }
        });
        void api.hardware.info().then((nextHardwareInfo) => {
          if (!active) {
            return;
          }
          setHardwareInfo(nextHardwareInfo);
          if (!nextHardwareInfo.gpuAvailable) {
            setGpuUsage((current) => ({ ...current, available: false }));
          }
        });
      });
    });
    const removeWhisperDownloadListener = api.whisper.onDownloadProgress((progress) => {
      setAvailableWhisperModels((models) =>
        models.map((model) =>
          model.id === progress.id
            ? { ...model, state: progress.state, progress: progress.progress }
            : model,
        ),
      );
    });
    const removeLlmDownloadListener = api.llm.onDownloadProgress((progress) => {
      setAvailableLlmModels((models) => {
        if (!models.some((model) => model.id === progress.id)) {
          return [
            ...models,
            {
              id: progress.id,
              label: progress.id,
              fileName: progress.id,
              disk: 'Downloading',
              memory: 'Custom GGUF model',
              vramGb: 0,
              state: progress.state,
              progress: progress.progress,
            },
          ];
        }
        return models.map((model) =>
          model.id === progress.id
            ? { ...model, state: progress.state, progress: progress.progress }
            : model,
        );
      });
    });
    const removeTranscriptPartialListener = api.transcript.onPartial((text) => {
      setTranscriptResult((current) => ({
        ...current,
        text,
        status: 'processing',
        actionPhase: 'processing',
        message: 'Transcribing...',
      }));
    });
    const removeOverlayListener = api.overlay.onState((state) => {
      setOverlayStateByMode((current) => ({
        ...current,
        [state.mode]: state,
      }));
    });
    return () => {
      active = false;
      stopTranscriptLivePreview();
      cancelInitialLoad?.();
      removeWhisperDownloadListener();
      removeLlmDownloadListener();
      removeTranscriptPartialListener();
      removeOverlayListener();
    };
  }, []);

  useEffect(() => {
    if (!hardwareInfo.gpuAvailable) {
      return;
    }

    let active = true;
    const refreshGpuUsage = async (): Promise<void> => {
      try {
        const nextUsage = await api.hardware.usage();
        if (active) {
          setGpuUsage(nextUsage);
        }
      } catch {
        if (active) {
          setGpuUsage((current) => ({ ...current, available: false }));
        }
      }
    };
    void refreshGpuUsage();
    const timer = window.setInterval(() => {
      void refreshGpuUsage();
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [hardwareInfo.gpuAvailable]);

  useEffect(() => {
    const microphoneSettingsKey = [
      settings.microphoneDeviceId,
      settings.microphoneDeviceLabel,
    ].join('\n');
    if (microphoneSettingsKeyRef.current === microphoneSettingsKey) {
      return;
    }
    microphoneSettingsKeyRef.current = microphoneSettingsKey;
    if (!recorder && !transcriptRecorder) {
      return;
    }
    showToast('info', 'Microphone switched.');
    const device = {
      id: settings.microphoneDeviceId,
      label: settings.microphoneDeviceLabel,
    };
    void recorder?.updateMicrophone?.(device).catch(() => {
      showOverlayWarning('speak', 'Selected microphone is not available.', 'error');
    });
    void transcriptRecorder?.updateMicrophone?.(device).catch(() => {
      showOverlayWarning('transcript', 'Selected microphone is not available.', 'error');
    });
  }, [
    settings.microphoneDeviceId,
    settings.microphoneDeviceLabel,
    recorder,
    transcriptRecorder,
  ]);

  useEffect(() => {
    const outputSettingsKey = [
      settings.transcriptOutputDeviceId,
      settings.transcriptOutputDeviceLabel,
    ].join('\n');
    if (transcriptOutputSettingsKeyRef.current === outputSettingsKey) {
      return;
    }
    transcriptOutputSettingsKeyRef.current = outputSettingsKey;
    if (!transcriptRecorder) {
      return;
    }
    showToast('info', 'Transcript audio switched.');
    void transcriptRecorder.updateOutput?.().catch(() => {
      showOverlayWarning('transcript', 'Selected computer audio is not available.', 'error');
    });
  }, [
    settings.transcriptOutputDeviceId,
    settings.transcriptOutputDeviceLabel,
    transcriptRecorder,
  ]);

  useEffect(() => {
    if (!useLocalSpeechRuntime || !audioServerEnabled || !whisperRuntime.runtimeAvailable || !localWhisperModelAvailable || !settings.whisperModel) {
      whisperWarmupModelRef.current = null;
      whisperWarmupRunRef.current += 1;
      setIsWhisperLoading(false);
      return;
    }
    if (whisperWarmupModelRef.current === settings.whisperModel) {
      return;
    }

    const model = settings.whisperModel;
    const runId = whisperWarmupRunRef.current + 1;
    whisperWarmupRunRef.current = runId;
    whisperWarmupModelRef.current = model;
    setIsWhisperLoading(true);
    void api.whisper.warmup(model)
      .catch(() => {
        if (whisperWarmupModelRef.current === model) {
          whisperWarmupModelRef.current = null;
        }
      })
      .finally(() => {
        if (whisperWarmupRunRef.current === runId) {
          setIsWhisperLoading(false);
        }
      });
  }, [audioServerEnabled, useLocalSpeechRuntime, settings.whisperModel, localWhisperModelAvailable, whisperRuntime.runtimeAvailable]);

  useEffect(() => {
    if (!useLocalImproveRuntime || !llmServerEnabled || !llmRuntime.runtimeAvailable || !localLlmModelAvailable || !settings.llmModel) {
      llmWarmupModelRef.current = null;
      llmWarmupRunRef.current += 1;
      setIsLlmLoading(false);
      return;
    }
    const warmupKey = llmWarmupKey(settings.llmModel, settings.llmContextSize, settings.llmPerformanceMode);
    if (llmWarmupModelRef.current === warmupKey) {
      return;
    }

    const model = settings.llmModel;
    const runId = llmWarmupRunRef.current + 1;
    llmWarmupRunRef.current = runId;
    llmWarmupModelRef.current = warmupKey;
    setIsLlmLoading(true);
    void api.llm.warmup(model)
      .catch(() => {
        if (llmWarmupModelRef.current === warmupKey) {
          llmWarmupModelRef.current = null;
        }
      })
      .finally(() => {
        if (llmWarmupRunRef.current === runId) {
          setIsLlmLoading(false);
        }
      });
  }, [llmServerEnabled, useLocalImproveRuntime, settings.llmModel, settings.llmContextSize, settings.llmPerformanceMode, localLlmModelAvailable, llmRuntime.runtimeAvailable, llmWarmupRevision]);

  useEffect(() => {
    if (!isWhisperLoading) {
      if (!audioServerEnabled) {
        setSpeakResult(actionResult('speak', 'warning', { message: 'Audio server stopped.' }));
        setTranscriptResult(actionResult('transcript', 'warning', { message: 'Audio server stopped.' }));
        loadingOverlayRef.current.speak = false;
        loadingOverlayRef.current.transcript = false;
        return;
      }
      setSpeakResult((current) =>
        (
          current.status === 'ready' && current.message === actionUi('speak', 'loading').message
        ) || current.message === 'Audio server stopped.'
          ? speakFallbackResult
          : current,
      );
      setTranscriptResult((current) =>
        (
          current.status === 'ready' && current.message === actionUi('transcript', 'loading').message
        ) || current.message === 'Audio server stopped.'
          ? transcriptFallbackResult
          : current,
      );
      if (loadingOverlayRef.current.speak) {
        loadingOverlayRef.current.speak = false;
        showReadyOverlay('speak');
      }
      if (loadingOverlayRef.current.transcript) {
        loadingOverlayRef.current.transcript = false;
        showReadyOverlay('transcript');
      }
      return;
    }

    if (!loadingOverlayRef.current.speak) {
      loadingOverlayRef.current.speak = true;
      publishOverlayState(actionOverlay('speak', 'loading'));
    }
    if (!loadingOverlayRef.current.transcript) {
      loadingOverlayRef.current.transcript = true;
      publishOverlayState(actionOverlay('transcript', 'loading'));
    }
  }, [audioServerEnabled, isWhisperLoading]);

  useEffect(() => {
    if (!isLlmLoading) {
      if (!llmServerEnabled) {
        setImproveResult(actionResult('improve', 'warning', { message: 'LLM server stopped.' }));
        loadingOverlayRef.current.improve = false;
        return;
      }
      setImproveResult((current) =>
        (
          current.status === 'ready' && current.message === actionUi('improve', 'loading').message
        ) || current.message === 'LLM server stopped.'
          ? improveFallbackResult
          : current,
      );
      if (loadingOverlayRef.current.improve) {
        loadingOverlayRef.current.improve = false;
        showReadyOverlay('improve');
      }
      return;
    }

    if (!loadingOverlayRef.current.improve) {
      loadingOverlayRef.current.improve = true;
      publishOverlayState(actionOverlay('improve', 'loading'));
    }
  }, [isLlmLoading, llmServerEnabled]);


  const downloadWhisperModel = async (id: WhisperAvailableModel['id']): Promise<void> => {
    const nextAvailableWhisperModels = await api.whisper.downloadModel(id);
    setAvailableWhisperModels(nextAvailableWhisperModels);
    await loadModels();
  };

  const deleteWhisperModel = async (id: WhisperAvailableModel['id']): Promise<void> => {
    const nextAvailableWhisperModels = await api.whisper.deleteModel(id);
    setAvailableWhisperModels(nextAvailableWhisperModels);
    await loadModels();
  };

  const downloadLlmModel = async (id: LlmAvailableModel['id']): Promise<void> => {
    markLlmModelDownloading(id);
    const nextAvailableLlmModels = await api.llm.downloadModel(id);
    setAvailableLlmModels(nextAvailableLlmModels);
    await loadModels();
  };

  const downloadCustomLlmModel = async (url: string): Promise<void> => {
    const validationError = customLlmModelUrlError(url);
    if (validationError) {
      showToast('error', validationError);
      return;
    }
    const fileName = customLlmFileName(url);
    if (fileName) {
      markLlmModelDownloading(fileName);
    }
    try {
      const nextAvailableLlmModels = await api.llm.downloadCustomModel(url);
      setAvailableLlmModels(nextAvailableLlmModels);
      await loadModels();
      showToast('success', 'Custom local AI model downloaded.');
    } catch (error) {
      showToast('error', errorMessage(error));
    }
  };

  const markLlmModelDownloading = (id: LlmAvailableModel['id']): void => {
    setAvailableLlmModels((models) => {
      if (!models.some((model) => model.id === id)) {
        return [
          ...models,
          {
            id,
            label: id,
            fileName: id,
            disk: 'Downloading',
            memory: 'Custom GGUF model',
            vramGb: 0,
            state: 'downloading',
            progress: 0,
          },
        ];
      }
      return models.map((model) =>
        model.id === id
          ? { ...model, state: 'downloading', progress: 0 }
          : model,
      );
    });
  };

  const deleteLlmModel = (id: LlmAvailableModel['id']): void => {
    if (deletingLlmModelIds.has(id)) {
      return;
    }
    setDeletingLlmModelIds((current) => new Set(current).add(id));
    void api.llm.deleteModel(id)
      .then(async (nextAvailableLlmModels) => {
        setAvailableLlmModels(nextAvailableLlmModels);
        await loadModels();
        showToast('success', 'Local AI model deleted.');
      })
      .catch((error) => {
        showToast('error', errorMessage(error));
      })
      .finally(() => {
        setDeletingLlmModelIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      });
  };

  const startRecording = async (): Promise<void> => {
    if (useLocalSpeechRuntime && !audioServerEnabled) {
      showOverlayWarning('speak', 'Audio server stopped.');
      return;
    }
    if (!useLocalSpeechRuntime && !remoteSpeechReady) {
      const message = 'Remote speech server settings missing.';
      setMode('speak');
      setSpeakResult(actionResult('speak', 'error', { message }));
      showOverlayWarning('speak', message, 'error');
      return;
    }
    if (!effectiveWhisperRuntime.runtimeAvailable) {
      setMode('speak');
      setSpeakResult(actionResult('speak', 'error', { message: actionMessages.whisperMissing }));
      showOverlayWarning('speak', actionMessages.whisperMissing, 'error');
      return;
    }
    if (!whisperModelAvailable) {
      setMode('speak');
      setSpeakResult(actionResult('speak', 'error', { message: actionMessages.whisperModelMissing }));
      showOverlayWarning('speak', actionMessages.whisperModelMissing, 'error');
      return;
    }
    const blockMessage = actionBlockMessage('speak', audioLockState);
    if (blockMessage) {
      if (isSameActionProcessingBlock('speak', blockMessage)) {
        return;
      }
      showOverlayWarning('speak', blockMessage);
      return;
    }
    setMode('speak');
    recordingActiveRef.current.speak = true;
    startAudioWarningTimer('speakMic', 'No microphone audio. Check settings.');
    recordingStartedAtRef.current.speak = Date.now();
    publishOverlayState(overlayRecording('speak', defaultWaveform().slice(-overlayWaveformSize), undefined, undefined, 'recording', {
      recordingStartedAtMs: recordingStartedAtRef.current.speak,
    }));
    try {
      setRecorder(
        await startWavRecorder(
          (level) => {
            setWaveform((current) => {
              if (!recordingActiveRef.current.speak) {
                return current;
              }
              if (level > 0.1) {
                markAudioDetected('speakMic');
              }
              const nextWaveform = nextVisualWaveform(current, level);
              publishOverlayState(overlayRecording(
                'speak',
                nextWaveform.slice(-overlayWaveformSize),
                overlayNoticeRef.current.speak?.message,
                overlayNoticeRef.current.speak?.messageType,
                'recording',
                { recordingStartedAtMs: recordingStartedAtRef.current.speak },
              ));
              return nextWaveform;
            });
          },
          {
            id: settings.microphoneDeviceId,
            label: settings.microphoneDeviceLabel,
          },
        ),
      );
    } catch (error) {
      const message = errorMessage(error);
      setSpeakResult(actionResult('speak', 'error', { message }));
      showOverlayWarning('speak', message, 'error');
    }
  };

  const stopRecording = async (): Promise<void> => {
    if (!recorder) {
      return;
    }

    setRecorder(null);
    recordingActiveRef.current.speak = false;
    delete recordingStartedAtRef.current.speak;
    clearAudioWarningTimer('speakMic');
    setWaveform(defaultWaveform());
    setIsSpeakProcessing(true);
    clearOverlayWarningTimer('speak');
    publishOverlayState(overlayProcessing('speak', defaultWaveform().slice(-overlayWaveformSize), undefined, undefined, {
      phase: 'transcribing',
    }));
    try {
      const audio = await recorder.stop();
      const nextResult = await api.dictation.start(audio);
      setSpeakResult(normalizeCopyResult('speak', nextResult));
      showCopyToast(nextResult);
      if (!nextResult.text) {
        showOverlayWarning('speak', nextResult.message);
        setWhisperRuntime(await api.whisper.runtimeInfo());
        await refreshHistoryAndModels();
        return;
      }
      showCompletionOverlay('speak', nextResult);
      setWhisperRuntime(await api.whisper.runtimeInfo());
      await refreshHistoryAndModels();
      if (settingsRef.current.improveAfterSpeak) {
        void improveAfterSpeak(nextResult.text);
      }
    } catch (error) {
      delete recordingStartedAtRef.current.speak;
      const message = errorMessage(error);
      setSpeakResult(actionResult('speak', 'error', { message }));
      showOverlayWarning('speak', message, 'error');
    } finally {
      setIsSpeakProcessing(false);
    }
  };

  const cancelRecording = async (recordingMode: 'speak' | 'transcript'): Promise<void> => {
    const activeRecorder = recordingMode === 'speak' ? recorder : transcriptRecorder;
    if (!activeRecorder) {
      return;
    }
    if (recordingMode === 'speak') {
      setRecorder(null);
      recordingActiveRef.current.speak = false;
      delete recordingStartedAtRef.current.speak;
      clearAudioWarningTimer('speakMic');
      setSpeakResult(actionResult('speak', 'warning', { message: actionMessages.recordingCancelled }));
    } else {
      setTranscriptRecorder(null);
      recordingActiveRef.current.transcript = false;
      delete recordingStartedAtRef.current.transcript;
      cancelTranscriptLivePreview();
      clearAudioWarningTimer('transcriptMic');
      clearAudioWarningTimer('transcriptSystem');
      setTranscriptResult(actionResult('transcript', 'warning', { message: actionMessages.recordingCancelled }));
    }
    delete overlayNoticeRef.current[recordingMode];
    setWaveform(defaultWaveform());
    if (recordingMode === 'transcript') {
      resetTranscriptAudioLevels();
    }
    publishOverlayState(overlayInactive(recordingMode));
    window.setTimeout(() => {
      void activeRecorder.cancel();
    }, 0);
  };

  const refreshHistoryAndModels = async (): Promise<void> => {
    const [nextHistory] = await Promise.all([api.history.list(), loadModels()]);
    setHistory(nextHistory);
  };

  const refreshModelsFromSettings = async (): Promise<void> => {
    await loadModels();
    showToast('success', 'Models refreshed.');
  };

  const setAudioServerRunning = async (enabled: boolean): Promise<void> => {
    if (!settingsRef.current.useLocalSpeechRuntime) {
      showToast('error', 'Local runtime is disabled.');
      return;
    }
    setAudioServerEnabled(enabled);
    await api.server.setEnabled('audio', enabled);
    if (!enabled) {
      if (recorder) {
        await cancelRecording('speak');
      }
      if (transcriptRecorder) {
        await cancelRecording('transcript');
      }
      whisperWarmupModelRef.current = null;
      whisperWarmupRunRef.current += 1;
      setIsWhisperLoading(false);
      try {
        await api.whisper.stopServer();
        showToast('success', 'Audio server stopped.');
      } catch (error) {
        showToast('error', errorMessage(error));
      }
      return;
    }
    if (!whisperRuntime.runtimeAvailable || !localWhisperModelAvailable || !settingsRef.current.whisperModel) {
      showToast('error', actionMessages.whisperModelMissing);
      return;
    }
    const model = settingsRef.current.whisperModel;
    setIsWhisperLoading(true);
    whisperWarmupModelRef.current = model;
    try {
      await api.whisper.warmup(model);
      showToast('success', 'Audio server started.');
    } catch (error) {
      if (whisperWarmupModelRef.current === model) {
        whisperWarmupModelRef.current = null;
      }
      showToast('error', errorMessage(error));
    } finally {
      setIsWhisperLoading(false);
    }
  };

  const setLlmServerRunning = async (enabled: boolean): Promise<void> => {
    if (!settingsRef.current.useLocalImproveRuntime) {
      showToast('error', 'Local runtime is disabled.');
      return;
    }
    setLlmServerEnabled(enabled);
    await api.server.setEnabled('llm', enabled);
    if (!enabled) {
      improveRunRef.current += 1;
      if (isImproveProcessing) {
        setIsImproveProcessing(false);
        setImproveResult(actionResult('improve', 'warning', { message: 'LLM server stopped.' }));
        showOverlayWarning('improve', 'LLM server stopped.');
      }
      llmWarmupModelRef.current = null;
      llmWarmupRunRef.current += 1;
      setIsLlmLoading(false);
      try {
        await api.llm.stopServer();
        showToast('success', 'LLM server stopped.');
      } catch (error) {
        showToast('error', errorMessage(error));
      }
      return;
    }
    if (!llmRuntime.runtimeAvailable || !localLlmModelAvailable || !settingsRef.current.llmModel) {
      showToast('error', actionMessages.llamaModelMissing);
      return;
    }
    const warmupKey = llmWarmupKey(settingsRef.current.llmModel, settingsRef.current.llmContextSize, settingsRef.current.llmPerformanceMode);
    const model = settingsRef.current.llmModel;
    setIsLlmLoading(true);
    llmWarmupModelRef.current = warmupKey;
    try {
      await api.llm.warmup(model);
      showToast('success', 'LLM server started.');
    } catch (error) {
      if (llmWarmupModelRef.current === warmupKey) {
        llmWarmupModelRef.current = null;
      }
      showToast('error', errorMessage(error));
    } finally {
      setIsLlmLoading(false);
    }
  };

  const improve = async (sourceOverride?: string): Promise<void> => {
    if (isImproveProcessing) {
      return;
    }
    setMode('improve');
    if (useLocalImproveRuntime && !llmServerEnabled) {
      showOverlayWarning('improve', 'LLM server stopped.');
      return;
    }
    if (!useLocalImproveRuntime && !remoteImproveReady) {
      const message = 'Remote improve server settings missing.';
      setImproveResult(actionResult('improve', 'error', { message }));
      showOverlayWarning('improve', message, 'error');
      return;
    }
    const blockMessage = actionBlockMessage('improve', audioLockState);
    if (blockMessage) {
      showOverlayWarning('improve', blockMessage);
      return;
    }
    if (!effectiveLlmRuntime.runtimeAvailable) {
      setImproveResult(actionResult('improve', 'error', { message: actionMessages.llamaMissing }));
      showOverlayWarning('improve', actionMessages.llamaMissing, 'error');
      return;
    }
    if (!llmModelAvailable) {
      setImproveResult(actionResult('improve', 'error', { message: actionMessages.llamaModelMissing }));
      showOverlayWarning('improve', actionMessages.llamaModelMissing, 'error');
      return;
    }
    const sourceText = sourceOverride ?? (isImproveInputFocused
      ? improveInput
      : settings.improveSelectedText
        ? await api.clipboard.readSelection()
        : await api.clipboard.read());
    if ((sourceOverride || !isImproveInputFocused) && sourceText) {
      setImproveInput(sourceText);
    }
    if (!sourceText.trim()) {
      const message = isImproveInputFocused && !sourceOverride ? actionMessages.enterTextToImprove : actionMessages.clipboardEmpty;
      setImproveResult(actionResult('improve', 'error', { message }));
      showOverlayWarning('improve', message);
      return;
    }
    setIsImproveProcessing(true);
    const runId = improveRunRef.current + 1;
    improveRunRef.current = runId;
    clearOverlayWarningTimer('improve');
    publishOverlayState(overlayProcessing('improve', [], undefined, undefined, {
      phase: 'thinking',
    }));
    try {
      const nextResult = await api.text.improve(sourceText);
      if (improveRunRef.current !== runId) {
        return;
      }
      setImproveResult(normalizeCopyResult('improve', nextResult));
      showCopyToast(nextResult);
      if (!nextResult.text) {
        showOverlayWarning('improve', nextResult.message);
        await refreshHistoryAndModels();
        return;
      }
      showCompletionOverlay('improve', nextResult);
      await refreshHistoryAndModels();
    } catch (error) {
      if (improveRunRef.current !== runId) {
        return;
      }
      const message = errorMessage(error);
      setImproveResult(actionResult('improve', 'error', { message }));
      showOverlayWarning('improve', message, 'error');
    } finally {
      if (improveRunRef.current === runId) {
        setIsImproveProcessing(false);
      }
    }
  };

  const autoImproveBlockMessage = (): string | null => {
    const serverMessage = serverBlockMessage('improve', useLocalSpeechRuntime, useLocalImproveRuntime, audioServerEnabled, llmServerEnabled);
    if (serverMessage) {
      return serverMessage;
    }
    const blockMessage = actionBlockMessage('improve', audioLockState);
    if (blockMessage) {
      return blockMessage;
    }
    if (!useLocalImproveRuntime && !remoteImproveReady) {
      return 'Remote improve server settings missing.';
    }
    if (!effectiveLlmRuntime.runtimeAvailable) {
      return actionMessages.llamaMissing;
    }
    if (!llmModelAvailable) {
      return actionMessages.llamaModelMissing;
    }
    return null;
  };

  const improveAfterSpeak = async (text: string): Promise<void> => {
    if (autoImproveBlockMessage()) {
      return;
    }
    await improve(text);
  };

  const resetTranscriptAudioLevels = (): void => {
    const nextMicrophoneWaveform = defaultWaveform();
    const nextSystemAudioWaveform = defaultWaveform();
    transcriptMicrophoneWaveformRef.current = nextMicrophoneWaveform;
    transcriptSystemAudioWaveformRef.current = nextSystemAudioWaveform;
    setTranscriptMicrophoneWaveform(nextMicrophoneWaveform);
    setTranscriptSystemAudioWaveform(nextSystemAudioWaveform);
  };

  const startTranscriptLivePreview = (): void => {
    stopTranscriptLivePreview();
    resetTranscriptLiveSegments();
    const runId = transcriptLiveRunIdRef.current + 1;
    transcriptLiveRunIdRef.current = runId;
    transcriptLivePreviewTimerRef.current = window.setInterval(() => {
      const task = closeTranscriptLiveSegment(runId);
      transcriptLiveSegmentCloseTaskRef.current = task;
      void task.finally(() => {
        if (transcriptLiveSegmentCloseTaskRef.current === task) {
          transcriptLiveSegmentCloseTaskRef.current = null;
        }
      });
    }, 1000);
  };

  const stopTranscriptLivePreview = (): void => {
    if (transcriptLivePreviewTimerRef.current !== null) {
      window.clearInterval(transcriptLivePreviewTimerRef.current);
      transcriptLivePreviewTimerRef.current = null;
    }
  };

  const cancelTranscriptLivePreview = (): void => {
    transcriptLiveRunIdRef.current += 1;
    stopTranscriptLivePreview();
    transcriptLivePreviewTaskRef.current = null;
    transcriptLivePreviewTaskRunIdRef.current = 0;
    transcriptLivePreviewRunningRef.current = false;
    transcriptLivePreviewTranscribingRef.current = false;
    transcriptLiveSegmentClosingRef.current = false;
  };

  const resetTranscriptLiveSegments = (): void => {
    transcriptLiveSegmentsRef.current = [];
    transcriptLiveNextSegmentIdRef.current = 1;
    transcriptLiveTextRef.current = '';
  };

  const enqueueTranscriptLiveSegment = (audio: ArrayBuffer): void => {
    if (audio.byteLength === 0) {
      return;
    }
    transcriptLiveSegmentsRef.current.push(
      createTranscriptLiveSegment(transcriptLiveNextSegmentIdRef.current, audio),
    );
    transcriptLiveNextSegmentIdRef.current += 1;
  };

  const closeTranscriptLiveSegment = async (runId: number): Promise<void> => {
    if (
      runId !== transcriptLiveRunIdRef.current ||
      !recordingActiveRef.current.transcript ||
      transcriptLiveSegmentClosingRef.current
    ) {
      return;
    }
    transcriptLiveSegmentClosingRef.current = true;
    try {
      const audio = await api.audioCapture.previewChunk('transcript', {
        chunkMs: settingsRef.current.transcriptLiveChunkSeconds * 1000,
      });
      if (!audio || runId !== transcriptLiveRunIdRef.current || !recordingActiveRef.current.transcript) {
        return;
      }
      enqueueTranscriptLiveSegment(audio);
      void startTranscriptLiveSegmentWorker(runId).catch(() => {
        if (runId === transcriptLiveRunIdRef.current) {
          stopTranscriptLivePreview();
        }
      });
    } catch {
      stopTranscriptLivePreview();
    } finally {
      if (runId === transcriptLiveRunIdRef.current) {
        transcriptLiveSegmentClosingRef.current = false;
      }
    }
  };

  const startTranscriptLiveSegmentWorker = (runId = transcriptLiveRunIdRef.current): Promise<void> => {
    if (transcriptLivePreviewTaskRef.current && transcriptLivePreviewTaskRunIdRef.current === runId) {
      return transcriptLivePreviewTaskRef.current;
    }
    const task = runTranscriptLiveSegmentWorker(runId);
    transcriptLivePreviewTaskRef.current = task;
    transcriptLivePreviewTaskRunIdRef.current = runId;
    void task.finally(() => {
      if (transcriptLivePreviewTaskRef.current === task) {
        transcriptLivePreviewTaskRef.current = null;
        transcriptLivePreviewTaskRunIdRef.current = 0;
      }
    });
    return task;
  };

  const runTranscriptLiveSegmentWorker = async (runId: number): Promise<void> => {
    if (runId !== transcriptLiveRunIdRef.current || transcriptLivePreviewRunningRef.current) {
      return;
    }
    transcriptLivePreviewRunningRef.current = true;
    transcriptLivePreviewTranscribingRef.current = true;
    try {
      if (recordingActiveRef.current.transcript) {
        publishOverlayState(overlayRecording(
          'transcript',
          transcriptSystemAudioWaveformRef.current.slice(-overlayWaveformSize),
          'Recording...',
          'info',
          'recording',
          {
            microphoneWaveform: transcriptMicrophoneWaveformRef.current.slice(-overlayWaveformSize),
            systemAudioWaveform: transcriptSystemAudioWaveformRef.current.slice(-overlayWaveformSize),
          progressLabel: 'Transcribing live preview',
          recordingStartedAtMs: recordingStartedAtRef.current.transcript,
        },
      ));
      }
      while (true) {
        if (runId !== transcriptLiveRunIdRef.current) {
          return;
        }
        const segment = nextTranscriptLiveSegment(transcriptLiveSegmentsRef.current);
        if (!segment) {
          return;
        }
        segment.status = 'transcribing';
        segment.attempts += 1;
        try {
          const text = await api.transcript.preview(segment.audio);
          if (runId !== transcriptLiveRunIdRef.current) {
            return;
          }
          segment.text = text;
          segment.status = 'done';
          publishTranscriptLiveText();
        } catch (error) {
          if (runId !== transcriptLiveRunIdRef.current) {
            return;
          }
          segment.status = 'failed';
          if (!nextTranscriptLiveSegment(transcriptLiveSegmentsRef.current)) {
            throw error;
          }
        }
      }
    } finally {
      if (runId !== transcriptLiveRunIdRef.current) {
        return;
      }
      transcriptLivePreviewTranscribingRef.current = false;
      if (recordingActiveRef.current.transcript) {
        publishTranscriptRecordingOverlay(
          transcriptSystemAudioWaveformRef.current,
          transcriptMicrophoneWaveformRef.current,
        );
      }
      transcriptLivePreviewRunningRef.current = false;
    }
  };

  const publishTranscriptLiveText = (): string => {
    const text = assembleTranscriptLiveSegments(transcriptLiveSegmentsRef.current);
    transcriptLiveTextRef.current = text;
    if (text.trim()) {
      setTranscriptResult((current) => ({
        ...current,
        text,
        status: 'processing',
        actionPhase: 'processing',
        message: 'Transcribing...',
      }));
    }
    return text;
  };

  const drainTranscriptLiveSegments = async (runId = transcriptLiveRunIdRef.current): Promise<string> => {
    while (
      hasRetryableTranscriptLiveSegments(transcriptLiveSegmentsRef.current) ||
      (transcriptLivePreviewTaskRef.current && transcriptLivePreviewTaskRunIdRef.current === runId)
    ) {
      await (
        transcriptLivePreviewTaskRef.current && transcriptLivePreviewTaskRunIdRef.current === runId
          ? transcriptLivePreviewTaskRef.current
          : startTranscriptLiveSegmentWorker(runId)
      );
    }
    if (hasFailedTranscriptLiveSegments(transcriptLiveSegmentsRef.current)) {
      throw new Error('Transcript segment failed.');
    }
    return publishTranscriptLiveText();
  };

  const publishTranscriptRecordingOverlay = (
    systemAudioWaveform: number[],
    microphoneWaveform: number[],
    message = overlayNoticeRef.current.transcript?.message,
    messageType = overlayNoticeRef.current.transcript?.messageType,
  ): void => {
    publishOverlayState(overlayRecording(
      'transcript',
      systemAudioWaveform.slice(-overlayWaveformSize),
      message,
      messageType,
      'recording',
      {
        microphoneWaveform: microphoneWaveform.slice(-overlayWaveformSize),
        systemAudioWaveform: systemAudioWaveform.slice(-overlayWaveformSize),
        progressLabel: transcriptLivePreviewTranscribingRef.current ? 'Transcribing live preview' : undefined,
        recordingStartedAtMs: recordingStartedAtRef.current.transcript,
      },
    ));
  };

  const startTranscript = async (): Promise<void> => {
    if (useLocalSpeechRuntime && !audioServerEnabled) {
      setMode('transcript');
      showOverlayWarning('transcript', 'Audio server stopped.');
      return;
    }
    if (!useLocalSpeechRuntime && !remoteSpeechReady) {
      const message = 'Remote speech server settings missing.';
      setSection('home');
      setMode('transcript');
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
      return;
    }
    if (!effectiveWhisperRuntime.runtimeAvailable) {
      setSection('home');
      setMode('transcript');
      setTranscriptResult(actionResult('transcript', 'error', { message: actionMessages.whisperMissing }));
      showOverlayWarning('transcript', actionMessages.whisperMissing, 'error');
      return;
    }
    if (!whisperModelAvailable) {
      setSection('home');
      setMode('transcript');
      setTranscriptResult(actionResult('transcript', 'error', { message: actionMessages.whisperModelMissing }));
      showOverlayWarning('transcript', actionMessages.whisperModelMissing, 'error');
      return;
    }
    const blockMessage = actionBlockMessage('transcript', audioLockState);
    if (blockMessage) {
      if (isSameActionProcessingBlock('transcript', blockMessage)) {
        return;
      }
      showOverlayWarning('transcript', blockMessage);
      return;
    }
    setSection('home');
    setMode('transcript');
    recordingActiveRef.current.transcript = true;
    recordingStartedAtRef.current.transcript = Date.now();
    resetTranscriptAudioLevels();
    startAudioWarningTimer('transcriptSystem', 'No computer audio. Check settings.');
    publishTranscriptRecordingOverlay(
      transcriptSystemAudioWaveformRef.current,
      transcriptMicrophoneWaveformRef.current,
    );
    try {
      setTranscriptRecorder(
        await startTranscriptRecorder(
          (level) => {
            setWaveform((current) => {
              if (!recordingActiveRef.current.transcript) {
                return current;
              }
              const nextWaveform = nextVisualWaveform(current, level);
              return nextWaveform;
            });
          },
          {
            microphoneDevice: {
              id: settings.microphoneDeviceId,
              label: settings.microphoneDeviceLabel,
            },
            onMicrophoneLevel: (level) => {
              if (!recordingActiveRef.current.transcript) {
                return;
              }
              if (level > 0.1) {
                markAudioDetected('transcriptMic');
              }
              setTranscriptMicrophoneWaveform((current) => {
                const nextWaveform = nextVisualWaveform(current, level);
                transcriptMicrophoneWaveformRef.current = nextWaveform;
                publishTranscriptRecordingOverlay(transcriptSystemAudioWaveformRef.current, nextWaveform);
                return nextWaveform;
              });
            },
            onSystemAudioChange: (active) => {
              if (!recordingActiveRef.current.transcript) {
                return;
              }
              setTranscriptResult((current) => ({
                ...current,
                message: active
                  ? actionUi('transcript', 'recording').message
                  : `${actionUi('transcript', 'recording').message} Computer audio is not captured.`,
              }));
            },
            onSystemAudioLevel: (level) => {
              if (!recordingActiveRef.current.transcript) {
                return;
              }
              if (level > 0.1) {
                markAudioDetected('transcriptSystem');
              }
              setTranscriptSystemAudioWaveform((current) => {
                const nextWaveform = nextVisualWaveform(current, level);
                transcriptSystemAudioWaveformRef.current = nextWaveform;
                publishTranscriptRecordingOverlay(nextWaveform, transcriptMicrophoneWaveformRef.current);
                return nextWaveform;
              });
            },
          },
        ),
      );
      startTranscriptLivePreview();
    } catch (error) {
      delete recordingStartedAtRef.current.transcript;
      const message = errorMessage(error);
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
    }
  };

  const stopTranscript = async (): Promise<void> => {
    if (!transcriptRecorder) {
      return;
    }

    stopTranscriptLivePreview();
    await transcriptLiveSegmentCloseTaskRef.current;
    const transcriptRunId = transcriptLiveRunIdRef.current;
    setTranscriptRecorder(null);
    recordingActiveRef.current.transcript = false;
    delete recordingStartedAtRef.current.transcript;
    clearAudioWarningTimer('transcriptMic');
    clearAudioWarningTimer('transcriptSystem');
    setWaveform(defaultWaveform());
    resetTranscriptAudioLevels();
    setIsTranscriptProcessing(true);
    clearOverlayWarningTimer('transcript');
    publishOverlayState(overlayProcessing('transcript', defaultWaveform().slice(-overlayWaveformSize), undefined, undefined, {
      phase: 'transcribing',
      progressLabel: 'Preparing transcript',
    }));
    try {
      const { audio, finalSegmentAudio } = transcriptRecorder.stopTranscript
        ? await transcriptRecorder.stopTranscript()
        : await transcriptRecorder.stop().then((audio) => ({ audio, finalSegmentAudio: audio }));
      const text = await enqueueFinalTranscriptLiveSegmentAfterCurrentTask(
        transcriptLivePreviewTaskRunIdRef.current === transcriptRunId ? transcriptLivePreviewTaskRef.current : null,
        () => enqueueTranscriptLiveSegment(finalSegmentAudio),
        () => drainTranscriptLiveSegments(transcriptRunId),
      );
      const nextResult = await api.transcript.save(audio, text);
      setTranscriptResult(nextResult);
      if (!nextResult.text) {
        showOverlayWarning('transcript', nextResult.message);
        setWhisperRuntime(await api.whisper.runtimeInfo());
        await refreshHistoryAndModels();
        return;
      }
      showCompletionOverlay('transcript', nextResult);
      setWhisperRuntime(await api.whisper.runtimeInfo());
      await refreshHistoryAndModels();
    } catch (error) {
      const message = errorMessage(error);
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
    } finally {
      setIsTranscriptProcessing(false);
    }
  };

  const importAudio = async (): Promise<void> => {
    if (!useLocalSpeechRuntime && !remoteSpeechReady) {
      const message = 'Remote speech server settings missing.';
      setSection('home');
      setMode('transcript');
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
      return;
    }
    if (!effectiveWhisperRuntime.runtimeAvailable) {
      setSection('home');
      setMode('transcript');
      setTranscriptResult(actionResult('transcript', 'error', { message: actionMessages.whisperMissing }));
      showOverlayWarning('transcript', actionMessages.whisperMissing, 'error');
      return;
    }
    if (!whisperModelAvailable) {
      setSection('home');
      setMode('transcript');
      setTranscriptResult(actionResult('transcript', 'error', { message: actionMessages.whisperModelMissing }));
      showOverlayWarning('transcript', actionMessages.whisperModelMissing, 'error');
      return;
    }
    const blockMessage = actionBlockMessage('transcript', audioLockState);
    if (blockMessage) {
      showOverlayWarning('transcript', blockMessage);
      return;
    }
    try {
      const audio = await api.app.importAudio();
      if (!audio) {
        return;
      }
      setSection('home');
      setMode('transcript');
      setWaveform(defaultWaveform());
      resetTranscriptAudioLevels();
      setIsTranscriptProcessing(true);
      clearOverlayWarningTimer('transcript');
      publishOverlayState(overlayProcessing('transcript', defaultWaveform().slice(-overlayWaveformSize), undefined, undefined, {
        phase: 'transcribing',
      }));
      await transcribeAudio(audio, false);
    } catch (error) {
      const message = errorMessage(error);
      showToast('error', message);
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
    } finally {
      setIsTranscriptProcessing(false);
    }
  };

  const transcribeAudio = async (audio: ArrayBuffer, progressive: boolean): Promise<void> => {
    const nextResult = await api.transcript.start(audio, { progressive });
    setTranscriptResult(nextResult);
    if (!nextResult.text) {
      showOverlayWarning('transcript', nextResult.message);
      setWhisperRuntime(await api.whisper.runtimeInfo());
      await refreshHistoryAndModels();
      return;
    }
    showCompletionOverlay('transcript', nextResult);
    setWhisperRuntime(await api.whisper.runtimeInfo());
    await refreshHistoryAndModels();
  };

  const copy = async (): Promise<void> => {
    await api.clipboard.write(result.text);
    showToast('info', appMessages.copiedToClipboard);
  };

  const exportResult = async (): Promise<void> => {
    const exported = await api.text.export(result.text);
    if (exported) {
      showToast('success', 'Result exported.');
    }
  };

  const deleteEntry = async (id: string): Promise<void> => {
    await api.history.delete(id);
    setHistory(history.filter((entry) => entry.id !== id));
    showToast('info', 'History entry deleted.');
  };

  const toggleHistoryFavorite = async (id: string): Promise<void> => {
    setHistory(await api.history.toggleFavorite(id));
  };

  const updateHistoryTitle = async (id: string, title: string): Promise<void> => {
    setHistory(await api.history.updateTitle(id, title));
  };

  const deleteSelectedEntries = async (ids: string[]): Promise<void> => {
    await Promise.all(ids.map((id) => api.history.delete(id)));
    setHistory(history.filter((entry) => !ids.includes(entry.id)));
    showToast('info', 'Selected history deleted.');
  };

  const clearHistory = async (): Promise<void> => {
    if (!window.confirm('Clear all history? This cannot be undone.')) {
      return;
    }
    setHistory(await api.history.clear());
    showToast('info', 'History cleared.');
  };

  const resetSettings = async (): Promise<void> => {
    if (!window.confirm('Reset all settings to defaults? This cannot be undone.')) {
      return;
    }
    await saveSettings({
      ...defaultSettings,
      llmModel: settingsRef.current.llmModel,
      whisperModel: settingsRef.current.whisperModel,
    });
    await loadModels(settingsRef.current);
    showToast('success', 'Settings reset.');
  };

  const saveSettings = async (nextSettings: SettingsType): Promise<void> => {
    const previousSettings = settings;
    const savedSettings = await api.settings.save(nextSettings);
    const saved = settingsAreEqual(nextSettings, savedSettings);
    settingsRef.current = savedSettings;
    setSettings(savedSettings);
    if (!savedSettings.useLocalSpeechRuntime) {
      setAudioServerEnabled(false);
      setIsWhisperLoading(false);
    }
    if (!savedSettings.useLocalImproveRuntime) {
      setLlmServerEnabled(false);
      setIsLlmLoading(false);
    }
    if (!saved) {
      showToast('error', 'This shortcut cannot be used.');
      return;
    }
    if (nextSettings.hotkeys.speak !== previousSettings.hotkeys.speak) {
      showToast('success', 'Speak shortcut updated.');
      return;
    }
    if (nextSettings.hotkeys.improveText !== previousSettings.hotkeys.improveText) {
      showToast('success', 'Improve shortcut updated.');
      return;
    }
    if (nextSettings.hotkeys.transcript !== previousSettings.hotkeys.transcript) {
      showToast('success', 'Transcript shortcut updated.');
      return;
    }
    if (
      savedSettings.useLocalImproveRuntime &&
      (savedSettings.llmModel !== previousSettings.llmModel ||
      savedSettings.llmContextSize !== previousSettings.llmContextSize ||
      savedSettings.llmPerformanceMode !== previousSettings.llmPerformanceMode)
    ) {
      llmWarmupModelRef.current = null;
      setLlmWarmupRevision((current) => current + 1);
    }
    if (!settingsAreEqual(savedSettings, previousSettings)) {
      showToast('success', 'Settings updated.');
    }
  };

  const changeSettings = async (nextSettings: SettingsType): Promise<void> => {
    await saveSettings(nextSettings);
  };

  const showToast = (type: ToastType, message: string): void => {
    setToast({ id: Date.now(), type, message });
  };

  const showSettingsToast = (type: ToastType, message: string): void => {
    setToast({
      id: Date.now(),
      type,
      message,
      actionLabel: 'Settings',
      onAction: () => {
        setToast(null);
        openSettingsFocus('microphone');
      },
    });
  };

  const startAudioWarningTimer = (
    key: 'speakMic' | 'transcriptMic' | 'transcriptSystem',
    message: string,
  ): void => {
    window.clearTimeout(audioWarningTimerRef.current[key]);
    audioWarningShownRef.current[key] = false;
    audioWarningTimerRef.current[key] = window.setTimeout(() => {
      if (audioWarningShownRef.current[key]) {
        return;
      }
      audioWarningShownRef.current[key] = true;
      showSettingsToast('warning', message);
      showAdditionalInfoOverlay(message);
    }, 30000);
  };

  const clearAudioWarningTimer = (key: 'speakMic' | 'transcriptMic' | 'transcriptSystem'): void => {
    window.clearTimeout(audioWarningTimerRef.current[key]);
    delete audioWarningTimerRef.current[key];
  };

  const markAudioDetected = (key: 'speakMic' | 'transcriptMic' | 'transcriptSystem'): void => {
    if (audioWarningShownRef.current[key]) {
      return;
    }
    clearAudioWarningTimer(key);
  };

  const showCopyToast = (nextResult: ResultState): void => {
    if (nextResult.message === appMessages.copiedToClipboard) {
      showToast('info', appMessages.copiedToClipboard);
    }
  };

  const showCompletionOverlay = (
    overlayMode: 'speak' | 'improve' | 'transcript',
    nextResult: ResultState,
  ): void => {
    clearOverlayWarningTimer(overlayMode);
    clearOverlayHideTimer(overlayMode);
    if (nextResult.status !== 'ready' || !nextResult.text) {
      publishOverlayState(overlayInactive(overlayMode));
      return;
    }
    publishOverlayState(overlayDone(
      overlayMode,
      actionUi(overlayMode, 'ready').message,
      'success',
    ));
    overlayHideTimerRef.current[overlayMode] = window.setTimeout(() => {
      publishOverlayState(overlayInactive(overlayMode));
    }, 1800);
  };

  const showReadyOverlay = (overlayMode: 'speak' | 'improve' | 'transcript'): void => {
    clearOverlayHideTimer(overlayMode);
    publishOverlayState(overlayDone(
      overlayMode,
      actionUi(overlayMode, 'ready').message,
      'success',
    ));
    overlayHideTimerRef.current[overlayMode] = window.setTimeout(() => {
      publishOverlayState(overlayInactive(overlayMode));
    }, 1800);
  };

  const clearOverlayHideTimer = (overlayMode: OverlayMode): void => {
    const timer = overlayHideTimerRef.current[overlayMode];
    if (timer) {
      window.clearTimeout(timer);
      delete overlayHideTimerRef.current[overlayMode];
    }
  };

  const showAdditionalInfoOverlay = (message: string): void => {
    clearOverlayWarningTimer('additional-info');
    publishOverlayState(overlayWarning('additional-info', message, 'warning'));
    overlayWarningTimerRef.current['additional-info'] = window.setTimeout(() => {
      delete overlayWarningTimerRef.current['additional-info'];
      publishOverlayState(overlayInactive('additional-info', 'warning'));
    }, 4200);
  };

  const showOverlayWarning = (
    overlayMode: 'speak' | 'improve' | 'transcript',
    message: string,
    messageType: 'error' | 'success' | 'warning' | 'info' = 'warning',
  ): void => {
    overlayNoticeRef.current[overlayMode] = { message, messageType };
    clearOverlayWarningTimer(overlayMode);
    if (overlayMode === 'speak' && recordingActiveRef.current.speak) {
      publishOverlayState(overlayRecording('speak', waveform.slice(-overlayWaveformSize), message, messageType, 'recording', {
        recordingStartedAtMs: recordingStartedAtRef.current.speak,
      }));
    } else if (overlayMode === 'speak' && isSpeakProcessing) {
      publishOverlayState(overlayProcessing('speak', waveform.slice(-overlayWaveformSize), message, messageType));
    } else if (overlayMode === 'transcript' && recordingActiveRef.current.transcript) {
      publishTranscriptRecordingOverlay(
        transcriptSystemAudioWaveformRef.current,
        transcriptMicrophoneWaveformRef.current,
        message,
        messageType,
      );
    } else if (overlayMode === 'transcript' && isTranscriptProcessing) {
      publishOverlayState(overlayProcessing('transcript', waveform.slice(-overlayWaveformSize), message, messageType));
    } else if (overlayMode === 'improve' && isImproveProcessing) {
      publishOverlayState(overlayProcessing('improve', [], message, messageType));
    } else {
      publishOverlayState(overlayWarning(overlayMode, message, messageType));
    }
    overlayWarningTimerRef.current[overlayMode] = window.setTimeout(() => {
      delete overlayNoticeRef.current[overlayMode];
      delete overlayWarningTimerRef.current[overlayMode];
      if (overlayMode === 'speak' && recordingActiveRef.current.speak) {
        publishOverlayState(overlayRecording('speak', waveform.slice(-overlayWaveformSize), undefined, undefined, 'recording', {
          recordingStartedAtMs: recordingStartedAtRef.current.speak,
        }));
        return;
      }
      if (overlayMode === 'speak' && isSpeakProcessing) {
        publishOverlayState(overlayProcessing('speak', waveform.slice(-overlayWaveformSize)));
        return;
      }
      if (overlayMode === 'transcript' && recordingActiveRef.current.transcript) {
        publishTranscriptRecordingOverlay(
          transcriptSystemAudioWaveformRef.current,
          transcriptMicrophoneWaveformRef.current,
        );
        return;
      }
      if (overlayMode === 'transcript' && isTranscriptProcessing) {
        publishOverlayState(overlayProcessing('transcript', waveform.slice(-overlayWaveformSize)));
        return;
      }
      if (overlayMode === 'improve' && isImproveProcessing) {
        publishOverlayState(overlayProcessing('improve'));
        return;
      }
      publishOverlayState(overlayInactive(overlayMode));
    }, 2400);
  };

  const clearOverlayWarningTimer = (overlayMode: OverlayMode): void => {
    const timer = overlayWarningTimerRef.current[overlayMode];
    if (timer) {
      window.clearTimeout(timer);
      delete overlayWarningTimerRef.current[overlayMode];
    }
    if (overlayMode !== 'additional-info') {
      delete overlayNoticeRef.current[overlayMode];
    }
  };

  const changeMode = (nextMode: HomeMode): void => {
    setMode(nextMode);
  };

  const openSettingsFocus = (focus: NonNullable<typeof settingsFocus>): void => {
    setSettingsFocus(focus);
    setSection('settings');
  };

  const stopActiveRecording = (): void => {
    if (transcriptRecorder) {
      void stopTranscript();
      return;
    }
    if (recorder) {
      void stopRecording();
    }
  };

  const cancelActiveRecording = (): void => {
    if (transcriptRecorder) {
      void cancelRecording('transcript');
      return;
    }
    if (recorder) {
      void cancelRecording('speak');
    }
  };

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), toast.actionLabel ? 7000 : 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    Object.values(overlayHideTimerRef.current).forEach((timer) => window.clearTimeout(timer));
    Object.values(audioWarningTimerRef.current).forEach((timer) => window.clearTimeout(timer));
    void api.overlay.setState(inactiveOverlayState);
  }, []);

  useEffect(() => api.actions.onSection(setSection), []);

  useEffect(() => api.server.onEnabledChanged(({ server, enabled }) => {
    if (server === 'audio') {
      setAudioServerEnabled(enabled);
      if (!enabled) {
        if (recorder) {
          void cancelRecording('speak');
        }
        if (transcriptRecorder) {
          void cancelRecording('transcript');
        }
        whisperWarmupModelRef.current = null;
        whisperWarmupRunRef.current += 1;
        setIsWhisperLoading(false);
        showToast('success', 'Audio server stopped.');
      }
      return;
    }

    setLlmServerEnabled(enabled);
    if (!enabled) {
      improveRunRef.current += 1;
      if (isImproveProcessing) {
        setIsImproveProcessing(false);
        setImproveResult(actionResult('improve', 'warning', { message: 'LLM server stopped.' }));
        showOverlayWarning('improve', 'LLM server stopped.');
      }
      llmWarmupModelRef.current = null;
      llmWarmupRunRef.current += 1;
      setIsLlmLoading(false);
      showToast('success', 'LLM server stopped.');
    }
  }), [recorder, transcriptRecorder, isImproveProcessing]);

  useEffect(() => {
    const removeSpeakListener = api.actions.onSpeak(() => {
      if (isShortcutEditing) {
        return;
      }
      if (recorder) {
        void stopRecording();
        return;
      }
      const serverMessage = serverBlockMessage('speak', useLocalSpeechRuntime, useLocalImproveRuntime, audioServerEnabled, llmServerEnabled);
      if (serverMessage) {
        showOverlayWarning('speak', serverMessage);
        return;
      }
      const blockMessage = actionBlockMessage('speak', audioLockState);
      if (blockMessage) {
        if (isSameActionProcessingBlock('speak', blockMessage)) {
          return;
        }
        showOverlayWarning('speak', blockMessage);
        return;
      }
      void startRecording();
    });
    const removeImproveListener = api.actions.onImproveText(() => {
      if (isShortcutEditing) {
        return;
      }
      if (isImproveProcessing) {
        return;
      }
      const serverMessage = serverBlockMessage('improve', useLocalSpeechRuntime, useLocalImproveRuntime, audioServerEnabled, llmServerEnabled);
      if (serverMessage) {
        showOverlayWarning('improve', serverMessage);
        return;
      }
      void improve();
    });
    const removeImproveResultListener = api.actions.onImproveResult((nextResult) => {
      setMode('improve');
      setImproveResult(normalizeCopyResult('improve', nextResult));
      showCopyToast(nextResult);
      if (nextResult.status === 'error' || !nextResult.text) {
        showOverlayWarning('improve', nextResult.message, nextResult.status === 'error' ? 'error' : 'warning');
      } else {
        showCompletionOverlay('improve', nextResult);
      }
      void refreshHistoryAndModels();
    });
    const removeTranscriptListener = api.actions.onTranscript(() => {
      if (isShortcutEditing) {
        return;
      }
      if (transcriptRecorder) {
        void stopTranscript();
        return;
      }
      const serverMessage = serverBlockMessage('transcript', useLocalSpeechRuntime, useLocalImproveRuntime, audioServerEnabled, llmServerEnabled);
      if (serverMessage) {
        showOverlayWarning('transcript', serverMessage);
        return;
      }
      const blockMessage = actionBlockMessage('transcript', audioLockState);
      if (blockMessage) {
        if (isSameActionProcessingBlock('transcript', blockMessage)) {
          return;
        }
        showOverlayWarning('transcript', blockMessage);
        return;
      }
      void startTranscript();
    });
    const removeCancelRecordingListener = api.actions.onCancelRecording((recordingMode) => {
      void cancelRecording(recordingMode);
    });
    return () => {
      removeSpeakListener();
      removeImproveListener();
      removeImproveResultListener();
      removeTranscriptListener();
      removeCancelRecordingListener();
    };
  }, [
    recorder,
    transcriptRecorder,
    improveInput,
    isImproveInputFocused,
    isShortcutEditing,
    isSpeakProcessing,
    isTranscriptProcessing,
    isImproveProcessing,
    useLocalSpeechRuntime,
    useLocalImproveRuntime,
    audioServerEnabled,
    llmServerEnabled,
    isWhisperLoading,
    isLlmLoading,
    waveform,
  ]);

  return (
    <main className="app-shell">
      <AppTopbar
        hotkeys={settings.hotkeys}
        hasRecording={Boolean(recorder || transcriptRecorder)}
        isImproveProcessing={isImproveProcessing}
        audioServerEnabled={audioServerEnabled}
        llmServerEnabled={llmServerEnabled}
        audioServerBusy={isWhisperLoading}
        llmServerBusy={isLlmLoading}
        useLocalSpeechRuntime={useLocalSpeechRuntime}
        useLocalImproveRuntime={useLocalImproveRuntime}
        onOpenLogsFolder={() => void api.app.openLogsFolder()}
        onOpenSettings={() => {
          setSection('settings');
          setSettingsFocus(null);
        }}
        onQuit={() => void api.app.quit()}
        onSpeak={() => void (recorder ? stopRecording() : startRecording())}
        onImprove={() => void improve()}
        onTranscript={() => void (transcriptRecorder ? stopTranscript() : startTranscript())}
        onAudioServerChange={(enabled) => void setAudioServerRunning(enabled)}
        onLlmServerChange={(enabled) => void setLlmServerRunning(enabled)}
        onImportAudio={() => void importAudio()}
        onOpenHelp={() => void api.app.openHelp()}
        onStopRecording={stopActiveRecording}
        onCancelRecording={cancelActiveRecording}
        onImproveModelSettings={() => openSettingsFocus('improveAi')}
        onSpeechModelSettings={() => openSettingsFocus('speechAi')}
        onMicrophoneSettings={() => openSettingsFocus('microphone')}
        onShortcutSettings={() => openSettingsFocus('shortcuts')}
        onHistorySettings={() => openSettingsFocus('history')}
        onMinimize={() => void api.window.minimize()}
        onMaximize={() => void api.window.toggleMaximize()}
        onClose={() => void api.window.close()}
      />
      <AppSidebar
        section={section}
        settings={settings}
        onSectionChange={(nextSection) => {
          setSection(nextSection);
          setSettingsFocus(null);
        }}
        onShortcutSettings={() => {
          openSettingsFocus('shortcuts');
        }}
      />
      <AppContent
        section={section}
        mode={mode}
        result={result}
        overlayState={overlayStateByMode[mode]}
        improveInput={improveInput}
        isRecording={mode === 'transcript' ? Boolean(transcriptRecorder) : Boolean(recorder)}
        actionBlockMessage={currentActionBlockMessage}
        settings={settings}
        whisperRuntime={effectiveWhisperRuntime}
        llmRuntime={effectiveLlmRuntime}
        runtimeInfoLoaded={runtimeInfoLoaded}
        whisperModelAvailable={whisperModelAvailable}
        llmModelAvailable={llmModelAvailable}
        audioServerEnabled={audioServerEnabled}
        llmServerEnabled={llmServerEnabled}
        audioServerBusy={isWhisperLoading}
        llmServerBusy={isLlmLoading}
        history={history}
        llmModels={llmModels}
        whisperModels={whisperModels}
        availableWhisperModels={availableWhisperModels}
        availableLlmModels={availableLlmModels}
        deletingLlmModelIds={deletingLlmModelIds}
        hardwareInfo={hardwareInfo}
        settingsFocus={settingsFocus}
        onOpenSettings={() => {
          openSettingsFocus(mode === 'improve' ? 'improveAi' : 'speechAi');
        }}
        onAudioServerChange={(enabled) => void setAudioServerRunning(enabled)}
        onLlmServerChange={(enabled) => void setLlmServerRunning(enabled)}
        onModeChange={changeMode}
        onStartRecording={() => void startRecording()}
        onStopRecording={() => void stopRecording()}
        onCancelRecording={() => void cancelRecording(mode === 'transcript' ? 'transcript' : 'speak')}
        onImprove={() => void improve()}
        onImproveInputChange={setImproveInput}
        onImproveInputFocusChange={setIsImproveInputFocused}
        onCopyResult={() => void copy()}
        onExportResult={() => void exportResult()}
        onStartTranscript={() => void startTranscript()}
        onStopTranscript={() => void stopTranscript()}
        onSettingsChange={(nextSettings) => void changeSettings(nextSettings)}
        onRefreshModels={() => void refreshModelsFromSettings()}
        onDownloadWhisperModel={(id) => void downloadWhisperModel(id)}
        onDeleteWhisperModel={(id) => void deleteWhisperModel(id)}
        onDownloadLlmModel={(id) => void downloadLlmModel(id)}
        onDownloadCustomLlmModel={(url) => void downloadCustomLlmModel(url)}
        onDeleteLlmModel={(id) => void deleteLlmModel(id)}
        onFocusHandled={() => setSettingsFocus(null)}
        onShortcutUnavailable={() => showToast('error', 'This shortcut cannot be used.')}
        onShortcutEditingChange={setIsShortcutEditing}
        onResetSettings={() => void resetSettings()}
        onHistoryCopy={(entry) => {
          void api.clipboard.write(entry.text);
          showToast('info', appMessages.copiedToClipboard);
        }}
        onHistoryFavoriteToggle={(id) => void toggleHistoryFavorite(id)}
        onHistoryTitleUpdate={(id, title) => void updateHistoryTitle(id, title)}
        onHistoryDelete={(id) => void deleteEntry(id)}
        onHistoryDeleteSelected={(ids) => void deleteSelectedEntries(ids)}
        onHistoryClear={() => void clearHistory()}
      />
      <AppFooter
        gpuUsage={gpuUsage}
        microphoneLevels={mode === 'transcript' ? transcriptMicrophoneWaveform : waveform}
        systemAudioLevels={transcriptSystemAudioWaveform}
        microphoneActive={Boolean(recorder) || Boolean(transcriptRecorder)}
        systemAudioActive={Boolean(transcriptRecorder)}
        onMicrophoneSettings={() => openSettingsFocus('microphone')}
        onAudioSettings={() => openSettingsFocus('microphone')}
      />
      {toast && <AppToast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
    </main>
  );
};

const settingsAreEqual = (left: SettingsType, right: SettingsType): boolean =>
  left.useLocalRuntime === right.useLocalRuntime &&
  left.useLocalSpeechRuntime === right.useLocalSpeechRuntime &&
  left.useLocalImproveRuntime === right.useLocalImproveRuntime &&
  left.remoteSpeechBaseUrl === right.remoteSpeechBaseUrl &&
  left.remoteSpeechApiKey === right.remoteSpeechApiKey &&
  left.remoteSpeechModel === right.remoteSpeechModel &&
  left.remoteImproveBaseUrl === right.remoteImproveBaseUrl &&
  left.remoteImproveApiKey === right.remoteImproveApiKey &&
  left.remoteImproveModel === right.remoteImproveModel &&
  left.llmModel === right.llmModel &&
  left.whisperModel === right.whisperModel &&
  left.whisperLanguage === right.whisperLanguage &&
  left.whisperQualityMode === right.whisperQualityMode &&
  left.llmPerformanceMode === right.llmPerformanceMode &&
  left.llmContextSize === right.llmContextSize &&
  left.llmTemperature === right.llmTemperature &&
  left.correctionPrompt === right.correctionPrompt &&
  left.pasteAfterDictation === right.pasteAfterDictation &&
  left.pasteAfterImprovement === right.pasteAfterImprovement &&
  left.improveAfterSpeak === right.improveAfterSpeak &&
  left.improveSelectedText === right.improveSelectedText &&
  left.startAudioServerOnLaunch === right.startAudioServerOnLaunch &&
  left.startLlmServerOnLaunch === right.startLlmServerOnLaunch &&
  left.startAtStartup === right.startAtStartup &&
  left.microphoneDeviceId === right.microphoneDeviceId &&
  left.microphoneDeviceLabel === right.microphoneDeviceLabel &&
  left.transcriptOutputDeviceId === right.transcriptOutputDeviceId &&
  left.transcriptOutputDeviceLabel === right.transcriptOutputDeviceLabel &&
  left.transcriptLiveChunkSeconds === right.transcriptLiveChunkSeconds &&
  left.silenceSensitivity === right.silenceSensitivity &&
  left.maxHistoryItems === right.maxHistoryItems &&
  left.hotkeys.speak === right.hotkeys.speak &&
  left.hotkeys.improveText === right.hotkeys.improveText &&
  left.hotkeys.transcript === right.hotkeys.transcript;

const scheduleAfterFirstPaint = (callback: () => void): (() => void) => {
  let cancelled = false;
  let firstFrame = 0;
  let secondFrame = 0;
  const run = (): void => {
    if (!cancelled) {
      callback();
    }
  };

  if (typeof window.requestAnimationFrame !== 'function') {
    const timer = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }

  firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(run);
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(secondFrame);
  };
};

const llmWarmupKey = (
  model: string,
  contextSize: SettingsType['llmContextSize'],
  performanceMode: SettingsType['llmPerformanceMode'],
): string => `${model}:${contextSize}:${performanceMode}`;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Operation failed.';

const serverBlockMessage = (
  mode: HomeMode,
  useLocalSpeechRuntime: boolean,
  useLocalImproveRuntime: boolean,
  audioServerEnabled: boolean,
  llmServerEnabled: boolean,
): string | null => {
  if ((mode === 'speak' || mode === 'transcript') && useLocalSpeechRuntime && !audioServerEnabled) {
    return 'Audio server stopped.';
  }
  if (mode === 'improve' && useLocalImproveRuntime && !llmServerEnabled) {
    return 'LLM server stopped.';
  }
  return null;
};

const customLlmFileName = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url.trim()).pathname.split('/').pop() ?? '');
  } catch {
    return '';
  }
};

const isSameActionProcessingBlock = (
  mode: 'speak' | 'transcript',
  message: string,
): boolean =>
  (mode === 'speak' && message === 'Speak is already transcribing.') ||
  (mode === 'transcript' && message === 'Transcript is already transcribing.');

const normalizeCopyResult = (
  mode: 'speak' | 'improve' | 'transcript',
  result: ResultState,
): ResultState => {
  if (result.message !== appMessages.copiedToClipboard) {
    return result;
  }
  const message =
    mode === 'speak'
      ? speakFallbackResult.message
      : mode === 'improve'
        ? improveFallbackResult.message
        : transcriptFallbackResult.message;
  return { ...result, message };
};
