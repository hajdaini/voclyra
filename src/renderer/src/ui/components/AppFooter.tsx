import { type JSX } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import type { GpuUsage } from '@shared/types';
import { packageInfo } from '@shared/GlobalVars';
import { AudioLevelIcon } from './AudioLevelIcon';

type AppFooterProps = {
  gpuUsage: GpuUsage;
  microphoneLevels: number[];
  systemAudioLevels: number[];
  microphoneActive: boolean;
  systemAudioActive: boolean;
  onMicrophoneSettings: () => void;
  onAudioSettings: () => void;
};

export const AppFooter = ({
  gpuUsage,
  microphoneLevels,
  systemAudioLevels,
  microphoneActive,
  systemAudioActive,
  onMicrophoneSettings,
  onAudioSettings,
}: AppFooterProps): JSX.Element => (
  <footer className="app-footer">
    <span className="footer-version">{`${packageInfo.productName} ${packageInfo.version}`}</span>
    <div className="footer-actions">
      <button type="button" className="footer-audio-button" title="Open microphone settings" onClick={onMicrophoneSettings}>
        <AudioLevelIcon icon={Mic} levels={microphoneLevels} active={microphoneActive} label="Microphone level" size={18} />
        <span>Microphone</span>
      </button>
      <button type="button" className="footer-audio-button" title="Open computer audio settings" onClick={onAudioSettings}>
        <AudioLevelIcon icon={Volume2} levels={systemAudioLevels} active={systemAudioActive} label="Computer audio level" size={18} />
        <span>Audio</span>
      </button>
      <GpuUsageBadge usage={gpuUsage} />
    </div>
  </footer>
);

const GpuUsageBadge = ({ usage }: { usage: GpuUsage }): JSX.Element | null => {
  if (!usage.available || usage.memoryUsedGb === null || usage.memoryTotalGb === null) {
    return null;
  }

  const tone = gpuUsageTone(usage.memoryUsagePercent);
  const title = `${usage.name} VRAM ${usage.memoryUsagePercent ?? '?'}%, GPU ${usage.utilizationPercent ?? '?'}%`;
  return (
    <div className={`footer-gpu-usage ${tone}`} title={title} aria-label={title}>
      <span>VRAM</span>
      <strong>{`${formatGb(usage.memoryUsedGb)} / ${formatGb(usage.memoryTotalGb)}`}</strong>
      <em>{`${usage.memoryUsagePercent ?? 0}%`}</em>
    </div>
  );
};

const gpuUsageTone = (percent: number | null): 'low' | 'medium' | 'high' => {
  if (percent === null) {
    return 'low';
  }
  if (percent >= 90) {
    return 'high';
  }
  if (percent >= 80) {
    return 'medium';
  }
  return 'low';
};

const formatGb = (value: number): string => `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;
