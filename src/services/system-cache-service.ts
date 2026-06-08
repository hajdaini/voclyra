import { rm } from 'node:fs/promises';
import { packageInfo } from '@shared/GlobalVars';
import type { HardwareInfo } from '@shared/types';
import { AppStorage } from '@storage/app-storage';
import type { HardwareDiagnostics } from './hardware-service';

export type SystemHardwareCache = {
  appVersion: string;
  updatedAt: string;
  systemInfo: {
    version: string;
    platform: NodeJS.Platform;
    arch: string;
    electron: string;
    node: string;
  };
  cpuInfo: {
    cpu: string;
    cpuCores: string;
    cpuThreads: string;
  };
  gpuInfo: {
    gpu: string;
    gpuVram: string;
    gpuDriver: string;
    gpuCudaVersion: string;
  };
  hardwareInfo: HardwareInfo;
};

export class SystemCacheService {
  private readonly storage = new AppStorage();
  private readonly fileName = 'cache/system.json';

  async readHardware(): Promise<SystemHardwareCache | null> {
    const cache = await this.storage.readJson<unknown>(this.fileName, null);
    if (!isSystemHardwareCache(cache) || cache.appVersion !== packageInfo.version) {
      await this.deleteHardware();
      return null;
    }
    return cache;
  }

  async writeHardware(
    diagnostics: HardwareDiagnostics,
    hardwareInfo: HardwareInfo,
  ): Promise<SystemHardwareCache> {
    const stableHardwareInfo: HardwareInfo = {
      ...hardwareInfo,
      gpuMemoryUsedGb: null,
      gpuMemoryFreeGb: null,
    };
    const cache: SystemHardwareCache = {
      appVersion: packageInfo.version,
      updatedAt: new Date().toISOString(),
      systemInfo: {
        version: packageInfo.version,
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron ?? 'unknown',
        node: process.versions.node,
      },
      cpuInfo: {
        cpu: value(diagnostics.cpu.value),
        cpuCores: value(diagnostics.cpuCores.value),
        cpuThreads: value(diagnostics.cpuThreads.value),
      },
      gpuInfo: {
        gpu: value(diagnostics.gpu.value),
        gpuVram: hardwareInfo.gpuVramGb === null
          ? 'unknown'
          : `${hardwareInfo.gpuName}: ${formatGb(hardwareInfo.gpuVramGb)} total`,
        gpuDriver: value(diagnostics.gpuDriver.value),
        gpuCudaVersion: value(diagnostics.gpuCuda.value),
      },
      hardwareInfo: stableHardwareInfo,
    };
    await this.storage.writeJson(this.fileName, cache);
    return cache;
  }

  private async deleteHardware(): Promise<void> {
    await rm(this.storage.path(this.fileName), { force: true }).catch(() => {});
  }
}

const value = (input: string): string => input.trim() || 'unknown';

const isSystemHardwareCache = (value: unknown): value is SystemHardwareCache => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const cache = value as Partial<SystemHardwareCache>;
  return (
    cache.appVersion === packageInfo.version &&
    typeof cache.updatedAt === 'string' &&
    isObject(cache.systemInfo) &&
    isObject(cache.cpuInfo) &&
    isObject(cache.gpuInfo) &&
    isHardwareInfo(cache.hardwareInfo)
  );
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const isHardwareInfo = (value: unknown): value is HardwareInfo => {
  const info = value as Partial<HardwareInfo> | null;
  return Boolean(info) && typeof info?.gpuName === 'string' && typeof info.gpuAvailable === 'boolean';
};

const formatGb = (value: number): string => `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;
