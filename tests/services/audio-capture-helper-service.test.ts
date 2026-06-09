import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => 'C:\\project\\voclyra'),
  },
}));

import {
  findStableSilenceBoundary,
  mixPcm16MonoSamples,
  parsePcm16MonoWav,
  slicePcm16MonoWav,
  transcriptSilenceBoundaryOffsetMs,
  transcriptSilenceMs,
  wavDurationMs,
  writePcm16MonoWav,
} from '@services/audio-capture-helper-service';

describe('AudioCaptureHelperService audio mixing', () => {
  it('keeps a single source unchanged', () => {
    const samples = new Int16Array([1000, -2000, 0, 32767]);

    expect(mixPcm16MonoSamples([{ sampleRate: 16000, samples, offsetMs: 0 }], 4, 16000)).toEqual(samples);
  });

  it('adds headroom when two strong sources overlap', () => {
    const mixed = mixPcm16MonoSamples([
      { sampleRate: 16000, samples: new Int16Array([20000]), offsetMs: 0 },
      { sampleRate: 16000, samples: new Int16Array([20000]), offsetMs: 0 },
    ], 1, 16000);

    expect(mixed[0]).toBe(32000);
    expect(mixed[0]).not.toBe(32767);
  });

  it('keeps weak overlapping sources audible', () => {
    const mixed = mixPcm16MonoSamples([
      { sampleRate: 16000, samples: new Int16Array([1000]), offsetMs: 0 },
      { sampleRate: 16000, samples: new Int16Array([2000]), offsetMs: 0 },
    ], 1, 16000);

    expect(mixed[0]).toBe(3000);
  });

  it('does not change gain when a second source starts or stops', () => {
    const mixed = mixPcm16MonoSamples([
      { sampleRate: 16000, samples: new Int16Array([1000, 1000, 1000]), offsetMs: 0 },
      { sampleRate: 16000, samples: new Int16Array([0, 1000, 0]), offsetMs: 0 },
    ], 3, 16000);

    expect(Array.from(mixed)).toEqual([1000, 2000, 1000]);
  });

  it('preserves temporal offsets', () => {
    const mixed = mixPcm16MonoSamples([
      { sampleRate: 10, samples: new Int16Array([1000, 1000]), offsetMs: 0 },
      { sampleRate: 10, samples: new Int16Array([2000]), offsetMs: 1000 },
    ], 11, 10);

    expect(mixed[0]).toBe(1000);
    expect(mixed[1]).toBe(1000);
    expect(mixed[10]).toBe(2000);
  });

  it('finds the middle of the first stable silence after the minimum chunk duration', () => {
    const audio = parsePcm16MonoWav(testWav([
      { durationMs: 60000, sample: 4000 },
      { durationMs: transcriptSilenceMs, sample: 0 },
      { durationMs: 1000, sample: 4000 },
    ]));

    expect(audio).not.toBeNull();
    expect(findStableSilenceBoundary(audio!, 60000)).toBe(60000 + transcriptSilenceBoundaryOffsetMs);
  });

  it('does not find a transcript boundary before stable silence is available', () => {
    const audio = parsePcm16MonoWav(testWav([
      { durationMs: 60000, sample: 4000 },
      { durationMs: transcriptSilenceMs - 100, sample: 0 },
      { durationMs: 1000, sample: 4000 },
    ]));

    expect(audio).not.toBeNull();
    expect(findStableSilenceBoundary(audio!, 60000)).toBeNull();
  });

  it('slices chunks at the middle of the stable silence', () => {
    const audio = parsePcm16MonoWav(testWav([
      { durationMs: 60000, sample: 4000 },
      { durationMs: transcriptSilenceMs, sample: 0 },
      { durationMs: 1000, sample: 4000 },
    ]));

    expect(audio).not.toBeNull();
    const boundaryMs = findStableSilenceBoundary(audio!, 60000);
    expect(boundaryMs).toBe(60000 + transcriptSilenceBoundaryOffsetMs);
    const chunk = parsePcm16MonoWav(slicePcm16MonoWav(audio!, 0, boundaryMs!));

    expect(chunk).not.toBeNull();
    expect(wavDurationMs(chunk!)).toBe(60000 + transcriptSilenceBoundaryOffsetMs);
  });
});

const testWav = (parts: Array<{ durationMs: number; sample: number }>): Uint8Array => {
  const sampleRate = 1000;
  const samples = new Int16Array(parts.reduce((count, part) => count + part.durationMs, 0));
  let offset = 0;
  for (const part of parts) {
    samples.fill(part.sample, offset, offset + part.durationMs);
    offset += part.durationMs;
  }
  return writePcm16MonoWav(samples, sampleRate);
};
