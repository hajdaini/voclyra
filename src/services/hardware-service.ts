import { spawn } from 'node:child_process';
import type { HardwareInfo } from '@shared/types';

type GpuInfo = {
  name: string;
  vramGb: number;
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

  private async gpuInfo(): Promise<GpuInfo[]> {
    if (process.platform !== 'win32') {
      return [];
    }

    const result = await this.powerShellJson(this.gpuInfoScript(), 4000);
    if (!result) {
      return [];
    }

    try {
      const value = JSON.parse(result) as unknown;
      return (Array.isArray(value) ? value : [value])
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
    } catch {
      return [];
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

  private powerShellJson(command: string, timeoutMs: number): Promise<string> {
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
        resolve('');
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
        resolve('');
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(code === 0 ? Buffer.concat(chunks).toString('utf8') : '');
      });
    });
  }
}
