import type { Settings } from '@shared/types';

export const shouldConfirmTranscriptOutputChange = (
  currentSettings: Settings,
  nextSettings: Settings,
  transcriptRecording: boolean,
): boolean =>
  transcriptRecording &&
  (
    currentSettings.transcriptOutputDeviceId !== nextSettings.transcriptOutputDeviceId ||
    currentSettings.transcriptOutputDeviceLabel !== nextSettings.transcriptOutputDeviceLabel
  );
