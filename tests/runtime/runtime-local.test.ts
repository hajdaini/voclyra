import { access } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@shared/types';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

let settings: Settings;
let llmModelPath = '';

const requireValue = (value: string, label: string): void => {
  if (!value) {
    throw new Error(`${label} is required in Settings.`);
  }
};

const requireFile = async (path: string, label: string): Promise<void> => {
  requireValue(path, label);
  await access(path);
};

const testWav = (): Uint8Array => {
  const sampleRate = 16000;
  const seconds = 1.4;
  const sampleCount = Math.floor(sampleRate * seconds);
  const dataBytes = sampleCount * 2;
  const audio = new Uint8Array(44 + dataBytes);
  const view = new DataView(audio.buffer);

  writeAscii(audio, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(audio, 8, 'WAVE');
  writeAscii(audio, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(audio, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.sin((Math.PI * index) / sampleCount);
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 12000 * envelope);
    view.setInt16(44 + index * 2, sample, true);
  }

  return audio;
};

const writeAscii = (target: Uint8Array, offset: number, value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
};

describe('Local runtime', () => {
  beforeAll(async () => {
    const { SettingsService } = await import('@services/settings-service');
    const { LlmModelService } = await import('@services/llm-model-service');
    const { WhisperModelService } = await import('@services/whisper-model-service');
    settings = await new SettingsService().get();
    const llmModelService = new LlmModelService();
    const whisperModelService = new WhisperModelService();
    const whisperModel = settings.whisperModel || (await whisperModelService.downloadedModelNames())[0] || '';
    const llmModel = settings.llmModel || (await llmModelService.downloadedModelNames())[0] || '';
    requireValue(whisperModel, 'Whisper model');
    requireValue(llmModel, 'LLM model');
    settings = { ...settings, whisperModel, llmModel };
    llmModelPath = llmModelService.modelPath(settings.llmModel);
    await requireFile(llmModelPath, 'LLM model file');
  });

  afterAll(async () => {
    const { whisperServerService } = await import('@services/whisper-server-service');
    const { llamaServerService } = await import('@services/llama-server-service');
    whisperServerService.stop();
    llamaServerService.stop();
  });

  it('finds real local runtimes and models', async () => {
    const { WhisperService } = await import('@services/whisper-service');
    const { LlamaService } = await import('@services/llama-service');
    const whisper = new WhisperService();
    const llama = new LlamaService();

    await expect(whisper.runtimeInfo()).resolves.toEqual({ runtimeAvailable: true });
    await expect(llama.runtimeInfo()).resolves.toEqual({ runtimeAvailable: true });
    await expect(whisper.listModels()).resolves.toContain(settings.whisperModel);
  }, 30000);

  it('starts the real Whisper server and transcribes local audio', async () => {
    const { WhisperService } = await import('@services/whisper-service');
    const whisper = new WhisperService();

    await whisper.warmup(settings.whisperModel);
    const text = await whisper.transcribe(testWav(), settings.whisperModel, {
      timeoutMs: 120000,
      debugName: 'runtime-whisper',
    });

    expect(typeof text).toBe('string');
  }, 180000);

  it('starts the real Llama server and improves text', async () => {
    const { LlamaService } = await import('@services/llama-service');
    const llama = new LlamaService();

    await llama.warmup(llmModelPath);
    const result = await llama.improveText(
      llmModelPath,
      'Correct spelling and punctuation. Return only the corrected text.',
      'helo world',
    );

    expect(result.text.trim()).not.toBe('');
    expect(result.tokensGenerated).toBeGreaterThan(0);
  }, 180000);
});
