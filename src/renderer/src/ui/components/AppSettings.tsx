import type { JSX } from 'react';
import type { HardwareInfo, LlmAvailableModel, Settings, WhisperAvailableModel, WhisperModelId } from '@shared/types';
import { SettingsView } from '../views/SettingsView';

type AppSettingsProps = {
  settings: Settings;
  llmModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  availableLlmModels: LlmAvailableModel[];
  hardwareInfo: HardwareInfo;
  settingsFocus: 'improveAi' | 'speechAi' | 'microphone' | 'history' | 'shortcuts' | null;
  onSettingsChange: (settings: Settings) => void;
  onRefreshModels: () => void;
  onDownloadWhisperModel: (id: WhisperModelId) => void;
  onDeleteWhisperModel: (id: WhisperModelId) => void;
  onDownloadLlmModel: (id: LlmAvailableModel['id']) => void;
  onDeleteLlmModel: (id: LlmAvailableModel['id']) => void;
  onFocusHandled: () => void;
  onShortcutUnavailable: () => void;
  onShortcutEditingChange: (editing: boolean) => void;
  onResetSettings: () => void;
};

export const AppSettings = ({
  settings,
  llmModels,
  whisperModels,
  availableWhisperModels,
  availableLlmModels,
  hardwareInfo,
  settingsFocus,
  onSettingsChange,
  onRefreshModels,
  onDownloadWhisperModel,
  onDeleteWhisperModel,
  onDownloadLlmModel,
  onDeleteLlmModel,
  onFocusHandled,
  onShortcutUnavailable,
  onShortcutEditingChange,
  onResetSettings,
}: AppSettingsProps): JSX.Element => (
  <SettingsView
    settings={settings}
    llmModels={llmModels}
    whisperModels={whisperModels}
    availableWhisperModels={availableWhisperModels}
    availableLlmModels={availableLlmModels}
    hardwareInfo={hardwareInfo}
    onChange={onSettingsChange}
    onRefreshModels={onRefreshModels}
    onDownloadWhisperModel={onDownloadWhisperModel}
    onDeleteWhisperModel={onDeleteWhisperModel}
    onDownloadLlmModel={onDownloadLlmModel}
    onDeleteLlmModel={onDeleteLlmModel}
    focusSection={settingsFocus}
    onFocusHandled={onFocusHandled}
    onShortcutUnavailable={onShortcutUnavailable}
    onShortcutEditingChange={onShortcutEditingChange}
    onResetSettings={onResetSettings}
  />
);
