import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import type { GpuUsage, HardwareInfo } from '@shared/types';
import { SystemCacheService } from '@services/system-cache-service';

type GpuInfo = {
  name: string;
  vramGb: number;
  driverVersion: string;
  cudaVersion: string;
  memoryUsedGb: number | null;
  memoryFreeGb: number | null;
};

type CheckStatus = 'ok' | 'missing' | 'timeout';
type GpuInfoStatus = { status: CheckStatus; items: GpuInfo[] };

export type HardwareCheckResult = {
  status: CheckStatus;
  value: string;
};

export type HardwareDiagnostics = {
  cpu: HardwareCheckResult;
  cpuCores: HardwareCheckResult;
  cpuThreads: HardwareCheckResult;
  gpu: HardwareCheckResult;
  gpuVram: HardwareCheckResult;
  gpuDriver: HardwareCheckResult;
  gpuCuda: HardwareCheckResult;
};

let nvidiaSmiCheck: Promise<HardwareCheckResult> | null = null;
let gpuInfoCheck: Promise<GpuInfoStatus> | null = null;
let physicalCpuCoresCheck: Promise<HardwareCheckResult> | null = null;
let cachedHardwareInfo: HardwareInfo | null = null;
let cacheLoad: Promise<void> | null = null;
let refreshHardware: Promise<HardwareInfo> | null = null;

export class HardwareService {
  private readonly cache = new SystemCacheService();

  nvidiaSmi(): Promise<HardwareCheckResult> {
    if (process.platform !== 'win32') {
      return Promise.resolve({ status: 'missing', value: 'unknown' });
    }

    nvidiaSmiCheck ??= this.commandText('nvidia-smi', [], 3000);
    return nvidiaSmiCheck;
  }

  async info(): Promise<HardwareInfo> {
    await this.loadCache();
    if (cachedHardwareInfo) {
      void this.refreshInfo().catch(() => {});
      return cachedHardwareInfo;
    }
    return this.refreshInfo();
  }

  async usage(): Promise<GpuUsage> {
    return this.readUsage();
  }

  async diagnostics(): Promise<HardwareDiagnostics> {
    const cpuList = cpus();
    const logicalThreads = cpuList.length;
    const physicalCores = await this.physicalCpuCores();
    const gpus = await this.gpuInfoWithStatus();

    return this.toDiagnostics(cpuList[0]?.model ?? 'unknown', logicalThreads, physicalCores, gpus);
  }

  async cudaMajorVersion(): Promise<number | null> {
    const result = await this.nvidiaSmi();
    if (result.status !== 'ok') {
      return null;
    }

    const major = Number(this.cudaVersion(result.value).split('.')[0]);
    return Number.isFinite(major) && major > 0 ? major : null;
  }

  private async loadCache(): Promise<void> {
    cacheLoad ??= this.cache.readHardware().then((cache) => {
      if (!cache) {
        return;
      }
      cachedHardwareInfo = cache.hardwareInfo;
    });
    await cacheLoad;
  }

  private async refreshInfo(): Promise<HardwareInfo> {
    refreshHardware ??= this.refreshHardwareCache().then((result) => result.hardwareInfo).finally(() => {
      refreshHardware = null;
    });
    return refreshHardware;
  }

  private async refreshHardwareCache(): Promise<{ hardwareInfo: HardwareInfo }> {
    const [hardwareInfo, diagnostics] = await Promise.all([
      this.readInfo(),
      this.diagnostics(),
    ]);
    cachedHardwareInfo = hardwareInfo;
    await this.cache.writeHardware(diagnostics, hardwareInfo).catch(() => {});
    return { hardwareInfo };
  }

  private async readInfo(): Promise<HardwareInfo> {
    const gpus = await this.gpuInfo();
    const bestGpu = gpus.sort((left, right) => right.vramGb - left.vramGb)[0];
    return {
      gpuName: bestGpu?.name ?? 'Unknown GPU',
      gpuVramGb: bestGpu?.vramGb ?? null,
      gpuAvailable: Boolean(bestGpu),
      gpuDriverVersion: bestGpu?.driverVersion ?? 'unknown',
      gpuCudaVersion: bestGpu?.cudaVersion ?? 'unknown',
      gpuMemoryUsedGb: bestGpu?.memoryUsedGb ?? null,
      gpuMemoryFreeGb: bestGpu?.memoryFreeGb ?? null,
    };
  }

  private async readUsage(): Promise<GpuUsage> {
    const gpus = await this.gpuUsage();
    const bestGpu = gpus.sort((left, right) => (right.memoryTotalGb ?? 0) - (left.memoryTotalGb ?? 0))[0];
    return bestGpu ?? {
      available: false,
      name: 'Unknown GPU',
      memoryUsedGb: null,
      memoryTotalGb: null,
      memoryUsagePercent: null,
      utilizationPercent: null,
    };
  }

  private toDiagnostics(
    cpuModel: string,
    logicalThreads: number,
    physicalCores: HardwareCheckResult,
    gpus: GpuInfoStatus,
  ): HardwareDiagnostics {
    return {
      cpu: {
        status: cpuModel !== 'unknown' ? 'ok' : 'missing',
        value: cpuModel,
      },
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
        value:
          gpus.items
            .map((gpu) =>
              gpu.memoryUsedGb === null || gpu.memoryFreeGb === null
                ? `${gpu.name}: ${this.formatGb(gpu.vramGb)}`
                : `${gpu.name}: ${this.formatGb(gpu.memoryUsedGb)} used / ${this.formatGb(gpu.vramGb)} total`,
            )
            .join(' | ') || 'unknown',
      },
      gpuDriver: {
        status: gpus.status,
        value: gpus.items.map((gpu) => gpu.driverVersion).join(' | ') || 'unknown',
      },
      gpuCuda: {
        status: gpus.status,
        value: gpus.items.map((gpu) => gpu.cudaVersion).join(' | ') || 'unknown',
      },
    };
  }

  private async physicalCpuCores(): Promise<HardwareCheckResult> {
    if (process.platform !== 'win32') {
      return { status: 'missing', value: 'unknown' };
    }

    physicalCpuCoresCheck ??= this.readPhysicalCpuCores();
    return physicalCpuCoresCheck;
  }

  private async readPhysicalCpuCores(): Promise<HardwareCheckResult> {
    const result = await this.powerShellJson(
      '(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum | ConvertTo-Json -Compress',
      3000,
    );
    if (result.status !== 'ok') {
      return { status: result.status, value: 'unknown' };
    }

    try {
      const cores = Number(JSON.parse(result.value));
      return Number.isFinite(cores) && cores > 0
        ? { status: 'ok', value: String(cores) }
        : { status: 'missing', value: 'unknown' };
    } catch {
      return { status: 'missing', value: 'unknown' };
    }
  }

  private async gpuInfo(): Promise<GpuInfo[]> {
    return (await this.gpuInfoWithStatus()).items;
  }

  private async gpuUsage(): Promise<GpuUsage[]> {
    if (process.platform !== 'win32') {
      return [];
    }

    const query = await this.commandText(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,memory.used,utilization.gpu', '--format=csv,noheader,nounits'],
      2000,
    );
    if (query.status !== 'ok') {
      return [];
    }

    return query.value
      .split(/\r?\n/)
      .map((line) => this.parseNvidiaGpuUsage(line))
      .filter((gpu): gpu is GpuUsage => Boolean(gpu));
  }

  private async gpuInfoWithStatus(): Promise<GpuInfoStatus> {
    if (process.platform !== 'win32') {
      return { status: 'missing', items: [] };
    }

    gpuInfoCheck ??= this.readGpuInfoWithStatus();
    return gpuInfoCheck;
  }

  private async readGpuInfoWithStatus(): Promise<GpuInfoStatus> {
    const [query, summary] = await Promise.all([
      this.commandText(
        'nvidia-smi',
        ['--query-gpu=name,driver_version,memory.total,memory.used,memory.free', '--format=csv,noheader,nounits'],
        3000,
      ),
      this.nvidiaSmi(),
    ]);
    if (query.status !== 'ok') {
      return { status: query.status, items: [] };
    }

    const cudaVersion = this.cudaVersion(summary.value);
    const items = query.value
      .split(/\r?\n/)
      .map((line) => this.parseNvidiaGpu(line, cudaVersion))
      .filter((gpu): gpu is GpuInfo => Boolean(gpu));

    return { status: items.length > 0 ? 'ok' : 'missing', items };
  }

  private parseNvidiaGpu(line: string, cudaVersion: string): GpuInfo | null {
    const [name, driverVersion, totalMiB, usedMiB, freeMiB] = line.split(',').map((part) => part.trim());
    const total = Number(totalMiB);
    if (!name || !Number.isFinite(total) || total <= 0) {
      return null;
    }

    return {
      name,
      driverVersion: driverVersion || 'unknown',
      cudaVersion,
      vramGb: this.mibToGb(total),
      memoryUsedGb: this.optionalMibToGb(usedMiB),
      memoryFreeGb: this.optionalMibToGb(freeMiB),
    };
  }

  private parseNvidiaGpuUsage(line: string): GpuUsage | null {
    const [name, totalMiB, usedMiB, utilization] = line.split(',').map((part) => part.trim());
    const total = Number(totalMiB);
    const used = Number(usedMiB);
    const utilizationPercent = Number(utilization);
    if (!name || !Number.isFinite(total) || total <= 0 || !Number.isFinite(used) || used < 0) {
      return null;
    }

    return {
      available: true,
      name,
      memoryUsedGb: this.mibToGb(used),
      memoryTotalGb: this.mibToGb(total),
      memoryUsagePercent: Math.min(100, Math.max(0, Math.round((used / total) * 100))),
      utilizationPercent: Number.isFinite(utilizationPercent) && utilizationPercent >= 0 ? utilizationPercent : null,
    };
  }

  private cudaVersion(output: string): string {
    return /CUDA Version:\s*([^\s|]+)/i.exec(output)?.[1] ?? 'unknown';
  }

  private optionalMibToGb(value: string | undefined): number | null {
    const mib = Number(value);
    return Number.isFinite(mib) && mib >= 0 ? this.mibToGb(mib) : null;
  }

  private mibToGb(value: number): number {
    return Math.ceil((value / 1024) * 10) / 10;
  }

  private powerShellJson(command: string, timeoutMs: number): Promise<HardwareCheckResult> {
    return new Promise((resolve) => {
      let settled = false;
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
        {
          windowsHide: true,
          shell: false,
        },
      );
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        resolve({ status: 'timeout', value: command });
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
        resolve({ status: 'missing', value: command });
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve({
          status: code === 0 ? 'ok' : 'missing',
          value: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
  }

  private commandText(command: string, args: string[], timeoutMs: number): Promise<HardwareCheckResult> {
    return new Promise((resolve) => {
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
        resolve({ status: 'timeout', value: 'unknown' });
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
        resolve({ status: 'missing', value: 'unknown' });
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const value = Buffer.concat(chunks).toString('utf8').trim();
        resolve(code === 0 && value ? { status: 'ok', value } : { status: 'missing', value: 'unknown' });
      });
    });
  }

  private formatGb(value: number): string {
    return `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;
  }
}
