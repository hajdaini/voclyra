import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type {
  AppSection,
  HardwareInfo,
  HistoryEntry,
  HomeMode,
  LlmAvailableModel,
  LlmRuntimeInfo,
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
import { api } from '../api';
import { startTranscriptRecorder, startWavRecorder, type WavRecorder } from '../audio/wav-recorder';
import { AppContent } from './components/AppContent';
import { AppToast, type Toast, type ToastType } from './components/AppToast';
import { AppSidebar } from './components/AppSidebar';
import { AppTopbar } from './components/AppTopbar';
import { Overlay } from './components/Overlay';
import { syncModelSettings } from './modelSettingsSync';
import { overlayDone, overlayInactive, overlayProcessing, overlayRecording, overlayWarning } from './overlayStates';
import {
  improveFallbackResult,
  inactiveOverlayState,
  speakFallbackResult,
  transcriptFallbackResult,
} from './appState';

const defaultWaveform = (): number[] => Array.from({ length: 28 }, () => 0.08);

export const App = (): JSX.Element => {
  const overlayMode = new URLSearchParams(window.location.search).get('overlay');
  if (overlayMode === 'speak' || overlayMode === 'improve' || overlayMode === 'transcript') {
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
  const [waveform, setWaveform] = useState<number[]>(defaultWaveform);
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
  const loadingOverlayRef = useRef<Record<HomeMode, boolean>>({
    speak: false,
    improve: false,
    transcript: false,
  });
  const overlayNoticeRef = useRef<
    Partial<Record<'speak' | 'improve' | 'transcript', { message: string; messageType: 'error' | 'success' | 'warning' | 'info' }>>
  >({});
  const overlayWarningTimerRef = useRef<Partial<Record<'speak' | 'improve' | 'transcript', number>>>({});
  const result =
    mode === 'speak' ? speakResult : mode === 'improve' ? improveResult : transcriptResult;
  const audioLockState = {
    speakRecording: Boolean(recorder),
    speakProcessing: isSpeakProcessing,
    improveProcessing: isImproveProcessing,
    improveLoading: isLlmLoading,
    transcriptRecording: Boolean(transcriptRecorder),
    transcriptProcessing: isTranscriptProcessing,
    whisperLoading: isWhisperLoading,
  };
  const currentActionBlockMessage = actionBlockMessage(mode, audioLockState);
  const whisperModelAvailable = Boolean(settings.whisperModel && whisperModels.includes(settings.whisperModel));
  const llmModelAvailable = Boolean(settings.llmModel && llmModels.includes(settings.llmModel));

  const publishOverlayState = (state: OverlayState): void => {
    setOverlayStateByMode((current) => ({
      ...current,
      [state.mode]: state,
    }));
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
    void api.settings.get().then((nextSettings) => {
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      void loadModels(nextSettings);
    });
    void api.history.list().then(setHistory);
    void api.hardware.info().then(setHardwareInfo);
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
      setAvailableLlmModels((models) =>
        models.map((model) =>
          model.id === progress.id
            ? { ...model, state: progress.state, progress: progress.progress }
            : model,
        ),
      );
    });
    const removeOverlayListener = api.overlay.onState((state) => {
      setOverlayStateByMode((current) => ({
        ...current,
        [state.mode]: state,
      }));
    });
    return () => {
      removeWhisperDownloadListener();
      removeLlmDownloadListener();
      removeOverlayListener();
    };
  }, []);

  useEffect(() => {
    if (!whisperRuntime.runtimeAvailable || !whisperModelAvailable || !settings.whisperModel) {
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
  }, [settings.whisperModel, whisperModelAvailable, whisperRuntime.runtimeAvailable]);

  useEffect(() => {
    if (!llmRuntime.runtimeAvailable || !llmModelAvailable || !settings.llmModel) {
      llmWarmupModelRef.current = null;
      llmWarmupRunRef.current += 1;
      setIsLlmLoading(false);
      return;
    }
    if (llmWarmupModelRef.current === settings.llmModel) {
      return;
    }

    const model = settings.llmModel;
    const runId = llmWarmupRunRef.current + 1;
    llmWarmupRunRef.current = runId;
    llmWarmupModelRef.current = model;
    setIsLlmLoading(true);
    void api.llm.warmup(model)
      .catch(() => {
        if (llmWarmupModelRef.current === model) {
          llmWarmupModelRef.current = null;
        }
      })
      .finally(() => {
        if (llmWarmupRunRef.current === runId) {
          setIsLlmLoading(false);
        }
      });
  }, [settings.llmModel, llmModelAvailable, llmRuntime.runtimeAvailable]);

  useEffect(() => {
    if (!isWhisperLoading) {
      setSpeakResult((current) =>
        current.status === 'ready' && current.message === actionUi('speak', 'loading').message
          ? speakFallbackResult
          : current,
      );
      setTranscriptResult((current) =>
        current.status === 'ready' && current.message === actionUi('transcript', 'loading').message
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
  }, [isWhisperLoading]);

  useEffect(() => {
    if (!isLlmLoading) {
      setImproveResult((current) =>
        current.status === 'ready' && current.message === actionUi('improve', 'loading').message
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
  }, [isLlmLoading]);


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
    const nextAvailableLlmModels = await api.llm.downloadModel(id);
    setAvailableLlmModels(nextAvailableLlmModels);
    await loadModels();
  };

  const deleteLlmModel = async (id: LlmAvailableModel['id']): Promise<void> => {
    const nextAvailableLlmModels = await api.llm.deleteModel(id);
    setAvailableLlmModels(nextAvailableLlmModels);
    await loadModels();
  };

  const startRecording = async (): Promise<void> => {
    if (!whisperRuntime.runtimeAvailable) {
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
    publishOverlayState(overlayRecording('speak', defaultWaveform().slice(-8)));
    try {
      setRecorder(
        await startWavRecorder(
          (level) => {
            setWaveform((current) => {
              const nextWaveform = [...current.slice(1), Math.max(0.08, level)];
              publishOverlayState(overlayRecording(
                'speak',
                nextWaveform.slice(-8),
                overlayNoticeRef.current.speak?.message,
                overlayNoticeRef.current.speak?.messageType,
              ));
              return nextWaveform;
            });
          },
          {
            id: settings.microphoneDeviceId,
            label: settings.microphoneDeviceLabel,
          },
          {
            echoCancellation: settings.microphoneEchoCancellation,
            noiseSuppression: settings.microphoneNoiseSuppression,
            autoGainControl: settings.microphoneAutoGainControl,
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
    setWaveform(defaultWaveform());
    setIsSpeakProcessing(true);
    clearOverlayWarningTimer('speak');
    publishOverlayState(overlayProcessing('speak', defaultWaveform().slice(-8), undefined, undefined, {
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
    } catch (error) {
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
      setSpeakResult(actionResult('speak', 'warning', { message: actionMessages.recordingCancelled }));
    } else {
      setTranscriptRecorder(null);
      setTranscriptResult(actionResult('transcript', 'warning', { message: actionMessages.recordingCancelled }));
    }
    delete overlayNoticeRef.current[recordingMode];
    setWaveform(defaultWaveform());
    await activeRecorder.cancel();
    publishOverlayState(overlayInactive(recordingMode));
  };

  const refreshHistoryAndModels = async (): Promise<void> => {
    const [nextHistory] = await Promise.all([api.history.list(), loadModels()]);
    setHistory(nextHistory);
  };

  const refreshModelsFromSettings = async (): Promise<void> => {
    await loadModels();
    showToast('success', 'Models refreshed.');
  };

  const improve = async (): Promise<void> => {
    if (isImproveProcessing) {
      return;
    }
    setMode('improve');
    const blockMessage = actionBlockMessage('improve', audioLockState);
    if (blockMessage) {
      showOverlayWarning('improve', blockMessage);
      return;
    }
    if (!llmRuntime.runtimeAvailable) {
      setImproveResult(actionResult('improve', 'error', { message: actionMessages.llamaMissing }));
      showOverlayWarning('improve', actionMessages.llamaMissing, 'error');
      return;
    }
    if (!llmModelAvailable) {
      setImproveResult(actionResult('improve', 'error', { message: actionMessages.llamaModelMissing }));
      showOverlayWarning('improve', actionMessages.llamaModelMissing, 'error');
      return;
    }
    const sourceText = isImproveInputFocused
      ? improveInput
      : settings.improveSelectedText
        ? await api.clipboard.readSelection()
        : await api.clipboard.read();
    if (!isImproveInputFocused && sourceText) {
      setImproveInput(sourceText);
    }
    if (!sourceText.trim()) {
      const message = isImproveInputFocused ? actionMessages.enterTextToImprove : actionMessages.clipboardEmpty;
      setImproveResult(actionResult('improve', 'error', { message }));
      showOverlayWarning('improve', message);
      return;
    }
    setIsImproveProcessing(true);
    clearOverlayWarningTimer('improve');
    publishOverlayState(overlayProcessing('improve', [], undefined, undefined, {
      phase: 'thinking',
    }));
    try {
      const nextResult = await api.text.improve(sourceText);
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
      const message = errorMessage(error);
      setImproveResult(actionResult('improve', 'error', { message }));
      showOverlayWarning('improve', message, 'error');
    } finally {
      setIsImproveProcessing(false);
    }
  };

  const startTranscript = async (): Promise<void> => {
    if (!whisperRuntime.runtimeAvailable) {
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
    publishOverlayState(overlayRecording('transcript', defaultWaveform().slice(-8)));
    try {
      setTranscriptRecorder(
        await startTranscriptRecorder(
          (level) => {
            setWaveform((current) => {
              const nextWaveform = [...current.slice(1), Math.max(0.08, level)];
              publishOverlayState(overlayRecording(
                'transcript',
                nextWaveform.slice(-8),
                overlayNoticeRef.current.transcript?.message,
                overlayNoticeRef.current.transcript?.messageType,
              ));
              return nextWaveform;
            });
          },
          {
            microphoneDevice: {
              id: settings.microphoneDeviceId,
              label: settings.microphoneDeviceLabel,
            },
            microphoneOptions: {
              echoCancellation: settings.microphoneEchoCancellation,
              noiseSuppression: settings.microphoneNoiseSuppression,
              autoGainControl: settings.microphoneAutoGainControl,
            },
            onSystemAudioChange: (active) => {
              setTranscriptResult((current) => ({
                ...current,
                message: active
                  ? actionUi('transcript', 'recording').message
                  : `${actionUi('transcript', 'recording').message} Computer audio is not captured.`,
              }));
            },
          },
        ),
      );
    } catch (error) {
      const message = errorMessage(error);
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
    }
  };

  const stopTranscript = async (): Promise<void> => {
    if (!transcriptRecorder) {
      return;
    }

    setTranscriptRecorder(null);
    setWaveform(defaultWaveform());
    setIsTranscriptProcessing(true);
    clearOverlayWarningTimer('transcript');
    publishOverlayState(overlayProcessing('transcript', defaultWaveform().slice(-8), undefined, undefined, {
      phase: 'transcribing',
    }));
    try {
      const audio = await transcriptRecorder.stop();
      await transcribeAudio(audio);
    } catch (error) {
      const message = errorMessage(error);
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
    } finally {
      setIsTranscriptProcessing(false);
    }
  };

  const importAudio = async (): Promise<void> => {
    if (!whisperRuntime.runtimeAvailable) {
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
      setIsTranscriptProcessing(true);
      clearOverlayWarningTimer('transcript');
      publishOverlayState(overlayProcessing('transcript', defaultWaveform().slice(-8), undefined, undefined, {
        phase: 'transcribing',
      }));
      await transcribeAudio(audio);
    } catch (error) {
      const message = errorMessage(error);
      showToast('error', message);
      setTranscriptResult(actionResult('transcript', 'error', { message }));
      showOverlayWarning('transcript', message, 'error');
    } finally {
      setIsTranscriptProcessing(false);
    }
  };

  const transcribeAudio = async (audio: ArrayBuffer): Promise<void> => {
    const nextResult = await api.transcript.start(audio);
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
  };

  const showToast = (type: ToastType, message: string): void => {
    setToast({ id: Date.now(), type, message });
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
    if (nextResult.status !== 'ready' || !nextResult.text) {
      publishOverlayState(overlayInactive(overlayMode));
      return;
    }
    publishOverlayState(overlayDone(
      overlayMode,
      actionUi(overlayMode, 'ready').message,
      'success',
    ));
    window.setTimeout(() => {
      publishOverlayState(overlayInactive(overlayMode));
    }, 1800);
  };

  const showReadyOverlay = (overlayMode: 'speak' | 'improve' | 'transcript'): void => {
    publishOverlayState(overlayDone(
      overlayMode,
      actionUi(overlayMode, 'ready').message,
      'success',
    ));
    window.setTimeout(() => {
      publishOverlayState(overlayInactive(overlayMode));
    }, 1800);
  };

  const showOverlayWarning = (
    overlayMode: 'speak' | 'improve' | 'transcript',
    message: string,
    messageType: 'error' | 'success' | 'warning' | 'info' = 'warning',
  ): void => {
    overlayNoticeRef.current[overlayMode] = { message, messageType };
    clearOverlayWarningTimer(overlayMode);
    if (overlayMode === 'speak' && recorder) {
      publishOverlayState(overlayRecording('speak', waveform.slice(-8), message, messageType));
    } else if (overlayMode === 'speak' && isSpeakProcessing) {
      publishOverlayState(overlayProcessing('speak', waveform.slice(-8), message, messageType));
    } else if (overlayMode === 'transcript' && transcriptRecorder) {
      publishOverlayState(overlayRecording('transcript', waveform.slice(-8), message, messageType));
    } else if (overlayMode === 'transcript' && isTranscriptProcessing) {
      publishOverlayState(overlayProcessing('transcript', waveform.slice(-8), message, messageType));
    } else if (overlayMode === 'improve' && isImproveProcessing) {
      publishOverlayState(overlayProcessing('improve', [], message, messageType));
    } else {
      publishOverlayState(overlayWarning(overlayMode, message, messageType));
    }
    overlayWarningTimerRef.current[overlayMode] = window.setTimeout(() => {
      delete overlayNoticeRef.current[overlayMode];
      delete overlayWarningTimerRef.current[overlayMode];
      if (overlayMode === 'speak' && recorder) {
        publishOverlayState(overlayRecording('speak', waveform.slice(-8)));
        return;
      }
      if (overlayMode === 'speak' && isSpeakProcessing) {
        publishOverlayState(overlayProcessing('speak', waveform.slice(-8)));
        return;
      }
      if (overlayMode === 'transcript' && transcriptRecorder) {
        publishOverlayState(overlayRecording('transcript', waveform.slice(-8)));
        return;
      }
      if (overlayMode === 'transcript' && isTranscriptProcessing) {
        publishOverlayState(overlayProcessing('transcript', waveform.slice(-8)));
        return;
      }
      if (overlayMode === 'improve' && isImproveProcessing) {
        publishOverlayState(overlayProcessing('improve'));
        return;
      }
      publishOverlayState(overlayInactive(overlayMode));
    }, 2400);
  };

  const clearOverlayWarningTimer = (overlayMode: 'speak' | 'improve' | 'transcript'): void => {
    const timer = overlayWarningTimerRef.current[overlayMode];
    if (timer) {
      window.clearTimeout(timer);
      delete overlayWarningTimerRef.current[overlayMode];
    }
    delete overlayNoticeRef.current[overlayMode];
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
    const timer = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    void api.overlay.setState(inactiveOverlayState);
  }, []);

  useEffect(() => api.actions.onSection(setSection), []);

  useEffect(() => {
    const removeSpeakListener = api.actions.onSpeak(() => {
      if (isShortcutEditing) {
        return;
      }
      if (recorder) {
        void stopRecording();
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
        onOpenLogsFolder={() => void api.app.openLogsFolder()}
        onOpenSettings={() => {
          setSection('settings');
          setSettingsFocus(null);
        }}
        onQuit={() => void api.app.quit()}
        onSpeak={() => void (recorder ? stopRecording() : startRecording())}
        onImprove={() => void improve()}
        onTranscript={() => void (transcriptRecorder ? stopTranscript() : startTranscript())}
        onImportAudio={() => void importAudio()}
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
        waveform={waveform}
        settings={settings}
        whisperRuntime={whisperRuntime}
        llmRuntime={llmRuntime}
        runtimeInfoLoaded={runtimeInfoLoaded}
        whisperModelAvailable={whisperModelAvailable}
        llmModelAvailable={llmModelAvailable}
        history={history}
        llmModels={llmModels}
        whisperModels={whisperModels}
        availableWhisperModels={availableWhisperModels}
        availableLlmModels={availableLlmModels}
        hardwareInfo={hardwareInfo}
        settingsFocus={settingsFocus}
        onOpenSettings={() => {
          openSettingsFocus(mode === 'improve' ? 'improveAi' : 'speechAi');
        }}
        onModeChange={changeMode}
        onStartRecording={() => void startRecording()}
        onStopRecording={() => void stopRecording()}
        onCancelRecording={() => void cancelRecording(mode === 'transcript' ? 'transcript' : 'speak')}
        onImprove={() => void improve()}
        onImproveInputChange={setImproveInput}
        onImproveInputFocusChange={setIsImproveInputFocused}
        onCopyResult={() => void copy()}
        onStartTranscript={() => void startTranscript()}
        onStopTranscript={() => void stopTranscript()}
        onSettingsChange={(nextSettings) => {
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
          void saveSettings(nextSettings);
        }}
        onRefreshModels={() => void refreshModelsFromSettings()}
        onDownloadWhisperModel={(id) => void downloadWhisperModel(id)}
        onDeleteWhisperModel={(id) => void deleteWhisperModel(id)}
        onDownloadLlmModel={(id) => void downloadLlmModel(id)}
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
      {toast && <AppToast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
    </main>
  );
};

const settingsAreEqual = (left: SettingsType, right: SettingsType): boolean =>
  left.llmModel === right.llmModel &&
  left.whisperModel === right.whisperModel &&
  left.whisperLanguage === right.whisperLanguage &&
  left.whisperQualityMode === right.whisperQualityMode &&
  left.llmContextSize === right.llmContextSize &&
  left.llmTemperature === right.llmTemperature &&
  left.correctionPrompt === right.correctionPrompt &&
  left.pasteAfterDictation === right.pasteAfterDictation &&
  left.pasteAfterImprovement === right.pasteAfterImprovement &&
  left.improveSelectedText === right.improveSelectedText &&
  left.microphoneDeviceId === right.microphoneDeviceId &&
  left.microphoneDeviceLabel === right.microphoneDeviceLabel &&
  left.microphoneEchoCancellation === right.microphoneEchoCancellation &&
  left.microphoneNoiseSuppression === right.microphoneNoiseSuppression &&
  left.microphoneAutoGainControl === right.microphoneAutoGainControl &&
  left.silenceSensitivity === right.silenceSensitivity &&
  left.maxHistoryItems === right.maxHistoryItems &&
  left.hotkeys.speak === right.hotkeys.speak &&
  left.hotkeys.improveText === right.hotkeys.improveText &&
  left.hotkeys.transcript === right.hotkeys.transcript;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Operation failed.';

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
