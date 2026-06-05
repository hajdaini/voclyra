import { useEffect, useState, type JSX } from 'react';
import { AlertTriangle, CheckCircle2, Headphones, Mic, Pencil, TriangleAlert, X } from 'lucide-react';
import type { OverlayState } from '@shared/types';
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
  const label =
    overlayState.status === 'warning'
      ? 'Action unavailable'
      : overlayState.status === 'recording'
      ? 'Listening'
      : overlayState.status === 'transcribing'
        ? 'Transcribing'
        : overlayState.status === 'improving'
          ? 'Improving'
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
        : AlertTriangle;

  useEffect(() => {
    let mounted = true;
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
    <main className={`speak-overlay ${overlayState.status === 'done' ? 'done' : ''} ${overlayState.status === 'warning' ? 'warning' : ''}`}>
      <div className={`speak-overlay-icon ${overlayState.status === 'done' ? 'done' : ''} ${overlayState.status === 'warning' ? 'warning' : ''}`}>
        {overlayState.status === 'warning' ? (
          <AlertTriangle size={18} />
        ) : overlayState.status === 'done' ? (
          <CheckCircle2 size={20} />
        ) : overlayState.mode === 'speak' ? (
          <Mic size={20} />
        ) : overlayState.mode === 'improve' ? (
          <Pencil size={18} />
        ) : (
          <Headphones size={18} />
        )}
      </div>
      <div className="speak-overlay-main">
        <strong>{label}</strong>
        {overlayState.status === 'recording' ? (
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
      </div>
      {overlayState.message && (
        <span className={`speak-overlay-message ${overlayState.messageType ?? 'error'}`}>
          <MessageIcon size={13} />
          <span>{overlayState.message}</span>
        </span>
      )}
      {overlayState.status === 'recording' && (
        <button type="button" title="Stop recording" onClick={() => void api.overlay.stopSpeak(overlayMode)}>
          <span>Stop</span>
        </button>
      )}
      {overlayState.status !== 'done' && (
        <button
          className="speak-overlay-close"
          type="button"
          title="Close overlay"
          aria-label="Close overlay"
          onClick={() => void api.overlay.dismiss(overlayMode)}
        >
          <X size={14} />
        </button>
      )}
    </main>
  );
};
