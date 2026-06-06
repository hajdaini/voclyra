import { type JSX } from 'react';

type ProgressRingProps = {
  progress?: number | null;
  size?: number;
  label?: string;
  showValue?: boolean;
  fontScale?: number;
};

export const ProgressRing = ({
  progress = null,
  size = 28,
  label,
  showValue = true,
  fontScale = 0.32,
}: ProgressRingProps): JSX.Element => {
  const value = typeof progress === 'number' ? clampProgress(Math.round(progress)) : null;
  const style =
    value === null
      ? { '--ring-font-size': `${Math.max(7, Math.round(size * fontScale))}px` }
      : {
          '--progress': `${value * 3.6}deg`,
          '--ring-font-size': `${Math.max(7, Math.round(size * fontScale))}px`,
        };

  return (
    <span
      className={`progress-ring ${value === null ? 'indeterminate' : 'determinate'}`}
      style={{ width: size, height: size, ...style }}
      aria-label={label ?? (value === null ? 'Loading' : `${value}%`)}
      role="status"
    >
      {showValue && value !== null && <span>{value}%</span>}
    </span>
  );
};

const clampProgress = (progress: number): number => Math.max(0, Math.min(100, progress));
