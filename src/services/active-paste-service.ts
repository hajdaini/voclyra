import { spawn } from 'node:child_process';

export class ActivePasteService {
  paste(): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-WindowStyle',
          'Hidden',
          '-Command',
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
        ],
        { windowsHide: true },
      );
      child.on('error', () => resolve());
      child.on('exit', () => resolve());
    });
  }
}
