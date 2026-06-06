import { join } from 'node:path';
import { BrowserWindow, app, screen, shell } from 'electron';
import { channels } from '@shared/channels';
import { appAssetConfig, packageInfo } from '@shared/GlobalVars';
import type { OverlayState, ResultState } from '@shared/types';
import { ErrorLogService } from '@services/error-log-service';
import { applyWindowSecurity } from './security';

let mainWindow: BrowserWindow | null = null;
const errorLogService = new ErrorLogService();
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
    ? join(process.resourcesPath, appAssetConfig.packagedAssetDir, appAssetConfig.iconIco)
    : join(app.getAppPath(), appAssetConfig.devAssetDir, appAssetConfig.iconIco);

export const createMainWindow = (): BrowserWindow => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 960,
    minHeight: 620,
    title: packageInfo.productName,
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

  mainWindow.on('unresponsive', () => {
    errorLogService.capture({
      source: 'renderer',
      type: 'unresponsive',
      error: new Error('Main window became unresponsive.'),
    });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') {
      return;
    }

    errorLogService.capture({
      source: 'renderer',
      type: 'render-process-gone',
      error: new Error(details.reason),
      context: {
        reason: details.reason,
        exitCode: details.exitCode,
      },
    });
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
  const previousState = overlayStates.get(mode);
  if (!state.active) {
    overlayDismissed.set(mode, false);
  }
  if (state.active) {
    overlayDismissed.set(mode, false);
  }
  overlayStates.set(mode, state);
  mainWindow?.webContents.send(channels.overlayStateChanged, state);
  const window = overlayWindows.get(mode);
  if (
    previousState?.active &&
    state.active &&
    window &&
    !window.isDestroyed() &&
    window.isVisible() &&
    previousState.status === state.status
  ) {
    window.webContents.send(channels.overlayStateChanged, state);
    return;
  }
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

export const cancelRecordingFromOverlay = (mode: 'speak' | 'transcript'): void => {
  mainWindow?.webContents.send(channels.appCancelRecording, mode);
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
    window.setFocusable(false);
    window.webContents.send(channels.overlayStateChanged, state);
    positionSpeakOverlay(window, index, state);
    window.showInactive();
  });
};

const createSpeakOverlayWindow = (mode: OverlayMode): BrowserWindow => {
  const existingWindow = overlayWindows.get(mode);
  if (existingWindow && !existingWindow.isDestroyed()) {
    return existingWindow;
  }

  const window = new BrowserWindow({
    width: 380,
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
    title: `${packageInfo.productName} ${mode}`,
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

  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') {
      return;
    }

    errorLogService.capture({
      source: 'overlay',
      type: 'render-process-gone',
      error: new Error(details.reason),
      context: {
        mode,
        reason: details.reason,
        exitCode: details.exitCode,
      },
    });
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

const positionSpeakOverlay = (window: BrowserWindow, index: number, state: OverlayState): void => {
  const { workArea } = screen.getPrimaryDisplay();
  const width = window.getBounds().width;
  const height = state.message ? 72 : 62;
  const gap = 10;
  window.setBounds({
    x: workArea.x + workArea.width - width - 18,
    y: workArea.y + workArea.height - height - 18 - index * (height + gap),
    width,
    height,
  });
};

export const resizeSpeakOverlayToContent = (
  mode: OverlayMode,
  size: { width: number; height: number },
): void => {
  const window = overlayWindows.get(mode);
  if (!window || window.isDestroyed() || size.width <= 0 || size.height <= 0) {
    return;
  }
  const activeStates = overlayModes
    .map((overlayMode) => overlayStates.get(overlayMode) ?? { ...defaultOverlayState, mode: overlayMode })
    .filter((state) => state.active && !overlayDismissed.get(state.mode));
  const index = Math.max(0, activeStates.findIndex((state) => state.mode === mode));
  const { workArea } = screen.getPrimaryDisplay();
  const gap = 10;
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
  window.setBounds({
    x: workArea.x + workArea.width - width - 18,
    y: workArea.y + workArea.height - height - 18 - index * (height + gap),
    width,
    height,
  });
};
