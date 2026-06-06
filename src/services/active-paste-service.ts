import { spawn } from 'node:child_process';

export class ActivePasteService {
  async paste(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    await this.sendKeys('^v');
  }

  copySelection(): Promise<void> {
    return this.sendKeys('^c');
  }

  private sendKeys(keys: string): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-WindowStyle',
          'Hidden',
          '-Command',
          `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')`,
        ],
        { windowsHide: true },
      );
      child.on('error', () => resolve());
      child.on('exit', () => resolve());
    });
  }
}
