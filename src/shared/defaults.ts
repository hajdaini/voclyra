import { text } from 'stream/iter';
import type { HistoryEntry, Settings } from './types';

export const defaultSettings: Settings = {
  llmModel: '',
  whisperModel: '',
  whisperCudaRuntimeVersion: 'cuda-12',
  whisperLanguage: 'auto',
  whisperQualityMode: 'balanced',
  llmCudaRuntimeVersion: 'cuda-13',
  llmMaxTokensMode: 'auto',
  llmMaxTokens: 160,
  llmContextSize: 4096,
  llmTemperature: 0.1,
correctionPrompt: [
  'Role: correct and reformat dictated text into clear, natural text.',
  '',
  'Rules:',
  'Fix typos, grammar, punctuation, spacing, paragraphing, and badly worded sentences.',
  'Capitalize the first word of the text and the first word of each sentence.',
  'Keep the same language, meaning, tone, and specialized terms.',
  'Keep domain-specific words exactly as written when they are understandable, even if a common translation exists.',
  'Keep all original content in the same order.',
  'You may rephrase unclear or badly spoken sentences when needed for readability.',
  'Do not add new ideas, facts, examples, or explanations.',
  'Do not summarize.',
  'Use only the punctuation needed for readability.',
  'Avoid decorative punctuation. Use commas or periods instead.',
  'Do not add Markdown or formatting that is not already in the input.',
  'Preserve existing Markdown and code formatting when present.',
].join('\n'),
  pasteAfterDictation: false,
  pasteAfterImprovement: false,
  improveSelectedText: false,
  microphoneDeviceId: '',
  microphoneDeviceLabel: '',
  microphoneEchoCancellation: true,
  microphoneNoiseSuppression: true,
  microphoneAutoGainControl: true,
  silenceSensitivity: 'normal',
  maxHistoryItems: 100,
  hotkeys: {
    speak: 'Alt+A',
    improveText: 'Alt+Z',
    transcript: 'Alt+E',
  },
};

export const sampleHistory: HistoryEntry[] = [];
