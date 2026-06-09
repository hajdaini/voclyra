import type { JSX } from 'react';
import type {
  AppSection,
  HardwareInfo,
  HistoryEntry,
  HomeMode,
  LlmAvailableModel,
  LlmRuntimeInfo,
  OverlayState,
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
  overlayState: OverlayState;
  improveInput: string;
  isRecording: boolean;
  actionBlockMessage: string | null;
  settings: Settings;
  whisperRuntime: WhisperRuntimeInfo;
  llmRuntime: LlmRuntimeInfo;
  runtimeInfoLoaded: boolean;
  whisperModelAvailable: boolean;
  llmModelAvailable: boolean;
  audioServerEnabled: boolean;
  llmServerEnabled: boolean;
  audioServerBusy: boolean;
  llmServerBusy: boolean;
  history: HistoryEntry[];
  llmModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  availableLlmModels: LlmAvailableModel[];
  deletingLlmModelIds: Set<string>;
  hardwareInfo: HardwareInfo;
  settingsFocus: 'improveAi' | 'speechAi' | 'microphone' | 'history' | 'shortcuts' | null;
  onOpenSettings: () => void;
  onAudioServerChange: (enabled: boolean) => void;
  onLlmServerChange: (enabled: boolean) => void;
  onModeChange: (mode: HomeMode) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onImprove: () => void;
  onImproveInputChange: (value: string) => void;
  onImproveInputFocusChange: (focused: boolean) => void;
  onCopyResult: () => void;
  onExportResult: () => void;
  onStartTranscript: () => void;
  onStopTranscript: () => void;
  onSettingsChange: (settings: Settings) => void;
  onRefreshModels: () => void;
  onDownloadWhisperModel: (id: WhisperModelId) => void;
  onDeleteWhisperModel: (id: WhisperModelId) => void;
  onDownloadLlmModel: (id: LlmAvailableModel['id']) => void;
  onDownloadCustomLlmModel: (url: string) => void;
  onDeleteLlmModel: (id: LlmAvailableModel['id']) => void;
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
  overlayState,
  improveInput,
  isRecording,
  actionBlockMessage,
  settings,
  whisperRuntime,
  llmRuntime,
  runtimeInfoLoaded,
  whisperModelAvailable,
  llmModelAvailable,
  audioServerEnabled,
  llmServerEnabled,
  audioServerBusy,
  llmServerBusy,
  history,
  llmModels,
  whisperModels,
  availableWhisperModels,
  availableLlmModels,
  deletingLlmModelIds,
  hardwareInfo,
  settingsFocus,
  onOpenSettings,
  onAudioServerChange,
  onLlmServerChange,
  onModeChange,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onImprove,
  onImproveInputChange,
  onImproveInputFocusChange,
  onCopyResult,
  onExportResult,
  onStartTranscript,
  onStopTranscript,
  onSettingsChange,
  onRefreshModels,
  onDownloadWhisperModel,
  onDeleteWhisperModel,
  onDownloadLlmModel,
  onDownloadCustomLlmModel,
  onDeleteLlmModel,
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
        overlayState={overlayState}
        improveInput={improveInput}
        isRecording={isRecording}
        actionBlockMessage={actionBlockMessage}
        settings={settings}
        whisperRuntime={whisperRuntime}
        llmRuntime={llmRuntime}
        runtimeInfoLoaded={runtimeInfoLoaded}
        hardwareInfo={hardwareInfo}
        whisperModelAvailable={whisperModelAvailable}
        llmModelAvailable={llmModelAvailable}
        audioServerEnabled={audioServerEnabled}
        llmServerEnabled={llmServerEnabled}
        audioServerBusy={audioServerBusy}
        llmServerBusy={llmServerBusy}
        onOpenSettings={onOpenSettings}
        onAudioServerChange={onAudioServerChange}
        onLlmServerChange={onLlmServerChange}
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
        onExportResult={onExportResult}
      />
    )}
    {section === 'settings' && (
      <AppSettings
        settings={settings}
        llmModels={llmModels}
        whisperModels={whisperModels}
        availableWhisperModels={availableWhisperModels}
        availableLlmModels={availableLlmModels}
        deletingLlmModelIds={deletingLlmModelIds}
        hardwareInfo={hardwareInfo}
        settingsFocus={settingsFocus}
        onSettingsChange={onSettingsChange}
        onRefreshModels={onRefreshModels}
        onDownloadWhisperModel={onDownloadWhisperModel}
        onDeleteWhisperModel={onDeleteWhisperModel}
        onDownloadLlmModel={onDownloadLlmModel}
        onDownloadCustomLlmModel={onDownloadCustomLlmModel}
        onDeleteLlmModel={onDeleteLlmModel}
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
