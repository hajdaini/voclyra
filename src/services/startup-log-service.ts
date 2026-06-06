import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import { cpus, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { app } from 'electron';
import { SettingsService } from '@services/settings-service';
import { appStorageConfig, packageInfo, whisperRuntimeConfig } from '@shared/GlobalVars';
import { AppStorage } from '@storage/app-storage';

type CheckStatus = 'ok' | 'missing' | 'timeout';

type CheckResult = {
  status: CheckStatus;
  value: string;
};

export class StartupLogService {
  private readonly storage = new AppStorage();
  private readonly settingsService = new SettingsService();

  async write(): Promise<void> {
    const storageRoot = await this.ensurePath(() => this.storage.ensureDir(), this.storage.path());
    const tmpFolder = await this.ensurePath(() => this.storage.ensureDir('tmp'), this.storage.path('tmp'));
    const logsFolder = await this.ensurePath(() => this.storage.ensureDir('logs'), this.storage.path('logs'));
    const settings = await this.settingsService.get();
    const whisperRuntime = await this.fileCheck(this.whisperExecutablePath());
    const whisperModel = await this.fileCheck(this.whisperModelPath(settings.whisperModel));
    const hardware = await this.hardwareInfo(whisperRuntime.value);
    const ollama = await this.ollamaPath();
    const ollamaModels = ollama.status === 'ok' ? await this.ollamaModels() : [];
    const ollamaModel = this.ollamaModelCheck(settings.ollamaModel, ollamaModels);

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
        this.line('gpu cuda usable', hardware.gpuCudaUsable),
        '',
        this.line('storage root', storageRoot),
        this.line('tmp folder', tmpFolder),
        this.line('logs folder', logsFolder),
        '',
        this.line('whisper runtime', whisperRuntime),
        this.line('whisper model', whisperModel),
        '',
        this.line('ollama', ollama),
        this.line('ollama model', ollamaModel),
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

  private whisperExecutablePath(): string {
    const cudaPath = join(
      homedir(),
      appStorageConfig.directoryName,
      ...whisperRuntimeConfig.cudaRuntimeParts,
      whisperRuntimeConfig.executableName,
    );

    if (process.platform === 'win32' && existsSync(cudaPath)) {
      return cudaPath;
    }

    if (app.isPackaged) {
      return join(
        process.resourcesPath,
        ...whisperRuntimeConfig.packagedRuntimeParts,
        whisperRuntimeConfig.executableName,
      );
    }

    return resolve(
      process.cwd(),
      ...whisperRuntimeConfig.devRuntimeParts,
      whisperRuntimeConfig.executableName,
    );
  }

  private whisperModelPath(model: string): string {
    return model ? join(this.storage.path('models', 'whisper'), model) : '';
  }

  private async hardwareInfo(whisperRuntimePath: string): Promise<{
    cpu: CheckResult;
    cpuCores: CheckResult;
    cpuThreads: CheckResult;
    gpu: CheckResult;
    gpuVram: CheckResult;
    gpuCudaUsable: CheckResult;
  }> {
    const cpuList = cpus();
    const cpu = {
      status: cpuList[0]?.model ? 'ok' : 'missing',
      value: cpuList[0]?.model ?? 'unknown',
    } satisfies CheckResult;
    const logicalThreads = cpuList.length;
    const physicalCores = await this.physicalCpuCores();
    const gpus = await this.gpuInfo();

    return {
      cpu,
      cpuCores: {
        status: physicalCores.status,
        value:
          physicalCores.status === 'ok'
            ? `${physicalCores.value} physical / ${logicalThreads} logical`
            : `unknown physical / ${logicalThreads} logical`,
      },
      cpuThreads: {
        status: logicalThreads > 0 ? 'ok' : 'missing',
        value: String(logicalThreads || 'unknown'),
      },
      gpu: {
        status: gpus.status,
        value: gpus.items.map((gpu) => gpu.name).join(' | ') || 'unknown',
      },
      gpuVram: {
        status: gpus.status,
        value: gpus.items.map((gpu) => `${gpu.name}: ${gpu.vram}`).join(' | ') || 'unknown',
      },
      gpuCudaUsable: this.cudaUsableCheck(whisperRuntimePath),
    };
  }

  private async physicalCpuCores(): Promise<CheckResult> {
    if (process.platform !== 'win32') {
      return { status: 'missing', value: 'unknown' };
    }

    const result = await this.powerShellJson(
      '(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum | ConvertTo-Json -Compress',
      3000,
    );
    if (result.status !== 'ok') {
      return { status: result.status, value: 'unknown' };
    }

    const cores = Number(JSON.parse(result.value));
    return Number.isFinite(cores) && cores > 0
      ? { status: 'ok', value: String(cores) }
      : { status: 'missing', value: 'unknown' };
  }

  private async gpuInfo(): Promise<{
    status: CheckStatus;
    items: Array<{ name: string; vram: string }>;
  }> {
    if (process.platform !== 'win32') {
      return { status: 'missing', items: [] };
    }

    const result = await this.powerShellJson(this.gpuInfoScript(), 4000);
    if (result.status !== 'ok') {
      return { status: result.status, items: [] };
    }

    try {
      const value = JSON.parse(result.value) as unknown;
      const items = (Array.isArray(value) ? value : [value])
        .map((item) => {
          const gpu = item as { Name?: unknown; AdapterRAM?: unknown };
          const registryRam = (item as { RegistryRAM?: unknown }).RegistryRAM;
          const name = typeof gpu.Name === 'string' ? gpu.Name : 'unknown';
          const bytes =
            typeof registryRam === 'number'
              ? registryRam
              : typeof gpu.AdapterRAM === 'number'
                ? gpu.AdapterRAM
                : 0;
          return { name, vram: bytes > 0 ? this.formatBytes(bytes) : 'unknown' };
        })
        .filter((gpu) => gpu.name !== 'unknown');
      return { status: items.length > 0 ? 'ok' : 'missing', items };
    } catch {
      return { status: 'missing', items: [] };
    }
  }

  private cudaUsableCheck(whisperRuntimePath: string): CheckResult {
    const cudaDll = join(dirname(whisperRuntimePath), whisperRuntimeConfig.cudaDllName);
    const usable = process.platform === 'win32' && existsSync(whisperRuntimePath) && existsSync(cudaDll);
    return {
      status: usable ? 'ok' : 'missing',
      value: usable ? 'whisper runtime supports CUDA' : 'whisper CUDA runtime not available',
    };
  }

  private gpuInfoScript(): string {
    return `
$registry = @{}
Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video' -ErrorAction SilentlyContinue | ForEach-Object {
  Get-ChildItem $_.PsPath -ErrorAction SilentlyContinue
} | ForEach-Object {
  $item = Get-ItemProperty $_.PsPath -ErrorAction SilentlyContinue
  $name = $item.DriverDesc -as [string]
  if (-not $name) { $name = $item.'HardwareInformation.AdapterString' -as [string] }
  $memory = $item.'HardwareInformation.qwMemorySize'
  if ($name -and $memory) { $registry[$name] = [uint64]$memory }
}
Get-CimInstance Win32_VideoController | ForEach-Object {
  [PSCustomObject]@{
    Name = $_.Name
    AdapterRAM = $_.AdapterRAM
    RegistryRAM = $registry[$_.Name]
  }
} | ConvertTo-Json -Compress
`.trim();
  }

  private ollamaPath(): Promise<CheckResult> {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    return this.commandFirstLine(command, ['ollama'], 'ollama');
  }

  private async ollamaModels(): Promise<string[]> {
    const result = await this.commandOutput('ollama', ['list'], 2500);
    if (result.status !== 'ok') {
      return [];
    }

    return result.value
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((model): model is string => Boolean(model));
  }

  private ollamaModelCheck(model: string, models: string[]): CheckResult {
    if (!model) {
      return { status: 'missing', value: '' };
    }

    return { status: models.includes(model) ? 'ok' : 'missing', value: model };
  }

  private async commandFirstLine(command: string, args: string[], fallback: string): Promise<CheckResult> {
    const result = await this.commandOutput(command, args, 1500);
    if (result.status !== 'ok') {
      return { status: result.status, value: fallback };
    }

    return { status: 'ok', value: result.value.split(/\r?\n/).find(Boolean)?.trim() || fallback };
  }

  private powerShellJson(command: string, timeoutMs: number): Promise<CheckResult> {
    return this.commandOutput(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      timeoutMs,
    );
  }

  private commandOutput(command: string, args: string[], timeoutMs: number): Promise<CheckResult> {
    return new Promise((resolveResult) => {
      let settled = false;
      const child = spawn(command, args, {
        windowsHide: true,
        shell: false,
      });
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        resolveResult({ status: 'timeout', value: command });
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      child.on('error', () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolveResult({ status: 'missing', value: command });
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolveResult({
          status: code === 0 ? 'ok' : 'missing',
          value: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
  }

  private line(label: string, result: CheckResult): string {
    return `${label}: ${result.status} => ${result.value}`;
  }

  private formatBytes(bytes: number): string {
    return `${Math.round(bytes / 1024 / 1024 / 1024)} GB`;
  }
}
