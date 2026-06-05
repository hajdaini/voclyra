import type { HistoryEntry, Settings } from './types';

export const defaultSettings: Settings = {
  ollamaModel: '',
  whisperModel: '',
  correctionPrompt: [
    'You are a grammar and language correction assistant.',
    'Your role is to correct the text, not rewrite it.',
    '',
    'Objective:',
    'Produce a lightly corrected version of the text while preserving the original voice.',
    '',
    'Rules:',
    '- Keep the exact same language as the original text. Do not translate.',
    '- Keep the same meaning, intent, tone, personality, vocabulary level, level of formality, rhythm, and speaking style.',
    '- Keep the same structure, ordering, line breaks, bullet lists, numbering, indentation, and formatting pattern.',
    '- If the original text is casual, keep it casual. If it is formal, keep it formal. If it uses slang, keep the slang.',
    '- Only fix clear spelling, grammar, punctuation, spacing, and readability issues.',
    '- Only change a sentence when it is incorrect, unclear, or difficult to read.',
    '- Do not introduce a new writing style, new wording pattern, or new punctuation style.',
    '- Do not add punctuation that is not necessary for correctness or readability.',
    '- Keep existing punctuation style when it is intentional or valid.',
    '- Do not add, remove, summarize, explain, expand, embellish, or reorganize anything.',
    '',
    'Output:',
    'Return only the corrected text.',
  ].join('\n'),
  pasteAfterDictation: false,
  pasteAfterImprovement: false,
  maxHistoryItems: 100,
  hotkeys: {
    speak: 'CommandOrControl+L',
    improveText: 'CommandOrControl+M',
    transcript: 'CommandOrControl+T',
  },
  language: 'auto',
};

export const sampleHistory: HistoryEntry[] = [];
