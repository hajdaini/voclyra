import { useEffect, useRef, useState, type JSX } from 'react';
import { AlertTriangle, CheckCircle2, Headphones, LoaderCircle, Mic, Timer, Volume2, Wand2 } from 'lucide-react';
import type { OverlayState } from '@shared/types';
import { defaultSettings } from '@shared/defaults';
import { api } from '../../api';
import { inactiveOverlayState } from '../appState';
import { AudioLevelIcon } from './AudioLevelIcon';

export const Overlay = (): JSX.Element => {
  const lastContentSizeRef = useRef<{ width: number; height: number } | null>(null);
  const overlayMode =
    new URLSearchParams(window.location.search).get('overlay') === 'improve'
      ? 'improve'
      : new URLSearchParams(window.location.search).get('overlay') === 'transcript'
        ? 'transcript'
        : new URLSearchParams(window.location.search).get('overlay') === 'additional-info'
          ? 'additional-info'
          : 'speak';
  const [overlayState, setOverlayState] = useState<OverlayState>(inactiveOverlayState);
  const [shortcut, setShortcut] = useState(
    overlayMode === 'transcript' ? defaultSettings.hotkeys.transcript : defaultSettings.hotkeys.speak,
  );
  const modeLabel =
    overlayState.mode === 'speak'
      ? 'Speak'
      : overlayState.mode === 'improve'
        ? 'Improve'
        : overlayState.mode === 'transcript'
          ? 'Transcript'
          : 'Info';
  const statusMessage = overlayState.message ?? fallbackMessage(overlayState);
  const isLivePreview = overlayState.status === 'recording' && Boolean(overlayState.progressLabel);
  const recordingElapsedLabel = useRecordingElapsedLabel(
    overlayState.status === 'recording',
    overlayState.recordingStartedAtMs,
  );
  const isBusy = isLivePreview
    || overlayState.status === 'warning' && overlayState.actionPhase === 'loading'
    || overlayState.status === 'transcribing'
    || overlayState.status === 'improving';

  useEffect(() => {
    let mounted = true;
    void api.settings.get().then((settings) => {
      if (mounted) {
        setShortcut(overlayMode === 'transcript' ? settings.hotkeys.transcript : settings.hotkeys.speak);
      }
    });
    void api.overlay.getState(overlayMode).then((state) => {
      if (mounted) {
        setOverlayState(state);
      }
    });
    const removeListener = api.overlay.onState((state) => {
      if (state.mode === overlayMode) {
        setOverlayState(state);
      }
    });
    return () => {
      mounted = false;
      removeListener();
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector('.overlay');
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      const lastContentSize = lastContentSizeRef.current;
      if (lastContentSize?.width === width && lastContentSize.height === height) {
        return;
      }
      lastContentSizeRef.current = { width, height };
      void api.overlay.setContentSize(overlayMode, {
        width,
        height,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [overlayState, overlayMode]);

  return (
    <main className={`overlay ${overlayState.status}`}>
      <div className="overlay-icon">
        {isBusy || isLivePreview ? (
          <LoaderCircle className="status-spinner-icon" size={20} aria-label={statusMessage} />
        ) : overlayState.status === 'warning' || overlayState.mode === 'additional-info' ? (
          <AlertTriangle size={18} />
        ) : overlayState.mode === 'speak' ? (
          <Mic size={20} />
        ) : overlayState.mode === 'improve' ? (
          <Wand2 size={18} />
        ) : (
          <Headphones size={18} />
        )}
      </div>
      <div className="overlay-main">
        <div className="overlay-title">
          {overlayState.status === 'done' && <CheckCircle2 size={14} />}
          <strong>{modeLabel}</strong>
        </div>
        {overlayState.status === 'recording' && overlayState.waveform.length > 0 ? (
          <>
            <span className={`overlay-message ${overlayState.messageType ?? 'info'}`}>{statusMessage}</span>
            <div className="audio-level-group compact">
              {overlayState.mode === 'transcript' && (
                <button
                  className="overlay-audio-button"
                  type="button"
                  title="Open microphone settings"
                  onClick={() => void api.overlay.openSettings()}
                >
                  <AudioLevelIcon
                    icon={Mic}
                    levels={overlayState.microphoneWaveform ?? []}
                    active={overlayState.status === 'recording'}
                    label="Microphone level"
                    size={19}
                  />
                </button>
              )}
              <button
                className="overlay-audio-button"
                type="button"
                title={overlayState.mode === 'transcript' ? 'Open computer audio settings' : 'Open microphone settings'}
                onClick={() => void api.overlay.openSettings()}
              >
                <AudioLevelIcon
                  icon={overlayState.mode === 'transcript' ? Volume2 : Mic}
                  levels={overlayState.mode === 'transcript' ? overlayState.systemAudioWaveform ?? overlayState.waveform : overlayState.waveform}
                  active={overlayState.status === 'recording'}
                  label={overlayState.mode === 'transcript' ? 'Computer audio level' : 'Microphone level'}
                  size={19}
                />
              </button>
            </div>
          </>
        ) : (
          <span className={`overlay-message ${overlayState.messageType ?? 'info'}`}>{statusMessage}</span>
        )}
      </div>
      {overlayState.status === 'recording' && (
        <button
          className="overlay-stop"
          type="button"
          title="Stop recording"
          onClick={() => void api.overlay.stopSpeak(overlayMode)}
        >
          <span>Stop</span>
          <small>{shortcut.replace('CommandOrControl', 'Ctrl')}</small>
        </button>
      )}
      {overlayState.status === 'recording' && (overlayMode === 'speak' || overlayMode === 'transcript') && (
        <button
          className="overlay-cancel"
          type="button"
          title="Cancel recording"
          onClick={() => void api.overlay.cancelRecording(overlayMode)}
        >
          <span>Cancel</span>
        </button>
      )}
      {overlayState.status === 'recording' && recordingElapsedLabel && (
        <span className="overlay-timer overlay-actions-timer" title="Recording duration">
          <Timer size={14} />
          <span>{recordingElapsedLabel}</span>
        </span>
      )}
    </main>
  );
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

const fallbackMessage = (state: OverlayState): string => {
  if (state.status === 'warning') {
    return 'Action unavailable';
  }
  if (state.status === 'recording') {
    return state.mode === 'speak' ? 'Listening...' : 'Recording...';
  }
  if (state.status === 'transcribing') {
    return state.mode === 'transcript' ? 'Transcribing...' : 'Transcribing...';
  }
  if (state.status === 'improving') {
    return 'Improving text...';
  }
  if (state.mode === 'additional-info') {
    return 'Info';
  }
  return state.mode === 'speak' ? 'Speak done' : state.mode === 'improve' ? 'Improve done' : 'Transcript done';
};
