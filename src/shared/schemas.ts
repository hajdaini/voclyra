import { z } from 'zod';

export const hotkeysSchema = z.object({
  speak: z.string().min(1).max(80),
  improveText: z.string().min(1).max(80),
  transcript: z.string().min(1).max(80),
});

export const settingsSchema = z.object({
  llmModel: z.string().max(260),
  whisperModel: z.string().max(260),
  whisperLanguage: z.enum(['auto', 'fr', 'en', 'es', 'de', 'it', 'pt']),
  whisperQualityMode: z.enum(['fast', 'balanced', 'accurate']),
  llmContextSize: z.union([
    z.literal(512),
    z.literal(1024),
    z.literal(2048),
    z.literal(3072),
    z.literal(4096),
    z.literal(6144),
    z.literal(8192),
    z.literal(12288),
    z.literal(16384),
    z.literal(32768),
  ]),
  llmTemperature: z.number().min(0).max(1),
  correctionPrompt: z.string().min(1).max(4000),
  pasteAfterDictation: z.boolean(),
  pasteAfterImprovement: z.boolean(),
  improveAfterSpeak: z.boolean().default(false),
  improveSelectedText: z.boolean(),
  startAtStartup: z.boolean(),
  microphoneDeviceId: z.string().max(260),
  microphoneDeviceLabel: z.string().max(260),
  transcriptOutputDeviceId: z.string().max(260),
  transcriptOutputDeviceLabel: z.string().max(260),
  transcriptLiveChunkSeconds: z.number().int().min(30).max(300),
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

export const customModelUrlSchema = z.string().trim().min(1).max(2048).url();

export const llmModelIdSchema = z.enum([
  'gemma4:e2b-it-qat',
  'gemma4:e4b-it-qat',
  'gemma4:12b-it-qat',
  'gemma4:26b-a4b-it-qat',
  'gemma4:31b-it-qat',
]);

export const llmDeleteModelIdSchema = z.string().refine(
  (value) => llmModelIdSchema.safeParse(value).success || /^[\w.-]+\.gguf$/.test(value),
  'Invalid local AI model.',
);

export const overlayStateSchema = z.object({
  active: z.boolean(),
  mode: z.enum(['speak', 'improve', 'transcript', 'additional-info']),
  status: z.enum(['recording', 'transcribing', 'improving', 'done', 'warning']),
  phase: z.enum(['recording', 'stopping', 'preparing', 'loading', 'transcribing', 'thinking', 'generating', 'finalizing']).optional(),
  actionPhase: z.enum(['ready', 'loading', 'recording', 'processing', 'done', 'warning', 'error']).optional(),
  waveform: z.array(z.number().min(0).max(1)).max(16),
  microphoneWaveform: z.array(z.number().min(0).max(1)).max(16).optional(),
  systemAudioWaveform: z.array(z.number().min(0).max(1)).max(16).optional(),
  progress: z.number().min(0).max(100).optional(),
  tokensGenerated: z.number().int().min(0).max(1000000).optional(),
  progressLabel: z.string().max(80).optional(),
  recordingStartedAtMs: z.number().int().min(0).optional(),
  message: z.string().max(160).optional(),
  messageType: z.enum(['error', 'success', 'warning', 'info']).optional(),
});
