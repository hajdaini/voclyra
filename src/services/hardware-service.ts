import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import type { HardwareInfo } from '@shared/types';

type GpuInfo = {
  name: string;
  vramGb: number;
};

type CheckStatus = 'ok' | 'missing' | 'timeout';

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
};

export class HardwareService {
  async info(): Promise<HardwareInfo> {
    const gpus = await this.gpuInfo();
    const bestGpu = gpus.sort((left, right) => right.vramGb - left.vramGb)[0];
    return {
      gpuName: bestGpu?.name ?? 'Unknown GPU',
      gpuVramGb: bestGpu?.vramGb ?? null,
    };
  }

  async diagnostics(): Promise<HardwareDiagnostics> {
    const cpuList = cpus();
    const logicalThreads = cpuList.length;
    const physicalCores = await this.physicalCpuCores();
    const gpus = await this.gpuInfoWithStatus();

    return {
      cpu: {
        status: cpuList[0]?.model ? 'ok' : 'missing',
        value: cpuList[0]?.model ?? 'unknown',
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
        value: gpus.items.map((gpu) => `${gpu.name}: ${this.formatGb(gpu.vramGb)}`).join(' | ') || 'unknown',
      },
    };
  }

  private async physicalCpuCores(): Promise<HardwareCheckResult> {
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

  private async gpuInfoWithStatus(): Promise<{ status: CheckStatus; items: GpuInfo[] }> {
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
          const gpu = item as { Name?: unknown; AdapterRAM?: unknown; RegistryRAM?: unknown };
          const name = typeof gpu.Name === 'string' ? gpu.Name : 'Unknown GPU';
          const bytes =
            typeof gpu.RegistryRAM === 'number'
              ? gpu.RegistryRAM
              : typeof gpu.AdapterRAM === 'number'
                ? gpu.AdapterRAM
                : 0;
          return { name, vramGb: bytes > 0 ? Math.ceil((bytes / 1024 / 1024 / 1024) * 10) / 10 : 0 };
        })
        .filter((gpu) => gpu.name !== 'Unknown GPU' && gpu.vramGb > 0);
      return { status: items.length > 0 ? 'ok' : 'missing', items };
    } catch {
      return { status: 'missing', items: [] };
    }
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

  private formatGb(value: number): string {
    return `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;
  }
}
