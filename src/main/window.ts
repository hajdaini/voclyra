import { join } from 'node:path';
import { BrowserWindow, app, screen, shell } from 'electron';
import { channels } from '@shared/channels';
import type { OverlayState, ResultState } from '@shared/types';
import { applyWindowSecurity } from './security';

let mainWindow: BrowserWindow | null = null;
let speakOverlayWindow: BrowserWindow | null = null;
let speakOverlayDismissed = false;
let speakOverlayState: OverlayState = {
  active: false,
  mode: 'speak',
  status: 'recording',
  waveform: [],
};

const getAppIconPath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'assets/icon.ico')
    : join(app.getAppPath(), 'resources/icon.ico');

export const createMainWindow = (): BrowserWindow => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 960,
    minHeight: 620,
    title: 'Voclyra',
    icon: getAppIconPath(),
    backgroundColor: '#080d14',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: {
      x: 16,
      y: 16,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });

  applyWindowSecurity(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('focus', () => {
    updateSpeakOverlayVisibility();
  });

  mainWindow.on('blur', () => {
    updateSpeakOverlayVisibility();
  });

  mainWindow.on('close', () => {
    if (!app.isQuitting) {
      app.isQuitting = true;
      setTimeout(() => app.quit(), 0);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
};

export const showMainWindow = (): void => {
  const window = createMainWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  window.showInactive();
  window.focus();
};

export const openSection = (section: string): void => {
  showMainWindow();
  mainWindow?.webContents.send(channels.navigationSection, section);
};

export const sendAppAction = (action: 'speak' | 'improveText' | 'transcript'): void => {
  const channel =
    action === 'speak'
      ? channels.appSpeak
      : action === 'improveText'
        ? channels.appImproveText
        : channels.appTranscript;
  mainWindow?.webContents.send(channel);
};

export const sendImproveResult = (result: ResultState): void => {
  mainWindow?.webContents.send(channels.appImproveResult, result);
};

export const setSpeakOverlayState = (state: OverlayState): void => {
  if (!state.active) {
    speakOverlayDismissed = false;
  }
  if (state.active) {
    speakOverlayDismissed = false;
  }
  speakOverlayState = state;
  updateSpeakOverlayVisibility();
};

export const getSpeakOverlayState = (): OverlayState => speakOverlayState;

export const stopSpeakFromOverlay = (): void => {
  if (speakOverlayState.mode === 'transcript') {
    mainWindow?.webContents.send(channels.appTranscript);
    return;
  }
  mainWindow?.webContents.send(channels.appSpeak);
};

export const dismissSpeakOverlay = (): void => {
  speakOverlayDismissed = true;
  speakOverlayWindow?.hide();
};

const updateSpeakOverlayVisibility = (): void => {
  if (
    !speakOverlayState.active ||
    speakOverlayDismissed
  ) {
    speakOverlayWindow?.hide();
    return;
  }
  const window = createSpeakOverlayWindow();
  if (!window.isVisible()) {
    positionSpeakOverlay(window);
  }
  window.webContents.send(channels.overlayStateChanged, speakOverlayState);
  window.show();
};

const createSpeakOverlayWindow = (): BrowserWindow => {
  if (speakOverlayWindow && !speakOverlayWindow.isDestroyed()) {
    return speakOverlayWindow;
  }

  speakOverlayWindow = new BrowserWindow({
    width: 246,
    height: 86,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    show: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Voclyra Speak',
    icon: getAppIconPath(),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });

  speakOverlayWindow.setAlwaysOnTop(true, 'floating');
  speakOverlayWindow.setFocusable(false);
  applyWindowSecurity(speakOverlayWindow);

  speakOverlayWindow.on('closed', () => {
    speakOverlayWindow = null;
  });

  speakOverlayWindow.webContents.once('did-finish-load', () => {
    speakOverlayWindow?.webContents.send(channels.overlayStateChanged, speakOverlayState);
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void speakOverlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?overlay=speak`);
  } else {
    void speakOverlayWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { overlay: 'speak' },
    });
  }

  return speakOverlayWindow;
};

const positionSpeakOverlay = (window: BrowserWindow): void => {
  const { workArea } = screen.getPrimaryDisplay();
  const size = window.getSize();
  const width = size[0] ?? 246;
  const height = size[1] ?? 86;
  window.setBounds({
    x: workArea.x + workArea.width - width - 18,
    y: workArea.y + workArea.height - height - 18,
    width,
    height,
  });
};
