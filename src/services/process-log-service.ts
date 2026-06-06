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
    await writeFile(path, [`[${new Date().toISOString()}]`, ...lines].join('\n'), 'utf8');
    await this.truncate(path);
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
}
