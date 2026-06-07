import { app } from 'electron';

export class StartupService {
  apply(startAtStartup: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: startAtStartup,
      openAsHidden: false,
    });
  }

  enabled(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  }
}
