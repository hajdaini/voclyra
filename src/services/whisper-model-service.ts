import { access, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { appStorageConfig } from '@shared/GlobalVars';
import type {
  WhisperAvailableModel,
  WhisperDownloadProgress,
  WhisperModelId,
  WhisperModelState,
} from '@shared/types';
import { whisperModelCatalog, whisperModelIds } from '@shared/whisper-models';
import { downloadModelFile } from './model-download-service';

type ProgressCallback = (progress: WhisperDownloadProgress) => void;
let rootHidden = false;

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
    if (!model) {
      throw new Error('Unknown Whisper model.');
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

  async deleteModel(id: WhisperModelId): Promise<WhisperAvailableModel[]> {
    if (this.downloads.has(id)) {
      return this.availableModels();
    }
    const model = whisperModelCatalog[id];
    if (!model) {
      return this.availableModels();
    }
    await rm(this.modelPath(model.fileName), { force: true });
    return this.availableModels();
  }

  private async toAvailableModel(id: WhisperModelId, progress: number): Promise<WhisperAvailableModel> {
    const model = whisperModelCatalog[id];
    if (!model) {
      throw new Error('Unknown Whisper model.');
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

  private async modelState(id: WhisperModelId): Promise<WhisperModelState> {
    if (this.downloads.has(id)) {
      return 'downloading';
    }

    const model = whisperModelCatalog[id];
    if (!model) {
      return 'missing';
    }
    return (await this.exists(this.modelPath(model.fileName))) ? 'ready' : 'missing';
  }

  private async ensureModelRoot(): Promise<void> {
    await mkdir(this.modelRoot, { recursive: true });
    this.hideRoot();
  }

  private hideRoot(): void {
    if (process.platform !== 'win32' || rootHidden) {
      return;
    }
    rootHidden = true;

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
    await downloadModelFile({ url, destination, onProgress });
  }

}
