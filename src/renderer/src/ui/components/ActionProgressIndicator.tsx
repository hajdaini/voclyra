import { type JSX } from 'react';
import type { OverlayState } from '@shared/types';
import { ProgressRing } from './ProgressRing';

type ActionProgressIndicatorProps = {
  state: OverlayState;
  compact?: boolean;
};

export const ActionProgressIndicator = ({ state, compact = false }: ActionProgressIndicatorProps): JSX.Element => {
  const progress = typeof state.progress === 'number' ? Math.round(state.progress) : null;
  const label = progressLabel(state, progress);

  return (
    <span className={`action-progress ${compact ? 'compact' : ''}`} aria-label={label}>
      <ProgressRing progress={progress} size={compact ? 18 : 28} label={label} />
      {label && <span className="action-progress-label">{label}</span>}
    </span>
  );
};

const progressLabel = (state: OverlayState, progress: number | null): string => {
  if (progress !== null) {
    return `${phaseValueLabel(state)} ${progress}%`;
  }
  if (typeof state.tokensGenerated === 'number' && state.tokensGenerated > 0) {
    return `${phaseValueLabel(state)} ${state.tokensGenerated} tokens`;
  }
  if (state.progressLabel) {
    return state.progressLabel;
  }
  return phaseLabel(state);
};

const phaseLabel = (state: OverlayState): string => {
  switch (state.phase) {
    case 'recording':
      return 'Recording...';
    case 'stopping':
      return 'Stopping...';
    case 'preparing':
      return 'Preparing...';
    case 'loading':
      return 'Loading...';
    case 'transcribing':
      return 'Transcribing...';
    case 'thinking':
      return 'Thinking...';
    case 'generating':
      return 'Generating...';
    case 'finalizing':
      return 'Finalizing...';
    default:
      return state.status === 'improving' ? 'Thinking...' : 'Processing...';
  }
};

const phaseValueLabel = (state: OverlayState): string => phaseLabel(state).replace(/\.\.\.$/, '');
