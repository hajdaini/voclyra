import { useEffect, useState, type JSX } from 'react';
import { AlertTriangle, CheckCircle2, Headphones, Info, Mic, TriangleAlert, Wand2 } from 'lucide-react';
import type { OverlayState } from '@shared/types';
import { defaultSettings } from '@shared/defaults';
import { api } from '../../api';
import { inactiveOverlayState } from '../appState';

export const SpeakOverlay = (): JSX.Element => {
  const overlayMode =
    new URLSearchParams(window.location.search).get('overlay') === 'improve'
      ? 'improve'
      : new URLSearchParams(window.location.search).get('overlay') === 'transcript'
        ? 'transcript'
        : 'speak';
  const [overlayState, setOverlayState] = useState<OverlayState>(inactiveOverlayState);
  const [shortcut, setShortcut] = useState(
    overlayMode === 'transcript' ? defaultSettings.hotkeys.transcript : defaultSettings.hotkeys.speak,
  );
  const modeLabel =
    overlayState.mode === 'speak' ? 'Speak' : overlayState.mode === 'improve' ? 'Improve' : 'Transcript';
  const label =
    overlayState.status === 'warning'
      ? 'Action unavailable'
      : overlayState.status === 'recording'
      ? 'Listening'
      : overlayState.status === 'transcribing'
        ? 'Transcribing'
        : overlayState.status === 'improving'
          ? 'Improving'
          : overlayState.status === 'done'
            ? `${modeLabel} done`
          : overlayState.mode === 'speak'
            ? 'Speak done'
            : overlayState.mode === 'improve'
              ? 'Improve done'
              : 'Transcript done';
  const MessageIcon =
    overlayState.messageType === 'success'
      ? CheckCircle2
      : overlayState.messageType === 'warning'
        ? TriangleAlert
        : overlayState.messageType === 'info'
          ? Info
          : AlertTriangle;

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

  return (
    <main className={`speak-overlay ${overlayState.status}`}>
      <div className="speak-overlay-icon">
        {overlayState.status === 'warning' ? (
          <AlertTriangle size={18} />
        ) : overlayState.mode === 'speak' ? (
          <Mic size={20} />
        ) : overlayState.mode === 'improve' ? (
          <Wand2 size={18} />
        ) : (
          <Headphones size={18} />
        )}
      </div>
      <div className="speak-overlay-main">
        <div className="speak-overlay-title">
          {overlayState.status === 'done' && <CheckCircle2 size={14} />}
          <strong>{label}</strong>
        </div>
        {overlayState.status === 'recording' && overlayState.waveform.length > 0 ? (
          <div className="speak-overlay-wave" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <span
                key={index}
                style={{ height: `${Math.round(8 + (overlayState.waveform[index] ?? 0.08) * 24)}px` }}
              />
            ))}
          </div>
        ) : overlayState.status === 'transcribing' || overlayState.status === 'improving' ? (
          <div className="speak-overlay-spinner" aria-hidden="true" />
        ) : null}
        {overlayState.message && (
          <span className={`speak-overlay-message ${overlayState.messageType ?? 'error'}`}>
            <MessageIcon size={13} />
            <span>{overlayState.message}</span>
          </span>
        )}
      </div>
      {overlayState.status === 'recording' && (
        <button
          className="speak-overlay-stop"
          type="button"
          title="Stop recording"
          onClick={() => void api.overlay.stopSpeak(overlayMode)}
        >
          <span>Stop</span>
          <small>{shortcut.replace('CommandOrControl', 'Ctrl')}</small>
        </button>
      )}
      {overlayState.status === 'recording' && overlayMode !== 'improve' && (
        <button
          className="speak-overlay-cancel"
          type="button"
          title="Cancel recording"
          onClick={() => void api.overlay.cancelRecording(overlayMode)}
        >
          <span>Cancel</span>
        </button>
      )}
    </main>
  );
};
