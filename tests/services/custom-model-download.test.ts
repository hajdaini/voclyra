import { describe, expect, it, vi } from 'vitest';
import { customLlmModelUrlError } from '@shared/custom-models';
import { LlmModelService } from '@services/llm-model-service';

describe('custom model downloads', () => {
  it('validates custom local AI model URLs before IPC download', () => {
    expect(customLlmModelUrlError('https://youtube.com/model.gguf')).toBe('Only Hugging Face model URLs are allowed.');
    expect(customLlmModelUrlError('https://huggingface.co/acme/model/resolve/main/model.gguf')).toBe('');
  });

  it('rejects custom local AI downloads outside allowed hosts', async () => {
    const service = new LlmModelService();

    await expect(
      service.downloadCustomModel('https://example.com/model.gguf', vi.fn()),
    ).rejects.toThrow('Model download host is not allowed.');
  });

  it('shows custom local AI model while it is downloading', async () => {
    const service = new LlmModelService();
    const progress = vi.fn();
    let releaseDownload = (): void => {};
    vi.spyOn(
      service as unknown as {
        downloadToTemporary: (url: string, temporary: string, onProgress: (progress: number) => void) => Promise<void>;
      },
      'downloadToTemporary',
    ).mockImplementation((_url, _temporary, onProgress) => {
      onProgress(12);
      return new Promise((resolve) => {
        releaseDownload = resolve;
      });
    });
    vi.spyOn(
      service as unknown as {
        customAvailableModels: () => Promise<unknown[]>;
      },
      'customAvailableModels',
    ).mockImplementation(async function (this: { customDownloads: Map<string, number> }) {
      return [...this.customDownloads.entries()].map(([id, progress]) => ({
        id,
        label: id,
        fileName: id,
        disk: 'Downloading',
        memory: 'Custom GGUF model',
        vramGb: 0,
        state: 'downloading' as const,
        progress,
      }));
    });
    const download = service.downloadCustomModel('https://huggingface.co/acme/model/resolve/main/model.gguf', progress)
      .catch(() => []);

    await vi.waitFor(() => {
      expect(progress).toHaveBeenCalledWith({ id: 'model.gguf', state: 'downloading', progress: 12 });
    });
    const models = await service.availableModels();

    expect(models).toContainEqual(expect.objectContaining({
      id: 'model.gguf',
      state: 'downloading',
      progress: 12,
    }));

    releaseDownload();
    await download;
  });
});
