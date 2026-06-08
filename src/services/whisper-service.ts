import { access, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { cpus, homedir } from 'node:os';
import { AppStorage } from '@storage/app-storage';
import { ProcessLogService } from '@services/process-log-service';
import { appStorageConfig, whisperCudaRuntimeVersionConfig, whisperRuntimeConfig } from '@shared/GlobalVars';
import { errorDiagnostics } from '@services/debug-log-buffer';
import { RuntimePathService } from '@services/runtime-path-service';
import { SettingsService } from '@services/settings-service';
import {
  whisperServerDiagnosticsFromError,
  whisperServerService,
  type WhisperServerDiagnostics,
  type WhisperServerResult,
} from '@services/whisper-server-service';
import type { LanguageMode, Settings, SilenceSensitivity, WhisperRuntimeInfo } from '@shared/types';

type TranscribeOptions = {
  timeoutMs?: number | null;
  debugName?: string;
  onProgress?: (progress?: number, label?: string) => void;
  onPartial?: (text: string) => void;
  progressive?: boolean;
};

type WavInfo = {
  dataOffset: number;
  dataSize: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

type SpeechRange = {
  startFrame: number;
  endFrame: number;
};

export class WhisperService {
  private readonly storage = new AppStorage();
  private readonly logger = new ProcessLogService();
  private readonly runtimePaths = new RuntimePathService();
  private readonly server = whisperServerService;
  private readonly settingsService = new SettingsService();

  async listModels(): Promise<string[]> {
    const roots = this.modelRoots();
    const files = await Promise.all(roots.map((root) => this.findModelFiles(root, 0)));
    return [...new Set(files.flat().map((file) => basename(file)))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  async runtimeInfo(): Promise<WhisperRuntimeInfo> {
    const executablePath = await this.executablePath();
    return {
      runtimeAvailable: await this.exists(executablePath),
    };
  }

  async warmup(modelFileName: string): Promise<void> {
    const modelPath = await this.modelPath(modelFileName);
    const executable = await this.executablePath();
    const settings = await this.settingsService.get();
    await this.server.warmup(executable, modelPath, {
      language: whisperLanguage(settings.whisperLanguage),
      threads: whisperThreadCount(),
      qualityArgs: whisperQualityArgs(settings.whisperQualityMode),
    });
  }

  private modelRoots(): string[] {
    return [join(homedir(), appStorageConfig.directoryName, 'models', 'whisper')];
  }

  private async findModelFiles(root: string, depth: number): Promise<string[]> {
    if (depth > 5) {
      return [];
    }

    try {
      const entries = await readdir(root, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => join(root, entry.name))
        .filter((file) => /\.(bin|gguf)$/i.test(file))
        .filter((file) => /whisper|ggml|large|medium|small|base|tiny/i.test(file))
        .filter((file) => !/^for-tests-/i.test(basename(file)));
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .filter((entry) => /whisper|models|snapshots|ggml|Systran/i.test(entry.name))
        .map((entry) => join(root, entry.name));
      const children = await Promise.all(
        directories.map((directory) => this.findModelFiles(directory, depth + 1)),
      );
      return [...files, ...children.flat()];
    } catch {
      return [];
    }
  }

  async transcribe(audio: Uint8Array, modelFileName: string, options: TranscribeOptions = {}): Promise<string> {
    const startedAt = Date.now();
    const modelPath = await this.modelPath(modelFileName);
    const id = crypto.randomUUID();
    const temporaryRoot = await this.storage.ensureDir('tmp', 'current', id);
    const serverDiagnostics: WhisperServerDiagnostics[] = [];
    let settings: Settings | null = null;
    let segments: Uint8Array[] = [];
    const wavInfo = this.wavInfo(audio);

    try {
      settings = await this.settingsService.get();
      segments = this.speechSegments(audio, settings.silenceSensitivity);
      if (segments.length === 0) {
        this.writeWhisperLog({
          fileName: this.logFileName(options.debugName),
          actionType: this.actionType(options.debugName),
          status: 'no speech',
          startedAt,
          durationMs: Math.max(1, Date.now() - startedAt),
          modelPath,
          audio,
          wavInfo,
          settings,
          segments,
          serverDiagnostics,
          serverCalled: false,
        });
        return '';
      }
      if (segments.length > 0) {
        const texts: string[] = [];
        for (let index = 0; index < segments.length; index += 1) {
          const segment = segments[index];
          if (!segment) {
            continue;
          }
          const segmentId = `${id}-segment-${index}`;
          const segmentPath = join(temporaryRoot, `${segmentId}.wav`);
          await writeFile(segmentPath, segment);
          const result = await this.transcribeWithServer(
            modelPath,
            segment,
            options.timeoutMs,
          );
          serverDiagnostics.push(result.diagnostics);
          const text = result.text;
          if (text) {
            texts.push(text);
          }
        }
        const text = texts.join('\n').trim();
        this.writeWhisperLog({
          fileName: this.logFileName(options.debugName),
          actionType: this.actionType(options.debugName),
          status: 'success',
          startedAt,
          durationMs: Math.max(1, Date.now() - startedAt),
          modelPath,
          audio,
          wavInfo,
          settings,
          segments,
          serverDiagnostics,
          serverCalled: true,
          outputText: text,
        });
        return text;
      }
      return '';
    } catch (error) {
      const diagnostics = whisperServerDiagnosticsFromError(error);
      if (diagnostics) {
        serverDiagnostics.push(diagnostics);
      }
      this.writeWhisperLog({
        fileName: this.logFileName(options.debugName),
        actionType: this.actionType(options.debugName),
        status: 'error',
        startedAt,
        durationMs: Math.max(1, Date.now() - startedAt),
        modelPath,
        audio,
        wavInfo,
        settings,
        segments,
        serverDiagnostics,
        serverCalled: serverDiagnostics.length > 0,
        error,
      });
      throw error;
    } finally {
      await this.cleanupTemporaryFiles(temporaryRoot);
    }
  }

  async transcribeFile(audioPath: string, modelFileName: string, options: TranscribeOptions = {}): Promise<string> {
    const modelPath = await this.modelPath(modelFileName);
    const id = crypto.randomUUID();
    const temporaryRoot = await this.storage.ensureDir('tmp', 'current', id);

    try {
      await access(audioPath);
      const audio = await readFile(audioPath);
      const settings = await this.settingsService.get();
      const segments = this.speechSegments(audio, settings.silenceSensitivity);
      if (segments.length === 0) {
        return '';
      }
      const texts: string[] = [];
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) {
          continue;
        }
        const segmentId = `${id}-segment-${index}`;
        const segmentPath = join(temporaryRoot, `${segmentId}.wav`);
        await writeFile(segmentPath, segment);
        const result = await this.transcribeWithServer(
          modelPath,
          segment,
          options.timeoutMs,
        );
        const text = result.text;
        if (text) {
          texts.push(text);
        }
      }
      return texts.join('\n').trim();
    } finally {
      await this.cleanupTemporaryFiles(temporaryRoot);
    }
  }

  async transcribeMeeting(audio: Uint8Array, modelFileName: string, options: TranscribeOptions = {}): Promise<string> {
    const modelPath = await this.modelPath(modelFileName);
    const id = crypto.randomUUID();
    const temporaryRoot = await this.storage.ensureDir('tmp', 'current', id);

    try {
      return await this.transcribeMeetingAudio(
        audio,
        modelPath,
        temporaryRoot,
        id,
        options.timeoutMs,
        options.debugName,
        options.onProgress,
        options.onPartial,
        Boolean(options.progressive),
      );
    } finally {
      await this.cleanupTemporaryFiles(temporaryRoot);
    }
  }

  private async transcribeMeetingAudio(
    audio: Uint8Array,
    modelPath: string,
    temporaryRoot: string,
    id: string,
    timeoutMs: number | null | undefined,
    debugName?: string,
    onProgress?: (progress?: number, label?: string) => void,
    onPartial?: (text: string) => void,
    progressive = false,
  ): Promise<string> {
    void temporaryRoot;
    void id;
    void debugName;
    if (progressive) {
      return this.transcribeMeetingAudioProgressive(audio, modelPath, timeoutMs, onProgress, onPartial);
    }
    const result = await this.transcribeWithServer(
      modelPath,
      audio,
      timeoutMs,
    );
    return result.text;
  }

  private async transcribeMeetingAudioProgressive(
    audio: Uint8Array,
    modelPath: string,
    timeoutMs: number | null | undefined,
    onProgress?: (progress?: number, label?: string) => void,
    onPartial?: (text: string) => void,
  ): Promise<string> {
    const chunks = this.meetingChunks(audio);
    if (chunks.length <= 1) {
      const result = await this.transcribeWithServer(modelPath, audio, timeoutMs);
      return result.text;
    }

    let text = '';
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (!chunk) {
        continue;
      }
      onProgress?.(undefined, `Transcribing part ${index + 1}/${chunks.length}`);
      const result = await this.transcribeWithServer(modelPath, chunk, timeoutMs);
      text = mergeTranscriptText(text, result.text);
      if (text) {
        onPartial?.(text);
      }
    }
    onProgress?.(undefined, 'Finalizing transcript');
    return text.trim();
  }

  private meetingChunks(audio: Uint8Array): Uint8Array[] {
    const info = this.wavInfo(audio);
    if (!info || info.bitsPerSample !== 16) {
      return [audio];
    }

    const frames = Math.floor(info.dataSize / (info.channels * 2));
    const chunkFrames = Math.round(info.sampleRate * 75);
    const overlapFrames = Math.round(info.sampleRate * 8);
    if (frames <= chunkFrames) {
      return [audio];
    }

    const chunks: Uint8Array[] = [];
    let startFrame = 0;
    while (startFrame < frames) {
      const endFrame = Math.min(startFrame + chunkFrames, frames);
      chunks.push(this.wavSlice(audio, info, { startFrame, endFrame }));
      if (endFrame === frames) {
        break;
      }
      startFrame = Math.max(startFrame + 1, endFrame - overlapFrames);
    }
    return chunks;
  }

  private async transcribeWithServer(
    modelPath: string,
    audio: Uint8Array,
    timeoutMs: number | null | undefined,
  ): Promise<WhisperServerResult> {
    const executable = await this.executablePath();
    const settings = await this.settingsService.get();
    return this.server.transcribe(executable, modelPath, audio, {
      language: whisperLanguage(settings.whisperLanguage),
      threads: whisperThreadCount(),
      qualityArgs: whisperQualityArgs(settings.whisperQualityMode),
      timeoutMs,
    });
  }

  private async modelPath(modelFileName: string): Promise<string> {
    if (!/^[\w.-]+\.(bin|gguf)$/i.test(modelFileName)) {
      throw new Error('Invalid Whisper model.');
    }

    const roots = this.modelRoots();
    const files = await Promise.all(roots.map((root) => this.findModelFiles(root, 0)));
    const match = files.flat().find((file) => basename(file) === modelFileName);

    if (!match) {
      throw new Error('Whisper model file not found.');
    }

    return match;
  }

  private async executablePath(): Promise<string> {
    const runtime = await this.runtimePaths.selectCudaRuntime(
      whisperRuntimeConfig.engineDirectory,
      whisperCudaRuntimeVersionConfig,
      whisperRuntimeConfig.platformDirectory,
      whisperRuntimeConfig.executableName,
    );
    return runtime.path;
  }


  private speechSegments(audio: Uint8Array, sensitivity: SilenceSensitivity): Uint8Array[] {
    const info = this.wavInfo(audio);
    if (!info || info.bitsPerSample !== 16) {
      return [audio];
    }

    const ranges = this.detectSpeechRanges(audio, info, sensitivity);
    if (ranges.length === 0) {
      return [];
    }

    return this.expandSpeechRanges(ranges, info)
      .flatMap((range) => this.splitLongRange(range, info))
      .map((range) => this.wavSlice(audio, info, range));
  }

  private wavInfo(audio: Uint8Array): WavInfo | null {
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
    if (this.readAscii(view, 0, 4) !== 'RIFF' || this.readAscii(view, 8, 4) !== 'WAVE') {
      return null;
    }

    let offset = 12;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let dataOffset = 0;
    let dataSize = 0;

    while (offset + 8 <= audio.byteLength) {
      const chunkId = this.readAscii(view, offset, 4);
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 'fmt ' && offset + 24 <= audio.byteLength) {
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      }
      if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (!channels || !sampleRate || !bitsPerSample || !dataOffset || !dataSize) {
      return null;
    }

    return { dataOffset, dataSize, sampleRate, channels, bitsPerSample };
  }

  private detectSpeechRanges(audio: Uint8Array, info: WavInfo, sensitivity: SilenceSensitivity): SpeechRange[] {
    const frameSamples = Math.max(1, Math.round(info.sampleRate * 0.03));
    const samples = Math.floor(info.dataSize / (info.channels * 2));
    const levels: number[] = [];

    for (let start = 0; start < samples; start += frameSamples) {
      const end = Math.min(start + frameSamples, samples);
      levels.push(this.rms(audio, info, start, end));
    }

    const peak = Math.max(...levels, 0);
    if (peak < 0.003) {
      return [];
    }

    const sorted = [...levels].sort((left, right) => left - right);
    const noise = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
    const config = silenceSensitivityConfig[sensitivity];
    const threshold = Math.max(
      config.minimumThreshold,
      Math.min(0.035, noise * config.noiseMultiplier),
      peak * config.peakMultiplier,
    );
    const minSpeechFrames = Math.max(1, Math.round(0.18 / 0.03));
    const minSilenceFrames = Math.max(1, Math.round(config.minSilenceSeconds / 0.03));
    const ranges: SpeechRange[] = [];
    let startFrame = -1;
    let silenceFrames = 0;

    for (let index = 0; index < levels.length; index += 1) {
      if ((levels[index] ?? 0) >= threshold) {
        if (startFrame < 0) {
          startFrame = index;
        }
        silenceFrames = 0;
        continue;
      }

      if (startFrame < 0) {
        continue;
      }

      silenceFrames += 1;
      if (silenceFrames >= minSilenceFrames) {
        const endFrame = index - silenceFrames + 1;
        if (endFrame - startFrame >= minSpeechFrames) {
          ranges.push({ startFrame: startFrame * frameSamples, endFrame: endFrame * frameSamples });
        }
        startFrame = -1;
        silenceFrames = 0;
      }
    }

    if (startFrame >= 0 && levels.length - startFrame >= minSpeechFrames) {
      ranges.push({ startFrame: startFrame * frameSamples, endFrame: samples });
    }

    return ranges;
  }

  private rms(audio: Uint8Array, info: WavInfo, startFrame: number, endFrame: number): number {
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
    let sum = 0;
    let count = 0;
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      for (let channel = 0; channel < info.channels; channel += 1) {
        const offset = info.dataOffset + (frame * info.channels + channel) * 2;
        if (offset + 2 > audio.byteLength) {
          continue;
        }
        const sample = view.getInt16(offset, true) / 32768;
        sum += sample * sample;
        count += 1;
      }
    }
    return count > 0 ? Math.sqrt(sum / count) : 0;
  }

  private expandSpeechRanges(ranges: SpeechRange[], info: WavInfo): SpeechRange[] {
    const paddingFrames = Math.round(info.sampleRate * 0.55);
    const mergeGapFrames = Math.round(info.sampleRate * 0.85);
    const maxFrames = Math.floor(info.dataSize / (info.channels * 2));
    const expanded = ranges.map((range) => ({
      startFrame: Math.max(0, range.startFrame - paddingFrames),
      endFrame: Math.min(maxFrames, range.endFrame + paddingFrames),
    }));
    const merged: SpeechRange[] = [];

    for (const range of expanded) {
      const previous = merged.at(-1);
      if (previous && range.startFrame - previous.endFrame <= mergeGapFrames) {
        previous.endFrame = Math.max(previous.endFrame, range.endFrame);
        continue;
      }
      merged.push({ ...range });
    }

    return merged;
  }

  private splitLongRange(range: SpeechRange, info: WavInfo): SpeechRange[] {
    const maxFrames = info.sampleRate * 4;
    const overlapFrames = Math.round(info.sampleRate * 0.25);
    if (range.endFrame - range.startFrame <= maxFrames) {
      return [range];
    }

    const ranges: SpeechRange[] = [];
    let startFrame = range.startFrame;
    while (startFrame < range.endFrame) {
      const endFrame = Math.min(startFrame + maxFrames, range.endFrame);
      ranges.push({ startFrame, endFrame });
      if (endFrame === range.endFrame) {
        break;
      }
      startFrame = Math.max(startFrame + 1, endFrame - overlapFrames);
    }
    return ranges;
  }

  private wavSlice(audio: Uint8Array, info: WavInfo, range: SpeechRange): Uint8Array {
    const bytesPerFrame = info.channels * 2;
    const start = info.dataOffset + range.startFrame * bytesPerFrame;
    const end = info.dataOffset + range.endFrame * bytesPerFrame;
    return this.encodeWav(audio.slice(start, end), info.sampleRate, info.channels);
  }

  private encodeWav(data: Uint8Array, sampleRate: number, channels: number): Uint8Array {
    const bytesPerSample = 2;
    const buffer = new Uint8Array(44 + data.byteLength);
    const view = new DataView(buffer.buffer);
    this.writeAscii(buffer, 0, 'RIFF');
    view.setUint32(4, 36 + data.byteLength, true);
    this.writeAscii(buffer, 8, 'WAVE');
    this.writeAscii(buffer, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    this.writeAscii(buffer, 36, 'data');
    view.setUint32(40, data.byteLength, true);
    buffer.set(data, 44);
    return buffer;
  }

  private readAscii(view: DataView, offset: number, length: number): string {
    let value = '';
    for (let index = 0; index < length; index += 1) {
      value += String.fromCharCode(view.getUint8(offset + index));
    }
    return value;
  }

  private writeAscii(buffer: Uint8Array, offset: number, value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      buffer[offset + index] = value.charCodeAt(index);
    }
  }

  private async cleanupTemporaryFiles(temporaryRoot: string): Promise<void> {
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
    } catch {}
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private writeWhisperLog(input: {
    fileName: 'speak.log' | 'transcript.log';
    actionType: 'speak' | 'transcript';
    status: 'success' | 'error' | 'no speech';
    startedAt: number;
    durationMs: number;
    modelPath: string;
    audio: Uint8Array;
    wavInfo: WavInfo | null;
    settings: Settings | null;
    segments: Uint8Array[];
    serverDiagnostics: WhisperServerDiagnostics[];
    serverCalled: boolean;
    outputText?: string;
    error?: unknown;
  }): void {
    const lastDiagnostics = input.serverDiagnostics.at(-1);
    void this.logger.writeSnapshot(input.fileName, [
      '',
      '[ACTION]',
      `type: ${input.actionType}`,
      `status: ${input.status}`,
      `duration ms: ${input.durationMs}`,
      `trigger/debug name: ${input.actionType}`,
      '',
      '[SERVER PROCESS]',
      'engine: whisper',
      `executable: ${lastDiagnostics?.executable ?? 'unknown'}`,
      `args: ${lastDiagnostics ? quoteArgs(lastDiagnostics.args) : 'unknown'}`,
      `pid: ${lastDiagnostics?.pid ?? 'unknown'}`,
      `host: ${lastDiagnostics?.host ?? 'unknown'}`,
      `port: ${lastDiagnostics?.port ?? 'unknown'}`,
      `url: ${lastDiagnostics?.url ?? 'unknown'}`,
      `server reused: ${yesNo(lastDiagnostics?.serverReused)}`,
      `server started during action: ${yesNo(lastDiagnostics?.serverStartedDuringAction)}`,
      `startup duration ms: ${lastDiagnostics?.startupDurationMs ?? 'unknown'}`,
      `alive before request: ${yesNo(lastDiagnostics?.aliveBeforeRequest)}`,
      `alive after request: ${yesNo(lastDiagnostics?.aliveAfterRequest)}`,
      '',
      '[SERVER STDOUT RAW TAIL]',
      lastDiagnostics?.stdoutTail || 'empty',
      '',
      '[SERVER STDERR RAW TAIL]',
      lastDiagnostics?.stderrTail || 'empty',
      '',
      '[CLIENT REQUEST]',
      `method: ${lastDiagnostics?.method ?? 'unknown'}`,
      `endpoint: ${lastDiagnostics?.endpoint ?? 'unknown'}`,
      `timeout ms: ${lastDiagnostics?.timeoutMs ?? 'unknown'}`,
      `request started at: ${lastDiagnostics?.requestStartedAt ?? new Date(input.startedAt).toISOString()}`,
      `request finished at: ${lastDiagnostics?.requestFinishedAt ?? 'unknown'}`,
      `request duration ms: ${lastDiagnostics?.requestDurationMs ?? 'unknown'}`,
      `http status: ${lastDiagnostics?.httpStatus ?? 'unknown'}`,
      `http status text: ${lastDiagnostics?.httpStatusText ?? 'unknown'}`,
      `content type: ${lastDiagnostics?.contentType ?? 'unknown'}`,
      `request bytes: ${lastDiagnostics?.requestBytes ?? 'unknown'}`,
      `response bytes: ${lastDiagnostics?.responseBytes ?? 'unknown'}`,
      '',
      '[WHISPER]',
      `model: ${input.modelPath}`,
      `language: ${input.settings ? whisperLanguage(input.settings.whisperLanguage) : 'unknown'}`,
      `threads: ${whisperThreadCount()}`,
      `quality args: ${input.settings ? quoteArgs(whisperQualityArgs(input.settings.whisperQualityMode)) : 'unknown'}`,
      `audio bytes: ${input.audio.byteLength}`,
      `wav valid: ${yesNo(Boolean(input.wavInfo))}`,
      `sample rate: ${input.wavInfo?.sampleRate ?? 'unknown'}`,
      `channels: ${input.wavInfo?.channels ?? 'unknown'}`,
      `bits per sample: ${input.wavInfo?.bitsPerSample ?? 'unknown'}`,
      `audio duration ms: ${input.wavInfo ? wavDurationMs(input.wavInfo) : 'unknown'}`,
      `silence sensitivity: ${input.settings?.silenceSensitivity ?? 'unknown'}`,
      `speech detected: ${yesNo(input.segments.length > 0)}`,
      `speech segments: ${input.segments.length}`,
      `segment durations ms: ${input.segments.map((segment) => wavDurationWeight(segment).toFixed(0)).join(', ') || 'none'}`,
      `server called: ${yesNo(input.serverCalled)}`,
      '',
      '[HTTP RAW RESPONSE TAIL]',
      input.serverDiagnostics.map((diagnostics) => diagnostics.rawResponseTail || 'empty').join('\n\n--- response ---\n\n') || 'empty',
      '',
      '[RESULT]',
      `output chars: ${input.outputText?.length ?? 'unknown'}`,
      `output lines: ${input.outputText ? lineCount(input.outputText) : 'unknown'}`,
      '',
      '[ERROR]',
      ...(input.error ? errorDiagnostics(input.error) : ['name: none', 'message: none', 'stack: none']),
      `http error body tail: ${lastDiagnostics?.httpErrorBodyTail || 'empty'}`,
      `server stdout tail: ${lastDiagnostics?.stdoutTail || 'empty'}`,
      `server stderr tail: ${lastDiagnostics?.stderrTail || 'empty'}`,
    ]).catch(() => {});
  }

  private logFileName(debugName?: string): 'speak.log' | 'transcript.log' {
    return debugName === 'transcript' ? 'transcript.log' : 'speak.log';
  }

  private actionType(debugName?: string): 'speak' | 'transcript' {
    return debugName === 'transcript' ? 'transcript' : 'speak';
  }
}

const whisperLanguage = (language: LanguageMode): string => language;

const whisperThreadCount = (): number => Math.max(1, Math.min(12, cpus().length || 4));

const whisperQualityArgs = (mode: Settings['whisperQualityMode']): string[] => {
  if (mode === 'fast') {
    return ['-bs', '1', '-bo', '1'];
  }
  if (mode === 'accurate') {
    return ['-bs', '5', '-bo', '5'];
  }
  return [];
};

const wavDurationWeight = (audio: Uint8Array): number => {
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  if (audio.byteLength < 44) {
    return audio.byteLength;
  }
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let dataSize = 0;
  while (offset + 8 <= audio.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ' && offset + 24 <= audio.byteLength) {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
    }
    if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return channels > 0 && sampleRate > 0 && dataSize > 0
    ? (dataSize / (channels * 2) / sampleRate) * 1000
    : audio.byteLength;
};

const wavDurationMs = (info: WavInfo): number => {
  const bytesPerFrame = info.channels * (info.bitsPerSample / 8);
  return Math.round((info.dataSize / bytesPerFrame / info.sampleRate) * 1000);
};

const lineCount = (text: string): number => text ? text.split(/\r?\n/).length : 0;

const quoteArgs = (args: string[]): string => args.map((part) => `"${part}"`).join(' ');

const yesNo = (value: boolean | undefined): string => value === undefined ? 'unknown' : value ? 'yes' : 'no';

const mergeTranscriptText = (current: string, next: string): string => {
  const left = current.trim();
  const right = next.trim();
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const leftWords = left.split(/\s+/);
  const rightWords = right.split(/\s+/);
  const maxOverlap = Math.min(80, leftWords.length, rightWords.length);
  for (let count = maxOverlap; count >= 8; count -= 1) {
    const leftTail = normalizeWords(leftWords.slice(-count));
    const rightHead = normalizeWords(rightWords.slice(0, count));
    if (leftTail === rightHead) {
      return `${leftWords.join(' ')} ${rightWords.slice(count).join(' ')}`.trim();
    }
  }
  return `${left}\n${right}`.trim();
};

const normalizeWords = (words: string[]): string =>
  words
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean)
    .join(' ');

const silenceSensitivityConfig: Record<
  SilenceSensitivity,
  {
    minimumThreshold: number;
    noiseMultiplier: number;
    peakMultiplier: number;
    minSilenceSeconds: number;
  }
> = {
  low: {
    minimumThreshold: 0.003,
    noiseMultiplier: 2.4,
    peakMultiplier: 0.04,
    minSilenceSeconds: 0.7,
  },
  normal: {
    minimumThreshold: 0.004,
    noiseMultiplier: 3,
    peakMultiplier: 0.055,
    minSilenceSeconds: 0.45,
  },
  high: {
    minimumThreshold: 0.006,
    noiseMultiplier: 3.8,
    peakMultiplier: 0.075,
    minSilenceSeconds: 0.25,
  },
};
