import { BrowserWindow, app, clipboard, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { channels } from '@shared/channels';
import { defaultSettings } from '@shared/defaults';
import { appMessages } from '@shared/GlobalVars';
import { actionMessages } from '@shared/action-messages';
import { actionBlockMessage } from '@shared/action-locks';
import { actionOverlay, actionUi } from '@shared/action-ui';
import { customLlmModelUrlError } from '@shared/custom-models';
import { customModelUrlSchema, historyTitleUpdateSchema, idSchema, llmDeleteModelIdSchema, llmModelIdSchema, overlayStateSchema, serverEnabledSchema, settingsSchema, textSchema } from '@shared/schemas';
import { whisperModelIdSchema } from '@shared/schemas';
import type { HomeMode, LocalServerName, OverlayState, ResultState, Settings } from '@shared/types';
import { ActivePasteService } from '@services/active-paste-service';
import { AudioCaptureHelperService } from '@services/audio-capture-helper-service';
import { HistoryService } from '@services/history-service';
import { HardwareService } from '@services/hardware-service';
import { LlamaService } from '@services/llama-service';
import { LlmModelService } from '@services/llm-model-service';
import { SettingsService } from '@services/settings-service';
import { TranscriptService } from '@services/transcript-service';
import { WhisperModelService } from '@services/whisper-model-service';
import { WhisperService } from '@services/whisper-service';
import { ProcessLogService } from '@services/process-log-service';
import { RemoteOpenAiService } from '@services/remote-openai-service';
import { HotkeyService } from '@services/hotkey-service';
import { StartupService } from '@services/startup-service';
import { AppStorage } from '@storage/app-storage';
import {
  cancelRecordingFromOverlay,
  dismissOverlay,
  getOverlayState,
  openSection,
  resizeOverlayToContent,
  sendBackgroundAppAction,
  sendImproveResult,
  sendServerEnabledChanged,
  setOverlayState,
  stopFromOverlay,
} from './window';
import { updateTray } from './tray';

let settings: Settings = defaultSettings;
const serverEnabledState = {
  audio: true,
  llm: true,
};
const activePasteService = new ActivePasteService();
const audioCaptureHelperService = new AudioCaptureHelperService();
const historyService = new HistoryService();
const hardwareService = new HardwareService();
const llamaService = new LlamaService();
const llmModelService = new LlmModelService();
const settingsService = new SettingsService();
const appStorage = new AppStorage();
const whisperModelService = new WhisperModelService();
const whisperService = new WhisperService();
const transcriptService = new TranscriptService(whisperService, historyService);
const transcriptLogService = new ProcessLogService();
const remoteOpenAiService = new RemoteOpenAiService();
const hotkeyService = new HotkeyService();
const startupService = new StartupService();
let improveShortcutRunning = false;
let transcriptLogSessionId = '';
let transcriptLogChunk = 0;
const progressUpdateState = new Map<HomeMode, { at: number; key: string }>();
const helpUrl = 'https://github.com/hajdaini/voclyra#readme';

export const setServerEnabled = (server: LocalServerName, enabled: boolean, notifyRenderer = true): void => {
  if (enabled && ((server === 'audio' && !settings.useLocalSpeechRuntime) || (server === 'llm' && !settings.useLocalImproveRuntime))) {
    return;
  }
  serverEnabledState[server] = enabled;
  if (!enabled && server === 'audio') {
    whisperService.stopServer();
  }
  if (!enabled && server === 'llm') {
    llamaService.stopServer();
  }
  updateTray(settings, {
    audioEnabled: serverEnabledState.audio,
    llmEnabled: serverEnabledState.llm,
  });
  if (notifyRenderer) {
    sendServerEnabledChanged(server, enabled);
  }
};

const mainActionLockState = () => ({
  speakRecording: false,
  speakProcessing: false,
  improveProcessing: improveShortcutRunning,
  improveLoading: false,
  transcriptRecording: false,
  transcriptProcessing: false,
  whisperLoading: false,
});

const ready = (
  text: string,
  message: string,
  durationMs?: number,
  metrics: Pick<ResultState, 'audioDurationMs' | 'tokensGenerated' | 'tokensPerSecond'> = {},
): ResultState => ({
  text,
  status: 'ready',
  message,
  durationMs,
  ...metrics,
});

const showImproveBlocked = (message: string): void => {
  setOverlayState(actionOverlay('improve', 'warning', [], {
    message,
    messageType: 'warning',
  }));
};

const showImproveProcessing = (): void => {
  setOverlayState(actionOverlay('improve', 'processing', [], {
    phase: 'thinking',
  }));
};

const showProcessingProgress = (
  mode: HomeMode,
  progress: Pick<OverlayState, 'phase' | 'progress' | 'tokensGenerated' | 'progressLabel'>,
): void => {
  const key = `${progress.progress ?? ''}:${progress.tokensGenerated ?? ''}:${progress.progressLabel ?? ''}`;
  const previous = progressUpdateState.get(mode);
  const now = Date.now();
  const previousPhase = previous?.key.split(':')[3];
  const phase = progress.phase ?? '';
  if (
    previous?.key === key ||
    (previous && previousPhase === phase && now - previous.at < 250 && progress.progress !== 100)
  ) {
    return;
  }
  progressUpdateState.set(mode, { at: now, key: `${key}:${phase}` });
  setOverlayState({
    active: true,
    mode,
    status: mode === 'improve' ? 'improving' : 'transcribing',
    phase: progress.phase ?? (mode === 'improve' ? 'generating' : 'transcribing'),
    actionPhase: 'processing',
    waveform: [],
    message: actionUi(mode, 'processing').message,
    messageType: 'info',
    ...progress,
  });
};

export const improveClipboardFromHotkey = async (): Promise<void> => {
  settings = await settingsService.get();
  if (settings.useLocalImproveRuntime && !serverEnabledState.llm) {
    showImproveBlocked('LLM server stopped.');
    return;
  }
  const blockMessage = actionBlockMessage('improve', mainActionLockState());
  if (blockMessage) {
    return;
  }
  improveShortcutRunning = true;
  try {
    const text = settings.improveSelectedText
      ? await readActiveSelection()
      : clipboard.readText();
    if (!text.trim()) {
      sendImproveResult(ready('', actionMessages.clipboardEmpty));
      return;
    }
    showImproveProcessing();
    const startedAt = performance.now();
    showProcessingProgress('improve', { phase: 'thinking' });
    const improved = settings.useLocalImproveRuntime
      ? await llamaService.improveText(
        llmModelService.modelPath(settings.llmModel),
        settings.correctionPrompt,
        text,
      )
      : await remoteOpenAiService.improveText(settings, text);
    const durationMs = elapsedMs(startedAt);
    if (!improved.text.trim()) {
      sendImproveResult(failed(new Error('Local AI returned an empty response.')));
      return;
    }
    clipboard.writeText(improved.text);
    if (settings.pasteAfterImprovement) {
      await activePasteService.paste();
    }
    await historyService.add({ kind: 'improvement', text: improved.text }, settings.maxHistoryItems);
    sendImproveResult(ready(improved.text, appMessages.copiedToClipboard, durationMs, {
      tokensGenerated: improved.tokensGenerated,
      tokensPerSecond: tokensPerSecond(improved),
    }));
  } catch (error) {
    sendImproveResult(failed(error));
  } finally {
    improveShortcutRunning = false;
  }
};

export const registerIpc = (): void => {
  ipcMain.handle(channels.settingsGet, async () => {
    settings = await settingsService.get();
    settings = { ...settings, startAtStartup: await startupService.enabled() };
    return settings;
  });

  ipcMain.handle(channels.settingsSave, async (_event, value: unknown) => {
    const nextSettings = settingsSchema.parse(value);
    const previousSettings = settings;
    const handlers = {
      speak: () => sendBackgroundAppAction('speak'),
      improveText: () => void improveClipboardFromHotkey(),
      transcript: () => sendBackgroundAppAction('transcript'),
    };
    const registration = hotkeyService.register(nextSettings, handlers);
    if (!registration.speak || !registration.improveText || !registration.transcript) {
      hotkeyService.register(previousSettings, handlers);
      return previousSettings;
    }
    const savedSettings = await settingsService.save(nextSettings);
    settings = savedSettings;
    if (!savedSettings.useLocalSpeechRuntime) {
      setServerEnabled('audio', false);
    }
    if (!savedSettings.useLocalImproveRuntime) {
      setServerEnabled('llm', false);
    }
    await startupService.apply(savedSettings.startAtStartup);
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

  ipcMain.handle(channels.appOpenHelp, async () => {
    await shell.openExternal(helpUrl);
  });

  ipcMain.handle(channels.appImportAudio, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Import audio',
      properties: ['openFile'],
      filters: [{ name: 'WAV audio', extensions: ['wav'] }],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) {
      return null;
    }
    const audio = await readFile(filePath);
    if (!isWavAudio(audio)) {
      throw new Error('Unsupported audio format. Please choose a WAV file.');
    }
    if (audio.byteLength === 0) {
      throw new Error('Audio file is empty.');
    }
    return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
  });

  ipcMain.handle(channels.appQuit, () => {
    app.isQuitting = true;
    app.quit();
  });

  ipcMain.handle(channels.modelsListLlm, () => llmModelService.downloadedModelNames());

  ipcMain.handle(channels.whisperListModels, async () => {
    const [downloadedModels, discoveredModels] = await Promise.all([
      whisperModelService.downloadedModelNames(),
      whisperService.listModels(),
    ]);
    return [...new Set([...downloadedModels, ...discoveredModels])].sort((a, b) => a.localeCompare(b));
  });

  ipcMain.handle(channels.whisperAvailableModels, () => whisperModelService.availableModels());

  ipcMain.handle(channels.whisperRuntimeInfo, () => whisperService.runtimeInfo());

  ipcMain.handle(channels.whisperWarmup, async (_event, value: unknown) => {
    const model = typeof value === 'string' ? value : '';
    const models = await whisperModelService.downloadedModelNames();
    if (!model || !models.includes(model)) {
      return;
    }
    await whisperService.warmup(model);
  });

  ipcMain.handle(channels.whisperStopServer, () => {
    whisperService.stopServer();
  });

  ipcMain.handle(channels.llmAvailableModels, () => llmModelService.availableModels());

  ipcMain.handle(channels.llmRuntimeInfo, () => llamaService.runtimeInfo());

  ipcMain.handle(channels.llmWarmup, async (_event, value: unknown) => {
    const model = typeof value === 'string' ? value : '';
    const models = await llmModelService.downloadedModelNames();
    if (!model || !models.includes(model)) {
      return;
    }
    await llamaService.warmup(llmModelService.modelPath(model));
  });

  ipcMain.handle(channels.llmStopServer, () => {
    llamaService.stopServer();
  });

  ipcMain.handle(channels.serverSetEnabled, (_event, value: unknown) => {
    const nextState = serverEnabledSchema.parse(value);
    if (nextState.enabled && ((nextState.server === 'audio' && !settings.useLocalSpeechRuntime) || (nextState.server === 'llm' && !settings.useLocalImproveRuntime))) {
      throw new Error('Local runtime is disabled.');
    }
    setServerEnabled(nextState.server, nextState.enabled, false);
  });

  ipcMain.handle(channels.remoteTestSpeech, async () => {
    settings = await settingsService.get();
    await remoteOpenAiService.testSpeech(settings);
  });

  ipcMain.handle(channels.remoteTestImprove, async () => {
    settings = await settingsService.get();
    await remoteOpenAiService.testImprove(settings);
  });

  ipcMain.handle(channels.hardwareInfo, () => hardwareService.info());

  ipcMain.handle(channels.hardwareUsage, () => hardwareService.usage());

  ipcMain.handle(channels.llmDownloadModel, (event, value: unknown) => {
    const id = llmModelIdSchema.parse(value);
    return llmModelService.downloadModel(id, (progress) => {
      event.sender.send(channels.llmDownloadProgress, progress);
    });
  });

  ipcMain.handle(channels.llmDownloadCustomModel, (event, value: unknown) => {
    const parsed = customModelUrlSchema.safeParse(value);
    if (!parsed.success || customLlmModelUrlError(parsed.data)) {
      return llmModelService.availableModels();
    }
    const url = parsed.data;
    return llmModelService.downloadCustomModel(url, (progress) => {
      event.sender.send(channels.llmDownloadProgress, progress);
    });
  });

  ipcMain.handle(channels.llmDeleteModel, (_event, value: unknown) => {
    const id = llmDeleteModelIdSchema.parse(value);
    return llmModelService.deleteModel(id);
  });

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
    if (settings.useLocalSpeechRuntime && !(await selectedWhisperModel())) {
      return ready('', 'Select a Whisper model first.');
    }
    try {
      const startedAt = performance.now();
      const audioDurationMs = wavDurationMs(audio);
      const text = singleLineText(settings.useLocalSpeechRuntime
        ? await transcribeSpeakLocal(audio)
        : await remoteOpenAiService.transcribe(audio, settings));
      const durationMs = elapsedMs(startedAt);
      if (!text.trim()) {
        return ready('', 'No speech detected.', durationMs, { audioDurationMs });
      }
      clipboard.writeText(text);
      if (settings.pasteAfterDictation) {
        await activePasteService.paste();
      }
      await historyService.add({ kind: 'dictation', text, audio }, settings.maxHistoryItems);
      return ready(text, appMessages.copiedToClipboard, durationMs, { audioDurationMs });
    } catch (error) {
      return failed(error);
    }
  });

  ipcMain.handle(channels.dictationStop, () => ready('', 'Speak stopped.'));

  ipcMain.handle(channels.audioCaptureStart, async (event, value: unknown) => {
    if (value !== 'speak' && value !== 'transcript') {
      throw new Error('Invalid audio capture mode.');
    }
    settings = await settingsService.get();
    if (value === 'transcript') {
      await resetTranscriptLog('live transcript', settings);
    }
    await audioCaptureHelperService.start(value, settings, (source, level) => {
      event.sender.send(channels.audioCaptureLevel, { mode: value, source, level });
    });
  });

  ipcMain.handle(channels.audioCaptureSwitch, async (_event, value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('mode' in value) ||
      !('source' in value) ||
      (value.mode !== 'speak' && value.mode !== 'transcript') ||
      (value.source !== 'input' && value.source !== 'output')
    ) {
      throw new Error('Invalid audio capture switch.');
    }
    settings = await settingsService.get();
    await audioCaptureHelperService.switchSource(value.mode, value.source, settings);
  });

  ipcMain.handle(channels.audioCaptureStop, async (_event, value: unknown) => {
    if (value !== 'speak' && value !== 'transcript') {
      throw new Error('Invalid audio capture mode.');
    }
    const audio = await audioCaptureHelperService.stop(value);
    return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
  });

  ipcMain.handle(channels.audioCaptureStopTranscript, async () => {
    const { audio, finalSegmentAudio } = await audioCaptureHelperService.stopTranscript();
    return {
      audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
      finalSegmentAudio: finalSegmentAudio.buffer.slice(
        finalSegmentAudio.byteOffset,
        finalSegmentAudio.byteOffset + finalSegmentAudio.byteLength,
      ),
    };
  });

  ipcMain.handle(channels.audioCaptureCancel, async (_event, value: unknown) => {
    if (value === 'speak' || value === 'transcript') {
      await audioCaptureHelperService.cancel(value);
    }
  });

  ipcMain.handle(channels.audioCapturePreviewChunk, async (_event, value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('mode' in value) ||
      !('chunkMs' in value) ||
      (value.mode !== 'speak' && value.mode !== 'transcript') ||
      typeof value.chunkMs !== 'number'
    ) {
      return null;
    }
    const audio = await audioCaptureHelperService.previewChunk(value.mode, value.chunkMs);
    return audio ? audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) : null;
  });

  ipcMain.handle(channels.transcriptStart, async (event, value: unknown) => {
    const input = transcriptInput(value);
    if (!input) {
      return ready('', 'No audio captured.');
    }
    const audio = new Uint8Array(input.audio);
    if (audio.byteLength === 0) {
      return ready('', 'No audio captured.');
    }
    if (settings.useLocalSpeechRuntime && !(await selectedWhisperModel())) {
      return ready('', 'Select a Whisper model first.');
    }
    const progressive = input.progressive;
    try {
      await resetTranscriptLog('full transcript', settings);
      const startedAt = performance.now();
      const audioDurationMs = wavDurationMs(audio);
      const text = settings.useLocalSpeechRuntime
        ? await transcribeMeetingLocal(audio, progressive, (partialText) => {
          event.sender.send(channels.transcriptPartial, partialText);
        })
        : await remoteOpenAiService.transcribe(audio, settings);
      const durationMs = elapsedMs(startedAt);
      if (!text.trim()) {
        return ready('', 'No speech detected.', durationMs, { audioDurationMs });
      }
      await historyService.add({ kind: 'transcript', text, audio }, settings.maxHistoryItems);
      return ready(text, 'Transcript generated.', durationMs, { audioDurationMs });
    } catch (error) {
      return failed(error);
    }
  });

  ipcMain.handle(channels.transcriptPreview, async (_event, value: unknown) => {
    const audio = value instanceof ArrayBuffer ? new Uint8Array(value) : null;
    if (!audio || audio.byteLength === 0) {
      return '';
    }
    if (!settings.useLocalSpeechRuntime) {
      return remoteOpenAiService.transcribe(audio, settings);
    }
    const whisperModel = await selectedWhisperModel();
    if (!whisperModel) {
      return '';
    }
    const chunkIndex = nextTranscriptLogChunk();
    const startedAt = performance.now();
    const debug = await whisperService.transcribeMeetingDetailed(audio, whisperModel, {
      timeoutMs: null,
      debugName: 'transcript',
    });
    const text = debug.text;
    const diagnostics = debug.diagnostics;
    await appendTranscriptLog([
      '',
      `[CHUNK ${chunkIndex}]`,
      `duration ms: ${elapsedMs(startedAt)}`,
      `audio bytes: ${audio.byteLength}`,
      `audio duration ms: ${wavDurationMs(audio) ?? 'unknown'}`,
      `output chars: ${text.length}`,
      '',
      '[SERVER PROCESS]',
      'engine: whisper',
      `executable: ${diagnostics.executable}`,
      `args: ${quoteArgs(diagnostics.args)}`,
      `pid: ${diagnostics.pid ?? 'unknown'}`,
      `host: ${diagnostics.host}`,
      `port: ${diagnostics.port}`,
      `url: ${diagnostics.url}`,
      `server reused: ${yesNo(diagnostics.serverReused)}`,
      `server started during action: ${yesNo(diagnostics.serverStartedDuringAction)}`,
      `startup duration ms: ${diagnostics.startupDurationMs}`,
      `alive before request: ${yesNo(diagnostics.aliveBeforeRequest)}`,
      `alive after request: ${yesNo(diagnostics.aliveAfterRequest)}`,
      '',
      '[SERVER STDOUT RAW TAIL]',
      diagnostics.stdoutTail || 'empty',
      '',
      '[SERVER STDERR RAW TAIL]',
      diagnostics.stderrTail || 'empty',
      '',
      '[CLIENT REQUEST]',
      `method: ${diagnostics.method}`,
      `endpoint: ${diagnostics.endpoint}`,
      `timeout ms: ${diagnostics.timeoutMs}`,
      `request started at: ${diagnostics.requestStartedAt}`,
      `request finished at: ${diagnostics.requestFinishedAt}`,
      `request duration ms: ${diagnostics.requestDurationMs}`,
      `http status: ${diagnostics.httpStatus ?? 'unknown'}`,
      `http status text: ${diagnostics.httpStatusText}`,
      `content type: ${diagnostics.contentType}`,
      `request bytes: ${diagnostics.requestBytes}`,
      `response bytes: ${diagnostics.responseBytes}`,
      '',
      '[WHISPER]',
      `model: ${whisperModel}`,
      `language: ${settings.whisperLanguage}`,
      `quality: ${settings.whisperQualityMode}`,
      `sample rate: ${debug.wavInfo?.sampleRate ?? 'unknown'}`,
      `channels: ${debug.wavInfo?.channels ?? 'unknown'}`,
      `bits per sample: ${debug.wavInfo?.bitsPerSample ?? 'unknown'}`,
      '',
      '[HTTP RAW RESPONSE TAIL]',
      diagnostics.rawResponseTail || 'empty',
      '[RAW TEXT]',
      text || 'empty',
    ]);
    return text;
  });

  ipcMain.handle(channels.transcriptSave, async (_event, value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('audio' in value) ||
      !('text' in value) ||
      !(value.audio instanceof ArrayBuffer) ||
      typeof value.text !== 'string'
    ) {
      return ready('', 'No transcript generated.');
    }
    const audio = new Uint8Array(value.audio);
    const text = textSchema.parse(value.text).trim();
    if (!audio.byteLength || !text) {
      return ready('', 'No speech detected.');
    }
    if (settings.useLocalSpeechRuntime) {
      await appendTranscriptLog([
      '',
      '[FINAL]',
      `audio bytes: ${audio.byteLength}`,
      `audio duration ms: ${wavDurationMs(audio) ?? 'unknown'}`,
      `text chars: ${text.length}`,
      '[FINAL TEXT]',
      text || 'empty',
      ]);
    }
    await historyService.add({ kind: 'transcript', text, audio }, settings.maxHistoryItems);
    return ready(text, 'Transcript generated.', undefined, { audioDurationMs: wavDurationMs(audio) });
  });

  ipcMain.handle(channels.textImprove, async (_event, value: unknown) => {
    const blockMessage = actionBlockMessage('improve', mainActionLockState());
    if (blockMessage) {
      showImproveBlocked(blockMessage);
      return ready('', blockMessage);
    }
    const text = textSchema.parse(value);
    if (!text.trim()) {
      return ready('', actionMessages.enterTextToImprove);
    }
    improveShortcutRunning = true;
    try {
      const startedAt = performance.now();
      showProcessingProgress('improve', { phase: 'thinking' });
      const improved = settings.useLocalImproveRuntime
        ? await llamaService.improveText(
          llmModelService.modelPath(settings.llmModel),
          settings.correctionPrompt,
          text,
        )
        : await remoteOpenAiService.improveText(settings, text);
      const durationMs = elapsedMs(startedAt);
      if (!improved.text.trim()) {
        return failed(new Error('Local AI returned an empty response.'));
      }
      clipboard.writeText(improved.text);
      if (settings.pasteAfterImprovement) {
        await activePasteService.paste();
      }
      await historyService.add({ kind: 'improvement', text: improved.text }, settings.maxHistoryItems);
      return ready(improved.text, appMessages.copiedToClipboard, durationMs, {
        tokensGenerated: improved.tokensGenerated,
        tokensPerSecond: tokensPerSecond(improved),
      });
    } catch (error) {
      return failed(error);
    } finally {
      improveShortcutRunning = false;
    }
  });

  ipcMain.handle(channels.textExport, async (event, value: unknown) => {
    const text = textSchema.parse(value);
    if (!text) {
      return false;
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export text',
      defaultPath: 'voclyra-result.txt',
      filters: [{ name: 'Text files', extensions: ['txt'] }],
    };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return false;
    }
    await writeFile(result.filePath, text, 'utf8');
    return true;
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

  ipcMain.handle(channels.historyAudio, async (_event, value: unknown) => {
    const id = idSchema.parse(value);
    const audio = await historyService.audio(id);
    return audio ? audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) : null;
  });

  ipcMain.handle(channels.historyExportText, async (event, value: unknown) => {
    const id = idSchema.parse(value);
    const entry = (await historyService.list()).find((item) => item.id === id);
    if (!entry) {
      throw new Error('History entry not found.');
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export text',
      defaultPath: `${safeFileName(entry.title)}.txt`,
      filters: [{ name: 'Text files', extensions: ['txt'] }],
    };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return false;
    }
    await writeFile(result.filePath, entry.text, 'utf8');
    return true;
  });

  ipcMain.handle(channels.overlaySetState, (_event, value: unknown) => {
    setOverlayState(overlayStateSchema.parse(value));
  });

  ipcMain.handle(channels.overlayGetState, (_event, value: unknown) => {
    const mode =
      value === 'improve' || value === 'transcript' || value === 'additional-info' ? value : 'speak';
    return getOverlayState(mode);
  });

  ipcMain.handle(channels.overlayContentSize, (_event, value: unknown) => {
    if (
      value &&
      typeof value === 'object' &&
      'mode' in value &&
      'size' in value &&
      (value.mode === 'speak' ||
        value.mode === 'improve' ||
        value.mode === 'transcript' ||
        value.mode === 'additional-info') &&
      value.size &&
      typeof value.size === 'object' &&
      'width' in value.size &&
      'height' in value.size &&
      typeof value.size.width === 'number' &&
      typeof value.size.height === 'number'
    ) {
      resizeOverlayToContent(value.mode, {
        width: Math.ceil(value.size.width),
        height: Math.ceil(value.size.height),
      });
    }
  });

  ipcMain.handle(channels.overlayStopSpeak, (_event, value: unknown) => {
    const mode = value === 'transcript' ? value : 'speak';
    stopFromOverlay(mode);
  });

  ipcMain.handle(channels.overlayCancelRecording, (_event, value: unknown) => {
    if (value === 'speak' || value === 'transcript') {
      cancelRecordingFromOverlay(value);
    }
  });

  ipcMain.handle(channels.overlayOpenSettings, () => {
    openSection('settings');
  });

  ipcMain.handle(channels.overlayDismiss, (_event, value: unknown) => {
    const mode =
      value === 'improve' || value === 'transcript' || value === 'additional-info' ? value : 'speak';
    dismissOverlay(mode);
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

const selectedWhisperModel = async (): Promise<string> => {
  const whisperModels = await whisperModelService.downloadedModelNames();
  return whisperModels.includes(settings.whisperModel)
    ? settings.whisperModel
    : whisperModels[0] ?? '';
};

const transcribeSpeakLocal = async (audio: Uint8Array): Promise<string> => {
  const whisperModel = await selectedWhisperModel();
  if (!whisperModel) {
    throw new Error('Select a Whisper model first.');
  }
  return whisperService.transcribe(audio, whisperModel, {
    debugName: 'speak',
    onProgress: (progress) => {
      showProcessingProgress('speak', { phase: 'transcribing', progress });
    },
  });
};

const transcribeMeetingLocal = async (
  audio: Uint8Array,
  progressive: boolean,
  onPartial: (text: string) => void,
): Promise<string> => {
  const whisperModel = await selectedWhisperModel();
  if (!whisperModel) {
    throw new Error('Select a Whisper model first.');
  }
  return whisperService.transcribeMeeting(audio, whisperModel, {
    timeoutMs: null,
    debugName: 'transcript',
    progressive,
    onProgress: (progress, label) => {
      showProcessingProgress('transcript', { phase: 'transcribing', progress, progressLabel: label });
    },
    onPartial,
  });
};

const singleLineText = (text: string): string => text.replace(/\s*\r?\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

const transcriptInput = (value: unknown): { audio: ArrayBuffer; progressive: boolean } | null => {
  if (value instanceof ArrayBuffer) {
    return { audio: value, progressive: false };
  }
  if (
    value &&
    typeof value === 'object' &&
    'audio' in value &&
    value.audio instanceof ArrayBuffer
  ) {
    return {
      audio: value.audio,
      progressive: 'progressive' in value && value.progressive === true,
    };
  }
  return null;
};

const isWavAudio = (audio: Uint8Array): boolean => {
  if (audio.byteLength < 12) {
    return false;
  }
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  return readAscii(view, 0, 4) === 'RIFF' && readAscii(view, 8, 4) === 'WAVE';
};

const safeFileName = (name: string): string => {
  const fileName = name.replace(/\.{3,}$/g, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim();
  return fileName.slice(0, 80) || 'voclyra-export';
};

const elapsedMs = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const quoteArgs = (args: string[]): string => args.map((part) => `"${part}"`).join(' ');

const yesNo = (value: boolean): string => (value ? 'yes' : 'no');

const tokensPerSecond = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object' || !('tokensPerSecond' in value)) {
    return undefined;
  }
  return typeof value.tokensPerSecond === 'number' ? value.tokensPerSecond : undefined;
};

const resetTranscriptLog = async (reason: string, currentSettings: Settings): Promise<void> => {
  transcriptLogSessionId = randomUUID();
  transcriptLogChunk = 0;
  await transcriptLogService.writeSnapshot('transcript.log', [
    '[TRANSCRIPT SESSION]',
    `session id: ${transcriptLogSessionId}`,
    `reason: ${reason}`,
    `whisper model: ${currentSettings.whisperModel || 'empty'}`,
    `whisper language: ${currentSettings.whisperLanguage}`,
    `whisper quality: ${currentSettings.whisperQualityMode}`,
    `chunk seconds: ${currentSettings.transcriptLiveChunkSeconds}`,
    'silence seconds: 0.4',
  ]);
};

const nextTranscriptLogChunk = (): number => {
  transcriptLogChunk += 1;
  return transcriptLogChunk;
};

const appendTranscriptLog = async (lines: string[]): Promise<void> => {
  if (!transcriptLogSessionId) {
    await resetTranscriptLog('transcript debug', settings);
  }
  await transcriptLogService.append('transcript.log', [
    `session id: ${transcriptLogSessionId}`,
    ...lines,
  ]);
};

const wavDurationMs = (audio: Uint8Array): number | undefined => {
  if (audio.byteLength < 44) {
    return undefined;
  }
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    return undefined;
  }
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataSize = 0;
  while (offset + 8 <= audio.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ' && offset + 24 <= audio.byteLength) {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    }
    if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (!channels || !sampleRate || !bitsPerSample || !dataSize) {
    return undefined;
  }
  const bytesPerFrame = channels * (bitsPerSample / 8);
  return Math.round((dataSize / bytesPerFrame / sampleRate) * 1000);
};

const readAscii = (view: DataView, offset: number, length: number): string => {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
};

const readActiveSelection = async (): Promise<string> => {
  const previousText = clipboard.readText();
  const sentinel = `__VOCLYRA_SELECTION_${randomUUID()}__`;
  clipboard.writeText(sentinel);
  await activePasteService.copySelection();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const selectedText = clipboard.readText();
  if (selectedText === sentinel || !selectedText.trim()) {
    clipboard.writeText(previousText);
    return previousText;
  }
  return selectedText;
};
