import type { JSX } from 'react';
import type {
  AppSection,
  HistoryEntry,
  HomeMode,
  ResultState,
  Settings,
  WhisperAvailableModel,
  WhisperModelId,
  WhisperRuntimeInfo,
} from '@shared/types';
import { AppAbout } from './AppAbout';
import { AppHistory } from './AppHistory';
import { AppHome } from './AppHome';
import { AppSettings } from './AppSettings';
import { WindowControls } from './WindowControls';

type AppContentProps = {
  section: AppSection;
  mode: HomeMode;
  result: ResultState;
  improveInput: string;
  isRecording: boolean;
  waveform: number[];
  settings: Settings;
  whisperRuntime: WhisperRuntimeInfo;
  history: HistoryEntry[];
  ollamaModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  settingsFocus: 'shortcuts' | null;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
  onModeChange: (mode: HomeMode) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onImprove: () => void;
  onImproveInputChange: (value: string) => void;
  onImproveInputFocusChange: (focused: boolean) => void;
  onCopyResult: () => void;
  onStartTranscript: () => void;
  onStopTranscript: () => void;
  onSettingsChange: (settings: Settings) => void;
  onRefreshModels: () => void;
  onDownloadWhisperModel: (id: WhisperModelId) => void;
  onDeleteWhisperModel: (id: WhisperModelId) => void;
  onFocusHandled: () => void;
  onShortcutUnavailable: () => void;
  onShortcutEditingChange: (editing: boolean) => void;
  onOpenDataFolder: () => void;
  onHistoryCopy: (entry: HistoryEntry) => void;
  onHistoryFavoriteToggle: (id: string) => void;
  onHistoryDelete: (id: string) => void;
  onHistoryDeleteSelected: (ids: string[]) => void;
  onHistoryClear: () => void;
};

export const AppContent = ({
  section,
  mode,
  result,
  improveInput,
  isRecording,
  waveform,
  settings,
  whisperRuntime,
  history,
  ollamaModels,
  whisperModels,
  availableWhisperModels,
  settingsFocus,
  onMinimize,
  onMaximize,
  onClose,
  onOpenSettings,
  onModeChange,
  onStartRecording,
  onStopRecording,
  onImprove,
  onImproveInputChange,
  onImproveInputFocusChange,
  onCopyResult,
  onStartTranscript,
  onStopTranscript,
  onSettingsChange,
  onRefreshModels,
  onDownloadWhisperModel,
  onDeleteWhisperModel,
  onFocusHandled,
  onShortcutUnavailable,
  onShortcutEditingChange,
  onOpenDataFolder,
  onHistoryCopy,
  onHistoryFavoriteToggle,
  onHistoryDelete,
  onHistoryDeleteSelected,
  onHistoryClear,
}: AppContentProps): JSX.Element => (
  <section className="content">
    <div className="titlebar" />
    <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
    {section === 'home' && (
      <AppHome
        mode={mode}
        result={result}
        improveInput={improveInput}
        isRecording={isRecording}
        waveform={waveform}
        settings={settings}
        whisperRuntime={whisperRuntime}
        onOpenSettings={onOpenSettings}
        onModeChange={onModeChange}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        onStartTranscript={onStartTranscript}
        onStopTranscript={onStopTranscript}
        onImprove={onImprove}
        onImproveInputChange={onImproveInputChange}
        onImproveInputFocusChange={onImproveInputFocusChange}
        onCopyResult={onCopyResult}
      />
    )}
    {section === 'settings' && (
      <AppSettings
        settings={settings}
        ollamaModels={ollamaModels}
        whisperModels={whisperModels}
        availableWhisperModels={availableWhisperModels}
        settingsFocus={settingsFocus}
        onSettingsChange={onSettingsChange}
        onRefreshModels={onRefreshModels}
        onDownloadWhisperModel={onDownloadWhisperModel}
        onDeleteWhisperModel={onDeleteWhisperModel}
        onFocusHandled={onFocusHandled}
        onShortcutUnavailable={onShortcutUnavailable}
        onShortcutEditingChange={onShortcutEditingChange}
        onOpenDataFolder={onOpenDataFolder}
      />
    )}
    {section === 'history' && (
      <AppHistory
        history={history}
        onHistoryCopy={onHistoryCopy}
        onHistoryFavoriteToggle={onHistoryFavoriteToggle}
        onHistoryDelete={onHistoryDelete}
        onHistoryDeleteSelected={onHistoryDeleteSelected}
        onHistoryClear={onHistoryClear}
      />
    )}
    {section === 'about' && <AppAbout />}
  </section>
);
