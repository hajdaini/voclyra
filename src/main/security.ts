import type { BrowserWindow } from 'electron';
import { desktopCapturer, session } from 'electron';

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

let displayMediaCaptureConfigured = false;

export const applyWindowSecurity = (window: BrowserWindow): void => {
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  configureDisplayMediaCapture();
};

const configureDisplayMediaCapture = (): void => {
  if (displayMediaCaptureConfigured) {
    return;
  }
  displayMediaCaptureConfigured = true;

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      const screen = sources[0];
      if (!screen) {
        callback({});
        return;
      }
      callback({
        video: screen,
        audio: process.platform === 'win32' ? 'loopback' : undefined,
      });
    });
  });
};
