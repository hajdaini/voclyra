import { access, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  LlmAvailableModel,
  LlmDownloadProgress,
  LlmModelId,
  LlmModelState,
} from '@shared/types';
import { llmModelCatalog, llmModelIds } from '@shared/llm-models';
import { AppStorage } from '@storage/app-storage';
import { downloadModelFile, downloadModelToTemporary, validateModelDownloadHost } from './model-download-service';

type ProgressCallback = (progress: LlmDownloadProgress) => void;

export class LlmModelService {
  private readonly storage = new AppStorage();
  private readonly modelRoot = this.storage.path('models', 'llm');
  private readonly downloads = new Set<LlmModelId>();
  private readonly customDownloads = new Map<LlmModelId, number>();

  async availableModels(): Promise<LlmAvailableModel[]> {
    await this.ensureModelRoot();
    const catalogModels = await Promise.all(llmModelIds.map((id) => this.toAvailableModel(id, 0)));
    const customModels = await this.customAvailableModels();
    return [...catalogModels, ...customModels];
  }

  async downloadedModelNames(): Promise<string[]> {
    const models = await this.availableModels();
    return models
      .filter((model) => model.state === 'ready')
      .map((model) => model.fileName)
      .sort((a, b) => a.localeCompare(b));
  }

  async downloadModel(id: LlmModelId, onProgress: ProgressCallback): Promise<LlmAvailableModel[]> {
    if (this.downloads.has(id)) {
      return this.availableModels();
    }

    const model = llmModelCatalog[id];
    if (!model) {
      throw new Error('Unknown local AI model.');
    }
    await this.ensureModelRoot();

    if (await this.exists(this.modelPath(model.fileName))) {
      return this.availableModels();
    }

    this.downloads.add(id);
    onProgress({ id, state: 'downloading', progress: 0 });

    try {
      await this.downloadFile(model.url, this.modelPath(model.fileName), (progress) => {
        onProgress({ id, state: 'downloading', progress });
      });
      onProgress({ id, state: 'ready', progress: 100 });
      return this.availableModels();
    } catch (error) {
      onProgress({ id, state: 'missing', progress: 0 });
      throw error;
    } finally {
      this.downloads.delete(id);
    }
  }

  async downloadCustomModel(url: string, onProgress: ProgressCallback): Promise<LlmAvailableModel[]> {
    const parsedUrl = new URL(url);
    validateModelDownloadHost(parsedUrl.hostname);
    const fileName = this.customFileName(parsedUrl, '.gguf');
    const id = fileName;
    if (this.downloads.has(id)) {
      return this.availableModels();
    }
    await this.ensureModelRoot();
    this.downloads.add(id);
    this.customDownloads.set(id, 0);
    onProgress({ id, state: 'downloading', progress: 0 });
    try {
      await this.downloadFile(parsedUrl.toString(), this.modelPath(fileName), (progress) => {
        this.customDownloads.set(id, progress);
        onProgress({ id, state: 'downloading', progress });
      });
      this.customDownloads.set(id, 100);
      onProgress({ id, state: 'ready', progress: 100 });
      return this.availableModels();
    } catch (error) {
      onProgress({ id, state: 'missing', progress: 0 });
      throw error;
    } finally {
      this.downloads.delete(id);
      this.customDownloads.delete(id);
    }
  }

  async deleteModel(id: LlmModelId): Promise<LlmAvailableModel[]> {
    if (this.downloads.has(id)) {
      return this.availableModels();
    }

    const model = llmModelCatalog[id];
    await rm(this.modelPath(model?.fileName ?? this.safeCustomModelFileName(id, '.gguf')), { force: true });
    return this.availableModels();
  }

  modelPath(fileName: string): string {
    if (!fileName) {
      return '';
    }
    return join(this.modelRoot, fileName);
  }

  private async toAvailableModel(id: LlmModelId, progress: number): Promise<LlmAvailableModel> {
    const model = llmModelCatalog[id];
    if (!model) {
      throw new Error('Unknown local AI model.');
    }
    const state = await this.modelState(id);
    return {
      id,
      label: model.label,
      fileName: model.fileName,
      disk: model.disk,
      memory: model.memory,
      vramGb: model.vramGb,
      state,
      progress: state === 'ready' ? 100 : progress,
    };
  }

  private async modelState(id: LlmModelId): Promise<LlmModelState> {
    if (this.downloads.has(id)) {
      return 'downloading';
    }

    const model = llmModelCatalog[id];
    if (!model) {
      return (await this.exists(this.modelPath(this.safeCustomModelFileName(id, '.gguf')))) ? 'ready' : 'missing';
    }
    return (await this.exists(this.modelPath(model.fileName))) ? 'ready' : 'missing';
  }

  private async customAvailableModels(): Promise<LlmAvailableModel[]> {
    const catalogFiles = new Set(Object.values(llmModelCatalog).map((model) => model.fileName));
    const entries = await readdir(this.modelRoot, { withFileTypes: true }).catch(() => []);
    const models = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.gguf') && !catalogFiles.has(entry.name))
        .map(async (entry) => {
          const size = (await stat(this.modelPath(entry.name))).size;
          return {
            id: entry.name,
            label: entry.name,
            fileName: entry.name,
            disk: formatBytes(size),
            memory: 'Custom GGUF model',
            vramGb: estimateCustomLlmVramGb(size),
            state: this.downloads.has(entry.name) ? 'downloading' as const : 'ready' as const,
            progress: this.downloads.has(entry.name) ? 0 : 100,
          };
        }),
    );
    const downloadingModels = [...this.customDownloads.entries()]
      .filter(([id]) => !models.some((model) => model.id === id))
      .map(([id, progress]) => ({
        id,
        label: id,
        fileName: id,
        disk: 'Downloading',
        memory: 'Custom GGUF model',
        vramGb: 0,
        state: 'downloading' as const,
        progress,
      }));
    return [...models, ...downloadingModels].sort((a, b) => a.label.localeCompare(b.label));
  }

  private async ensureModelRoot(): Promise<void> {
    await this.storage.ensureDir('models', 'llm');
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async downloadFile(
    url: string,
    destination: string,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    await downloadModelFile({
      url,
      destination,
      onProgress,
      downloadToTemporary: (nextUrl, temporary, nextProgress) =>
        this.downloadToTemporary(nextUrl, temporary, nextProgress),
    });
  }

  private downloadToTemporary(
    url: string,
    temporary: string,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    return downloadModelToTemporary(url, temporary, onProgress);
  }

  private customFileName(url: URL, extension: '.gguf'): string {
    return this.safeCustomModelFileName(decodeURIComponent(url.pathname.split('/').pop() ?? ''), extension);
  }

  private safeCustomModelFileName(fileName: string, extension: '.gguf'): string {
    if (!/^[\w.-]+$/.test(fileName) || !fileName.endsWith(extension)) {
      throw new Error('Custom local AI model must be a Hugging Face .gguf file.');
    }
    return fileName;
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MiB`;
};

const estimateCustomLlmVramGb = (bytes: number): number => {
  const gb = bytes / 1024 ** 3;
  return Math.ceil((gb + 1.5) * 2) / 2;
};
