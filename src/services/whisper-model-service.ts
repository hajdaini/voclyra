import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm, stat } from 'node:fs/promises';
import { get } from 'node:https';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { appStorageConfig } from '@shared/GlobalVars';
import type {
  WhisperAvailableModel,
  WhisperDownloadProgress,
  WhisperModelId,
  WhisperModelState,
} from '@shared/types';
import { whisperModelCatalog, whisperModelIds } from '@shared/whisper-models';

type ProgressCallback = (progress: WhisperDownloadProgress) => void;

export class WhisperModelService {
  private readonly root = join(homedir(), appStorageConfig.directoryName);
  private readonly modelRoot = join(this.root, 'models', 'whisper');
  private readonly downloads = new Set<WhisperModelId>();

  async availableModels(): Promise<WhisperAvailableModel[]> {
    await this.ensureModelRoot();
    return Promise.all(whisperModelIds.map((id) => this.toAvailableModel(id, 0)));
  }

  async downloadedModelNames(): Promise<string[]> {
    const models = await this.availableModels();
    return models
      .filter((model) => model.state === 'ready')
      .map((model) => model.fileName)
      .sort((a, b) => a.localeCompare(b));
  }

  async downloadModel(id: WhisperModelId, onProgress: ProgressCallback): Promise<WhisperAvailableModel[]> {
    if (this.downloads.has(id)) {
      return this.availableModels();
    }

    const model = whisperModelCatalog[id];
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

  async deleteModel(id: WhisperModelId): Promise<WhisperAvailableModel[]> {
    if (this.downloads.has(id)) {
      return this.availableModels();
    }
    const model = whisperModelCatalog[id];
    await rm(this.modelPath(model.fileName), { force: true });
    return this.availableModels();
  }

  private async toAvailableModel(id: WhisperModelId, progress: number): Promise<WhisperAvailableModel> {
    const model = whisperModelCatalog[id];
    const state = await this.modelState(id);
    return {
      id,
      label: model.label,
      fileName: model.fileName,
      disk: model.disk,
      memory: model.memory,
      state,
      progress: state === 'ready' ? 100 : progress,
    };
  }

  private async modelState(id: WhisperModelId): Promise<WhisperModelState> {
    if (this.downloads.has(id)) {
      return 'downloading';
    }

    const model = whisperModelCatalog[id];
    return (await this.exists(this.modelPath(model.fileName))) ? 'ready' : 'missing';
  }

  private async ensureModelRoot(): Promise<void> {
    await mkdir(this.modelRoot, { recursive: true });
    this.hideRoot();
  }

  private hideRoot(): void {
    if (process.platform !== 'win32') {
      return;
    }

    const child = spawn('attrib', ['+h', this.root], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    child.on('error', () => {});
  }

  private modelPath(fileName: string): string {
    return join(this.modelRoot, fileName);
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
      const request = get(url, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          const location = response.headers.location;
          response.resume();
          if (!location) {
            reject(new Error('Model download redirected without location.'));
            return;
          }
          this.downloadToTemporary(new URL(location, url).toString(), temporary, onProgress)
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
}
