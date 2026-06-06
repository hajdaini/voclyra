import { app } from 'electron';
import { improveClipboardFromHotkey, registerIpc } from './ipc';
import { createTray, destroyTray } from './tray';
import { createMainWindow, sendAppAction, showMainWindow } from './window';
import { SettingsService } from '@services/settings-service';
import { HotkeyService } from '@services/hotkey-service';
import { AppStorage } from '@storage/app-storage';

app.setName('Voclyra');
app.setAppUserModelId('app.voclyra.desktop');

const gotLock = app.requestSingleInstanceLock();
const settingsService = new SettingsService();
const hotkeyService = new HotkeyService();
const appStorage = new AppStorage();

if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  showMainWindow();
});

void app.whenReady().then(async () => {
  await appStorage.clearDir('tmp').catch(() => {});
  await appStorage
    .removeMatching('logs', (name) =>
      /^last-.*\.whisper\.(raw|stderr|stdout)\.txt$/i.test(name) ||
      name === 'ollama.log' ||
      name === 'whisper.log',
    )
    .catch(() => {});

  registerIpc();
  createMainWindow();

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
