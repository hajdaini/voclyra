export const homeWaveformSize = 28;
export const settingsWaveformSize = 24;
export const overlayWaveformSize = 12;

export const defaultWaveform = (size = homeWaveformSize): number[] => Array.from({ length: size }, () => 0.08);

export const nextVisualWaveform = (current: number[], level: number): number[] => {
  const amplified = level < 0.01 ? 0.08 : Math.min(1, Math.max(level * 3.4, Math.sqrt(level) * 0.95));
  return [...current.slice(1), amplified];
};
