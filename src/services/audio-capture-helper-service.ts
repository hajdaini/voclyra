import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { AppStorage } from '@storage/app-storage';
import type { Settings } from '@shared/types';

type CaptureMode = 'speak' | 'transcript';
type CaptureSource = 'input' | 'output';

type CaptureProcess = {
  source: CaptureSource;
  child: ChildProcessWithoutNullStreams;
  outputPath: string;
  startedAtMs: number;
};

type CaptureDevice = {
  id: string;
  label: string;
};

type CaptureSegment = {
  source: CaptureSource;
  outputPath: string;
  startedAtMs: number;
  endedAtMs: number;
};

type CaptureState = {
  mode: CaptureMode;
  startedAtMs: number;
  nextPreviewStartMs: number;
  settings: Settings;
  onLevel: (source: CaptureSource, level: number) => void;
  processes: Map<string, CaptureProcess>;
  segments: CaptureSegment[];
  nextSegmentIndex: number;
  temporaryRoot: string;
};

export class AudioCaptureHelperService {
  private readonly storage = new AppStorage();
  private readonly captures = new Map<CaptureMode, CaptureState>();

  async start(
    mode: CaptureMode,
    settings: Settings,
    onLevel: (source: CaptureSource, level: number) => void,
  ): Promise<void> {
    await this.cancel(mode);
    const id = randomUUID();
    const temporaryRoot = await this.storage.ensureDir('tmp', 'current', `audio-${id}`);
    const sources = mode === 'speak' ? (['input'] as const) : (['output', 'input'] as const);
    const state: CaptureState = {
      mode,
      startedAtMs: Date.now(),
      nextPreviewStartMs: 0,
      settings,
      onLevel,
      processes: new Map(),
      segments: [],
      nextSegmentIndex: 0,
      temporaryRoot,
    };
    for (const source of sources) {
      for (const process of await this.startSourceProcesses(state, source)) {
        state.processes.set(process.outputPath, process);
      }
    }
    this.captures.set(mode, state);
    await delay(150);
    if ([...state.processes.values()].some((process) => process.child.exitCode !== null)) {
      await this.cancel(mode);
      throw new Error(`${mode === 'speak' ? 'Microphone' : 'Computer audio'} capture failed.`);
    }
  }

  async switchSource(mode: CaptureMode, source: CaptureSource, settings: Settings): Promise<void> {
    const state = this.captures.get(mode);
    if (!state || (mode === 'speak' && source !== 'input')) {
      return;
    }
    state.settings = settings;
    const currentProcesses = [...state.processes.entries()].filter(([, process]) => process.source === source);
    for (const [key, current] of currentProcesses) {
      await this.stopProcess(current, state);
      state.processes.delete(key);
    }
    const nextProcesses = await this.startSourceProcesses(state, source);
    for (const process of nextProcesses) {
      state.processes.set(process.outputPath, process);
    }
    await delay(80);
    if (nextProcesses.some((process) => process.child.exitCode !== null)) {
      for (const process of nextProcesses) {
        state.processes.delete(process.outputPath);
      }
      throw new Error(`${source === 'input' ? 'Microphone' : 'Computer audio'} capture failed.`);
    }
  }

  async stop(mode: CaptureMode): Promise<Uint8Array> {
    const state = this.captures.get(mode);
    if (!state) {
      return new Uint8Array();
    }
    this.captures.delete(mode);
    await Promise.all([...state.processes.values()].map((process) => this.stopProcess(process, state)));
    const audio = await mixWavSegments(state.segments, state.startedAtMs);
    await this.cleanup(state.temporaryRoot);
    return audio;
  }

  async stopTranscript(): Promise<{ audio: Uint8Array; finalSegmentAudio: Uint8Array }> {
    const state = this.captures.get('transcript');
    if (!state) {
      return { audio: new Uint8Array(), finalSegmentAudio: new Uint8Array() };
    }
    this.captures.delete('transcript');
    await this.stopCurrentProcesses(state);
    const audio = await mixWavSegments(state.segments, state.startedAtMs);
    const parsed = parsePcm16MonoWav(audio);
    const finalSegmentAudio = parsed
      ? slicePcm16MonoWav(parsed, state.nextPreviewStartMs, wavDurationMs(parsed))
      : audio;
    await this.cleanup(state.temporaryRoot);
    return { audio, finalSegmentAudio };
  }

  async previewChunk(mode: CaptureMode, chunkMs: number): Promise<Uint8Array | null> {
    const state = this.captures.get(mode);
    if (!state || chunkMs < 5000) {
      return null;
    }
    const audio = await this.snapshotCurrentAudio(state);
    const parsed = parsePcm16MonoWav(audio);
    if (!parsed) {
      return null;
    }
    const durationMs = wavDurationMs(parsed);
    if (durationMs - state.nextPreviewStartMs < chunkMs) {
      return null;
    }
    const boundaryMs = findStableSilenceBoundary(parsed, state.nextPreviewStartMs + chunkMs);
    if (boundaryMs === null) {
      return null;
    }
    const chunk = slicePcm16MonoWav(parsed, state.nextPreviewStartMs, boundaryMs);
    state.nextPreviewStartMs = boundaryMs;
    return chunk;
  }

  async cancel(mode: CaptureMode): Promise<void> {
    const state = this.captures.get(mode);
    if (!state) {
      return;
    }
    this.captures.delete(mode);
    for (const process of state.processes.values()) {
      process.child.kill();
    }
    void Promise.all([...state.processes.values()].map((process) => this.waitForExit(process.child, 250).catch(() => {}))).finally(() => {
      void this.cleanup(state.temporaryRoot);
    });
  }

  private async startSourceProcesses(state: CaptureState, source: CaptureSource): Promise<CaptureProcess[]> {
    if (source !== 'output' || state.settings.transcriptOutputDeviceId !== 'all') {
      return [this.startProcess(state, source)];
    }
    const devices = await this.listOutputDevices();
    if (devices.length === 0) {
      return [this.startProcess(state, source, { id: 'default', label: '' })];
    }
    return devices.map((device) => this.startProcess(state, source, device));
  }

  private startProcess(state: CaptureState, source: CaptureSource, device?: CaptureDevice): CaptureProcess {
    const outputPath = join(state.temporaryRoot, `${state.mode}-${source}-${state.nextSegmentIndex}.wav`);
    state.nextSegmentIndex += 1;
    const child = spawn(this.executablePath(), this.args(source, outputPath, state.settings, device), {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        const match = /^LEVEL\s+([0-9]+(?:[.,][0-9]+)?)$/i.exec(line.trim());
        const rawLevel = match?.[1];
        if (rawLevel) {
          state.onLevel(source, displayLevel(Number(rawLevel.replace(',', '.'))));
        }
      }
    });
    return { source, child, outputPath, startedAtMs: Date.now() };
  }

  private async stopProcess(process: CaptureProcess, state: CaptureState): Promise<void> {
    process.child.stdin.write('stop\n');
    await this.waitForExit(process.child, 350).catch(() => {
      process.child.kill();
    });
    await this.waitForExit(process.child, 100).catch(() => {});
    state.segments.push({
      source: process.source,
      outputPath: process.outputPath,
      startedAtMs: process.startedAtMs,
      endedAtMs: Date.now(),
    });
  }

  private async stopCurrentProcesses(state: CaptureState): Promise<CaptureSegment[]> {
    const entries = [...state.processes.entries()];
    const previousLength = state.segments.length;
    for (const [key, process] of entries) {
      await this.stopProcess(process, state);
      state.processes.delete(key);
    }
    return state.segments.slice(previousLength);
  }

  private async snapshotCurrentAudio(state: CaptureState): Promise<Uint8Array> {
    const snapshotStartedAtMs = Date.now();
    const segments = await Promise.all([...state.processes.values()].map(async (process) => {
      const outputPath = join(state.temporaryRoot, `${state.mode}-${process.source}-snapshot-${randomUUID()}.wav`);
      process.child.stdin.write(`snapshot ${outputPath}\n`);
      await this.waitForSnapshot(outputPath, 800);
      return {
        source: process.source,
        outputPath,
        startedAtMs: process.startedAtMs,
        endedAtMs: snapshotStartedAtMs,
      };
    }));
    return mixWavSegments(segments, state.startedAtMs);
  }

  private async waitForSnapshot(path: string, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const audio = await readFile(path).catch(() => null);
      if (audio && audio.byteLength > 44) {
        return;
      }
      await delay(20);
    }
    throw new Error('Audio capture snapshot timed out.');
  }

  private args(source: CaptureSource, outputPath: string, settings: Settings, device?: CaptureDevice): string[] {
    const args = ['--mode', source, '--out', outputPath];
    const deviceId = device?.id ?? (source === 'input' ? settings.microphoneDeviceId : settings.transcriptOutputDeviceId);
    const label = device?.label ?? (source === 'input' ? settings.microphoneDeviceLabel : settings.transcriptOutputDeviceLabel);
    if (device || deviceId === 'default' || deviceId === 'communications') {
      args.push('--device-id', deviceId);
    }
    if (label && deviceId && deviceId !== 'all') {
      args.push('--device-name', label);
    }
    return args;
  }

  private async listOutputDevices(): Promise<CaptureDevice[]> {
    const child = spawn(this.executablePath(), ['--list', 'output'], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    await this.waitForExit(child, 1000).catch(() => {
      child.kill();
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => {
        const [id, label] = line.split('\t');
        return id && label ? { id, label } : null;
      })
      .filter((device): device is CaptureDevice => device !== null);
  }

  private executablePath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'runtimes', 'audio', 'win-x64', 'audio-capture-helper.exe')
      : join(app.getAppPath(), 'resources', 'runtimes', 'audio', 'win-x64', 'audio-capture-helper.exe');
  }

  private waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
    if (child.exitCode !== null) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Audio capture stop timed out.')), timeoutMs);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async cleanup(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true }).catch(() => {});
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const transcriptSilenceMs = 400;
export const transcriptSilenceBoundaryOffsetMs = transcriptSilenceMs / 2;
const silenceAnalysisFrameMs = 20;
const silenceNoiseWindowMs = 10000;
const silenceThresholdFloorDb = -45;
const silenceThresholdCeilingDb = -35;
const silenceThresholdAboveNoiseDb = 6;

const displayLevel = (rawLevel: number): number => {
  const noiseFloor = 0.003;
  if (!Number.isFinite(rawLevel) || rawLevel <= noiseFloor) {
    return 0;
  }
  const normalized = Math.min(1, (rawLevel - noiseFloor) / 0.12);
  return Math.max(0, Math.min(1, Math.pow(normalized, 0.65)));
};

const mixWavSegments = async (segments: CaptureSegment[], sessionStartedAtMs: number): Promise<Uint8Array> => {
  const files = await Promise.all(
    segments.map(async (segment) => ({
      segment,
      audio: await readFile(segment.outputPath).catch(() => new Uint8Array()),
    })),
  );
  const parsed = files
    .map(({ segment, audio }) => {
      const parsedAudio = parsePcm16MonoWav(audio);
      return parsedAudio
        ? {
            ...parsedAudio,
            offsetMs: Math.max(0, segment.startedAtMs - sessionStartedAtMs),
          }
        : null;
    })
    .filter((file): file is Pcm16MonoWav => file !== null);
  if (parsed.length === 0) {
    return new Uint8Array();
  }
  const first = parsed[0];
  if (!first) {
    return new Uint8Array();
  }
  if (parsed.length === 1) {
    return first.source;
  }
  const sampleRate = first.sampleRate;
  const sameFormat = parsed.every((file) => file.sampleRate === sampleRate);
  if (!sameFormat) {
    return first.source;
  }
  const sampleCount = Math.max(
    ...parsed.map((file) => Math.round((file.offsetMs / 1000) * sampleRate) + file.samples.length),
  );
  return writePcm16MonoWav(mixPcm16MonoSamples(parsed, sampleCount, sampleRate), sampleRate);
};

type Pcm16MonoWav = {
  source: Uint8Array;
  sampleRate: number;
  samples: Int16Array;
  offsetMs: number;
};

export const mixPcm16MonoSamples = (
  files: Array<Pick<Pcm16MonoWav, 'sampleRate' | 'samples' | 'offsetMs'>>,
  sampleCount: number,
  sampleRate: number,
): Int16Array => {
  if (files.length === 1) {
    const file = files[0];
    const mixed = new Int16Array(sampleCount);
    if (!file) {
      return mixed;
    }
    const offsetSamples = Math.round((file.offsetMs / 1000) * sampleRate);
    const targetOffset = Math.max(0, offsetSamples);
    if (targetOffset >= sampleCount) {
      return mixed;
    }
    mixed.set(file.samples.slice(0, sampleCount - targetOffset), targetOffset);
    return mixed;
  }
  const sums = new Int32Array(sampleCount);
  for (const file of files) {
    const offsetSamples = Math.round((file.offsetMs / 1000) * sampleRate);
    for (let index = 0; index < file.samples.length; index += 1) {
      const sample = file.samples[index] ?? 0;
      const targetIndex = offsetSamples + index;
      if (targetIndex < 0 || targetIndex >= sampleCount) {
        continue;
      }
      sums[targetIndex] = (sums[targetIndex] ?? 0) + sample;
    }
  }

  const mixed = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    mixed[index] = softLimitPcm16(sums[index] ?? 0);
  }
  return mixed;
};

export const parsePcm16MonoWav = (source: Uint8Array): Pcm16MonoWav | null => {
  if (source.byteLength < 44) {
    return null;
  }
  const buffer = Buffer.from(source);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  const sampleRate = buffer.readUInt32LE(24);
  const channels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, buffer.byteLength - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (channels !== 1 || bitsPerSample !== 16 || dataOffset < 0 || dataSize <= 0) {
    return null;
  }
  return {
    source,
    sampleRate,
    samples: new Int16Array(buffer.buffer, buffer.byteOffset + dataOffset, Math.floor(dataSize / 2)),
    offsetMs: 0,
  };
};

export const writePcm16MonoWav = (samples: Int16Array, sampleRate: number): Uint8Array => {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(samples.buffer, samples.byteOffset, dataSize).copy(buffer, 44);
  return buffer;
};

const clampPcm16 = (value: number): number => Math.max(-32768, Math.min(32767, value));

const softLimitPcm16 = (value: number): number => {
  const sign = Math.sign(value);
  const absolute = Math.abs(value);
  const threshold = 28000;
  const knee = 6000;
  if (absolute <= threshold) {
    return clampPcm16(value);
  }
  const compressed = threshold + (absolute - threshold) / (1 + (absolute - threshold) / knee);
  return clampPcm16(Math.round(sign * compressed));
};

export const slicePcm16MonoWav = (audio: Pcm16MonoWav, startMs: number, endMs: number): Uint8Array => {
  const start = Math.max(0, Math.floor((startMs / 1000) * audio.sampleRate));
  const end = Math.max(start, Math.min(audio.samples.length, Math.ceil((endMs / 1000) * audio.sampleRate)));
  return writePcm16MonoWav(audio.samples.slice(start, end), audio.sampleRate);
};

export const wavDurationMs = (audio: Pcm16MonoWav): number => (audio.samples.length / audio.sampleRate) * 1000;

export const findStableSilenceBoundary = (audio: Pcm16MonoWav, searchStartMs: number): number | null => {
  const frameSamples = Math.max(1, Math.round((silenceAnalysisFrameMs / 1000) * audio.sampleRate));
  const levels = frameDbLevels(audio.samples, frameSamples);
  const searchFrame = Math.max(0, Math.floor(searchStartMs / silenceAnalysisFrameMs));
  const silenceFrames = Math.max(1, Math.ceil(transcriptSilenceMs / silenceAnalysisFrameMs));
  if (levels.length - searchFrame < silenceFrames) {
    return null;
  }
  const noiseStart = Math.max(0, searchFrame - Math.round(silenceNoiseWindowMs / silenceAnalysisFrameMs));
  const threshold = silenceThreshold(levels.slice(noiseStart, searchFrame));
  let run = 0;
  for (let index = searchFrame; index < levels.length; index += 1) {
    if ((levels[index] ?? 0) <= threshold) {
      run += 1;
      if (run >= silenceFrames) {
        const silenceStartFrame = index - run + 1;
        return (silenceStartFrame * silenceAnalysisFrameMs) + transcriptSilenceBoundaryOffsetMs;
      }
      continue;
    }
    run = 0;
  }
  return null;
};

const frameDbLevels = (samples: Int16Array, frameSamples: number): number[] => {
  const levels: number[] = [];
  for (let start = 0; start < samples.length; start += frameSamples) {
    const end = Math.min(samples.length, start + frameSamples);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const value = (samples[index] ?? 0) / 32768;
      sum += value * value;
    }
    const rms = end > start ? Math.sqrt(sum / (end - start)) : 0;
    levels.push(rms > 0 ? 20 * Math.log10(rms) : -120);
  }
  return levels;
};

const silenceThreshold = (levels: number[]): number => {
  if (levels.length === 0) {
    return silenceThresholdFloorDb;
  }
  const sorted = [...levels].sort((left, right) => left - right);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.2)] ?? silenceThresholdFloorDb;
  return Math.min(
    silenceThresholdCeilingDb,
    Math.max(noiseFloor + silenceThresholdAboveNoiseDb, silenceThresholdFloorDb),
  );
};
