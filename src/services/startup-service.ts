import { app } from 'electron';
import { spawn } from 'node:child_process';
import { packageInfo } from '@shared/GlobalVars';

const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const runValueName = packageInfo.productName;

export class StartupService {
  async apply(startAtStartup: boolean): Promise<void> {
    await this.deleteLegacyRunEntry();
    app.setLoginItemSettings({
      openAtLogin: startAtStartup,
      openAsHidden: false,
    });
  }

  async enabled(): Promise<boolean> {
    return app.getLoginItemSettings().openAtLogin || await this.hasLegacyRunEntry();
  }

  private async hasLegacyRunEntry(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }
    return this.runReg(['query', runKey, '/v', runValueName]);
  }

  private async deleteLegacyRunEntry(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }
    await this.runReg(['delete', runKey, '/v', runValueName, '/f']);
  }

  private runReg(args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('reg', args, {
        windowsHide: true,
        shell: false,
        stdio: 'ignore',
      });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
  }
}
