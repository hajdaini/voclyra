import { useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { CircleHelp, FileUp } from 'lucide-react';
import type { GpuUsage, Hotkeys } from '@shared/types';
import { packageInfo } from '@shared/GlobalVars';
import logoUrl from '@assets/logo.svg';
import { WindowControls } from './WindowControls';

type AppTopbarProps = {
  hotkeys: Hotkeys;
  gpuUsage: GpuUsage;
  hasRecording: boolean;
  isImproveProcessing: boolean;
  onOpenLogsFolder: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
  onSpeak: () => void;
  onImprove: () => void;
  onTranscript: () => void;
  onImportAudio: () => void;
  onOpenHelp: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onImproveModelSettings: () => void;
  onSpeechModelSettings: () => void;
  onMicrophoneSettings: () => void;
  onShortcutSettings: () => void;
  onHistorySettings: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

type OpenMenu = 'file' | 'actions' | 'edit' | null;

export const AppTopbar = ({
  hotkeys,
  gpuUsage,
  hasRecording,
  isImproveProcessing,
  onOpenLogsFolder,
  onOpenSettings,
  onQuit,
  onSpeak,
  onImprove,
  onTranscript,
  onImportAudio,
  onOpenHelp,
  onStopRecording,
  onCancelRecording,
  onImproveModelSettings,
  onSpeechModelSettings,
  onMicrophoneSettings,
  onShortcutSettings,
  onHistorySettings,
  onMinimize,
  onMaximize,
  onClose,
}: AppTopbarProps): JSX.Element => {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const runAction = (action: () => void): void => {
    setOpenMenu(null);
    action();
  };
  const closeMenuOnTopbarClick = (event: ReactMouseEvent<HTMLElement>): void => {
    if (openMenu && !(event.target as HTMLElement).closest('.topbar-dropdown')) {
      setOpenMenu(null);
    }
  };

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!topbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  return (
    <header className="app-topbar" ref={topbarRef} onMouseDown={closeMenuOnTopbarClick}>
      <div className="topbar-logo" aria-label={packageInfo.productName}>
        <img src={logoUrl} alt="" />
      </div>
      <nav className="topbar-menu" aria-label="Application menu">
        <div className={`topbar-dropdown ${openMenu === 'file' ? 'open' : ''}`}>
          <button type="button" className="topbar-menu-trigger" onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}>
            File
          </button>
          {openMenu === 'file' && (
            <div className="topbar-dropdown-menu">
              <button type="button" onClick={() => runAction(onImportAudio)}>
                <span>Import audio</span>
              </button>
              <hr />
              <button type="button" onClick={() => runAction(onOpenLogsFolder)}>
                <span>Logs folder</span>
              </button>
              <button type="button" onClick={() => runAction(onOpenSettings)}>
                <span>Settings...</span>
              </button>
              <hr />
              <button type="button" onClick={() => runAction(onQuit)}>
                <span>Exit</span>
              </button>
            </div>
          )}
        </div>
        <div className={`topbar-dropdown ${openMenu === 'actions' ? 'open' : ''}`}>
          <button type="button" className="topbar-menu-trigger" onClick={() => setOpenMenu(openMenu === 'actions' ? null : 'actions')}>
            Actions
          </button>
          {openMenu === 'actions' && (
            <div className="topbar-dropdown-menu">
              <button type="button" onClick={() => runAction(onSpeak)}>
                <span>Speak</span>
                <kbd>{formatShortcut(hotkeys.speak)}</kbd>
              </button>
              <button type="button" disabled={isImproveProcessing} onClick={() => runAction(onImprove)}>
                <span>Improve</span>
                <kbd>{formatShortcut(hotkeys.improveText)}</kbd>
              </button>
              <button type="button" onClick={() => runAction(onTranscript)}>
                <span>Transcript</span>
                <kbd>{formatShortcut(hotkeys.transcript)}</kbd>
              </button>
              {hasRecording && <hr />}
              {hasRecording && (
                <button type="button" onClick={() => runAction(onStopRecording)}>
                  <span>Stop recording</span>
                  <kbd>{formatShortcut(hotkeys.speak)} / {formatShortcut(hotkeys.transcript)}</kbd>
                </button>
              )}
              {hasRecording && (
                <button type="button" onClick={() => runAction(onCancelRecording)}>
                  <span>Cancel recording</span>
                </button>
              )}
            </div>
          )}
        </div>
        <div className={`topbar-dropdown ${openMenu === 'edit' ? 'open' : ''}`}>
          <button type="button" className="topbar-menu-trigger" onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}>
            Edit
          </button>
          {openMenu === 'edit' && (
            <div className="topbar-dropdown-menu">
              <button type="button" onClick={() => runAction(onImproveModelSettings)}>
                <span>Improve AI model</span>
              </button>
              <button type="button" onClick={() => runAction(onSpeechModelSettings)}>
                <span>Speak & Transcript model</span>
              </button>
              <hr />
              <button type="button" onClick={() => runAction(onMicrophoneSettings)}>
                <span>Microphone settings</span>
              </button>
              <button type="button" onClick={() => runAction(onShortcutSettings)}>
                <span>Shortcuts</span>
              </button>
              <button type="button" onClick={() => runAction(onHistorySettings)}>
                <span>History settings</span>
              </button>
            </div>
          )}
        </div>
        <button type="button" className="topbar-import-action" onClick={() => runAction(onImportAudio)}>
          <FileUp size={14} />
          <span>Import audio</span>
        </button>
        <button type="button" className="topbar-import-action" onClick={() => runAction(onOpenHelp)}>
          <CircleHelp size={14} />
          <span>Help</span>
        </button>
      </nav>
      <div className={`topbar-spacer ${openMenu ? 'menu-open' : ''}`} onMouseDown={() => setOpenMenu(null)} />
      <GpuUsageBadge usage={gpuUsage} />
      <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
    </header>
  );
};

const formatShortcut = (shortcut: string): string => shortcut.replace('CommandOrControl', 'Ctrl');

const GpuUsageBadge = ({ usage }: { usage: GpuUsage }): JSX.Element | null => {
  if (!usage.available || usage.memoryUsedGb === null || usage.memoryTotalGb === null) {
    return null;
  }

  const tone = gpuUsageTone(usage.memoryUsagePercent);
  const title = `${usage.name} VRAM ${usage.memoryUsagePercent ?? '?'}%, GPU ${usage.utilizationPercent ?? '?'}%`;
  return (
    <div className={`topbar-gpu-usage ${tone}`} title={title} aria-label={title}>
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
