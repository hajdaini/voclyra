import { type JSX } from 'react';
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
  whisperModel: string;
  llmModel: string;
  hotkeys: Hotkeys;
  whisperRuntime: WhisperRuntimeInfo;
  llmRuntime: LlmRuntimeInfo;
  runtimeInfoLoaded: boolean;
  hardwareInfo: HardwareInfo;
  whisperModelAvailable: boolean;
  llmModelAvailable: boolean;
  onOpenSettings: () => void;
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
  whisperModel,
  llmModel,
  hotkeys,
  whisperRuntime,
  llmRuntime,
  runtimeInfoLoaded,
  hardwareInfo,
  whisperModelAvailable,
  llmModelAvailable,
  onOpenSettings,
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
  const statusMessage = missingMessage ?? activeOverlay?.message ?? result.message;
  const statusTone = missingMessage ? 'error' : activeOverlay ? statusToneForOverlay(activeOverlay) : statusToneFor(result);
  const StatusIcon = statusIcon[statusTone];
  const showProgressStatus = activeOverlay
    ? activeOverlay.actionPhase === 'loading' || activeOverlay.actionPhase === 'processing'
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
    : activeRuntimeAvailable
    ? hardwareInfo.gpuAvailable
      ? 'GPU ready'
      : 'CPU auto'
    : 'Runtime missing';
  const runtimeTone = !runtimeInfoLoaded
    ? 'info'
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

        <div className="home-actions">
          <button
            className={`home-action speak-action ${mode === 'speak' ? 'selected' : ''} ${mode === 'speak' && isRecording ? 'recording' : ''}`}
            type="button"
            title="Switch to Speak"
            onClick={() => onModeChange('speak')}
          >
            <Mic size={24} />
            <div className="home-action-content">
              <span className="action-title-row">
                <strong>Speak</strong>
              </span>
              <span className="action-description">Dictate. Paste. Move on.</span>
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
            className={`home-action ${mode === 'transcript' ? 'selected' : ''} ${mode === 'transcript' && isRecording ? 'recording' : ''}`}
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
          <div className={`task-panel speak-task ${isRecording ? 'recording' : ''}`}>
            <button
              className={`record-button ${isRecording ? 'recording' : ''}`}
              type="button"
              title={
                isRecording
                  ? `Stop ${mode === 'transcript' ? 'transcript' : 'recording'}`
                  : `Start ${mode === 'transcript' ? 'transcript' : 'recording'}`
              }
              onClick={
                mode === 'transcript'
                  ? isRecording
                    ? onStopTranscript
                    : onStartTranscript
                  : isRecording
                    ? onStopRecording
                    : onStartRecording
              }
              disabled={isActionBlocked}
            >
              {isRecording ? (
                <Square size={21} />
              ) : mode === 'transcript' ? (
                <Headphones size={24} />
              ) : (
                <Mic size={24} />
              )}
              <span className="action-button-text">
                <span>{isRecording ? 'Stop' : mode === 'transcript' ? 'Transcript' : 'Speak'}</span>
                <small>({formatShortcut(mode === 'transcript' ? hotkeys.transcript : hotkeys.speak)})</small>
              </span>
            </button>

            {isRecording && (
              <button
                className="cancel-record-button"
                type="button"
                title="Cancel recording"
                onClick={onCancelRecording}
              >
                <span>Cancel</span>
              </button>
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

const formatShortcut = (shortcut: string): string => shortcut.replace('CommandOrControl', 'Ctrl');

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)}s`;
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
