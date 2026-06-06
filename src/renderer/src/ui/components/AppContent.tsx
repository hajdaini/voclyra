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

type AppContentProps = {
  section: AppSection;
  mode: HomeMode;
  result: ResultState;
  improveInput: string;
  isRecording: boolean;
  actionBlockMessage: string | null;
  waveform: number[];
  settings: Settings;
  whisperRuntime: WhisperRuntimeInfo;
  history: HistoryEntry[];
  ollamaModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  settingsFocus: 'models' | 'microphone' | 'history' | 'shortcuts' | null;
  onOpenSettings: () => void;
  onModeChange: (mode: HomeMode) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
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
  onResetSettings: () => void;
  onHistoryCopy: (entry: HistoryEntry) => void;
  onHistoryFavoriteToggle: (id: string) => void;
  onHistoryTitleUpdate: (id: string, title: string) => void;
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
  actionBlockMessage,
  waveform,
  settings,
  whisperRuntime,
  history,
  ollamaModels,
  whisperModels,
  availableWhisperModels,
  settingsFocus,
  onOpenSettings,
  onModeChange,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
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
  onResetSettings,
  onHistoryCopy,
  onHistoryFavoriteToggle,
  onHistoryTitleUpdate,
  onHistoryDelete,
  onHistoryDeleteSelected,
  onHistoryClear,
}: AppContentProps): JSX.Element => (
  <section className="content">
    {section === 'home' && (
      <AppHome
        mode={mode}
        result={result}
        improveInput={improveInput}
        isRecording={isRecording}
        actionBlockMessage={actionBlockMessage}
        waveform={waveform}
        settings={settings}
        whisperRuntime={whisperRuntime}
        onOpenSettings={onOpenSettings}
        onModeChange={onModeChange}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        onCancelRecording={onCancelRecording}
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
        onResetSettings={onResetSettings}
      />
    )}
    {section === 'history' && (
      <AppHistory
        history={history}
        onHistoryCopy={onHistoryCopy}
        onHistoryFavoriteToggle={onHistoryFavoriteToggle}
        onHistoryTitleUpdate={onHistoryTitleUpdate}
        onHistoryDelete={onHistoryDelete}
        onHistoryDeleteSelected={onHistoryDeleteSelected}
        onHistoryClear={onHistoryClear}
      />
    )}
    {section === 'about' && <AppAbout />}
  </section>
);
