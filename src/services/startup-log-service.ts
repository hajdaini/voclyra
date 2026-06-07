import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SettingsService } from '@services/settings-service';
import {
  llamaCudaRuntimeVersionConfig,
  packageInfo,
  whisperCudaRuntimeVersionConfig,
  whisperRuntimeConfig,
} from '@shared/GlobalVars';
import { AppStorage } from '@storage/app-storage';
import { LlamaService } from '@services/llama-service';
import { LlmModelService } from '@services/llm-model-service';
import { HardwareService, type HardwareCheckResult } from '@services/hardware-service';
import { RuntimePathService } from '@services/runtime-path-service';

type CheckResult = HardwareCheckResult;

export class StartupLogService {
  private readonly storage = new AppStorage();
  private readonly settingsService = new SettingsService();
  private readonly llamaService = new LlamaService();
  private readonly llmModelService = new LlmModelService();
  private readonly hardwareService = new HardwareService();
  private readonly runtimePaths = new RuntimePathService();

  async write(): Promise<void> {
    const storageRoot = await this.ensurePath(() => this.storage.ensureDir(), this.storage.path());
    const tmpFolder = await this.ensurePath(() => this.storage.ensureDir('tmp'), this.storage.path('tmp'));
    const logsFolder = await this.ensurePath(() => this.storage.ensureDir('logs'), this.storage.path('logs'));
    const modelsFolder = await this.ensurePath(() => this.storage.ensureDir('models'), this.storage.path('models'));
    const settings = await this.settingsService.get();
    const whisperRuntime = await this.fileCheck(this.whisperExecutablePath(settings.whisperCudaRuntimeVersion));
    const whisperModel = await this.fileCheck(this.whisperModelPath(settings.whisperModel));
    const hardware = await this.hardwareService.diagnostics();
    const llamaRuntime = await this.fileCheck(await this.llamaService.runtimePath());
    const llmModel = await this.fileCheck(this.llmModelPath(settings.llmModel));

    if (logsFolder.status !== 'ok') {
      return;
    }

    await writeFile(
      join(logsFolder.value, 'app.log'),
      [
        `[${new Date().toISOString()}]`,
        '[SYSTEM INFO]',
        `version: ${packageInfo.version}`,
        `platform: ${process.platform}`,
        `arch: ${process.arch}`,
        `electron: ${process.versions.electron ?? 'unknown'}`,
        `node: ${process.versions.node}`,
        '',
        '[CPU INFO]',
        this.line('cpu', hardware.cpu),
        this.line('cpu cores', hardware.cpuCores),
        this.line('cpu threads', hardware.cpuThreads),
        '',
        '[GPU INFO]',
        this.line('gpu', hardware.gpu),
        this.line('gpu vram', hardware.gpuVram),
        this.line('gpu driver', hardware.gpuDriver),
        this.line('gpu cuda version', hardware.gpuCuda),
        '',
        '[STORAGE INFO]',
        this.line('root folder', storageRoot),
        this.line('tmp folder', tmpFolder),
        this.line('logs folder', logsFolder),
        this.line('models folder', modelsFolder),
        `settings path: ${this.value(this.storage.path('settings.json'))}`,
        `history path: ${this.value(this.storage.path('history.json'))}`,
        '',
        '',
        '[WHISPER INFO]',
        this.line('whisper path', whisperRuntime),
        this.line('whisper model', whisperModel),
        `whisper cuda version: ${this.value(whisperCudaRuntimeVersionConfig[settings.whisperCudaRuntimeVersion].label)}`,
        '',
        '[LLAMA INFO]',
        this.line('llama path', llamaRuntime),
        this.line('llm model', llmModel),
        `llama cuda version: ${this.value(llamaCudaRuntimeVersionConfig[settings.llmCudaRuntimeVersion].label)}`,
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
    return this.runtimePaths.path(
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

  private line(label: string, result: CheckResult): string {
    return `${label}: ${this.value(result.value)}`;
  }

  private value(value: string): string {
    return value.trim() || 'unknown';
  }
}
