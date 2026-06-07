import type { JSX } from 'react';
import type { HardwareInfo, HomeMode, LlmRuntimeInfo, OverlayState, ResultState, Settings, WhisperRuntimeInfo } from '@shared/types';
import { HomeView } from '../views/HomeView';

type AppHomeProps = {
  mode: HomeMode;
  result: ResultState;
  overlayState: OverlayState;
  improveInput: string;
  isRecording: boolean;
  actionBlockMessage: string | null;
  waveform: number[];
  settings: Settings;
  whisperRuntime: WhisperRuntimeInfo;
  llmRuntime: LlmRuntimeInfo;
  runtimeInfoLoaded: boolean;
  hardwareInfo: HardwareInfo;
  whisperModelAvailable: boolean;
  llmModelAvailable: boolean;
  onOpenSettings: () => void;
  onModeChange: (mode: HomeMode) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onStartTranscript: () => void;
  onStopTranscript: () => void;
  onImprove: () => void;
  onImproveInputChange: (value: string) => void;
  onImproveInputFocusChange: (focused: boolean) => void;
  onCopyResult: () => void;
};

export const AppHome = ({
  mode,
  result,
  overlayState,
  improveInput,
  isRecording,
  actionBlockMessage,
  waveform,
  settings,
  whisperRuntime,
  llmRuntime,
  runtimeInfoLoaded,
  hardwareInfo,
  whisperModelAvailable,
  llmModelAvailable,
  onOpenSettings,
  onModeChange,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onStartTranscript,
  onStopTranscript,
  onImprove,
  onImproveInputChange,
  onImproveInputFocusChange,
  onCopyResult,
}: AppHomeProps): JSX.Element => (
  <HomeView
    mode={mode}
    result={result}
    overlayState={overlayState}
    improveInput={improveInput}
    isRecording={isRecording}
    actionBlockMessage={actionBlockMessage}
    waveform={waveform}
    whisperModel={settings.whisperModel}
    llmModel={settings.llmModel}
    hotkeys={settings.hotkeys}
    whisperRuntime={whisperRuntime}
    llmRuntime={llmRuntime}
    runtimeInfoLoaded={runtimeInfoLoaded}
    hardwareInfo={hardwareInfo}
    whisperModelAvailable={whisperModelAvailable}
    llmModelAvailable={llmModelAvailable}
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
    onCopy={onCopyResult}
  />
);
