import { describe, expect, it } from 'vitest';

const runtimeEnabled = process.env.VOCLYRA_TEST_RUNTIME === '1';

describe.skipIf(!runtimeEnabled)('Local runtime checks', () => {
  it('requires local model paths', () => {
    expect(process.env.VOCLYRA_TEST_WHISPER_MODEL, 'VOCLYRA_TEST_WHISPER_MODEL is required').toBeTruthy();
    expect(process.env.VOCLYRA_TEST_LLM_MODEL, 'VOCLYRA_TEST_LLM_MODEL is required').toBeTruthy();
  });

  it('checks runtime availability', async () => {
    const { WhisperService } = await import('@services/whisper-service');
    const { LlamaService } = await import('@services/llama-service');

    await expect(new WhisperService().runtimeInfo()).resolves.toEqual(expect.objectContaining({ runtimeAvailable: expect.any(Boolean) }));
    await expect(new LlamaService().runtimeInfo()).resolves.toEqual(expect.objectContaining({ runtimeAvailable: expect.any(Boolean) }));
  });
});
