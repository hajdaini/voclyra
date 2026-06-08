import { app } from 'electron';
import { spawnSync } from 'node:child_process';
import { packageInfo } from '@shared/GlobalVars';

const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const runValueName = packageInfo.productName;

export class StartupService {
  apply(startAtStartup: boolean): void {
    this.deleteLegacyRunEntry();
    app.setLoginItemSettings({
      openAtLogin: startAtStartup,
      openAsHidden: false,
    });
  }

  enabled(): boolean {
    return app.getLoginItemSettings().openAtLogin || this.hasLegacyRunEntry();
  }

  private hasLegacyRunEntry(): boolean {
    if (process.platform !== 'win32') {
      return false;
    }
    return spawnSync('reg', ['query', runKey, '/v', runValueName], {
      windowsHide: true,
      stdio: 'ignore',
    }).status === 0;
  }

  private deleteLegacyRunEntry(): void {
    if (process.platform !== 'win32') {
      return;
    }
    spawnSync('reg', ['delete', runKey, '/v', runValueName, '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  }
}
