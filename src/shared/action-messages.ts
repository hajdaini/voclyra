import type { HomeMode, LlmRuntimeInfo, WhisperRuntimeInfo } from './types';

export const actionMessages = {
  clipboardEmpty: 'Clipboard is empty.',
  enterTextToImprove: 'Enter text to improve.',
  recordingCancelled: 'Recording cancelled.',
  whisperMissing: 'Whisper missing',
  whisperModelMissing: 'Whisper model missing',
  llamaMissing: 'Llama missing',
  llamaModelMissing: 'Llama model missing',
} as const;

export const missingActionMessage = ({
  mode,
  resultStatus,
  whisperRuntime,
  llmRuntime,
  whisperModelAvailable,
  llmModelAvailable,
}: {
  mode: HomeMode;
  resultStatus: string;
  whisperRuntime: WhisperRuntimeInfo;
  llmRuntime: LlmRuntimeInfo;
  whisperModelAvailable: boolean;
  llmModelAvailable: boolean;
}): string | null => {
  if (resultStatus !== 'ready') {
    return null;
  }
  if (mode === 'improve') {
    if (!llmRuntime.runtimeAvailable) {
      return actionMessages.llamaMissing;
    }
    return llmModelAvailable ? null : actionMessages.llamaModelMissing;
  }
  if (!whisperRuntime.runtimeAvailable) {
    return actionMessages.whisperMissing;
  }
  return whisperModelAvailable ? null : actionMessages.whisperModelMissing;
};
