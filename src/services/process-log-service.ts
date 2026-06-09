import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logConfig } from '@shared/GlobalVars';
import { AppStorage } from '@storage/app-storage';

export class ProcessLogService {
  private readonly maxBytes = logConfig.processMaxBytes;
  private readonly storage = new AppStorage();

  async append(fileName: string, lines: string[]): Promise<void> {
    const logsRoot = await this.storage.ensureDir('logs');
    const path = join(logsRoot, fileName);
    const previous = await readFile(path, 'utf8').catch(() => '');
    const next = [
      previous.trimEnd(),
      [`[${new Date().toISOString()}]`, ...lines].join('\n'),
    ].filter(Boolean).join('\n');
    await writeFile(path, next, 'utf8');
    await this.truncate(path);
  }

  async writeSnapshot(fileName: string, lines: string[], maxBytes = 1024 * 1024): Promise<void> {
    const logsRoot = await this.storage.ensureDir('logs');
    const path = join(logsRoot, fileName);
    await writeFile(path, this.limit([`[${new Date().toISOString()}]`, ...lines].join('\n'), maxBytes), 'utf8');
  }

  private async truncate(path: string): Promise<void> {
    try {
      const size = (await stat(path)).size;
      if (size <= this.maxBytes) {
        return;
      }
      const content = await readFile(path, 'utf8');
      await writeFile(path, content.slice(-this.maxBytes), 'utf8');
    } catch {}
  }

  private limit(content: string, maxBytes: number): string {
    if (Buffer.byteLength(content, 'utf8') <= maxBytes) {
      return content;
    }
    const marker = '\n...[truncated]...\n';
    const half = Math.floor((maxBytes - Buffer.byteLength(marker, 'utf8')) / 2);
    return `${content.slice(0, half)}${marker}${content.slice(-half)}`;
  }
}
