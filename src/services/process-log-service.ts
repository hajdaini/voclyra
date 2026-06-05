import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppStorage } from '@storage/app-storage';

export class ProcessLogService {
  private readonly storage = new AppStorage();

  async append(fileName: string, lines: string[]): Promise<void> {
    const logsRoot = await this.storage.ensureDir('logs');
    await appendFile(
      join(logsRoot, fileName),
      [`\n[${new Date().toISOString()}]`, ...lines].join('\n'),
      'utf8',
    );
  }
}
