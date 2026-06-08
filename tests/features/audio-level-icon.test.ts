import { describe, expect, it } from 'vitest';
import { audioLevelTone, audioLevelValue } from '@renderer/ui/components/AudioLevelIcon';

describe('AudioLevelIcon helpers', () => {
  it('uses the latest levels with peak emphasis', () => {
    expect(audioLevelValue([0.1, 0.2, 0.6, 0.8, 1])).toBe(1);
  });

  it('returns zero when inactive', () => {
    expect(audioLevelValue([1], false)).toBe(0);
  });

  it('maps levels to gauge tones', () => {
    expect(audioLevelTone(0.1)).toBe('quiet');
    expect(audioLevelTone(0.2)).toBe('low');
    expect(audioLevelTone(0.5)).toBe('medium');
    expect(audioLevelTone(0.8)).toBe('high');
  });
});
