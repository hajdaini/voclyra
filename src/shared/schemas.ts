import { z } from 'zod';

export const hotkeysSchema = z.object({
  speak: z.string().min(1).max(80),
  improveText: z.string().min(1).max(80),
  transcript: z.string().min(1).max(80),
});

export const settingsSchema = z.object({
  ollamaModel: z.string().min(1).max(120),
  whisperModel: z.string().max(260),
  correctionPrompt: z.string().min(1).max(4000),
  pasteAfterDictation: z.boolean(),
  pasteAfterImprovement: z.boolean(),
  improveSelectedText: z.boolean(),
  microphoneDeviceId: z.string().max(260),
  microphoneDeviceLabel: z.string().max(260),
  microphoneEchoCancellation: z.boolean(),
  microphoneNoiseSuppression: z.boolean(),
  microphoneAutoGainControl: z.boolean(),
  maxHistoryItems: z.number().int().min(1).max(10000),
  hotkeys: hotkeysSchema,
  language: z.literal('auto'),
});

export const textSchema = z.string().max(200000);

export const idSchema = z.string().min(1).max(120);

export const historyTitleUpdateSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(120),
});

export const whisperModelIdSchema = z.enum(['tiny', 'base', 'small', 'medium', 'large']);

export const overlayStateSchema = z.object({
  active: z.boolean(),
  mode: z.enum(['speak', 'improve', 'transcript']),
  status: z.enum(['recording', 'transcribing', 'improving', 'done', 'warning']),
  waveform: z.array(z.number().min(0).max(1)).max(16),
  message: z.string().max(160).optional(),
  messageType: z.enum(['error', 'success', 'warning', 'info']).optional(),
});
