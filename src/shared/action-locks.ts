export type ActionLockAction = 'speak' | 'improve' | 'transcript';

export type ActionLockState = {
  speakRecording: boolean;
  speakProcessing: boolean;
  improveProcessing: boolean;
  transcriptRecording: boolean;
  transcriptProcessing: boolean;
};

export const improveRunningMessage = 'Improve is already running.';

export const actionBlockMessage = (
  action: ActionLockAction,
  state: ActionLockState,
): string | null => {
  if (action === 'improve') {
    return state.improveProcessing ? improveRunningMessage : null;
  }

  if (action === 'speak') {
    if (state.speakRecording) {
      return 'Speak is already running.';
    }
    if (state.speakProcessing) {
      return 'Speak is already transcribing.';
    }
    if (state.transcriptRecording || state.transcriptProcessing) {
      return 'Transcript is already running.';
    }
    return null;
  }

  if (state.transcriptRecording) {
    return 'Transcript is already running.';
  }
  if (state.transcriptProcessing) {
    return 'Transcript is already transcribing.';
  }
  if (state.speakRecording || state.speakProcessing) {
    return 'Speak is already running.';
  }
  return null;
};
