import { appendFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logConfig } from '@shared/GlobalVars';
import { AppStorage } from '@storage/app-storage';

type ErrorLogInput = {
  source: string;
  type: string;
  error: unknown;
  context?: Record<string, string | number | boolean | null | undefined>;
};

export class ErrorLogService {
  private readonly maxBytes = logConfig.errorMaxBytes;
  private readonly maxRotations = logConfig.errorRotations;
  private readonly storage = new AppStorage();
  private queue = Promise.resolve();

  capture(input: ErrorLogInput): void {
    this.queue = this.queue
      .then(() => this.write(input))
      .catch(() => {});
  }

  private async write(input: ErrorLogInput): Promise<void> {
    const root = await this.storage.ensureDir('logs', 'errors');
    const path = join(root, 'error.log');
    const entry = this.format(input);
    await this.rotateIfNeeded(root, path, Buffer.byteLength(entry, 'utf8'));
    await appendFile(path, entry, 'utf8');
  }

  private async rotateIfNeeded(root: string, path: string, nextBytes: number): Promise<void> {
    try {
      const size = (await stat(path)).size;
      if (size + nextBytes <= this.maxBytes) {
        return;
      }
    } catch {
      await writeFile(path, '', 'utf8').catch(() => {});
      return;
    }

    await rm(join(root, `error.${this.maxRotations}.log`), { force: true }).catch(() => {});
    for (let index = this.maxRotations - 1; index >= 1; index -= 1) {
      await rename(join(root, `error.${index}.log`), join(root, `error.${index + 1}.log`)).catch(() => {});
    }
    await rename(path, join(root, 'error.1.log')).catch(() => {});
    await writeFile(path, '', 'utf8').catch(() => {});
  }

  private format({ source, type, error, context }: ErrorLogInput): string {
    const normalized = this.normalizeError(error);
    const lines = [
      `[${new Date().toISOString()}]`,
      'level: error',
      `source: ${this.clean(source, 120)}`,
      `type: ${this.clean(type, 120)}`,
      `message: ${this.clean(normalized.message, 1000)}`,
    ];

    const safeContext = this.formatContext(context);
    if (safeContext.length > 0) {
      lines.push('context:', ...safeContext);
    }

    if (normalized.stack) {
      lines.push('stack:', normalized.stack);
    }

    return `${lines.join('\n')}\n\n`;
  }

  private normalizeError(error: unknown): { message: string; stack: string } {
    if (error instanceof Error) {
      return {
        message: error.message || error.name || 'Unknown error',
        stack: this.cleanStack(error.stack ?? ''),
      };
    }

    return {
      message: typeof error === 'string' ? error : String(error),
      stack: '',
    };
  }

  private formatContext(context?: Record<string, string | number | boolean | null | undefined>): string[] {
    if (!context) {
      return [];
    }

    return Object.entries(context)
      .filter(([, value]) => value !== undefined)
      .slice(0, 12)
      .map(([key, value]) => `${this.clean(key, 80)}: ${this.clean(String(value), 500)}`);
  }

  private cleanStack(stack: string): string {
    return stack
      .split(/\r?\n/)
      .slice(0, 30)
      .map((line) => this.clean(line, 1000))
      .join('\n');
  }

  private clean(value: string, maxLength: number): string {
    const cleaned = value.replace(/\0/g, '').trim();
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
  }
}
