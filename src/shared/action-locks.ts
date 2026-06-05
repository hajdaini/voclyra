export type AudioAction = 'speak' | 'transcript';

export type AudioLockState = {
  speakRecording: boolean;
  speakProcessing: boolean;
  transcriptRecording: boolean;
  transcriptProcessing: boolean;
};

export const improveRunningMessage = 'Improve is already running.';

export const audioActionBlockMessage = (
  action: AudioAction,
  state: AudioLockState,
): string | null => {
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
