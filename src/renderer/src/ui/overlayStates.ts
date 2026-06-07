import type { OverlayState } from '@shared/types';
import { actionOverlay } from '@shared/action-ui';
import { inactiveOverlayState } from './appState';

type OverlayMode = OverlayState['mode'];
type OverlayMessageType = NonNullable<OverlayState['messageType']>;
type OverlayProgress = Pick<OverlayState, 'phase' | 'progress' | 'tokensGenerated' | 'progressLabel'>;

export const overlayDone = (
  mode: OverlayMode,
  message?: string,
  messageType: OverlayMessageType = 'success',
): OverlayState => ({
  ...actionOverlay(mode, 'done', [], { message, messageType }),
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
  ...actionOverlay(mode, 'warning', [], { message, messageType }),
});

export const overlayRecording = (
  mode: 'speak' | 'transcript',
  waveform: number[],
  message?: string,
  messageType?: OverlayMessageType,
  phase: OverlayState['phase'] = 'recording',
): OverlayState => ({
  ...actionOverlay(mode, 'recording', waveform, cleanOverlayOverrides({ phase, message, messageType })),
});

export const overlayProcessing = (
  mode: OverlayMode,
  waveform: number[] = [],
  message?: string,
  messageType?: OverlayMessageType,
  progress?: OverlayProgress,
): OverlayState => ({
  ...actionOverlay(mode, 'processing', waveform, cleanOverlayOverrides({
    ...progress,
    phase: progress?.phase ?? (mode === 'improve' ? 'thinking' : 'transcribing'),
    message,
    messageType,
  })),
});

const cleanOverlayOverrides = (overrides: Partial<OverlayState>): Partial<OverlayState> =>
  Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<OverlayState>;
