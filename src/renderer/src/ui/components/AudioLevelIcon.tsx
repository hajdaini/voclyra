import { type CSSProperties, type JSX } from 'react';
import type { LucideIcon } from 'lucide-react';

export type AudioLevelTone = 'quiet' | 'low' | 'medium' | 'high';

export type AudioLevelIconProps = {
  icon: LucideIcon;
  levels: number[];
  active: boolean;
  label: string;
  size?: number;
};

type AudioLevelStyle = CSSProperties & {
  '--audio-level': string;
};

export const audioLevelValue = (levels: number[], active = true): number => {
  if (!active || levels.length === 0) {
    return 0;
  }
  const sample = levels.slice(-4).map((level) => Math.max(0, Math.min(1, level)));
  const average = sample.reduce((sum, level) => sum + level, 0) / sample.length;
  const peak = Math.max(...sample);
  return Math.max(0, Math.min(1, (average * 0.35 + peak * 0.65) * 1.55));
};

export const audioLevelTone = (level: number): AudioLevelTone => {
  if (level >= 0.62) {
    return 'high';
  }
  if (level >= 0.38) {
    return 'medium';
  }
  if (level >= 0.14) {
    return 'low';
  }
  return 'quiet';
};

export const AudioLevelIcon = ({
  icon: Icon,
  levels,
  active,
  label,
  size = 24,
}: AudioLevelIconProps): JSX.Element => {
  const level = audioLevelValue(levels, active);
  const style: AudioLevelStyle = {
    '--audio-level': `${Math.round(level * 100)}%`,
  };

  return (
    <span
      className={`audio-level-icon ${active ? 'active' : ''} ${audioLevelTone(level)}`}
      style={style}
      aria-label={label}
      role="img"
    >
      <Icon className="audio-level-base" size={size} aria-hidden="true" />
      <span className="audio-level-fill" aria-hidden="true">
        <Icon size={size} />
      </span>
    </span>
  );
};
