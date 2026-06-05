import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

export class AppStorage {
  readonly root = join(homedir(), '.voclyra');

  async readJson<T>(name: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path(name), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  async writeJson<T>(name: string, value: T): Promise<T> {
    const path = this.path(name);
    await mkdir(dirname(path), { recursive: true });
    this.hideRoot();
    await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
    return value;
  }

  async ensureDir(...parts: string[]): Promise<string> {
    const path = join(this.root, ...parts);
    await mkdir(path, { recursive: true });
    this.hideRoot();
    return path;
  }

  path(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  private hideRoot(): void {
    if (process.platform !== 'win32') {
      return;
    }

    const child = spawn('attrib', ['+h', this.root], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    child.on('error', () => {});
  }
}
