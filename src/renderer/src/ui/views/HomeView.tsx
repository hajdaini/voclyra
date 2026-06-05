import { type JSX } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clipboard,
  Cpu,
  FileText,
  Headphones,
  LoaderCircle,
  Mic,
  Signal,
  Square,
  Wand2,
} from 'lucide-react';
import type { HomeMode, ResultState, WhisperRuntimeInfo } from '@shared/types';

export type HomeViewProps = {
  mode: HomeMode;
  result: ResultState;
  improveInput: string;
  isRecording: boolean;
  waveform: number[];
  whisperModel: string;
  ollamaModel: string;
  whisperRuntime: WhisperRuntimeInfo;
  onOpenSettings: () => void;
  onModeChange: (mode: HomeMode) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStartTranscript: () => void;
  onStopTranscript: () => void;
  onImprove: () => void;
  onImproveInputChange: (value: string) => void;
  onImproveInputFocusChange: (focused: boolean) => void;
  onCopy: () => void;
};

export const HomeView = ({
  mode,
  result,
  improveInput,
  isRecording,
  waveform,
  whisperModel,
  ollamaModel,
  whisperRuntime,
  onOpenSettings,
  onModeChange,
  onStartRecording,
  onStopRecording,
  onStartTranscript,
  onStopTranscript,
  onImprove,
  onImproveInputChange,
  onImproveInputFocusChange,
  onCopy,
}: HomeViewProps): JSX.Element => {
  const StatusIcon = statusIcon[result.status];
  const backendLabel =
    whisperRuntime.backend === 'gpu'
      ? 'GPU used'
      : whisperRuntime.backend === 'cpu'
        ? 'CPU used'
        : whisperRuntime.gpuAvailable
          ? 'GPU ready'
          : 'CPU only';

  return (
    <div className="home-grid">
      <section className="workspace">
        <div className="home-heading">
          <div>
            <h1>Home</h1>
          </div>
          <button type="button" title="Open model settings" onClick={onOpenSettings}>
            <Bot size={17} />
            <span>Model settings</span>
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
            <div>
              <span className="action-title-row">
                <strong>Speak</strong>
                <span className="action-badges">
                  <small className="action-badge">
                    <Bot size={14} />
                    {whisperModel || 'No model'}
                  </small>
                  <small className="action-badge">
                    <Cpu size={14} />
                    <span>{backendLabel}</span>
                  </small>
                </span>
              </span>
              <span>Voice to text</span>
            </div>
          </button>
          <button
            className={`home-action ${mode === 'improve' ? 'selected' : ''}`}
            type="button"
            title="Switch to Improve"
            onClick={() => onModeChange('improve')}
          >
            <Wand2 size={23} />
            <div>
              <span className="action-title-row">
                <strong>Improve</strong>
                <small className="action-badge">
                  <Bot size={14} />
                  {ollamaModel || 'No model'}
                </small>
              </span>
              <span>Clean selected text</span>
            </div>
          </button>
          <button
            className={`home-action ${mode === 'transcript' ? 'selected' : ''} ${mode === 'transcript' && isRecording ? 'recording' : ''}`}
            type="button"
            title="Switch to Transcript"
            onClick={() => onModeChange('transcript')}
          >
            <Headphones size={23} />
            <div>
              <span className="action-title-row">
                <strong>Transcript</strong>
                <span className="action-badges">
                  <small className="action-badge">
                    <Bot size={14} />
                    {whisperModel || 'No model'}
                  </small>
                  <small className="action-badge">
                    <Cpu size={14} />
                    <span>{backendLabel}</span>
                  </small>
                </span>
              </span>
              <span>Long voice capture</span>
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
            >
              {isRecording ? <Square size={24} /> : mode === 'transcript' ? <Headphones size={28} /> : <Mic size={28} />}
              <span>{isRecording ? 'Stop' : mode === 'transcript' ? 'Transcript' : 'Speak'}</span>
            </button>
            <div className={`waveform ${isRecording ? 'recording' : ''}`} aria-hidden="true">
              {waveform.map((level, index) => (
                <span key={index} style={{ height: `${Math.round(8 + level * 54)}px` }} />
              ))}
            </div>
          </div>
        )}
        {mode === 'improve' && (
          <div className="task-panel">
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
            >
              <Wand2 size={17} />
              <span>Improve</span>
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
                    ? 'Dictation result'
                    : mode === 'improve'
                      ? 'Improved result'
                      : 'Transcript result'}
                </span>
              </h2>
              <div className={`inline-status ${result.status}`}>
                {result.status === 'processing' ? (
                  <span className="status-spinner" aria-hidden="true" />
                ) : (
                  <StatusIcon size={18} />
                )}
                <span>{result.message}</span>
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
            <span>{result.text.length} characters</span>
          </div>
        </section>
      </section>
    </div>
  );
};

const statusIcon = {
  ready: CheckCircle2,
  listening: Signal,
  processing: LoaderCircle,
  error: AlertCircle,
};
