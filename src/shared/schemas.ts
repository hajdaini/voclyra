import { z } from 'zod';
import {
  llmContextSizeValues,
  llmPerformanceModeOptions,
  optionValues,
  settingsLimits,
  silenceSensitivityOptions,
  whisperLanguageOptions,
  whisperQualityModeOptions,
} from './settings-options';
import type { LanguageMode, LlmContextSize, LlmPerformanceMode, SilenceSensitivity, WhisperQualityMode } from './types';

const optionSchema = <T extends string>(values: readonly T[]) =>
  z.custom<T>((value) => typeof value === 'string' && values.includes(value as T));

const llmContextSizeSchema = z.custom<LlmContextSize>(
  (value) => typeof value === 'number' && llmContextSizeValues.includes(value as LlmContextSize),
);

export const hotkeysSchema = z.object({
  speak: z.string().min(1).max(80),
  improveText: z.string().min(1).max(80),
  transcript: z.string().min(1).max(80),
});

export const settingsSchema = z.object({
  useLocalRuntime: z.boolean().default(true),
  useLocalSpeechRuntime: z.boolean().default(true),
  useLocalImproveRuntime: z.boolean().default(true),
  remoteSpeechBaseUrl: z.string().trim().max(2048).default(''),
  remoteSpeechApiKey: z.string().max(2048).default(''),
  remoteSpeechModel: z.string().trim().max(260).default(''),
  remoteImproveBaseUrl: z.string().trim().max(2048).default(''),
  remoteImproveApiKey: z.string().max(2048).default(''),
  remoteImproveModel: z.string().trim().max(260).default(''),
  llmModel: z.string().max(260),
  whisperModel: z.string().max(260),
  whisperLanguage: optionSchema<LanguageMode>(optionValues(whisperLanguageOptions)),
  whisperQualityMode: optionSchema<WhisperQualityMode>(optionValues(whisperQualityModeOptions)),
  llmPerformanceMode: optionSchema<LlmPerformanceMode>(optionValues(llmPerformanceModeOptions)).default('balanced'),
  llmContextSize: llmContextSizeSchema,
  llmTemperature: z.number().min(0).max(1),
  correctionPrompt: z.string().min(1).max(4000),
  pasteAfterSpeak: z.boolean(),
  pasteAfterImprovement: z.boolean(),
  improveAfterSpeak: z.boolean().default(false),
  improveSelectedText: z.boolean(),
  startAudioServerOnLaunch: z.boolean(),
  startLlmServerOnLaunch: z.boolean(),
  startAtStartup: z.boolean(),
  microphoneDeviceId: z.string().max(260),
  microphoneDeviceLabel: z.string().max(260),
  transcriptOutputDeviceId: z.string().max(260),
  transcriptOutputDeviceLabel: z.string().max(260),
  transcriptLiveChunkSeconds: z.number().int().min(settingsLimits.transcriptLiveChunkSeconds.min).max(settingsLimits.transcriptLiveChunkSeconds.max),
  silenceSensitivity: optionSchema<SilenceSensitivity>(optionValues(silenceSensitivityOptions)),
  maxHistoryItems: z.number().int().min(settingsLimits.maxHistoryItems.min).max(settingsLimits.maxHistoryItems.max),
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

export const serverEnabledSchema = z.object({
  server: z.enum(['audio', 'llm']),
  enabled: z.boolean(),
});

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
