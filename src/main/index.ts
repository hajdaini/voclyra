import { app } from 'electron';
import { improveClipboardFromHotkey, registerIpc } from './ipc';
import { createTray, destroyTray } from './tray';
import { createMainWindow, sendBackgroundAppAction, showMainWindow } from './window';
import { ErrorLogService } from '@services/error-log-service';
import { SettingsService } from '@services/settings-service';
import { HotkeyService } from '@services/hotkey-service';
import { StartupLogService } from '@services/startup-log-service';
import { StartupService } from '@services/startup-service';
import { llamaServerService } from '@services/llama-server-service';
import { whisperServerService } from '@services/whisper-server-service';
import { AppStorage } from '@storage/app-storage';
import { packageInfo } from '@shared/GlobalVars';

app.setName(packageInfo.productName);
app.setAppUserModelId(packageInfo.appId);

const gotLock = app.requestSingleInstanceLock();
const errorLogService = new ErrorLogService();
const settingsService = new SettingsService();
const hotkeyService = new HotkeyService();
const startupLogService = new StartupLogService();
const startupService = new StartupService();
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
  registerIpc();
  createMainWindow();

  void appStorage.clearDir('tmp', 'current').catch(() => {});
  void startupLogService.write().catch(() => {});
  void settingsService.get().then((settings) => {
    const startupEnabled = startupService.enabled();
    if (startupEnabled) {
      startupService.apply(true);
    }
    const runtimeSettings = { ...settings, startAtStartup: startupEnabled };
    hotkeyService.register(runtimeSettings, {
      speak: () => sendBackgroundAppAction('speak'),
      improveText: () => void improveClipboardFromHotkey(),
      transcript: () => sendBackgroundAppAction('transcript'),
    });
    createTray(runtimeSettings);
  });
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  hotkeyService.unregisterAll();
  llamaServerService.stop();
  whisperServerService.stop();
  destroyTray();
});

app.on('window-all-closed', () => {});
