import type { JSX } from 'react';
import type { Settings, WhisperAvailableModel, WhisperModelId } from '@shared/types';
import { SettingsView } from '../views/SettingsView';

type AppSettingsProps = {
  settings: Settings;
  ollamaModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  settingsFocus: 'models' | 'shortcuts' | null;
  onSettingsChange: (settings: Settings) => void;
  onRefreshModels: () => void;
  onDownloadWhisperModel: (id: WhisperModelId) => void;
  onDeleteWhisperModel: (id: WhisperModelId) => void;
  onFocusHandled: () => void;
  onShortcutUnavailable: () => void;
  onShortcutEditingChange: (editing: boolean) => void;
  onOpenDataFolder: () => void;
};

export const AppSettings = ({
  settings,
  ollamaModels,
  whisperModels,
  availableWhisperModels,
  settingsFocus,
  onSettingsChange,
  onRefreshModels,
  onDownloadWhisperModel,
  onDeleteWhisperModel,
  onFocusHandled,
  onShortcutUnavailable,
  onShortcutEditingChange,
  onOpenDataFolder,
}: AppSettingsProps): JSX.Element => (
  <SettingsView
    settings={settings}
    ollamaModels={ollamaModels}
    whisperModels={whisperModels}
    availableWhisperModels={availableWhisperModels}
    onChange={onSettingsChange}
    onRefreshModels={onRefreshModels}
    onDownloadWhisperModel={onDownloadWhisperModel}
    onDeleteWhisperModel={onDeleteWhisperModel}
    focusSection={settingsFocus}
    onFocusHandled={onFocusHandled}
    onShortcutUnavailable={onShortcutUnavailable}
    onShortcutEditingChange={onShortcutEditingChange}
    onOpenDataFolder={onOpenDataFolder}
  />
);
