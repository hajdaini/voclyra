import { describe, expect, it, vi } from 'vitest';
import {
  assembleTranscriptLiveSegments,
  createTranscriptLiveSegment,
  enqueueFinalTranscriptLiveSegmentAfterCurrentTask,
  hasFailedTranscriptLiveSegments,
  hasRetryableTranscriptLiveSegments,
  mergeTranscriptLiveText,
  nextTranscriptLiveSegment,
  type TranscriptLiveSegment,
} from '@renderer/ui/transcript-live-segments';

const audio = (): ArrayBuffer => new ArrayBuffer(4);

describe('transcript live segments', () => {
  it('assembles done segments in segment order', () => {
    const segments: TranscriptLiveSegment[] = [
      { ...createTranscriptLiveSegment(2, audio()), status: 'done', text: 'second part' },
      { ...createTranscriptLiveSegment(1, audio()), status: 'done', text: 'first part' },
    ];

    expect(assembleTranscriptLiveSegments(segments)).toBe('first part\nsecond part');
  });

  it('ignores pending and silent done segments', () => {
    const segments: TranscriptLiveSegment[] = [
      { ...createTranscriptLiveSegment(1, audio()), status: 'done', text: 'first part' },
      createTranscriptLiveSegment(2, audio()),
      { ...createTranscriptLiveSegment(3, audio()), status: 'done', text: '   ' },
    ];

    expect(assembleTranscriptLiveSegments(segments)).toBe('first part');
  });

  it('retries failed segments once before hard failure', () => {
    const retryable = { ...createTranscriptLiveSegment(1, audio()), status: 'failed' as const, attempts: 1 };
    const failed = { ...createTranscriptLiveSegment(2, audio()), status: 'failed' as const, attempts: 2 };

    expect(nextTranscriptLiveSegment([retryable])).toBe(retryable);
    expect(hasRetryableTranscriptLiveSegments([retryable])).toBe(true);
    expect(hasFailedTranscriptLiveSegments([retryable])).toBe(false);
    expect(nextTranscriptLiveSegment([failed])).toBeUndefined();
    expect(hasRetryableTranscriptLiveSegments([failed])).toBe(false);
    expect(hasFailedTranscriptLiveSegments([failed])).toBe(true);
  });

  it('removes exact repeated text at segment boundaries', () => {
    expect(mergeTranscriptLiveText(
      'Nous avons un vrai problème de demande',
      'un vrai problème de demande parce que le cloud avance',
    )).toBe('Nous avons un vrai problème de demande parce que le cloud avance');
  });

  it('removes conservative fuzzy repeated text at segment boundaries', () => {
    expect(mergeTranscriptLiveText(
      'Il faut réfléchir à avoir des réglementations qui sont plus simples',
      'reglementations qui sont plus simples et plus unifiées',
    )).toBe('Il faut réfléchir à avoir des réglementations qui sont plus simples et plus unifiées');
  });

  it('keeps similar text when the ordered overlap score is too low', () => {
    expect(mergeTranscriptLiveText(
      'Le marché total doit être comparé à la masse salariale',
      'Le marché européen doit être indiqué par les acteurs européens',
    )).toBe([
      'Le marché total doit être comparé à la masse salariale',
      'Le marché européen doit être indiqué par les acteurs européens',
    ].join('\n'));
  });

  it('removes repeated text after a short prefix in the next segment', () => {
    expect(mergeTranscriptLiveText(
      "Et ce jeu, il aurait pu rester un paisible paradis où les joueurs s'entraînent et gagnent",
      "sans compter il aurait pu rester un paisible paradis où les joueurs s'entraînent et gagnent. Mais c'était sans compter sur les bots.",
    )).toBe(
      "Et ce jeu, il aurait pu rester un paisible paradis où les joueurs s'entraînent et gagnent Mais c'était sans compter sur les bots.",
    );
  });

  it('waits for the current live transcription before enqueueing and draining the final segment', async () => {
    const calls: string[] = [];
    let finishCurrentTask: () => void = () => {};
    const currentTask = new Promise<void>((resolve) => {
      finishCurrentTask = resolve;
    }).then(() => {
      calls.push('current done');
    });
    const enqueueFinal = vi.fn(() => {
      calls.push('enqueue final');
    });
    const drain = vi.fn(async () => {
      calls.push('drain');
      return 'final text';
    });

    const result = enqueueFinalTranscriptLiveSegmentAfterCurrentTask(currentTask, enqueueFinal, drain);
    await Promise.resolve();

    expect(enqueueFinal).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();

    finishCurrentTask();

    await expect(result).resolves.toBe('final text');
    expect(calls).toEqual(['current done', 'enqueue final', 'drain']);
  });
});
