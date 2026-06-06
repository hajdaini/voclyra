import type { OverlayState } from '@shared/types';
import { inactiveOverlayState } from './appState';

type OverlayMode = OverlayState['mode'];
type OverlayMessageType = NonNullable<OverlayState['messageType']>;

export const overlayDone = (
  mode: OverlayMode,
  message?: string,
  messageType: OverlayMessageType = 'success',
): OverlayState => ({
  active: true,
  mode,
  status: 'done',
  waveform: [],
  message,
  messageType,
});

export const overlayInactive = (mode: OverlayMode, status: OverlayState['status'] = 'done'): OverlayState => ({
  ...inactiveOverlayState,
  mode,
  status,
  waveform: [],
});

export const overlayWarning = (
  mode: OverlayMode,
  message: string,
  messageType: OverlayMessageType,
): OverlayState => ({
  active: true,
  mode,
  status: 'warning',
  waveform: [],
  message,
  messageType,
});

export const overlayRecording = (
  mode: 'speak' | 'transcript',
  waveform: number[],
  message?: string,
  messageType?: OverlayMessageType,
): OverlayState => ({
  active: true,
  mode,
  status: 'recording',
  waveform,
  message,
  messageType,
});

export const overlayProcessing = (
  mode: OverlayMode,
  waveform: number[] = [],
  message?: string,
  messageType?: OverlayMessageType,
): OverlayState => ({
  active: true,
  mode,
  status: mode === 'improve' ? 'improving' : 'transcribing',
  waveform,
  message,
  messageType,
});
