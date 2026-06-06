import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm, stat } from 'node:fs/promises';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import type {
  LlmAvailableModel,
  LlmDownloadProgress,
  LlmModelId,
  LlmModelState,
} from '@shared/types';
import { llmModelCatalog, llmModelIds } from '@shared/llm-models';
import { AppStorage } from '@storage/app-storage';

type ProgressCallback = (progress: LlmDownloadProgress) => void;

export class LlmModelService {
  private readonly storage = new AppStorage();
  private readonly modelRoot = this.storage.path('models', 'llm');
  private readonly downloads = new Set<LlmModelId>();

  async availableModels(): Promise<LlmAvailableModel[]> {
    await this.ensureModelRoot();
    return Promise.all(llmModelIds.map((id) => this.toAvailableModel(id, 0)));
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

  async deleteModel(id: LlmModelId): Promise<LlmAvailableModel[]> {
    if (this.downloads.has(id)) {
      return this.availableModels();
    }

    const model = llmModelCatalog[id];
    await rm(this.modelPath(model.fileName), { force: true });
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
    return (await this.exists(this.modelPath(model.fileName))) ? 'ready' : 'missing';
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
    const temporary = `${destination}.download`;
    await mkdir(dirname(destination), { recursive: true });
    await rm(temporary, { force: true });
    await this.downloadToTemporary(url, temporary, onProgress);

    const downloaded = await stat(temporary);
    if (downloaded.size === 0) {
      await rm(temporary, { force: true });
      throw new Error('Downloaded model is empty.');
    }

    await rename(temporary, destination);
  }

  private downloadToTemporary(
    url: string,
    temporary: string,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const parsedUrl = new URL(url);
      if (!this.isAllowedDownloadHost(parsedUrl.hostname)) {
        reject(new Error('Model download host is not allowed.'));
        return;
      }

      const request = get(parsedUrl, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          const location = response.headers.location;
          response.resume();
          if (!location) {
            reject(new Error('Model download redirected without location.'));
            return;
          }
          this.downloadToTemporary(new URL(location, parsedUrl).toString(), temporary, onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Model download failed with status ${response.statusCode ?? 0}.`));
          return;
        }

        const total = Number(response.headers['content-length'] ?? 0);
        let downloaded = 0;
        const file = createWriteStream(temporary, { flags: 'wx' });

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0) {
            onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
        file.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy(new Error('Model download timed out.'));
      });
    });
  }

  private isAllowedDownloadHost(hostname: string): boolean {
    return (
      hostname === 'huggingface.co' ||
      hostname.endsWith('.huggingface.co') ||
      hostname === 'hf.co' ||
      hostname.endsWith('.hf.co')
    );
  }
}
