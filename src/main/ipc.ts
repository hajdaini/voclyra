import { BrowserWindow, app, clipboard, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { channels } from '@shared/channels';
import { defaultSettings } from '@shared/defaults';
import { appMessages } from '@shared/GlobalVars';
import { improveRunningMessage } from '@shared/action-locks';
import { historyTitleUpdateSchema, idSchema, overlayStateSchema, settingsSchema, textSchema } from '@shared/schemas';
import { whisperModelIdSchema } from '@shared/schemas';
import type { ResultState, Settings } from '@shared/types';
import { ActivePasteService } from '@services/active-paste-service';
import { HistoryService } from '@services/history-service';
import { OllamaService } from '@services/ollama-service';
import { SettingsService } from '@services/settings-service';
import { TranscriptService } from '@services/transcript-service';
import { WhisperModelService } from '@services/whisper-model-service';
import { WhisperService } from '@services/whisper-service';
import { HotkeyService } from '@services/hotkey-service';
import { AppStorage } from '@storage/app-storage';
import {
  cancelRecordingFromOverlay,
  dismissSpeakOverlay,
  getSpeakOverlayState,
  sendAppAction,
  sendImproveResult,
  setSpeakOverlayState,
  stopSpeakFromOverlay,
} from './window';
import { updateTray } from './tray';

let settings: Settings = defaultSettings;
const activePasteService = new ActivePasteService();
const historyService = new HistoryService();
const ollamaService = new OllamaService();
const settingsService = new SettingsService();
const appStorage = new AppStorage();
const whisperModelService = new WhisperModelService();
const whisperService = new WhisperService();
const transcriptService = new TranscriptService(whisperService, historyService);
const hotkeyService = new HotkeyService();
let improveShortcutRunning = false;

const ready = (text: string, message: string): ResultState => ({
  text,
  status: 'ready',
  message,
});

export const improveClipboardFromHotkey = async (): Promise<void> => {
  if (improveShortcutRunning) {
    setSpeakOverlayState({
      active: true,
      mode: 'improve',
      status: 'warning',
      waveform: [],
      message: improveRunningMessage,
      messageType: 'warning',
    });
    return;
  }
  improveShortcutRunning = true;
  try {
    settings = await settingsService.get();
    const text = settings.improveSelectedText
      ? await readActiveSelection()
      : clipboard.readText();
    if (!text.trim()) {
      sendImproveResult(ready('', 'Clipboard is empty.'));
      return;
    }
    setSpeakOverlayState({
      active: true,
      mode: 'improve',
      status: 'improving',
      waveform: [],
    });
    const improved = await ollamaService.improveText(
      settings.ollamaModel,
      settings.correctionPrompt,
      text,
    );
    if (!improved.trim()) {
      sendImproveResult(failed(new Error('Ollama returned an empty response.')));
      return;
    }
    clipboard.writeText(improved);
    if (settings.pasteAfterImprovement) {
      await activePasteService.paste();
    }
    await historyService.add({ kind: 'improvement', text: improved }, settings.maxHistoryItems);
    sendImproveResult(ready(improved, appMessages.copiedToClipboard));
  } catch (error) {
    sendImproveResult(failed(error));
  } finally {
    improveShortcutRunning = false;
  }
};

export const registerIpc = (): void => {
  ipcMain.handle(channels.settingsGet, async () => {
    settings = await settingsService.get();
    return settings;
  });

  ipcMain.handle(channels.settingsSave, async (_event, value: unknown) => {
    const nextSettings = settingsSchema.parse(value);
    const previousSettings = settings;
    const handlers = {
      speak: () => sendAppAction('speak'),
      improveText: () => void improveClipboardFromHotkey(),
      transcript: () => sendAppAction('transcript'),
    };
    const registration = hotkeyService.register(nextSettings, handlers);
    if (!registration.speak || !registration.improveText || !registration.transcript) {
      hotkeyService.register(previousSettings, handlers);
      return previousSettings;
    }
    const savedSettings = await settingsService.save(nextSettings);
    settings = savedSettings;
    updateTray(savedSettings);
    return savedSettings;
  });

  ipcMain.handle(channels.appOpenDataFolder, async () => {
    const path = await appStorage.ensureDir();
    const error = await shell.openPath(path);
    if (error) {
      throw new Error(error);
    }
  });

  ipcMain.handle(channels.appOpenLogsFolder, async () => {
    const path = await appStorage.ensureDir('logs');
    const error = await shell.openPath(path);
    if (error) {
      throw new Error(error);
    }
  });

  ipcMain.handle(channels.appQuit, () => {
    app.isQuitting = true;
    app.quit();
  });

  ipcMain.handle(channels.modelsListOllama, () => ollamaService.listModels());

  ipcMain.handle(channels.whisperListModels, async () => {
    const [downloadedModels, discoveredModels] = await Promise.all([
      whisperModelService.downloadedModelNames(),
      whisperService.listModels(),
    ]);
    return [...new Set([...downloadedModels, ...discoveredModels])].sort((a, b) => a.localeCompare(b));
  });

  ipcMain.handle(channels.whisperAvailableModels, () => whisperModelService.availableModels());

  ipcMain.handle(channels.whisperRuntimeInfo, () => whisperService.runtimeInfo());

  ipcMain.handle(channels.whisperDownloadModel, (event, value: unknown) => {
    const id = whisperModelIdSchema.parse(value);
    return whisperModelService.downloadModel(id, (progress) => {
      event.sender.send(channels.whisperDownloadProgress, progress);
    });
  });

  ipcMain.handle(channels.whisperDeleteModel, (_event, value: unknown) => {
    const id = whisperModelIdSchema.parse(value);
    return whisperModelService.deleteModel(id);
  });

  ipcMain.handle(channels.dictationStart, async (_event, value: unknown) => {
    const audio = value instanceof ArrayBuffer ? new Uint8Array(value) : null;
    if (!audio || audio.byteLength === 0) {
      return ready('', 'No audio captured.');
    }
    const whisperModels = await whisperModelService.downloadedModelNames();
    const whisperModel = whisperModels.includes(settings.whisperModel)
      ? settings.whisperModel
      : whisperModels[0];
    if (!whisperModel) {
      return ready('', 'Select a Whisper model first.');
    }
    try {
      const text = singleLineText(await whisperService.transcribe(audio, whisperModel, { debugName: 'speak' }));
      if (!text.trim()) {
        return ready('', 'No speech detected.');
      }
      clipboard.writeText(text);
      if (settings.pasteAfterDictation) {
        await activePasteService.paste();
      }
      await historyService.add({ kind: 'dictation', text }, settings.maxHistoryItems);
      return ready(text, appMessages.copiedToClipboard);
    } catch (error) {
      return failed(error);
    }
  });

  ipcMain.handle(channels.dictationStop, () => ready('', 'Dictation stopped.'));

  ipcMain.handle(channels.transcriptStart, async (_event, value: unknown) => {
    const audio = value instanceof ArrayBuffer ? new Uint8Array(value) : null;
    if (!audio || audio.byteLength === 0) {
      return ready('', 'No audio captured.');
    }
    const whisperModels = await whisperModelService.downloadedModelNames();
    const whisperModel = whisperModels.includes(settings.whisperModel)
      ? settings.whisperModel
      : whisperModels[0];
    if (!whisperModel) {
      return ready('', 'Select a Whisper model first.');
    }
    try {
      const text = await whisperService.transcribe(audio, whisperModel, {
        timeoutMs: null,
        debugName: 'transcript',
      });
      if (!text.trim()) {
        return ready('', 'No speech detected.');
      }
      await historyService.add({ kind: 'transcript', text }, settings.maxHistoryItems);
      return ready(text, 'Transcript generated.');
    } catch (error) {
      return failed(error);
    }
  });

  ipcMain.handle(channels.textImprove, async (_event, value: unknown) => {
    if (improveShortcutRunning) {
      setSpeakOverlayState({
        active: true,
        mode: 'improve',
        status: 'warning',
        waveform: [],
        message: improveRunningMessage,
        messageType: 'warning',
      });
      return ready('', improveRunningMessage);
    }
    const text = textSchema.parse(value);
    if (!text.trim()) {
      return ready('', 'Enter text to improve.');
    }
    improveShortcutRunning = true;
    try {
      const improved = await ollamaService.improveText(
        settings.ollamaModel,
        settings.correctionPrompt,
        text,
      );
      if (!improved.trim()) {
        return failed(new Error('Ollama returned an empty response.'));
      }
      clipboard.writeText(improved);
      if (settings.pasteAfterImprovement) {
        await activePasteService.paste();
      }
      await historyService.add({ kind: 'improvement', text: improved }, settings.maxHistoryItems);
      return ready(improved, appMessages.copiedToClipboard);
    } catch (error) {
      return failed(error);
    } finally {
      improveShortcutRunning = false;
    }
  });

  ipcMain.handle(channels.clipboardRead, () => clipboard.readText());

  ipcMain.handle(channels.clipboardReadSelection, async () => readActiveSelection());

  ipcMain.handle(channels.clipboardWrite, (_event, value: unknown) => {
    clipboard.writeText(textSchema.parse(value));
  });

  ipcMain.handle(channels.textReplaceActive, (_event, value: unknown) => {
    textSchema.parse(value);
  });

  ipcMain.handle(channels.historyList, () => historyService.list());

  ipcMain.handle(channels.historyToggleFavorite, async (_event, value: unknown) => {
    const id = idSchema.parse(value);
    return historyService.toggleFavorite(id);
  });

  ipcMain.handle(channels.historyUpdateTitle, async (_event, value: unknown) => {
    const update = historyTitleUpdateSchema.parse(value);
    return historyService.updateTitle(update.id, update.title);
  });

  ipcMain.handle(channels.historyDelete, async (_event, value: unknown) => {
    const id = idSchema.parse(value);
    await historyService.delete(id);
  });

  ipcMain.handle(channels.historyClear, () => historyService.clear());

  ipcMain.handle(channels.overlaySetState, (_event, value: unknown) => {
    setSpeakOverlayState(overlayStateSchema.parse(value));
  });

  ipcMain.handle(channels.overlayGetState, (_event, value: unknown) => {
    const mode = value === 'improve' || value === 'transcript' ? value : 'speak';
    return getSpeakOverlayState(mode);
  });

  ipcMain.handle(channels.overlayStopSpeak, (_event, value: unknown) => {
    const mode = value === 'transcript' ? value : 'speak';
    stopSpeakFromOverlay(mode);
  });

  ipcMain.handle(channels.overlayCancelRecording, (_event, value: unknown) => {
    if (value === 'speak' || value === 'transcript') {
      cancelRecordingFromOverlay(value);
    }
  });

  ipcMain.handle(channels.overlayDismiss, (_event, value: unknown) => {
    const mode = value === 'improve' || value === 'transcript' ? value : 'speak';
    dismissSpeakOverlay(mode);
  });

  ipcMain.handle(channels.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle(channels.windowToggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }
    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }
    window.maximize();
  });

  ipcMain.handle(channels.windowClose, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.hide();
  });
};

const failed = (error: unknown): ResultState => ({
  text: '',
  status: 'error',
  message: error instanceof Error ? error.message : 'Operation failed.',
});

const singleLineText = (text: string): string => text.replace(/\s*\r?\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

const readActiveSelection = async (): Promise<string> => {
  const previousText = clipboard.readText();
  const sentinel = `__VOCLYRA_SELECTION_${randomUUID()}__`;
  clipboard.writeText(sentinel);
  await activePasteService.copySelection();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const selectedText = clipboard.readText();
  if (selectedText === sentinel) {
    clipboard.writeText(previousText);
    return '';
  }
  return selectedText;
};
