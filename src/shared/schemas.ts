import { z } from 'zod';

export const hotkeysSchema = z.object({
  speak: z.string().min(1).max(80),
  improveText: z.string().min(1).max(80),
  transcript: z.string().min(1).max(80),
});

export const settingsSchema = z.object({
  llmModel: z.string().max(260),
  whisperModel: z.string().max(260),
  whisperCudaRuntimeVersion: z.enum(['cuda-11', 'cuda-12']),
  whisperLanguage: z.enum(['auto', 'fr', 'en', 'es', 'de', 'it', 'pt']),
  whisperQualityMode: z.enum(['fast', 'balanced', 'accurate']),
  llmCudaRuntimeVersion: z.enum(['cuda-12', 'cuda-13']),
  llmMaxTokensMode: z.enum(['auto', 'fixed']),
  llmMaxTokens: z.number().int().min(64).max(1200),
  llmContextSize: z.union([z.literal(2048), z.literal(3072), z.literal(4096)]),
  llmTemperature: z.number().min(0).max(1),
  correctionPrompt: z.string().min(1).max(4000),
  pasteAfterDictation: z.boolean(),
  pasteAfterImprovement: z.boolean(),
  improveSelectedText: z.boolean(),
  microphoneDeviceId: z.string().max(260),
  microphoneDeviceLabel: z.string().max(260),
  microphoneEchoCancellation: z.boolean(),
  microphoneNoiseSuppression: z.boolean(),
  microphoneAutoGainControl: z.boolean(),
  silenceSensitivity: z.enum(['low', 'normal', 'high']),
  maxHistoryItems: z.number().int().min(1).max(10000),
  hotkeys: hotkeysSchema,
});

export const textSchema = z.string().max(200000);

export const idSchema = z.string().min(1).max(120);

export const historyTitleUpdateSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(120),
});

export const whisperModelIdSchema = z.enum(['tiny', 'base', 'small', 'medium', 'large']);

export const llmModelIdSchema = z.enum([
  'qwen3-0_6b-q8',
  'qwen3-1_7b-q8',
  'llama3_2-3b-q4',
  'smollm3-3b-q4',
  'phi4-mini-q4',
  'qwen3-4b-q4',
  'gemma-e4b-q4',
  'qwen3-8b-q4',
  'qwen3-14b-q4',
  'mistral-small-3_2-24b-iq4',
  'qwen3-30b-a3b-q4',
  'mistral-small-3_2-24b-q4',
]);

export const overlayStateSchema = z.object({
  active: z.boolean(),
  mode: z.enum(['speak', 'improve', 'transcript']),
  status: z.enum(['recording', 'transcribing', 'improving', 'done', 'warning']),
  waveform: z.array(z.number().min(0).max(1)).max(16),
  message: z.string().max(160).optional(),
  messageType: z.enum(['error', 'success', 'warning', 'info']).optional(),
});
