import { app } from 'electron';
import { improveClipboardFromHotkey, registerIpc } from './ipc';
import { createTray, destroyTray } from './tray';
import { createMainWindow, sendAppAction, showMainWindow } from './window';
import { ErrorLogService } from '@services/error-log-service';
import { SettingsService } from '@services/settings-service';
import { HotkeyService } from '@services/hotkey-service';
import { StartupLogService } from '@services/startup-log-service';
import { AppStorage } from '@storage/app-storage';
import { packageInfo } from '@shared/GlobalVars';

app.setName(packageInfo.productName);
app.setAppUserModelId(packageInfo.appId);

const gotLock = app.requestSingleInstanceLock();
const errorLogService = new ErrorLogService();
const settingsService = new SettingsService();
const hotkeyService = new HotkeyService();
const startupLogService = new StartupLogService();
const appStorage = new AppStorage();

if (!gotLock) {
  app.quit();
}

process.on('uncaughtExceptionMonitor', (error) => {
  errorLogService.capture({
    source: 'main',
    type: 'uncaughtException',
    error,
  });
});

process.on('unhandledRejection', (error) => {
  errorLogService.capture({
    source: 'main',
    type: 'unhandledRejection',
    error,
  });
});

app.on('child-process-gone', (_event, details) => {
  if (details.reason === 'clean-exit') {
    return;
  }

  errorLogService.capture({
    source: 'electron',
    type: 'child-process-gone',
    error: new Error(details.reason),
    context: {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
    },
  });
});

app.on('second-instance', () => {
  showMainWindow();
});

void app.whenReady().then(async () => {
  await appStorage.clearDir('tmp').catch(() => {});

  registerIpc();
  createMainWindow();
  void startupLogService.write().catch(() => {});

  void settingsService.get().then((settings) => {
    hotkeyService.register(settings, {
      speak: () => sendAppAction('speak'),
      improveText: () => void improveClipboardFromHotkey(),
      transcript: () => sendAppAction('transcript'),
    });
    createTray(settings);
  });
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  hotkeyService.unregisterAll();
  destroyTray();
});

app.on('window-all-closed', () => {});
