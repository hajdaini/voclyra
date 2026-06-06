import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type {
  AppSection,
  HistoryEntry,
  HomeMode,
  ResultState,
  Settings as SettingsType,
  WhisperAvailableModel,
  WhisperRuntimeInfo,
} from '@shared/types';
import { defaultSettings } from '@shared/defaults';
import { audioActionBlockMessage, improveRunningMessage } from '@shared/action-locks';
import { api } from '../api';
import { startTranscriptRecorder, startWavRecorder, type WavRecorder } from '../audio/wav-recorder';
import { AppContent } from './components/AppContent';
import { AppToast, type Toast, type ToastType } from './components/AppToast';
import { AppSidebar } from './components/AppSidebar';
import { SpeakOverlay } from './components/SpeakOverlay';
import {
  improveFallbackResult,
  inactiveOverlayState,
  speakFallbackResult,
  transcriptFallbackResult,
} from './appState';

export const App = (): JSX.Element => {
  const overlayMode = new URLSearchParams(window.location.search).get('overlay');
  if (overlayMode === 'speak' || overlayMode === 'improve' || overlayMode === 'transcript') {
    return <SpeakOverlay />;
  }

  const [section, setSection] = useState<AppSection>('home');
  const [speakResult, setSpeakResult] = useState<ResultState>(speakFallbackResult);
  const [improveResult, setImproveResult] = useState<ResultState>(improveFallbackResult);
  const [transcriptResult, setTranscriptResult] = useState<ResultState>(transcriptFallbackResult);
  const [settings, setSettings] = useState<SettingsType>(defaultSettings);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [whisperModels, setWhisperModels] = useState<string[]>([]);
  const [availableWhisperModels, setAvailableWhisperModels] = useState<WhisperAvailableModel[]>([]);
  const [whisperRuntime, setWhisperRuntime] = useState<WhisperRuntimeInfo>({
    backend: 'unknown',
    gpuAvailable: false,
    device: 'Auto',
  });
  const [mode, setMode] = useState<HomeMode>('speak');
  const [improveInput, setImproveInput] = useState('');
  const [recorder, setRecorder] = useState<WavRecorder | null>(null);
  const [transcriptRecorder, setTranscriptRecorder] = useState<WavRecorder | null>(null);
  const [isSpeakProcessing, setIsSpeakProcessing] = useState(false);
  const [isTranscriptProcessing, setIsTranscriptProcessing] = useState(false);
  const [isImproveProcessing, setIsImproveProcessing] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: 28 }, () => 0.08));
  const [settingsFocus, setSettingsFocus] = useState<'shortcuts' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isShortcutEditing, setIsShortcutEditing] = useState(false);
  const [isImproveInputFocused, setIsImproveInputFocused] = useState(false);
  const overlayNoticeRef = useRef<
    Partial<Record<'speak' | 'improve' | 'transcript', { message: string; messageType: 'error' | 'success' | 'warning' }>>
  >({});
  const result =
    mode === 'speak' ? speakResult : mode === 'improve' ? improveResult : transcriptResult;
  const audioLockState = {
    speakRecording: Boolean(recorder),
    speakProcessing: isSpeakProcessing,
    transcriptRecording: Boolean(transcriptRecorder),
    transcriptProcessing: isTranscriptProcessing,
  };
  const actionBlockMessage =
    mode === 'improve'
      ? isImproveProcessing
        ? improveRunningMessage
        : null
      : audioActionBlockMessage(mode, audioLockState);

  const loadModels = async (): Promise<void> => {
    const [nextOllamaModels, nextWhisperModels, nextAvailableWhisperModels, nextWhisperRuntime] = await Promise.all([
      api.models.listOllama(),
      api.models.listWhisper(),
      api.whisper.availableModels(),
      api.whisper.runtimeInfo(),
    ]);
    setOllamaModels(nextOllamaModels);
    setWhisperModels(nextWhisperModels);
    setAvailableWhisperModels(nextAvailableWhisperModels);
    setWhisperRuntime(nextWhisperRuntime);
    setSettings((currentSettings) => ({
      ...currentSettings,
      ollamaModel: nextOllamaModels.includes(currentSettings.ollamaModel)
        ? currentSettings.ollamaModel
        : (nextOllamaModels[0] ?? currentSettings.ollamaModel),
      whisperModel: nextWhisperModels.includes(currentSettings.whisperModel)
        ? currentSettings.whisperModel
        : (nextWhisperModels[0] ?? currentSettings.whisperModel),
    }));
  };

  useEffect(() => {
    void api.settings.get().then(setSettings);
    void api.history.list().then(setHistory);
    void loadModels();
    return api.whisper.onDownloadProgress((progress) => {
      setAvailableWhisperModels((models) =>
        models.map((model) =>
          model.id === progress.id
            ? { ...model, state: progress.state, progress: progress.progress }
            : model,
        ),
      );
    });
  }, []);

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

  const startRecording = async (): Promise<void> => {
    const blockMessage = audioActionBlockMessage('speak', audioLockState);
    if (blockMessage) {
      showOverlayWarning('speak', blockMessage);
      return;
    }
    setMode('speak');
    setSpeakResult({ text: '', status: 'listening', message: 'Listening...' });
    try {
      setRecorder(
        await startWavRecorder((level) => {
          setWaveform((current) => {
            const nextWaveform = [...current.slice(1), Math.max(0.08, level)];
            void api.overlay.setState({
              active: true,
              mode: 'speak',
              status: 'recording',
              waveform: nextWaveform.slice(-8),
              message: overlayNoticeRef.current.speak?.message,
              messageType: overlayNoticeRef.current.speak?.messageType,
            });
            return nextWaveform;
          });
        }),
      );
    } catch (error) {
      const message = errorMessage(error);
      setSpeakResult({ text: '', status: 'error', message });
      showOverlayWarning('speak', message, 'error');
    }
  };

  const stopRecording = async (): Promise<void> => {
    if (!recorder) {
      if (isSpeakProcessing) {
        showOverlayWarning('speak', audioActionBlockMessage('speak', audioLockState) ?? 'Speak is already running.');
      }
      return;
    }

    setRecorder(null);
    setIsSpeakProcessing(true);
    setSpeakResult({ text: '', status: 'processing', message: 'Transcribing...' });
    void api.overlay.setState({
      active: true,
      mode: 'speak',
      status: 'transcribing',
      waveform: waveform.slice(-8),
    });
    try {
      const audio = await recorder.stop();
      const nextResult = await api.dictation.start(audio);
      setSpeakResult(nextResult);
      setWhisperRuntime(await api.whisper.runtimeInfo());
      await refreshHistoryAndModels();
      if (!nextResult.text) {
        showOverlayWarning('speak', nextResult.message);
        return;
      }
      showCompletionOverlay('speak', nextResult);
    } catch (error) {
      const message = errorMessage(error);
      setSpeakResult({ text: '', status: 'error', message });
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
      setSpeakResult({ text: '', status: 'ready', message: 'Recording cancelled.' });
    } else {
      setTranscriptRecorder(null);
      setTranscriptResult({ text: '', status: 'ready', message: 'Recording cancelled.' });
    }
    delete overlayNoticeRef.current[recordingMode];
    setWaveform(Array.from({ length: 28 }, () => 0.08));
    await activeRecorder.cancel();
    void api.overlay.setState({
      ...inactiveOverlayState,
      mode: recordingMode,
    });
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
      showOverlayWarning('improve', improveRunningMessage);
      return;
    }
    setMode('improve');
    const sourceText = isImproveInputFocused
      ? improveInput
      : settings.improveSelectedText
        ? await api.clipboard.readSelection()
        : await api.clipboard.read();
    if (!isImproveInputFocused && sourceText) {
      setImproveInput(sourceText);
    }
    if (!sourceText.trim()) {
      const message = isImproveInputFocused ? 'Enter text to improve.' : 'Clipboard is empty.';
      setImproveResult({ text: '', status: 'error', message });
      showOverlayWarning('improve', message);
      return;
    }
    setIsImproveProcessing(true);
    setImproveResult({ text: '', status: 'processing', message: 'Improving text...' });
    void api.overlay.setState({
      active: true,
      mode: 'improve',
      status: 'improving',
      waveform: [],
    });
    try {
      const nextResult = await api.text.improve(sourceText);
      setImproveResult(nextResult);
      await refreshHistoryAndModels();
      if (!nextResult.text) {
        showOverlayWarning('improve', nextResult.message);
        return;
      }
      showCompletionOverlay('improve', nextResult);
    } catch (error) {
      const message = errorMessage(error);
      setImproveResult({ text: '', status: 'error', message });
      showOverlayWarning('improve', message, 'error');
    } finally {
      setIsImproveProcessing(false);
    }
  };

  const startTranscript = async (): Promise<void> => {
    const blockMessage = audioActionBlockMessage('transcript', audioLockState);
    if (blockMessage) {
      showOverlayWarning('transcript', blockMessage);
      return;
    }
    setSection('home');
    setMode('transcript');
    setTranscriptResult({ text: '', status: 'listening', message: 'Recording transcript...' });
    try {
      setTranscriptRecorder(
        await startTranscriptRecorder(
          (level) => {
            setWaveform((current) => {
              const nextWaveform = [...current.slice(1), Math.max(0.08, level)];
              void api.overlay.setState({
                active: true,
                mode: 'transcript',
                status: 'recording',
                waveform: nextWaveform.slice(-8),
                message: overlayNoticeRef.current.transcript?.message,
                messageType: overlayNoticeRef.current.transcript?.messageType,
              });
              return nextWaveform;
            });
          },
          {
            onSystemAudioChange: (active) => {
              setTranscriptResult((current) => ({
                ...current,
                message: active
                  ? 'Recording transcript with microphone and computer audio...'
                  : 'Recording transcript. Computer audio is not captured.',
              }));
            },
          },
        ),
      );
    } catch (error) {
      const message = errorMessage(error);
      setTranscriptResult({ text: '', status: 'error', message });
      showOverlayWarning('transcript', message, 'error');
    }
  };

  const stopTranscript = async (): Promise<void> => {
    if (!transcriptRecorder) {
      if (isTranscriptProcessing) {
        showOverlayWarning('transcript', audioActionBlockMessage('transcript', audioLockState) ?? 'Transcript is already running.');
      }
      return;
    }

    setTranscriptRecorder(null);
    setIsTranscriptProcessing(true);
    setTranscriptResult({ text: '', status: 'processing', message: 'Transcribing transcript...' });
    void api.overlay.setState({
      active: true,
      mode: 'transcript',
      status: 'transcribing',
      waveform: waveform.slice(-8),
    });
    try {
      const audio = await transcriptRecorder.stop();
      const nextResult = await api.transcript.start(audio);
      setTranscriptResult(nextResult);
      setWhisperRuntime(await api.whisper.runtimeInfo());
      await refreshHistoryAndModels();
      if (!nextResult.text) {
        showOverlayWarning('transcript', nextResult.message);
        return;
      }
      showCompletionOverlay('transcript', nextResult);
    } catch (error) {
      const message = errorMessage(error);
      setTranscriptResult({ text: '', status: 'error', message });
      showOverlayWarning('transcript', message, 'error');
    } finally {
      setIsTranscriptProcessing(false);
    }
  };

  const copy = async (): Promise<void> => {
    await api.clipboard.write(result.text);
    if (mode === 'speak') {
      setSpeakResult({ ...result, message: 'Copied to clipboard' });
      return;
    }
    if (mode === 'transcript') {
      setTranscriptResult({ ...result, message: 'Copied to clipboard' });
      return;
    }
    setImproveResult({ ...result, message: 'Copied to clipboard' });
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
    setHistory(await api.history.clear());
    showToast('info', 'History cleared.');
  };

  const saveSettings = async (nextSettings: SettingsType): Promise<void> => {
    const previousSettings = settings;
    const savedSettings = await api.settings.save(nextSettings);
    const saved = settingsAreEqual(nextSettings, savedSettings);
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
    }
  };

  const showToast = (type: ToastType, message: string): void => {
    setToast({ id: Date.now(), type, message });
  };

  const showCompletionOverlay = (
    overlayMode: 'speak' | 'improve' | 'transcript',
    nextResult: ResultState,
  ): void => {
    if (nextResult.status !== 'ready' || !nextResult.text) {
      void api.overlay.setState({
        ...inactiveOverlayState,
        mode: overlayMode,
      });
      return;
    }
    void api.overlay.setState({
      active: true,
      mode: overlayMode,
      status: 'done',
      waveform: [],
      message: nextResult.message,
      messageType: 'success',
    });
    window.setTimeout(() => {
      void api.overlay.setState({
        active: false,
        mode: overlayMode,
        status: 'done',
        waveform: [],
      });
    }, 1800);
  };

  const showOverlayWarning = (
    overlayMode: 'speak' | 'improve' | 'transcript',
    message: string,
    messageType: 'error' | 'success' | 'warning' = 'warning',
  ): void => {
    overlayNoticeRef.current[overlayMode] = { message, messageType };
    if (overlayMode === 'speak' && recorder) {
      void api.overlay.setState({
        active: true,
        mode: 'speak',
        status: 'recording',
        waveform: waveform.slice(-8),
        message,
        messageType,
      });
    } else if (overlayMode === 'speak' && isSpeakProcessing) {
      void api.overlay.setState({
        active: true,
        mode: 'speak',
        status: 'transcribing',
        waveform: waveform.slice(-8),
        message,
        messageType,
      });
    } else if (overlayMode === 'transcript' && transcriptRecorder) {
      void api.overlay.setState({
        active: true,
        mode: 'transcript',
        status: 'recording',
        waveform: waveform.slice(-8),
        message,
        messageType,
      });
    } else if (overlayMode === 'transcript' && isTranscriptProcessing) {
      void api.overlay.setState({
        active: true,
        mode: 'transcript',
        status: 'transcribing',
        waveform: waveform.slice(-8),
        message,
        messageType,
      });
    } else if (overlayMode === 'improve' && isImproveProcessing) {
      void api.overlay.setState({
        active: true,
        mode: 'improve',
        status: 'improving',
        waveform: [],
        message,
        messageType,
      });
    } else {
      void api.overlay.setState({
        active: true,
        mode: overlayMode,
        status: 'warning',
        waveform: [],
        message,
        messageType,
      });
    }
    window.setTimeout(() => {
      delete overlayNoticeRef.current[overlayMode];
      if (overlayMode === 'speak' && recorder) {
        void api.overlay.setState({
          active: true,
          mode: 'speak',
          status: 'recording',
          waveform: waveform.slice(-8),
        });
        return;
      }
      if (overlayMode === 'speak' && isSpeakProcessing) {
        void api.overlay.setState({
          active: true,
          mode: 'speak',
          status: 'transcribing',
          waveform: waveform.slice(-8),
        });
        return;
      }
      if (overlayMode === 'transcript' && transcriptRecorder) {
        void api.overlay.setState({
          active: true,
          mode: 'transcript',
          status: 'recording',
          waveform: waveform.slice(-8),
        });
        return;
      }
      if (overlayMode === 'transcript' && isTranscriptProcessing) {
        void api.overlay.setState({
          active: true,
          mode: 'transcript',
          status: 'transcribing',
          waveform: waveform.slice(-8),
        });
        return;
      }
      if (overlayMode === 'improve' && isImproveProcessing) {
        void api.overlay.setState({
          active: true,
          mode: 'improve',
          status: 'improving',
          waveform: [],
        });
        return;
      }
      void api.overlay.setState({
        ...inactiveOverlayState,
        mode: overlayMode,
      });
    }, 2400);
  };

  const changeMode = (nextMode: HomeMode): void => {
    setMode(nextMode);
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
      const blockMessage = audioActionBlockMessage('speak', audioLockState);
      if (blockMessage) {
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
        showOverlayWarning('improve', improveRunningMessage);
        return;
      }
      void improve();
    });
    const removeImproveResultListener = api.actions.onImproveResult((nextResult) => {
      setMode('improve');
      setImproveResult(nextResult);
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
      const blockMessage = audioActionBlockMessage('transcript', audioLockState);
      if (blockMessage) {
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
    waveform,
  ]);

  return (
    <main className="app-shell">
      <AppSidebar
        section={section}
        settings={settings}
        onSectionChange={(nextSection) => {
          setSection(nextSection);
          setSettingsFocus(null);
        }}
        onShortcutSettings={() => {
          setSettingsFocus('shortcuts');
          setSection('settings');
        }}
      />
      <AppContent
        section={section}
        mode={mode}
        result={result}
        improveInput={improveInput}
        isRecording={mode === 'transcript' ? Boolean(transcriptRecorder) : Boolean(recorder)}
        actionBlockMessage={actionBlockMessage}
        waveform={waveform}
        settings={settings}
        whisperRuntime={whisperRuntime}
        history={history}
        ollamaModels={ollamaModels}
        whisperModels={whisperModels}
        availableWhisperModels={availableWhisperModels}
        settingsFocus={settingsFocus}
        onMinimize={() => void api.window.minimize()}
        onMaximize={() => void api.window.toggleMaximize()}
        onClose={() => void api.window.close()}
        onOpenSettings={() => setSection('settings')}
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
          setSettings(nextSettings);
          void saveSettings(nextSettings);
        }}
        onRefreshModels={() => void refreshModelsFromSettings()}
        onDownloadWhisperModel={(id) => void downloadWhisperModel(id)}
        onDeleteWhisperModel={(id) => void deleteWhisperModel(id)}
        onFocusHandled={() => setSettingsFocus(null)}
        onShortcutUnavailable={() => showToast('error', 'This shortcut cannot be used.')}
        onShortcutEditingChange={setIsShortcutEditing}
        onOpenDataFolder={() => void api.app.openDataFolder()}
        onHistoryCopy={(entry) => void api.clipboard.write(entry.text)}
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
  left.ollamaModel === right.ollamaModel &&
  left.whisperModel === right.whisperModel &&
  left.correctionPrompt === right.correctionPrompt &&
  left.pasteAfterDictation === right.pasteAfterDictation &&
  left.pasteAfterImprovement === right.pasteAfterImprovement &&
  left.improveSelectedText === right.improveSelectedText &&
  left.maxHistoryItems === right.maxHistoryItems &&
  left.language === right.language &&
  left.hotkeys.speak === right.hotkeys.speak &&
  left.hotkeys.improveText === right.hotkeys.improveText &&
  left.hotkeys.transcript === right.hotkeys.transcript;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Operation failed.';
