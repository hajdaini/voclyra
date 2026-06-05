import { existsSync } from 'node:fs';
import { access, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { app } from 'electron';
import { spawn } from 'node:child_process';
import { AppStorage } from '@storage/app-storage';
import { ProcessLogService } from '@services/process-log-service';
import type { WhisperRuntimeInfo } from '@shared/types';

type WhisperRunResult = {
  stdout: string;
  stderr: string;
  backend: 'gpu' | 'cpu';
};

type TranscribeOptions = {
  timeoutMs?: number | null;
  debugName?: string;
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

const exactTranscriptionPrompt = [
  'Transcribe exactly what is spoken.',
  'Do not translate.',
  'Keep the original spoken language for every sentence.',
  'If speakers switch language, keep each part in its original language.',
].join(' ');

export class WhisperService {
  private readonly storage = new AppStorage();
  private readonly logger = new ProcessLogService();
  private lastBackend: 'gpu' | 'cpu' | 'unknown' = 'unknown';

  async listModels(): Promise<string[]> {
    const roots = this.modelRoots();
    const files = await Promise.all(roots.map((root) => this.findModelFiles(root, 0)));
    return [...new Set(files.flat().map((file) => basename(file)))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  async runtimeInfo(): Promise<WhisperRuntimeInfo> {
    const executablePath = this.executablePath();
    const executableExists = await this.exists(executablePath);
    const help = executableExists ? await this.helpText() : '';
    const canSelectDevice = /(?:^|\s)(?:-dev|--device)\b/i.test(help);
    const canDisableGpu = /(?:^|\s)(?:-ng|--no-gpu)\b/i.test(help);
    const cudaRuntimeExists =
      process.platform === 'win32' && (await this.exists(join(dirname(executablePath), 'ggml-cuda.dll')));

    return {
      backend: this.lastBackend,
      gpuAvailable: executableExists && canSelectDevice && canDisableGpu && cudaRuntimeExists,
      device: this.lastBackend === 'cpu' ? 'CPU' : this.lastBackend === 'gpu' ? 'CUDA0' : 'Auto',
    };
  }

  private modelRoots(): string[] {
    const home = homedir();
    const localAppData = process.env.LOCALAPPDATA;
    return [
      join(home, '.voclyra', 'models', 'whisper'),
      join(process.cwd(), 'models', 'whisper'),
      join(process.cwd(), 'whisper.cpp', 'models'),
      join(home, 'whisper.cpp', 'models'),
      join(home, '.cache', 'whisper'),
      join(home, '.cache', 'huggingface', 'hub'),
      ...(localAppData ? [join(localAppData, 'whisper.cpp', 'models')] : []),
    ];
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
    const modelPath = await this.modelPath(modelFileName);
    const id = crypto.randomUUID();
    const temporaryRoot = await this.storage.ensureDir('tmp', id);

    try {
      const audioPath = join(temporaryRoot, 'input.wav');
      await writeFile(audioPath, audio);
      return this.transcribeAudioFile(
        modelPath,
        audioPath,
        temporaryRoot,
        id,
        options.timeoutMs,
        exactTranscriptionPrompt,
        options.debugName,
      );
    } finally {
      await this.cleanupTemporaryFiles(temporaryRoot);
    }
  }

  async transcribeFile(audioPath: string, modelFileName: string, options: TranscribeOptions = {}): Promise<string> {
    const modelPath = await this.modelPath(modelFileName);
    const id = crypto.randomUUID();
    const temporaryRoot = await this.storage.ensureDir('tmp', id);

    try {
      await access(audioPath);
      const audio = await readFile(audioPath);
      const segments = this.speechSegments(audio);
      if (segments.length <= 1) {
        return this.transcribeAudioFile(
          modelPath,
          audioPath,
          temporaryRoot,
          id,
          options.timeoutMs,
          exactTranscriptionPrompt,
          options.debugName,
        );
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
        const text = await this.transcribeAudioFile(
          modelPath,
          segmentPath,
          temporaryRoot,
          segmentId,
          options.timeoutMs,
          exactTranscriptionPrompt,
          options.debugName ? `${options.debugName}-segment-${index}` : undefined,
        );
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
    const temporaryRoot = await this.storage.ensureDir('tmp', id);

    try {
      return this.transcribeMeetingAudio(audio, modelPath, temporaryRoot, id, options.timeoutMs, options.debugName);
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
  ): Promise<string> {
    const audioPath = join(temporaryRoot, 'input.wav');
    await writeFile(audioPath, audio);
    return this.transcribeAudioFile(
      modelPath,
      audioPath,
      temporaryRoot,
      id,
      timeoutMs,
      exactTranscriptionPrompt,
      debugName,
    );
  }

  private async transcribeAudioFile(
    modelPath: string,
    audioPath: string,
    temporaryRoot: string,
    id: string,
    timeoutMs: number | null | undefined,
    prompt?: string,
    debugName?: string,
  ): Promise<string> {
    const attempts: Array<{
      backend: 'gpu' | 'cpu';
      inputMode: 'positional' | 'flag';
      outputMode: 'file' | 'stdout';
    }> = [
      { backend: 'gpu', inputMode: 'positional', outputMode: 'file' },
      { backend: 'cpu', inputMode: 'positional', outputMode: 'file' },
      { backend: 'gpu', inputMode: 'flag', outputMode: 'file' },
      { backend: 'cpu', inputMode: 'flag', outputMode: 'file' },
      { backend: 'gpu', inputMode: 'positional', outputMode: 'stdout' },
      { backend: 'cpu', inputMode: 'positional', outputMode: 'stdout' },
      { backend: 'gpu', inputMode: 'flag', outputMode: 'stdout' },
      { backend: 'cpu', inputMode: 'flag', outputMode: 'stdout' },
    ];
    const errors: string[] = [];

    for (const attempt of attempts) {
      const outputBase = join(temporaryRoot, `${id}-${attempt.backend}-${attempt.inputMode}-${attempt.outputMode}`);
      const outputId = basename(outputBase);
      const run = await this.runWhisper(
        modelPath,
        audioPath,
        outputBase,
        temporaryRoot,
        attempt.backend,
        attempt.inputMode,
        attempt.outputMode,
        timeoutMs,
        prompt,
        debugName,
      ).catch((error: unknown) => {
        errors.push(error instanceof Error ? error.message : 'Whisper failed.');
        return null;
      });
      if (run) {
        const text = await this.readTranscript(temporaryRoot, outputId, run.stdout, run.stderr);
        if (text) {
          this.lastBackend = run.backend;
          return text;
        }
      }
    }

    if (errors.length > 0) {
      this.lastBackend = errors.some((error) => /using CUDA|CUDA0 total size|found GPU device/i.test(error))
        ? 'gpu'
        : this.lastBackend;
    }
    return '';
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

  private executablePath(): string {
    const cudaPath = join(
      homedir(),
      '.voclyra',
      'runtimes',
      'whisper-cuda',
      'win-x64',
      'whisper-cli.exe',
    );

    if (process.platform === 'win32' && existsSync(cudaPath)) {
      return cudaPath;
    }

    if (app.isPackaged) {
      return join(process.resourcesPath, 'whisper', 'win-x64', 'whisper-cli.exe');
    }

    return resolve(process.cwd(), 'resources', 'whisper', 'win-x64', 'whisper-cli.exe');
  }

  private runWhisper(
    modelPath: string,
    audioPath: string,
    outputBase: string,
    cwd: string,
    backend: 'gpu' | 'cpu',
    inputMode: 'positional' | 'flag',
    outputMode: 'file' | 'stdout',
    timeoutMs: number | null | undefined = 180000,
    prompt?: string,
    logName?: string,
  ): Promise<WhisperRunResult> {
    return new Promise((resolvePromise, reject) => {
      const args = [
        '-m',
        modelPath,
        '-l',
        'auto',
        '-nt',
        '-t',
        '12',
      ];

      if (outputMode === 'file') {
        args.push('-otxt', '-of', outputBase);
      }

      if (prompt) {
        args.push('-mc', '0', '--prompt', prompt);
      }

      if (backend === 'cpu') {
        args.push('-ng');
      } else {
        args.push('-dev', '0');
      }

      if (inputMode === 'flag') {
        args.push('-f', audioPath);
      } else {
        args.push(audioPath);
      }

      const process = spawn(this.executablePath(), args, {
        cwd,
        windowsHide: true,
        shell: false,
      });
      const errors: Buffer[] = [];
      const output: Buffer[] = [];
      const rawOutput: Buffer[] = [];
      const timeout =
        timeoutMs === null
          ? null
          : setTimeout(async () => {
              await this.appendWhisperLog(
                args,
                cwd,
                Buffer.concat(rawOutput).toString('utf8'),
                'timeout',
                logName,
              );
              process.kill();
              reject(new Error('Whisper transcription timed out.'));
            }, timeoutMs);

      process.stdout.on('data', (chunk: Buffer) => {
        output.push(chunk);
        rawOutput.push(chunk);
      });

      process.stderr.on('data', (chunk: Buffer) => {
        errors.push(chunk);
        rawOutput.push(chunk);
      });

      process.on('error', async (error) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        await this.appendWhisperLog(args, cwd, '', error.message, logName);
        reject(error);
      });

      process.on('close', async (code) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        const stderr = Buffer.concat(errors).toString('utf8');
        const stdout = Buffer.concat(output).toString('utf8');
        const raw = Buffer.concat(rawOutput).toString('utf8');
        await this.appendWhisperLog(args, cwd, raw, `exit code: ${code ?? 'unknown'}`, logName);
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || 'Whisper failed.'));
          return;
        }
        resolvePromise({
          stdout,
          stderr,
          backend: /using CUDA|CUDA0 total size|found GPU device/i.test(stderr) ? 'gpu' : 'cpu',
        });
      });
    });
  }

  private async appendWhisperLog(
    args: string[],
    cwd: string,
    rawOutput: string,
    status: string,
    logName?: string,
  ): Promise<void> {
    const executable = this.executablePath();
    const command = [executable, ...args].map((part) => `"${part}"`).join(' ');
    const fileName = logName === 'transcript'
      ? 'transcript-whisper.log'
      : logName === 'speak'
        ? 'speak-whisper.log'
        : 'whisper.log';
    await this.logger.append(fileName, [`cwd: ${cwd}`, `command: ${command}`, rawOutput, status]);
  }

  private async readTranscript(
    temporaryRoot: string,
    id: string,
    stdout: string,
    stderr: string,
  ): Promise<string> {
    const fileText = await this.readTranscriptFile(temporaryRoot, id);
    if (fileText) {
      return fileText;
    }

    const stdoutText = this.cleanTranscriptOutput(stdout);
    if (stdoutText) {
      return stdoutText;
    }

    return this.cleanTranscriptOutput(stderr);
  }

  private async readTranscriptFile(temporaryRoot: string, id: string): Promise<string> {
    try {
      const files = await readdir(temporaryRoot);
      const candidates = files
        .filter((file) => file.startsWith(id) && file.endsWith('.txt'))
        .sort((a, b) => a.localeCompare(b));

      for (const candidate of candidates) {
        const text = (await readFile(join(temporaryRoot, candidate), 'utf8')).trim();
        if (text) {
          return text;
        }
      }
    } catch {}

    return '';
  }

  private speechSegments(audio: Uint8Array): Uint8Array[] {
    const info = this.wavInfo(audio);
    if (!info || info.bitsPerSample !== 16) {
      return [audio];
    }

    const ranges = this.detectSpeechRanges(audio, info);
    if (ranges.length === 0) {
      return [audio];
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

  private detectSpeechRanges(audio: Uint8Array, info: WavInfo): SpeechRange[] {
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
    const threshold = Math.max(0.004, Math.min(0.035, noise * 3), peak * 0.055);
    const minSpeechFrames = Math.max(1, Math.round(0.18 / 0.03));
    const minSilenceFrames = Math.max(1, Math.round(0.45 / 0.03));
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
    const maxFrames = info.sampleRate * 30;
    const overlapFrames = Math.round(info.sampleRate * 0.8);
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

  private cleanTranscriptOutput(output: string): string {
    return output
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^whisper/i.test(line))
      .filter((line) => !/^system_info/i.test(line))
      .filter((line) => !/^main:/i.test(line))
      .filter((line) => !/^ggml/i.test(line))
      .filter((line) => !/^whisper_/i.test(line))
      .filter((line) => !/^error:/i.test(line))
      .filter((line) => !/^usage:/i.test(line))
      .filter((line) => !/^Device\s+\d+:/i.test(line))
      .filter((line) => !/^read_audio_data:/i.test(line))
      .filter((line) => !/^output_txt:/i.test(line))
      .filter((line) => !/^CUDA\d+\s+total size/i.test(line))
      .map((line) => line.replace(/^\[[^\]]+\]\s*/, '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private helpText(): Promise<string> {
    return new Promise((resolveHelp) => {
      const process = spawn(this.executablePath(), ['--help'], {
        windowsHide: true,
        shell: false,
      });
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        process.kill();
        resolveHelp('');
      }, 5000);

      process.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      process.stderr.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      process.on('error', () => {
        clearTimeout(timeout);
        resolveHelp('');
      });

      process.on('close', () => {
        clearTimeout(timeout);
        resolveHelp(Buffer.concat(chunks).toString('utf8'));
      });
    });
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
