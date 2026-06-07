import type { HomeMode, OverlayState, ResultState, StatusTone } from './types';

export type ActionUiPhase = 'ready' | 'loading' | 'recording' | 'processing' | 'done' | 'warning' | 'error';

type ActionUiDefinition = {
  title: string;
  message: string;
  tone: StatusTone;
  resultStatus: ResultState['status'];
  overlayStatus: OverlayState['status'];
  overlayPhase?: OverlayState['phase'];
  messageType?: OverlayState['messageType'];
};

export const actionUi = (mode: HomeMode, phase: ActionUiPhase): ActionUiDefinition => ({
  title: actionTitle(mode),
  message: actionMessage(mode, phase),
  tone: actionTone(phase),
  resultStatus: resultStatus(phase),
  overlayStatus: overlayStatus(mode, phase),
  overlayPhase: overlayPhase(mode, phase),
  messageType: messageType(phase),
});

export const actionResult = (
  mode: HomeMode,
  phase: ActionUiPhase,
  overrides: Partial<ResultState> = {},
): ResultState => {
  const state = actionUi(mode, phase);
  return {
    text: '',
    status: state.resultStatus,
    tone: state.tone,
    message: state.message,
    actionPhase: phase,
    ...overrides,
  };
};

export const actionOverlay = (
  mode: HomeMode,
  phase: ActionUiPhase,
  waveform: number[] = [],
  overrides: Partial<OverlayState> = {},
): OverlayState => {
  const state = actionUi(mode, phase);
  return {
    active: phase !== 'ready',
    mode,
    status: state.overlayStatus,
    phase: state.overlayPhase,
    waveform,
    actionPhase: phase,
    message: state.message,
    messageType: state.messageType,
    ...overrides,
  };
};

const actionTitle = (mode: HomeMode): string =>
  mode === 'speak' ? 'Speak' : mode === 'improve' ? 'Improve' : 'Transcript';

const actionMessage = (mode: HomeMode, phase: ActionUiPhase): string => {
  if (phase === 'ready') {
    return mode === 'transcript' ? 'Transcription ready' : `${actionTitle(mode)} ready`;
  }
  if (phase === 'loading') {
    return `${actionTitle(mode)} is loading...`;
  }
  if (phase === 'recording') {
    return mode === 'speak' ? 'Listening...' : 'Recording...';
  }
  if (phase === 'processing') {
    if (mode === 'improve') {
      return 'Improving text...';
    }
    return mode === 'transcript' ? 'Transcribing...' : 'Transcribing...';
  }
  if (phase === 'done') {
    return `${actionTitle(mode)} done`;
  }
  if (phase === 'warning') {
    return 'Action unavailable';
  }
  return `${actionTitle(mode)} failed`;
};

const actionTone = (phase: ActionUiPhase): StatusTone => {
  if (phase === 'ready' || phase === 'done') {
    return 'success';
  }
  if (phase === 'warning') {
    return 'warning';
  }
  if (phase === 'error') {
    return 'error';
  }
  return 'info';
};

const resultStatus = (phase: ActionUiPhase): ResultState['status'] => {
  if (phase === 'error') {
    return 'error';
  }
  if (phase === 'recording') {
    return 'listening';
  }
  if (phase === 'processing') {
    return 'processing';
  }
  return 'ready';
};

const overlayStatus = (mode: HomeMode, phase: ActionUiPhase): OverlayState['status'] => {
  if (phase === 'recording') {
    return 'recording';
  }
  if (phase === 'processing') {
    return mode === 'improve' ? 'improving' : 'transcribing';
  }
  if (phase === 'warning' || phase === 'error' || phase === 'loading') {
    return 'warning';
  }
  return 'done';
};

const overlayPhase = (mode: HomeMode, phase: ActionUiPhase): OverlayState['phase'] | undefined => {
  if (phase === 'loading') {
    return 'loading';
  }
  if (phase === 'recording') {
    return 'recording';
  }
  if (phase === 'processing') {
    return mode === 'improve' ? 'thinking' : 'transcribing';
  }
  return undefined;
};

const messageType = (phase: ActionUiPhase): OverlayState['messageType'] => {
  if (phase === 'ready' || phase === 'done') {
    return 'success';
  }
  if (phase === 'warning') {
    return 'warning';
  }
  if (phase === 'error') {
    return 'error';
  }
  return 'info';
};
