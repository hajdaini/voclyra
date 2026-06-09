export type TranscriptLiveSegmentStatus = 'pending' | 'transcribing' | 'done' | 'failed';

export type TranscriptLiveSegment = {
  id: number;
  audio: ArrayBuffer;
  text: string;
  status: TranscriptLiveSegmentStatus;
  attempts: number;
};

export const maxTranscriptLiveSegmentAttempts = 2;

export const createTranscriptLiveSegment = (id: number, audio: ArrayBuffer): TranscriptLiveSegment => ({
  id,
  audio,
  text: '',
  status: 'pending',
  attempts: 0,
});

export const nextTranscriptLiveSegment = (segments: TranscriptLiveSegment[]): TranscriptLiveSegment | undefined =>
  segments
    .slice()
    .sort((left, right) => left.id - right.id)
    .find((segment) =>
      segment.status === 'pending' ||
      (segment.status === 'failed' && segment.attempts < maxTranscriptLiveSegmentAttempts),
    );

export const hasRetryableTranscriptLiveSegments = (segments: TranscriptLiveSegment[]): boolean =>
  segments.some((segment) =>
    segment.status === 'pending' ||
    segment.status === 'transcribing' ||
    (segment.status === 'failed' && segment.attempts < maxTranscriptLiveSegmentAttempts),
  );

export const hasFailedTranscriptLiveSegments = (segments: TranscriptLiveSegment[]): boolean =>
  segments.some((segment) => segment.status === 'failed' && segment.attempts >= maxTranscriptLiveSegmentAttempts);

export const enqueueFinalTranscriptLiveSegmentAfterCurrentTask = async (
  currentTask: Promise<void> | null,
  enqueueFinal: () => void,
  drain: () => Promise<string>,
): Promise<string> => {
  await currentTask;
  enqueueFinal();
  return drain();
};

export const assembleTranscriptLiveSegments = (
  segments: TranscriptLiveSegment[],
): string =>
  segments
    .filter((segment) => segment.status === 'done' && segment.text.trim())
    .slice()
    .sort((left, right) => left.id - right.id)
    .reduce((text, segment) => mergeTranscriptLiveText(text, segment.text), '');

export const mergeTranscriptLiveText = (current: string, next: string): string => {
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
  const maxOverlap = Math.min(18, leftWords.length, rightWords.length);
  let bestCount = 0;
  let bestOffset = 0;
  let bestScore = 0;
  const maxOffset = Math.min(4, Math.max(0, rightWords.length - 4));

  for (let count = maxOverlap; count >= 4; count -= 1) {
    const leftTail = leftWords.slice(-count).map(normalizeTranscriptLiveWord);
    for (let offset = 0; offset <= maxOffset && offset + count <= rightWords.length; offset += 1) {
      const rightHead = rightWords.slice(offset, offset + count).map(normalizeTranscriptLiveWord);
      const score = orderedTokenSimilarity(leftTail, rightHead);
      if (score > bestScore) {
        bestScore = score;
        bestCount = count;
        bestOffset = offset;
      }
    }
  }

  if (bestScore >= 0.88) {
    return `${leftWords.join(' ')} ${rightWords.slice(bestOffset + bestCount).join(' ')}`.trim();
  }
  return `${left}\n${right}`.trim();
};

const orderedTokenSimilarity = (left: string[], right: string[]): number => {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }
  const matches = left.reduce((count, word, index) => count + (word && word === right[index] ? 1 : 0), 0);
  return matches / left.length;
};

const normalizeTranscriptLiveWord = (word: string): string =>
  word
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
