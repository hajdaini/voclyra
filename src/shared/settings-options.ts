import type {
  LanguageMode,
  LlmContextSize,
  LlmPerformanceMode,
  SilenceSensitivity,
  WhisperQualityMode,
} from './types';

export const whisperLanguageOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'fr', label: 'French' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
] as const satisfies readonly { value: LanguageMode; label: string }[];

export const whisperQualityModeOptions = [
  { value: 'fast', label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'accurate', label: 'Accurate' },
] as const satisfies readonly { value: WhisperQualityMode; label: string }[];

export const llmPerformanceModeOptions = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'fast', label: 'Fast GPU' },
] as const satisfies readonly { value: LlmPerformanceMode; label: string }[];

export const llmContextSizeValues = [
  512,
  1024,
  2048,
  3072,
  4096,
  6144,
  8192,
  12288,
  16384,
  32768,
] as const satisfies readonly LlmContextSize[];

export const silenceSensitivityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
] as const satisfies readonly { value: SilenceSensitivity; label: string }[];

export const settingsLimits = {
  maxHistoryItems: {
    min: 1,
    max: 10000,
  },
  transcriptLiveChunkSeconds: {
    min: 30,
    max: 300,
  },
} as const;

export const optionValues = <T extends string>(
  options: readonly { value: T }[],
): readonly T[] => options.map((option) => option.value);
