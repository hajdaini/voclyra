import type { JSX } from 'react';
import type { HomeMode, ResultState, Settings, WhisperRuntimeInfo } from '@shared/types';
import { HomeView } from '../views/HomeView';

type AppHomeProps = {
  mode: HomeMode;
  result: ResultState;
  improveInput: string;
  isRecording: boolean;
  waveform: number[];
  settings: Settings;
  whisperRuntime: WhisperRuntimeInfo;
  onOpenSettings: () => void;
  onModeChange: (mode: HomeMode) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
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
  improveInput,
  isRecording,
  waveform,
  settings,
  whisperRuntime,
  onOpenSettings,
  onModeChange,
  onStartRecording,
  onStopRecording,
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
    improveInput={improveInput}
    isRecording={isRecording}
    waveform={waveform}
    whisperModel={settings.whisperModel}
    ollamaModel={settings.ollamaModel}
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
    onCopy={onCopyResult}
  />
);
