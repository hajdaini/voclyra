import { app } from 'electron';
import { join } from 'node:path';
import { appAssetConfig } from '@shared/GlobalVars';

export class RuntimePathService {
  root(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'runtimes')
      : join(app.getAppPath(), appAssetConfig.devAssetDir, 'runtimes');
  }

  path(...parts: string[]): string {
    return join(this.root(), ...parts);
  }
}
