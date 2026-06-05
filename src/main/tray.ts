import { join } from 'node:path';
import { Menu, Tray, app, nativeImage } from 'electron';
import { openSection, sendAppAction, showMainWindow } from './window';

let tray: Tray | null = null;

export const createTray = (): Tray => {
  if (tray) {
    return tray;
  }

  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'assets/icon.png')
    : join(app.getAppPath(), 'resources/icon.png');
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('Voclyra');
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Speak', click: showMainWindow },
      { label: 'Improve', click: showMainWindow },
      { label: 'Transcript', click: () => sendAppAction('transcript') },
      { type: 'separator' },
      { label: 'Show Voclyra', click: showMainWindow },
      { label: 'Settings', click: () => openSection('settings') },
      { label: 'History', click: () => openSection('history') },
      { type: 'separator' },
      {
        label: 'Quit Voclyra',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  return tray;
};

export const destroyTray = (): void => {
  tray?.destroy();
  tray = null;
};
