import { join } from 'node:path';
import { BrowserWindow, app, screen, shell } from 'electron';
import { channels } from '@shared/channels';
import type { OverlayState, ResultState } from '@shared/types';
import { applyWindowSecurity } from './security';

let mainWindow: BrowserWindow | null = null;
type OverlayMode = OverlayState['mode'];

const overlayModes: OverlayMode[] = ['speak', 'improve', 'transcript'];
const overlayWindows = new Map<OverlayMode, BrowserWindow>();
const overlayDismissed = new Map<OverlayMode, boolean>();
const defaultOverlayState: OverlayState = {
  active: false,
  mode: 'speak',
  status: 'recording',
  waveform: [],
};
const overlayStates = new Map<OverlayMode, OverlayState>(
  overlayModes.map((mode) => [mode, { ...defaultOverlayState, mode }]),
);

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
  const mode = state.mode;
  if (!state.active) {
    overlayDismissed.set(mode, false);
  }
  if (state.active) {
    overlayDismissed.set(mode, false);
  }
  overlayStates.set(mode, state);
  updateSpeakOverlayVisibility();
};

export const getSpeakOverlayState = (mode: OverlayMode = 'speak'): OverlayState =>
  overlayStates.get(mode) ?? { ...defaultOverlayState, mode };

export const stopSpeakFromOverlay = (mode: OverlayMode = 'speak'): void => {
  if (mode === 'transcript') {
    mainWindow?.webContents.send(channels.appTranscript);
    return;
  }
  if (mode === 'improve') {
    return;
  }
  mainWindow?.webContents.send(channels.appSpeak);
};

export const dismissSpeakOverlay = (mode: OverlayMode = 'speak'): void => {
  overlayDismissed.set(mode, true);
  overlayWindows.get(mode)?.hide();
  updateSpeakOverlayVisibility();
};

const updateSpeakOverlayVisibility = (): void => {
  const activeStates = overlayModes
    .map((mode) => overlayStates.get(mode) ?? { ...defaultOverlayState, mode })
    .filter((state) => state.active && !overlayDismissed.get(state.mode));

  for (const mode of overlayModes) {
    const state = overlayStates.get(mode) ?? { ...defaultOverlayState, mode };
    const window = overlayWindows.get(mode);
    if (!state.active || overlayDismissed.get(mode)) {
      window?.hide();
    }
  }

  activeStates.forEach((state, index) => {
    const window = createSpeakOverlayWindow(state.mode);
    positionSpeakOverlay(window, index);
    window.setFocusable(false);
    window.webContents.send(channels.overlayStateChanged, state);
    window.showInactive();
  });
};

const createSpeakOverlayWindow = (mode: OverlayMode): BrowserWindow => {
  const existingWindow = overlayWindows.get(mode);
  if (existingWindow && !existingWindow.isDestroyed()) {
    return existingWindow;
  }

  const window = new BrowserWindow({
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
    title: `Voclyra ${mode}`,
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

  window.setAlwaysOnTop(true, 'floating');
  window.setFocusable(false);
  applyWindowSecurity(window);

  window.on('closed', () => {
    overlayWindows.delete(mode);
  });

  window.webContents.once('did-finish-load', () => {
    window.webContents.send(channels.overlayStateChanged, getSpeakOverlayState(mode));
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?overlay=${mode}`);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { overlay: mode },
    });
  }

  overlayWindows.set(mode, window);
  return window;
};

const positionSpeakOverlay = (window: BrowserWindow, index: number): void => {
  const { workArea } = screen.getPrimaryDisplay();
  const size = window.getSize();
  const width = size[0] ?? 246;
  const height = size[1] ?? 86;
  const gap = 10;
  window.setBounds({
    x: workArea.x + workArea.width - width - 18,
    y: workArea.y + workArea.height - height - 18 - index * (height + gap),
    width,
    height,
  });
};
