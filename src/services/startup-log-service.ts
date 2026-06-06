import { existsSync } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SettingsService } from '@services/settings-service';
import {
  appStorageConfig,
  llamaCudaRuntimeVersionConfig,
  packageInfo,
  whisperCudaRuntimeVersionConfig,
  whisperRuntimeConfig,
} from '@shared/GlobalVars';
import { AppStorage } from '@storage/app-storage';
import { LlamaService } from '@services/llama-service';
import { LlmModelService } from '@services/llm-model-service';
import { HardwareService, type HardwareCheckResult } from '@services/hardware-service';

type CheckResult = HardwareCheckResult;

export class StartupLogService {
  private readonly storage = new AppStorage();
  private readonly settingsService = new SettingsService();
  private readonly llamaService = new LlamaService();
  private readonly llmModelService = new LlmModelService();
  private readonly hardwareService = new HardwareService();

  async write(): Promise<void> {
    const storageRoot = await this.ensurePath(() => this.storage.ensureDir(), this.storage.path());
    const tmpFolder = await this.ensurePath(() => this.storage.ensureDir('tmp'), this.storage.path('tmp'));
    const logsFolder = await this.ensurePath(() => this.storage.ensureDir('logs'), this.storage.path('logs'));
    const settings = await this.settingsService.get();
    const whisperRuntime = await this.fileCheck(this.whisperExecutablePath(settings.whisperCudaRuntimeVersion));
    const whisperModel = await this.fileCheck(this.whisperModelPath(settings.whisperModel));
    const hardware = await this.hardwareService.diagnostics();
    const gpuCudaUsable = this.cudaUsableCheck(whisperRuntime.value);
    const llamaRuntime = await this.fileCheck(await this.llamaService.runtimePath());
    const llmModel = await this.fileCheck(this.llmModelPath(settings.llmModel));

    if (logsFolder.status !== 'ok') {
      return;
    }

    await writeFile(
      join(logsFolder.value, 'app.log'),
      [
        `[${new Date().toISOString()}]`,
        `version: ${packageInfo.version}`,
        `platform: ${process.platform}`,
        `arch: ${process.arch}`,
        `electron: ${process.versions.electron ?? 'unknown'}`,
        `node: ${process.versions.node}`,
        '',
        this.line('cpu', hardware.cpu),
        this.line('cpu cores', hardware.cpuCores),
        this.line('cpu threads', hardware.cpuThreads),
        '',
        this.line('gpu', hardware.gpu),
        this.line('gpu vram', hardware.gpuVram),
        this.line('gpu cuda usable', gpuCudaUsable),
        '',
        this.line('storage root', storageRoot),
        this.line('tmp folder', tmpFolder),
        this.line('logs folder', logsFolder),
        '',
        `whisper cuda runtime: ${whisperCudaRuntimeVersionConfig[settings.whisperCudaRuntimeVersion].label}`,
        `llama cuda runtime: ${llamaCudaRuntimeVersionConfig[settings.llmCudaRuntimeVersion].label}`,
        this.line('whisper runtime', whisperRuntime),
        this.line('whisper model', whisperModel),
        '',
        this.line('llama runtime', llamaRuntime),
        this.line('llm model', llmModel),
      ].join('\n'),
      'utf8',
    );
  }

  private async ensurePath(factory: () => Promise<string>, fallback: string): Promise<CheckResult> {
    try {
      return { status: 'ok', value: await factory() };
    } catch {
      return { status: 'missing', value: fallback };
    }
  }

  private async fileCheck(path: string): Promise<CheckResult> {
    if (!path) {
      return { status: 'missing', value: '' };
    }

    try {
      await access(path);
      return { status: 'ok', value: path };
    } catch {
      return { status: 'missing', value: path };
    }
  }

  private whisperExecutablePath(version: keyof typeof whisperCudaRuntimeVersionConfig): string {
    return join(
      homedir(),
      appStorageConfig.directoryName,
      ...whisperRuntimeConfig.runtimeParts,
      whisperRuntimeConfig.engineDirectory,
      whisperCudaRuntimeVersionConfig[version].directory,
      whisperRuntimeConfig.platformDirectory,
      whisperRuntimeConfig.executableName,
    );
  }

  private whisperModelPath(model: string): string {
    return model ? join(this.storage.path('models', 'whisper'), model) : '';
  }

  private llmModelPath(model: string): string {
    return model ? this.llmModelService.modelPath(model) : '';
  }

  private cudaUsableCheck(whisperRuntimePath: string): CheckResult {
    const cudaDll = join(dirname(whisperRuntimePath), whisperRuntimeConfig.cudaDllName);
    const usable = process.platform === 'win32' && existsSync(whisperRuntimePath) && existsSync(cudaDll);
    return {
      status: usable ? 'ok' : 'missing',
      value: usable ? 'whisper runtime supports CUDA' : 'whisper CUDA runtime not available',
    };
  }

  private line(label: string, result: CheckResult): string {
    return `${label}: ${result.status} => ${result.value}`;
  }
}
