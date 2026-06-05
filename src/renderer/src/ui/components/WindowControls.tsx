import type { JSX } from 'react';

type WindowControlsProps = {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export const WindowControls = ({
  onMinimize,
  onMaximize,
  onClose,
}: WindowControlsProps): JSX.Element => (
  <div className="window-controls">
    <button type="button" title="Minimize" aria-label="Minimize" onClick={onMinimize}>
      <span />
    </button>
    <button type="button" title="Maximize" aria-label="Maximize" onClick={onMaximize}>
      <span />
    </button>
    <button type="button" title="Close" aria-label="Close" onClick={onClose}>
      <span />
    </button>
  </div>
);
