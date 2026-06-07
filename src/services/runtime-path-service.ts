import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appAssetConfig } from '@shared/GlobalVars';
import { HardwareService } from '@services/hardware-service';

type CudaRuntimeConfig = Record<string, { label: string; directory: string }>;

export type SelectedRuntimePath = {
  path: string;
  label: string;
};

export class RuntimePathService {
  private readonly hardwareService = new HardwareService();

  root(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'runtimes')
      : join(app.getAppPath(), appAssetConfig.devAssetDir, 'runtimes');
  }

  path(...parts: string[]): string {
    return join(this.root(), ...parts);
  }

  async selectCudaRuntime(
    engineDirectory: string,
    versions: CudaRuntimeConfig,
    platformDirectory: string,
    executableName: string,
  ): Promise<SelectedRuntimePath> {
    const cudaMajor = await this.hardwareService.cudaMajorVersion();
    const candidates = Object.values(versions)
      .map((version) => ({
        ...version,
        major: this.cudaMajor(version.label),
        path: this.path(engineDirectory, version.directory, platformDirectory, executableName),
      }))
      .filter((version) => existsSync(version.path))
      .filter((version) => cudaMajor === null || version.major === null || version.major <= cudaMajor)
      .sort((left, right) => (right.major ?? 0) - (left.major ?? 0));

    const selected = candidates[0] ?? Object.values(versions)[0] ?? {
      directory: 'unknown',
      label: 'unknown',
    };
    return {
      path: this.path(engineDirectory, selected.directory, platformDirectory, executableName),
      label: selected.label,
    };
  }

  private cudaMajor(label: string): number | null {
    const major = Number(/CUDA\s+(\d+)/i.exec(label)?.[1]);
    return Number.isFinite(major) && major > 0 ? major : null;
  }
}
