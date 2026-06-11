import { useEffect, useState, type JSX } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clipboard,
  Cpu,
  Download,
  FileText,
  Headphones,
  Home,
  Info,
  LoaderCircle,
  Mic,
  Pencil,
  Signal,
  Square,
  TriangleAlert,
  Timer,
  Type,
  Wand2,
} from 'lucide-react';
import type { HardwareInfo, HomeMode, Hotkeys, LlmRuntimeInfo, OverlayState, ResultState, WhisperRuntimeInfo } from '@shared/types';
import { missingActionMessage } from '@shared/action-messages';

export type HomeViewProps = {
  mode: HomeMode;
  result: ResultState;
  overlayState: OverlayState;
  improveInput: string;
  isRecording: boolean;
  actionBlockMessage: string | null;
  useLocalSpeechRuntime: boolean;
  useLocalImproveRuntime: boolean;
  whisperModel: string;
  llmModel: string;
  hotkeys: Hotkeys;
  whisperRuntime: WhisperRuntimeInfo;
  llmRuntime: LlmRuntimeInfo;
  runtimeInfoLoaded: boolean;
  hardwareInfo: HardwareInfo;
  whisperModelAvailable: boolean;
  llmModelAvailable: boolean;
  audioServerEnabled: boolean;
  llmServerEnabled: boolean;
  audioServerBusy: boolean;
  llmServerBusy: boolean;
  onOpenSettings: () => void;
  onAudioServerChange: (enabled: boolean) => void;
  onLlmServerChange: (enabled: boolean) => void;
  onModeChange: (mode: HomeMode) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onStartTranscript: () => void;
  onStopTranscript: () => void;
  onImprove: () => void;
  onImproveInputChange: (value: string) => void;
  onImproveInputFocusChange: (focused: boolean) => void;
  onCopy: () => void;
  onExport: () => void;
};

export const shouldShowDownloadModelButton = (
  mode: HomeMode,
  runtimeInfoLoaded: boolean,
  whisperModelAvailable: boolean,
  llmModelAvailable: boolean,
): boolean => runtimeInfoLoaded && !(mode === 'improve' ? llmModelAvailable : whisperModelAvailable);

export const HomeView = ({
  mode,
  result,
  overlayState,
  improveInput,
  isRecording,
  actionBlockMessage,
  useLocalSpeechRuntime,
  useLocalImproveRuntime,
  whisperModel,
  llmModel,
  hotkeys,
  whisperRuntime,
  llmRuntime,
  runtimeInfoLoaded,
  hardwareInfo,
  whisperModelAvailable,
  llmModelAvailable,
  audioServerEnabled,
  llmServerEnabled,
  audioServerBusy,
  llmServerBusy,
  onOpenSettings,
  onAudioServerChange,
  onLlmServerChange,
  onModeChange,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onStartTranscript,
  onStopTranscript,
  onImprove,
  onImproveInputChange,
  onImproveInputFocusChange,
  onCopy,
  onExport,
}: HomeViewProps): JSX.Element => {
  const isActionBlocked = Boolean(actionBlockMessage) && !isRecording;
  const missingMessage = runtimeInfoLoaded
    ? missingActionMessage({
        mode,
        resultStatus: result.status,
        whisperRuntime,
        llmRuntime,
        whisperModelAvailable,
        llmModelAvailable,
      })
    : null;
  const activeOverlay = overlayState.active && overlayState.mode === mode ? overlayState : null;
  const isRecordingActive = isRecording || activeOverlay?.status === 'recording';
  const recordingElapsedLabel = useRecordingElapsedLabel(
    isRecordingActive,
    activeOverlay?.recordingStartedAtMs,
  );
  const statusMessage = missingMessage ?? activeOverlay?.message ?? result.message;
  const statusTone = missingMessage ? 'error' : activeOverlay ? statusToneForOverlay(activeOverlay) : statusToneFor(result);
  const StatusIcon = statusIcon[statusTone];
  const showProgressStatus = activeOverlay
    ? activeOverlay.actionPhase === 'loading' || activeOverlay.actionPhase === 'processing'
      || (activeOverlay.status === 'recording' && Boolean(activeOverlay.progressLabel))
    : result.status === 'processing' || result.actionPhase === 'loading';
  const activeRuntimeAvailable = runtimeInfoLoaded && (mode === 'improve' ? llmRuntime.runtimeAvailable : whisperRuntime.runtimeAvailable);
  const showDownloadModelButton = shouldShowDownloadModelButton(
    mode,
    runtimeInfoLoaded,
    whisperModelAvailable,
    llmModelAvailable,
  );
  const runtimeLabel = !runtimeInfoLoaded
    ? 'Runtime loading'
    : (mode === 'improve' ? !useLocalImproveRuntime : !useLocalSpeechRuntime)
    ? 'Remote server'
    : activeRuntimeAvailable
    ? hardwareInfo.gpuAvailable
      ? 'GPU ready'
      : 'CPU auto'
    : 'Runtime missing';
  const runtimeTone = !runtimeInfoLoaded
    ? 'info'
    : (mode === 'improve' ? !useLocalImproveRuntime : !useLocalSpeechRuntime)
    ? activeRuntimeAvailable
      ? 'success'
      : 'warning'
    : activeRuntimeAvailable
    ? hardwareInfo.gpuAvailable
      ? 'success'
      : 'error'
    : 'warning';

  return (
    <div className="home-grid">
      <section className="workspace">
        <div className="home-heading">
          <div>
            <h1 className="view-title">
              <Home size={21} />
              <span>Home</span>
            </h1>
          </div>
          <div className="home-heading-actions">
            <ServerSwitch
              label="Audio server"
              checked={audioServerEnabled}
              busy={audioServerBusy}
              disabled={audioServerBusy}
              onChange={onAudioServerChange}
            />
            <ServerSwitch
              label="LLM server"
              checked={llmServerEnabled}
              busy={llmServerBusy}
              disabled={llmServerBusy}
              onChange={onLlmServerChange}
            />
            <button
              className={`home-model-button ${showDownloadModelButton ? 'download' : ''}`}
              type="button"
              title={showDownloadModelButton ? 'Open model downloads' : 'Open model settings'}
              onClick={onOpenSettings}
            >
              {showDownloadModelButton ? <Download size={17} /> : <Bot size={17} />}
              <span>{showDownloadModelButton ? 'Download model' : 'Model settings'}</span>
            </button>
          </div>
        </div>

        <div className="home-actions">
          <button
            className={`home-action speak-action ${mode === 'speak' ? 'selected' : ''} ${mode === 'speak' && isRecordingActive ? 'recording' : ''}`}
            type="button"
            title="Switch to Speak"
            onClick={() => onModeChange('speak')}
          >
            <Mic size={24} />
            <div className="home-action-content">
              <span className="action-title-row">
                <strong>Speak</strong>
              </span>
              <span className="action-description">Speak. Paste. Move on.</span>
              <small className="action-badge model-badge" title={whisperModel || 'No model'}>
                <Bot size={12} />
                <span>{whisperModel || 'No model'}</span>
              </small>
            </div>
          </button>

          <button
            className={`home-action ${mode === 'improve' ? 'selected' : ''}`}
            type="button"
            title="Switch to Improve"
            onClick={() => onModeChange('improve')}
          >
            <Wand2 size={23} />
            <div className="home-action-content">
              <span className="action-title-row">
                <strong>Improve</strong>
              </span>
              <span className="action-description">Correct text in one shortcut.</span>
              <small className="action-badge model-badge" title={llmModel || 'No model'}>
                <Bot size={12} />
                <span>{llmModel || 'No model'}</span>
              </small>
            </div>
          </button>

          <button
            className={`home-action ${mode === 'transcript' ? 'selected' : ''} ${mode === 'transcript' && isRecordingActive ? 'recording' : ''}`}
            type="button"
            title="Switch to Transcript"
            onClick={() => onModeChange('transcript')}
          >
            <Headphones size={23} />
            <div className="home-action-content">
              <span className="action-title-row">
                <strong>Transcript</strong>
              </span>
              <span className="action-description">Record now. Summarize later.</span>
              <small className="action-badge model-badge" title={whisperModel || 'No model'}>
                <Bot size={12} />
                <span>{whisperModel || 'No model'}</span>
              </small>
            </div>
          </button>
        </div>

        {(mode === 'speak' || mode === 'transcript') && (
          <div className={`task-panel speak-task ${isRecordingActive ? 'recording' : ''}`}>
            <button
              className={`record-button ${isRecordingActive ? 'recording' : ''}`}
              type="button"
              title={
                isRecordingActive
                  ? `Stop ${mode === 'transcript' ? 'transcript' : 'recording'}`
                  : `Start ${mode === 'transcript' ? 'transcript' : 'recording'}`
              }
              onClick={
                mode === 'transcript'
                  ? isRecordingActive
                    ? onStopTranscript
                    : onStartTranscript
                  : isRecordingActive
                    ? onStopRecording
                    : onStartRecording
              }
              disabled={isActionBlocked}
            >
              {isRecordingActive ? (
                <Square size={21} />
              ) : mode === 'transcript' ? (
                <Headphones size={24} />
              ) : (
                <Mic size={24} />
              )}
              <span className="action-button-text">
                <span>{isRecordingActive ? 'Stop' : mode === 'transcript' ? 'Transcript' : 'Speak'}</span>
                <small>({formatShortcut(mode === 'transcript' ? hotkeys.transcript : hotkeys.speak)})</small>
              </span>
            </button>

            {isRecordingActive && (
              <>
                <button
                  className="cancel-record-button"
                  type="button"
                  title="Cancel recording"
                  onClick={onCancelRecording}
                >
                  <span>Cancel</span>
                </button>
                {recordingElapsedLabel && (
                  <span className="recording-elapsed" title="Recording duration">
                    <Timer size={14} />
                    <span>{recordingElapsedLabel}</span>
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {mode === 'improve' && (
          <div className="task-panel improve-task">
            <label className="improve-input">
              Text to improve
              <textarea
                value={improveInput}
                onChange={(event) => onImproveInputChange(event.target.value)}
                onFocus={() => onImproveInputFocusChange(true)}
                onBlur={() => onImproveInputFocusChange(false)}
                placeholder="Paste or type text to improve"
              />
            </label>
            <button
              className="primary-action"
              type="button"
              title="Improve text"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onImprove}
              disabled={isActionBlocked}
            >
              <Wand2 size={24} />
              <span className="action-button-text">
                <span>Improve</span>
                <small>({formatShortcut(hotkeys.improveText)})</small>
              </span>
            </button>
          </div>
        )}

        <section className="result-panel">
          <div className="result-title">
            <div>
              <h2>
                <FileText size={18} />
                <span>
                  {mode === 'speak'
                    ? 'Speak result'
                    : mode === 'improve'
                      ? 'Improved result'
                      : 'Transcript result'}
                </span>
              </h2>
              <div className={`inline-status ${statusTone}`}>
                <span className="inline-status-badge">
                  {showProgressStatus ? (
                    <LoaderCircle className="status-spinner-icon" size={15} aria-label={statusMessage} />
                  ) : (
                    <StatusIcon size={15} />
                  )}
                  {statusMessage && <span>{statusMessage}</span>}
                </span>
                {(mode === 'speak' || mode === 'transcript' || mode === 'improve') && (
                  <small className={`inline-runtime-badge ${runtimeTone}`}>
                    <Cpu size={14} />
                    <span>{runtimeLabel}</span>
                  </small>
                )}
              </div>
            </div>
          </div>

          <div className="result-body">
            <button
              className="result-copy-button"
              type="button"
              title="Copy result"
              aria-label="Copy result"
              onClick={onCopy}
              disabled={result.text.length === 0}
            >
              <Clipboard size={17} />
            </button>
            <button
              className="result-copy-button result-export-button"
              type="button"
              title="Export result as TXT"
              aria-label="Export result as TXT"
              onClick={onExport}
              disabled={result.text.length === 0}
            >
              <Download size={17} />
            </button>
            <div className={`result-output ${result.text ? '' : 'empty'}`} aria-label="Result">
              {result.text || 'The result will appear here.'}
            </div>
          </div>

          <div className="result-actions">
            <span className="result-metrics">
              <span className="result-metric">
                <Pencil size={14} />
                <span>{result.text.length} characters</span>
              </span>
              {typeof result.durationMs === 'number' && (
                <span className="result-metric">
                  <Timer size={14} />
                  <span>{formatDuration(result.durationMs)}</span>
                </span>
              )}
              {typeof result.audioDurationMs === 'number' && (
                <span className="result-metric">
                  <Timer size={14} />
                  <span>{formatDuration(result.audioDurationMs)} audio</span>
                </span>
              )}
              {typeof result.tokensGenerated === 'number' && (
                <span className="result-metric">
                  <Type size={14} />
                  <span>{result.tokensGenerated} tokens</span>
                </span>
              )}
              {typeof result.tokensPerSecond === 'number' && (
                <span className="result-metric">
                  <Timer size={14} />
                  <span>{result.tokensPerSecond} tokens/s</span>
                </span>
              )}
            </span>
          </div>
        </section>
      </section>
    </div>
  );
};

type ServerSwitchProps = {
  label: string;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
};

const ServerSwitch = ({
  label,
  checked,
  busy,
  disabled,
  onChange,
}: ServerSwitchProps): JSX.Element => (
  <label className={`server-switch ${checked ? 'on' : 'off'}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled || busy}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="server-switch-track">
      <span className="server-switch-thumb">
        {busy && <LoaderCircle className="status-spinner-icon" size={12} aria-label={`${label} changing`} />}
      </span>
    </span>
    <span>{label}</span>
  </label>
);

const formatShortcut = (shortcut: string): string => shortcut.replace('CommandOrControl', 'Ctrl');

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)}s`;
};

const useRecordingElapsedLabel = (active: boolean, startedAtMs?: number): string => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !startedAtMs) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAtMs]);
  if (!active || !startedAtMs) {
    return '';
  }
  return formatRecordingElapsed(Math.max(0, now - startedAtMs));
};

const formatRecordingElapsed = (durationMs: number): string => {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const statusIcon = {
  default: Signal,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

const statusToneFor = (result: ResultState): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  if (result.tone) {
    return result.tone;
  }
  if (result.status === 'error') {
    return 'error';
  }
  if (result.status === 'listening' || result.status === 'processing') {
    return 'info';
  }
  return result.text ? 'success' : 'default';
};

const statusToneForOverlay = (state: OverlayState): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  if (state.messageType) {
    return state.messageType;
  }
  if (state.status === 'done') {
    return 'success';
  }
  if (state.status === 'warning') {
    return state.actionPhase === 'loading' ? 'info' : 'warning';
  }
  return 'info';
};
