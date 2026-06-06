import { join } from 'node:path';
import { Menu, Tray, app, nativeImage } from 'electron';
import { defaultSettings } from '@shared/defaults';
import type { Settings } from '@shared/types';
import { openSection, sendAppAction, showMainWindow } from './window';

let tray: Tray | null = null;

export const createTray = (settings: Settings = defaultSettings): Tray => {
  if (tray) {
    updateTray(settings);
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
  updateTray(settings);

  return tray;
};

export const updateTray = (settings: Settings): void => {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Speak (${formatShortcut(settings.hotkeys.speak)})`, click: () => sendAppAction('speak') },
      { label: `Improve (${formatShortcut(settings.hotkeys.improveText)})`, click: showMainWindow },
      { label: `Transcript (${formatShortcut(settings.hotkeys.transcript)})`, click: () => sendAppAction('transcript') },
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
};

export const destroyTray = (): void => {
  tray?.destroy();
  tray = null;
};

const formatShortcut = (shortcut: string): string => shortcut.replace('CommandOrControl', 'Ctrl');
