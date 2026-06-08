import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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

type CaptureSegment = {
  source: CaptureSource;
  outputPath: string;
  startedAtMs: number;
  endedAtMs: number;
};

type CaptureState = {
  mode: CaptureMode;
  startedAtMs: number;
  settings: Settings;
  onLevel: (level: number) => void;
  processes: Map<CaptureSource, CaptureProcess>;
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
    onLevel: (level: number) => void,
  ): Promise<void> {
    await this.cancel(mode);
    const id = randomUUID();
    const temporaryRoot = await this.storage.ensureDir('tmp', 'current', `audio-${id}`);
    const sources = mode === 'speak' ? (['input'] as const) : (['output', 'input'] as const);
    const state: CaptureState = {
      mode,
      startedAtMs: Date.now(),
      settings,
      onLevel,
      processes: new Map(),
      segments: [],
      nextSegmentIndex: 0,
      temporaryRoot,
    };
    for (const source of sources) {
      state.processes.set(source, this.startProcess(state, source));
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
    const current = state.processes.get(source);
    if (current) {
      await this.stopProcess(current, state);
      state.processes.delete(source);
    }
    const nextProcess = this.startProcess(state, source);
    state.processes.set(source, nextProcess);
    await delay(80);
    if (nextProcess.child.exitCode !== null) {
      state.processes.delete(source);
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

  private startProcess(
    state: CaptureState,
    source: CaptureSource,
  ): CaptureProcess {
    const outputPath = join(state.temporaryRoot, `${state.mode}-${source}-${state.nextSegmentIndex}.wav`);
    state.nextSegmentIndex += 1;
    const child = spawn(this.executablePath(), this.args(source, outputPath, state.settings), {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        const match = /^LEVEL\s+([0-9]+(?:[.,][0-9]+)?)$/i.exec(line.trim());
        const rawLevel = match?.[1];
        if (rawLevel) {
          state.onLevel(displayLevel(Number(rawLevel.replace(',', '.'))));
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

  private args(source: CaptureSource, outputPath: string, settings: Settings): string[] {
    const args = ['--mode', source, '--out', outputPath];
    const deviceId = source === 'input' ? settings.microphoneDeviceId : settings.transcriptOutputDeviceId;
    const label = source === 'input' ? settings.microphoneDeviceLabel : settings.transcriptOutputDeviceLabel;
    if (deviceId === 'default' || deviceId === 'communications') {
      args.push('--device-id', deviceId);
    }
    if (label) {
      args.push('--device-name', label);
    }
    return args;
  }

  private executablePath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'runtimes', 'audio', 'win-x64', 'audio-capture-helper.exe')
      : join(app.getAppPath(), 'resources', 'runtimes', 'audio', 'win-x64', 'audio-capture-helper.exe');
  }

  private waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
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
const switchSilenceMs = 250;

const displayLevel = (rawLevel: number): number => {
  const noiseFloor = 0.003;
  if (!Number.isFinite(rawLevel) || rawLevel <= noiseFloor) {
    return 0;
  }
  const normalized = Math.min(1, (rawLevel - noiseFloor) / 0.12);
  return Math.max(0, Math.min(1, Math.pow(normalized, 0.65)));
};

const mixWavSegments = async (segments: CaptureSegment[], sessionStartedAtMs: number): Promise<Uint8Array> => {
  const sourceSegments = new Map<CaptureSource, CaptureSegment[]>();
  for (const segment of segments) {
    sourceSegments.set(segment.source, [...(sourceSegments.get(segment.source) ?? []), segment]);
  }
  const segmentSilence = new Map<CaptureSegment, { startMs: number; endMs: number }>();
  for (const sourceSegmentList of sourceSegments.values()) {
    const sorted = [...sourceSegmentList].sort((a, b) => a.startedAtMs - b.startedAtMs);
    sorted.forEach((segment, index) => {
      segmentSilence.set(segment, {
        startMs: index > 0 ? switchSilenceMs : 0,
        endMs: index < sorted.length - 1 ? switchSilenceMs : 0,
      });
    });
  }
  const files = await Promise.all(
    segments.map(async (segment) => ({
      segment,
      audio: await readFile(segment.outputPath).catch(() => new Uint8Array()),
    })),
  );
  const parsed = files
    .map(({ segment, audio }) => {
      const parsedAudio = parsePcm16MonoWav(audio);
      const silence = segmentSilence.get(segment) ?? { startMs: 0, endMs: 0 };
      return parsedAudio
        ? {
            ...parsedAudio,
            offsetMs: Math.max(0, segment.startedAtMs - sessionStartedAtMs),
            silenceStartMs: silence.startMs,
            silenceEndMs: silence.endMs,
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
  const mixed = new Int16Array(sampleCount);
  for (const file of parsed) {
    const silenceStartSamples = Math.min(file.samples.length, Math.round((file.silenceStartMs / 1000) * sampleRate));
    const silenceEndSamples = Math.min(
      file.samples.length - silenceStartSamples,
      Math.round((file.silenceEndMs / 1000) * sampleRate),
    );
    const offsetSamples = Math.round((file.offsetMs / 1000) * sampleRate) + silenceStartSamples;
    const endIndex = file.samples.length - silenceEndSamples;
    for (let index = silenceStartSamples; index < endIndex; index += 1) {
      const targetIndex = offsetSamples + index - silenceStartSamples;
      mixed[targetIndex] = Math.max(-32768, Math.min(32767, (mixed[targetIndex] ?? 0) + (file.samples[index] ?? 0)));
    }
  }
  return writePcm16MonoWav(mixed, sampleRate);
};

type Pcm16MonoWav = {
  source: Uint8Array;
  sampleRate: number;
  samples: Int16Array;
  offsetMs: number;
  silenceStartMs: number;
  silenceEndMs: number;
};

const parsePcm16MonoWav = (source: Uint8Array): Pcm16MonoWav | null => {
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
    silenceStartMs: 0,
    silenceEndMs: 0,
  };
};

const writePcm16MonoWav = (samples: Int16Array, sampleRate: number): Uint8Array => {
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
