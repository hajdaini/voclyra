import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type Ref } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Download,
  Gauge,
  Headphones,
  History as HistoryIcon,
  Keyboard,
  LoaderCircle,
  MemoryStick,
  Mic,
  Pencil,
  RefreshCw,
  Settings2,
  Square,
  Trash2,
  Volume2,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type {
  LlmAvailableModel,
  HardwareInfo,
  Settings as SettingsType,
  WhisperAvailableModel,
  WhisperModelId,
} from '@shared/types';
import {
  llmContextSizeValues,
  llmPerformanceModeOptions,
  settingsLimits,
  silenceSensitivityOptions,
  whisperLanguageOptions,
  whisperQualityModeOptions,
} from '@shared/settings-options';
import { actionMessages } from '@shared/action-messages';
import { api } from '../../api';
import { defaultWaveform, nextVisualWaveform, settingsWaveformSize } from '../waveform';
import { AudioLevelIcon } from '../components/AudioLevelIcon';
import { ProgressRing } from '../components/ProgressRing';

type AudioInputDevice = {
  deviceId: string;
  label: string;
};

type AudioOutputDevice = {
  deviceId: string;
  label: string;
};

type AudioCaptureTest = {
  mode: 'speak' | 'transcript';
  timer: number;
  tickTimer: number;
  removeLevelListener: () => void;
  context?: AudioContext;
  oscillator?: OscillatorNode;
  audio?: HTMLAudioElement;
};

type SettingsTab = 'general' | 'audio' | 'ai' | 'shortcuts';

type RemoteTestStatus = {
  tone: 'success' | 'error';
  message: string;
};

export type SettingsViewProps = {
  settings: SettingsType;
  llmModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  availableLlmModels: LlmAvailableModel[];
  deletingLlmModelIds: Set<string>;
  hardwareInfo: HardwareInfo;
  onChange: (settings: SettingsType) => void;
  onRefreshModels: () => void;
  onDownloadWhisperModel: (id: WhisperModelId) => void;
  onDeleteWhisperModel: (id: WhisperModelId) => void;
  onDownloadLlmModel: (id: LlmAvailableModel['id']) => void;
  onDownloadCustomLlmModel: (url: string) => void;
  onDeleteLlmModel: (id: LlmAvailableModel['id']) => void;
  focusSection: 'improveAi' | 'speechAi' | 'microphone' | 'history' | 'shortcuts' | null;
  onFocusHandled: () => void;
  onShortcutUnavailable: () => void;
  onShortcutEditingChange: (editing: boolean) => void;
  onResetSettings: () => void;
};

export const SettingsView = ({
  settings,
  llmModels,
  whisperModels,
  availableWhisperModels,
  availableLlmModels,
  deletingLlmModelIds,
  hardwareInfo,
  onChange,
  onRefreshModels,
  onDownloadWhisperModel,
  onDeleteWhisperModel,
  onDownloadLlmModel,
  onDownloadCustomLlmModel,
  onDeleteLlmModel,
  focusSection,
  onFocusHandled,
  onShortcutUnavailable,
  onShortcutEditingChange,
  onResetSettings,
}: SettingsViewProps): JSX.Element => {
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const improveAiRef = useRef<HTMLElement>(null);
  const speechAiRef = useRef<HTMLElement>(null);
  const microphoneRef = useRef<HTMLElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  const speakShortcutRef = useRef<HTMLButtonElement>(null);
  const microphoneTestRef = useRef<AudioCaptureTest | null>(null);
  const outputTestRef = useRef<AudioCaptureTest | null>(null);
  const [audioInputs, setAudioInputs] = useState<AudioInputDevice[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioOutputDevice[]>([]);
  const [isMicrophoneTesting, setIsMicrophoneTesting] = useState(false);
  const [isOutputTesting, setIsOutputTesting] = useState(false);
  const [microphoneTestLevels, setMicrophoneTestLevels] = useState<number[]>(defaultWaveform(settingsWaveformSize));
  const [microphoneTestRemaining, setMicrophoneTestRemaining] = useState(0);
  const [outputTestRemaining, setOutputTestRemaining] = useState(0);
  const [microphoneTestError, setMicrophoneTestError] = useState('');
  const [outputTestError, setOutputTestError] = useState('');
  const [customLlmUrl, setCustomLlmUrl] = useState('');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [remoteSpeechTestStatus, setRemoteSpeechTestStatus] = useState<RemoteTestStatus | null>(null);
  const [remoteImproveTestStatus, setRemoteImproveTestStatus] = useState<RemoteTestStatus | null>(null);
  const [testingRemoteSpeech, setTestingRemoteSpeech] = useState(false);
  const [testingRemoteImprove, setTestingRemoteImprove] = useState(false);
  const localSpeechRuntimeDisabled = !settings.useLocalSpeechRuntime;
  const localImproveRuntimeDisabled = !settings.useLocalImproveRuntime;

  const testRemoteSpeech = async (): Promise<void> => {
    setTestingRemoteSpeech(true);
    setRemoteSpeechTestStatus(null);
    try {
      await api.remote.testSpeech();
      setRemoteSpeechTestStatus({ tone: 'success', message: 'Speech server connected.' });
    } catch (error) {
      setRemoteSpeechTestStatus({ tone: 'error', message: errorMessage(error) });
    } finally {
      setTestingRemoteSpeech(false);
    }
  };

  const testRemoteImprove = async (): Promise<void> => {
    setTestingRemoteImprove(true);
    setRemoteImproveTestStatus(null);
    try {
      await api.remote.testImprove();
      setRemoteImproveTestStatus({ tone: 'success', message: 'Improve server connected.' });
    } catch (error) {
      setRemoteImproveTestStatus({ tone: 'error', message: errorMessage(error) });
    } finally {
      setTestingRemoteImprove(false);
    }
  };

  useEffect(() => {
    if (!focusSection) {
      return;
    }
    setSettingsTab(focusSection === 'microphone' ? 'audio' : focusSection === 'history' ? 'general' : focusSection === 'shortcuts' ? 'shortcuts' : 'ai');
    if (focusSection === 'improveAi') {
      improveAiRef.current?.scrollIntoView({ block: 'center' });
    } else if (focusSection === 'speechAi') {
      speechAiRef.current?.scrollIntoView({ block: 'center' });
    } else if (focusSection === 'microphone') {
      microphoneRef.current?.scrollIntoView({ block: 'center' });
    } else if (focusSection === 'history') {
      historyRef.current?.scrollIntoView({ block: 'center' });
    } else {
      shortcutsRef.current?.scrollIntoView({ block: 'center' });
      speakShortcutRef.current?.focus();
    }
    onFocusHandled();
  }, [focusSection, onFocusHandled]);

  useEffect(() => {
    let mounted = true;
    const loadAudioDevices = async (): Promise<void> => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) {
          return;
        }
        setAudioInputs(
          devices
            .filter((device) => device.kind === 'audioinput')
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Microphone ${index + 1}`,
            })),
        );
        setAudioOutputs(
          devices
            .filter((device) => device.kind === 'audiooutput')
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Output ${index + 1}`,
            })),
        );
      } catch {
        if (mounted) {
          setAudioInputs([]);
          setAudioOutputs([]);
        }
      }
    };
    void loadAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', loadAudioDevices);
    };
  }, []);

  useEffect(() => () => {
    stopAudioCaptureTest(microphoneTestRef.current);
    stopAudioCaptureTest(outputTestRef.current);
  }, []);

  const toggleMicrophoneTest = async (): Promise<void> => {
    if (microphoneTestRef.current) {
      stopAudioCaptureTest(microphoneTestRef.current);
      microphoneTestRef.current = null;
      setIsMicrophoneTesting(false);
      setMicrophoneTestRemaining(0);
      return;
    }

    stopAudioCaptureTest(outputTestRef.current);
    outputTestRef.current = null;
    setIsOutputTesting(false);
    setOutputTestRemaining(0);

    try {
      setMicrophoneTestError('');
      setMicrophoneTestRemaining(5);
      const startedAt = Date.now();
      const removeLevelListener = api.audioCapture.onLevel((event) => {
        if (event.mode === 'speak') {
          setMicrophoneTestLevels((current) => nextVisualWaveform(current, event.level));
        }
      });
      const tickTimer = window.setInterval(() => {
        setMicrophoneTestRemaining(Math.max(0, 5 - Math.floor((Date.now() - startedAt) / 1000)));
      }, 250);
      const timer = window.setTimeout(() => {
        stopAudioCaptureTest(microphoneTestRef.current);
        microphoneTestRef.current = null;
        setIsMicrophoneTesting(false);
        setMicrophoneTestRemaining(0);
      }, 5000);
      microphoneTestRef.current = { mode: 'speak', timer, tickTimer, removeLevelListener };
      await api.audioCapture.start('speak');
      if (!microphoneTestRef.current) {
        await api.audioCapture.cancel('speak');
        return;
      }
      setIsMicrophoneTesting(true);
    } catch {
      stopAudioCaptureTest(microphoneTestRef.current);
      microphoneTestRef.current = null;
      setMicrophoneTestError('Microphone test failed.');
      setIsMicrophoneTesting(false);
      setMicrophoneTestRemaining(0);
    }
  };

  const playOutputTest = async (): Promise<void> => {
    if (outputTestRef.current) {
      stopAudioCaptureTest(outputTestRef.current);
      outputTestRef.current = null;
      setIsOutputTesting(false);
      setOutputTestRemaining(0);
      return;
    }

    stopAudioCaptureTest(microphoneTestRef.current);
    microphoneTestRef.current = null;
    setIsMicrophoneTesting(false);
    setMicrophoneTestRemaining(0);
    setOutputTestError('');

    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      const audio = new Audio();
      const sinkAudio = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
      const selectedOutputDeviceId = settings.transcriptOutputDeviceId === 'all' ? '' : settings.transcriptOutputDeviceId;
      if (selectedOutputDeviceId && !sinkAudio.setSinkId) {
        await context.close();
        setOutputTestError('Output selection is not supported on this system.');
        return;
      }
      if (selectedOutputDeviceId && sinkAudio.setSinkId) {
        await sinkAudio.setSinkId(selectedOutputDeviceId);
      }
      oscillator.frequency.value = 720;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(destination);
      audio.srcObject = destination.stream;
      setOutputTestRemaining(5);
      const startedAt = Date.now();
      const removeLevelListener = api.audioCapture.onLevel((event) => {
        if (event.mode === 'transcript') {
          setMicrophoneTestLevels((current) => nextVisualWaveform(current, event.level));
        }
      });
      const tickTimer = window.setInterval(() => {
        setOutputTestRemaining(Math.max(0, 5 - Math.floor((Date.now() - startedAt) / 1000)));
      }, 250);
      const timer = window.setTimeout(() => {
        stopAudioCaptureTest(outputTestRef.current);
        outputTestRef.current = null;
        setIsOutputTesting(false);
        setOutputTestRemaining(0);
      }, 5000);
      outputTestRef.current = { mode: 'transcript', timer, tickTimer, removeLevelListener, context, oscillator, audio };
      await api.audioCapture.start('transcript');
      if (!outputTestRef.current) {
        await api.audioCapture.cancel('transcript');
        return;
      }
      await audio.play();
      oscillator.start();
      setIsOutputTesting(true);
    } catch {
      stopAudioCaptureTest(outputTestRef.current);
      outputTestRef.current = null;
      setOutputTestError('Output test failed.');
      setIsOutputTesting(false);
      setOutputTestRemaining(0);
    }
  };

  return (
    <section className="page settings-page">
      <div className="page-heading">
        <div>
          <h1 className="view-title">
            <Settings2 size={21} />
            <span>Settings</span>
          </h1>
        </div>
        <button className="danger-action" type="button" title="Reset settings" onClick={onResetSettings}>
          <RefreshCw size={17} />
          <span>Reset settings</span>
        </button>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        <SettingsTabButton active={settingsTab === 'general'} icon={Settings2} label="General" onClick={() => setSettingsTab('general')} />
        <SettingsTabButton active={settingsTab === 'audio'} icon={Mic} label="Audio" onClick={() => setSettingsTab('audio')} />
        <SettingsTabButton active={settingsTab === 'ai'} icon={Bot} label="AI" onClick={() => setSettingsTab('ai')} />
        <SettingsTabButton active={settingsTab === 'shortcuts'} icon={Keyboard} label="Shortcuts" onClick={() => setSettingsTab('shortcuts')} />
      </div>

      {settingsTab === 'general' && (
      <section className="settings-section">
        <SectionTitle icon={Settings2} title="General" />
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.pasteAfterSpeak}
            onChange={(event) => onChange({ ...settings, pasteAfterSpeak: event.target.checked })}
          />
          <span className="settings-option-label">
            Paste Speak result into active app
            <HelpHint text="When enabled, Speak pastes the final text into the app that was focused before recording." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.pasteAfterImprovement}
            onChange={(event) => onChange({ ...settings, pasteAfterImprovement: event.target.checked })}
          />
          <span className="settings-option-label">
            Paste Improve result into active app
            <HelpHint text="When enabled, Improve pastes the corrected text into the previously focused app after completion." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.improveAfterSpeak}
            onChange={(event) => onChange({ ...settings, improveAfterSpeak: event.target.checked })}
          />
          <span className="settings-option-label">
            Improve automatically after Speak
            <HelpHint text="When enabled, Speak keeps its transcription result and automatically sends that text to Improve." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.improveSelectedText}
            onChange={(event) => onChange({ ...settings, improveSelectedText: event.target.checked })}
          />
          <span className="settings-option-label">
            Copy automatically selected text for Improve
            <HelpHint text="When enabled, Improve first copies the current selection from the active app before correcting it." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.startAtStartup}
            onChange={(event) => onChange({ ...settings, startAtStartup: event.target.checked })}
          />
          <span className="settings-option-label">
            Start Voclyra when Windows starts
            <HelpHint text="When enabled, Windows opens Voclyra automatically after you sign in." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.startAudioServerOnLaunch}
            disabled={localSpeechRuntimeDisabled}
            onChange={(event) => onChange({ ...settings, startAudioServerOnLaunch: event.target.checked })}
          />
          <span className="settings-option-label">
            Start audio server when Voclyra starts
            <HelpHint text="When enabled, Voclyra starts the local audio server automatically on launch." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.startLlmServerOnLaunch}
            disabled={localImproveRuntimeDisabled}
            onChange={(event) => onChange({ ...settings, startLlmServerOnLaunch: event.target.checked })}
          />
          <span className="settings-option-label">
            Start LLM server when Voclyra starts
            <HelpHint text="When enabled, Voclyra starts the local LLM server automatically on launch." />
          </span>
        </label>
      </section>
      )}

      {settingsTab === 'audio' && (
      <section className="settings-section focused-target" ref={microphoneRef}>
        <SectionTitle icon={Mic} title="Audio settings" />
        <label>
          <span className="field-label">
            Microphone input
            <HelpHint text="Choose the microphone used by Speak and by the microphone part of Transcript. System audio is only used by Transcript." />
          </span>
          <select
            value={settings.microphoneDeviceId}
            onChange={(event) => {
              const device = audioInputs.find((input) => input.deviceId === event.target.value);
              onChange({
                ...settings,
                microphoneDeviceId: event.target.value,
                microphoneDeviceLabel: device?.label ?? '',
              });
            }}
          >
            <option value="">System default microphone</option>
            {audioInputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
        <div className="microphone-test">
          <div className="field-label">
            Microphone test
            <HelpHint text="Starts a local microphone test and shows live waves so you can verify the selected microphone works." />
          </div>
          <div className="microphone-test-row">
            <button type="button" onClick={() => void toggleMicrophoneTest()}>
              {isMicrophoneTesting ? <Square size={15} /> : <Mic size={16} />}
              <span>{isMicrophoneTesting ? 'Stop test' : 'Start test'}</span>
            </button>
            <AudioLevelIcon
              icon={Mic}
              levels={microphoneTestLevels}
              active={isMicrophoneTesting}
              label="Microphone level"
              size={22}
            />
            {isMicrophoneTesting && <span className="microphone-test-timer">{microphoneTestRemaining}s</span>}
          </div>
          {microphoneTestError && <span className="microphone-test-error">{microphoneTestError}</span>}
        </div>
        <label>
          <span className="field-label">
            Computer audio for Transcript
            <HelpHint text="Choose the Windows sound output you use for calls or meetings. This helps avoid confusing microphone input with computer audio output." />
          </span>
          <select
            value={settings.transcriptOutputDeviceId}
            onChange={(event) => {
              const device = audioOutputs.find((output) => output.deviceId === event.target.value);
              onChange({
                ...settings,
                transcriptOutputDeviceId: event.target.value,
                transcriptOutputDeviceLabel:
                  event.target.value === 'all'
                    ? 'All computer audio'
                    : event.target.value === ''
                      ? 'Windows default sound output'
                      : device?.label ?? '',
              });
            }}
          >
            <option value="all">All computer audio</option>
            <option value="">Windows default sound output</option>
            {audioOutputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
        <div className="microphone-test">
          <div className="field-label">
            Computer audio test
            <HelpHint text="Plays a short local tone through the selected computer audio output." />
          </div>
          <div className="microphone-test-row">
            <button type="button" onClick={() => void playOutputTest()}>
              <Volume2 size={16} />
              <span>{isOutputTesting ? 'Stop test' : 'Play sound'}</span>
            </button>
            <AudioLevelIcon
              icon={Volume2}
              levels={microphoneTestLevels}
              active={isOutputTesting}
              label="Computer audio level"
              size={22}
            />
            {isOutputTesting && <span className="microphone-test-timer">{outputTestRemaining}s</span>}
          </div>
          {outputTestError && <span className="microphone-test-error">{outputTestError}</span>}
        </div>
        <label>
          <span className="field-label">
            Silence sensitivity
            <HelpHint text="Controls how aggressively silence is detected before sending audio to Whisper. High cuts sooner; Low keeps longer pauses." />
          </span>
          <select
            value={settings.silenceSensitivity}
            onChange={(event) =>
              onChange({ ...settings, silenceSensitivity: event.target.value as SettingsType['silenceSensitivity'] })
            }
          >
            {silenceSensitivityOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>
      )}

      {settingsTab === 'general' && (
      <section className="settings-section focused-target" ref={historyRef}>
        <SectionTitle icon={HistoryIcon} title="History settings" />
        <label className="compact-number-field">
          <span className="field-label">
            Max history items
            <HelpHint text="Limits how many history entries Voclyra keeps. Lower values reduce stored local data." />
          </span>
          <input
            type="number"
            min={settingsLimits.maxHistoryItems.min}
            max={settingsLimits.maxHistoryItems.max}
            step={1}
            value={settings.maxHistoryItems}
            onChange={(event) =>
              onChange({
                ...settings,
                maxHistoryItems: Math.max(
                  settingsLimits.maxHistoryItems.min,
                  Math.min(settingsLimits.maxHistoryItems.max, Number(event.target.value) || settingsLimits.maxHistoryItems.min),
                ),
              })
            }
          />
        </label>
      </section>
      )}

      {settingsTab === 'ai' && (
      <>
      <section className="settings-section focused-target" ref={improveAiRef}>
        <div className="settings-title-row">
          <SectionTitle icon={Wand2} title="Improve AI" />
          {settings.useLocalImproveRuntime && <button type="button" title="Refresh models" onClick={onRefreshModels}>
            <RefreshCw size={17} />
            <span>Refresh models</span>
          </button>}
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.useLocalImproveRuntime}
            onChange={(event) => onChange({
              ...settings,
              useLocalImproveRuntime: event.target.checked,
              useLocalRuntime: settings.useLocalSpeechRuntime && event.target.checked,
            })}
          />
          <span className="settings-option-label">
            Use local Improve runtime
            <HelpHint text="When disabled, Improve uses the remote OpenAI-compatible Improve server." />
          </span>
        </label>
        {!settings.useLocalImproveRuntime && (
          <div className="remote-runtime-panel">
            <div className="remote-runtime-card">
              <h3>Improve server</h3>
              <label>
                <span className="field-label">Server URL</span>
                <input
                  type="url"
                  value={settings.remoteImproveBaseUrl}
                  placeholder="http://localhost:1234/v1"
                  onChange={(event) => onChange({ ...settings, remoteImproveBaseUrl: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">API key</span>
                <input
                  type="password"
                  value={settings.remoteImproveApiKey}
                  onChange={(event) => onChange({ ...settings, remoteImproveApiKey: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">Text model</span>
                <input
                  value={settings.remoteImproveModel}
                  placeholder="gemma-4-e4b-it-qat"
                  onChange={(event) => onChange({ ...settings, remoteImproveModel: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">
                  Correction prompt
                  <HelpHint text="Instruction sent to the remote model for Improve. It uses the same prompt format as local Improve." />
                </span>
                <textarea
                  value={settings.correctionPrompt}
                  onChange={(event) => onChange({ ...settings, correctionPrompt: event.target.value })}
                />
              </label>
              <button type="button" disabled={testingRemoteImprove} onClick={() => void testRemoteImprove()}>
                {testingRemoteImprove ? <LoaderCircle className="status-spinner-icon" size={16} /> : <CheckCircle2 size={16} />}
                <span>Test improve server</span>
              </button>
              {remoteImproveTestStatus && <span className={`remote-test-status ${remoteImproveTestStatus.tone}`}>{remoteImproveTestStatus.message}</span>}
            </div>
          </div>
        )}
        {settings.useLocalImproveRuntime && (
        <div className="model-settings-group">
          <div className="settings-grid models-select-grid">
            <label>
              <span className="field-label">
                Model
                <HelpHint text="Select the local LLM used by Improve. No model means Improve cannot run." />
              </span>
              <select
                value={settings.llmModel}
                disabled={localImproveRuntimeDisabled || (llmModels.length === 0 && !settings.llmModel)}
                onChange={(event) => onChange({ ...settings, llmModel: event.target.value })}
              >
                {llmModels.length === 0 && (
                  <option value={settings.llmModel}>{settings.llmModel || 'No local AI model found'}</option>
                )}
                {llmModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="inline-download-heading">
            <Download size={16} />
            <span>Download local AI models</span>
            <HelpHint text="Paste a direct Hugging Face .gguf file URL. Voclyra downloads it locally, verifies the host and file type, then adds it to the Model list." />
          </div>
          <div className="custom-model-download">
            <input
              type="url"
              value={customLlmUrl}
              disabled={localImproveRuntimeDisabled}
              onChange={(event) => setCustomLlmUrl(event.target.value)}
              placeholder="https://huggingface.co/.../resolve/.../model.gguf"
              aria-label="Custom local AI model URL"
            />
            <button
              type="button"
              title="Download custom local AI model"
              disabled={localImproveRuntimeDisabled || !customLlmUrl.trim()}
              onClick={() => {
                onDownloadCustomLlmModel(customLlmUrl);
                setCustomLlmUrl('');
              }}
            >
              <Download size={16} />
              <span>Download custom</span>
            </button>
          </div>
          <GpuSummary hardwareInfo={hardwareInfo} />
          <div className="model-download-list compact-list">
            {readyModelsFirst(availableLlmModels).map((model) => {
              const StateIcon = modelStateIcon[model.state];
              const isDeleting = deletingLlmModelIds.has(model.id);
              return (
                <article className="model-download-row" key={model.id}>
                  <div className="model-main">
                    <div className={`model-state-icon ${model.state}`}>
                      <StateIcon size={18} />
                    </div>
                    <div>
                      <strong>{model.label}</strong>
                      <span className="model-meta">
                        <VramBadge requiredGb={model.vramGb} hardwareInfo={hardwareInfo} />
                      </span>
                    </div>
                  </div>
                  <div className="model-state">
                    <span className={model.state}>
                      {model.state === 'ready' && <CheckCircle2 size={14} />}
                      {model.state === 'downloading' ? (
                        <ProgressRing progress={model.progress} size={30} label={`${model.label} ${model.progress}%`} fontScale={0.27} />
                      ) : (
                        modelStateLabel(model)
                      )}
                    </span>
                    {model.state === 'ready' && (
                      <button
                        className="model-delete-button"
                        type="button"
                        title={isDeleting ? `Deleting ${model.label}` : `Delete ${model.label}`}
                        aria-label={`Delete ${model.label}`}
                        disabled={localImproveRuntimeDisabled || isDeleting}
                        onClick={() => {
                          if (!localImproveRuntimeDisabled) {
                            onDeleteLlmModel(model.id);
                          }
                        }}
                      >
                        {isDeleting ? (
                          <LoaderCircle className="status-spinner-icon" size={17} aria-label={`Deleting ${model.label}`} />
                        ) : (
                          <Trash2 size={17} />
                        )}
                      </button>
                    )}
                    {model.state === 'missing' && (
                      <button
                        type="button"
                        title={`Download ${model.label}`}
                        aria-label={`Download ${model.label}`}
                        disabled={localImproveRuntimeDisabled}
                        onClick={() => onDownloadLlmModel(model.id)}
                      >
                        <Download size={17} />
                        <span>Download {model.disk}</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="settings-grid models-select-grid">
            <label>
              <span className="field-label">
                Local performance
                <HelpHint text="Balanced keeps the current conservative llama.cpp launch. Fast GPU uses larger batches and explicit GPU cache options." />
              </span>
              <select
                value={settings.llmPerformanceMode}
                disabled={localImproveRuntimeDisabled}
                onChange={(event) =>
                  onChange({ ...settings, llmPerformanceMode: event.target.value as SettingsType['llmPerformanceMode'] })
                }
              >
                {llmPerformanceModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">
                Context size
                <HelpHint text="Controls how much text the model can consider. Smaller is faster; larger handles longer inputs better." />
              </span>
              <select
                value={settings.llmContextSize}
                disabled={localImproveRuntimeDisabled}
                onChange={(event) =>
                  onChange({ ...settings, llmContextSize: Number(event.target.value) as SettingsType['llmContextSize'] })
                }
              >
                {llmContextSizeValues.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">
                Temperature
                <HelpHint text="Controls variation in Improve output. Lower values are more stable and better for correction." />
              </span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={settings.llmTemperature}
                disabled={localImproveRuntimeDisabled}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    llmTemperature: Math.max(0, Math.min(1, Number(event.target.value) || 0)),
                  })
                }
              />
            </label>
          </div>
          <label>
            <span className="field-label">
              Correction prompt
              <HelpHint text="Instruction sent to the local model for Improve. Keep it precise to avoid slow or verbose answers." />
            </span>
            <textarea
              value={settings.correctionPrompt}
              disabled={localImproveRuntimeDisabled}
              onChange={(event) => onChange({ ...settings, correctionPrompt: event.target.value })}
            />
          </label>
        </div>
        )}
      </section>

      <section className="settings-section focused-target" ref={speechAiRef}>
        <div className="settings-title-row">
          <SectionTitle icon={Headphones} title="Speak and Transcript AI" />
          {settings.useLocalSpeechRuntime && <button type="button" title="Refresh models" onClick={onRefreshModels}>
            <RefreshCw size={17} />
            <span>Refresh models</span>
          </button>}
        </div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.useLocalSpeechRuntime}
            onChange={(event) => onChange({
              ...settings,
              useLocalSpeechRuntime: event.target.checked,
              useLocalRuntime: event.target.checked && settings.useLocalImproveRuntime,
            })}
          />
          <span className="settings-option-label">
            Use local Speech runtime
            <HelpHint text="When disabled, Speak and Transcript use the remote OpenAI-compatible speech server." />
          </span>
        </label>
        {!settings.useLocalSpeechRuntime && (
          <div className="remote-runtime-panel">
            <div className="remote-runtime-card">
              <h3>Speech server</h3>
              <label>
                <span className="field-label">Server URL</span>
                <input
                  type="url"
                  value={settings.remoteSpeechBaseUrl}
                  placeholder="https://server.example/v1"
                  onChange={(event) => onChange({ ...settings, remoteSpeechBaseUrl: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">API key</span>
                <input
                  type="password"
                  value={settings.remoteSpeechApiKey}
                  onChange={(event) => onChange({ ...settings, remoteSpeechApiKey: event.target.value })}
                />
              </label>
              <label>
                <span className="field-label">Transcription model</span>
                <input
                  value={settings.remoteSpeechModel}
                  placeholder="whisper-large-v3"
                  onChange={(event) => onChange({ ...settings, remoteSpeechModel: event.target.value })}
                />
              </label>
              <button type="button" disabled={testingRemoteSpeech} onClick={() => void testRemoteSpeech()}>
                {testingRemoteSpeech ? <LoaderCircle className="status-spinner-icon" size={16} /> : <CheckCircle2 size={16} />}
                <span>Test speech server</span>
              </button>
              {remoteSpeechTestStatus && <span className={`remote-test-status ${remoteSpeechTestStatus.tone}`}>{remoteSpeechTestStatus.message}</span>}
            </div>
          </div>
        )}
        {settings.useLocalSpeechRuntime && (
        <div className="model-settings-group">
          <div className="settings-grid models-select-grid">
            <label>
              <span className="field-label">
                Model
                <HelpHint text="Select the local Whisper model used by Speak and Transcript. Larger models are usually more accurate but slower." />
              </span>
              <select
                value={settings.whisperModel}
                disabled={localSpeechRuntimeDisabled || (whisperModels.length === 0 && !settings.whisperModel)}
                onChange={(event) => onChange({ ...settings, whisperModel: event.target.value })}
              >
                {whisperModels.length === 0 && (
                  <option value={settings.whisperModel}>{settings.whisperModel || 'No Whisper model found'}</option>
                )}
                {whisperModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="inline-download-heading">
            <Download size={16} />
            <span>Download Whisper models</span>
            <HelpHint text="Download one of the bundled compatible Whisper models. Custom Whisper model downloads are not available because this list is already validated for Voclyra." />
          </div>
          <GpuSummary hardwareInfo={hardwareInfo} />
          <div className="model-download-list compact-list">
            {availableWhisperModels.map((model) => {
              const StateIcon = modelStateIcon[model.state];
              return (
                <article className="model-download-row" key={model.id}>
                  <div className="model-main">
                    <div className={`model-state-icon ${model.state}`}>
                      <StateIcon size={18} />
                    </div>
                    <div>
                      <strong>{model.label}</strong>
                      <span className="model-meta">
                        <VramBadge requiredGb={model.vramGb} hardwareInfo={hardwareInfo} />
                      </span>
                    </div>
                  </div>
                  <div className="model-state">
                    <span className={model.state}>
                      {model.state === 'ready' && <CheckCircle2 size={14} />}
                      {model.state === 'downloading' ? (
                        <ProgressRing progress={model.progress} size={30} label={`${model.label} ${model.progress}%`} fontScale={0.27} />
                      ) : (
                        modelStateLabel(model)
                      )}
                    </span>
                    {model.state === 'ready' && (
                      <button
                        className="model-delete-button"
                        type="button"
                        title={`Delete ${model.label}`}
                        aria-label={`Delete ${model.label}`}
                        disabled={localSpeechRuntimeDisabled}
                        onClick={() => onDeleteWhisperModel(model.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                    {model.state === 'missing' && (
                      <button
                        type="button"
                        title={`Download ${model.label}`}
                        aria-label={`Download ${model.label}`}
                        disabled={localSpeechRuntimeDisabled}
                        onClick={() => onDownloadWhisperModel(model.id)}
                      >
                        <Download size={17} />
                        <span>Download {model.disk}</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="settings-grid models-select-grid">
            <label>
              <span className="field-label">
                Whisper language
                <HelpHint text="Auto detects the spoken language. A fixed language can be faster and more stable when you always speak the same language." />
              </span>
              <select
                value={settings.whisperLanguage}
                disabled={localSpeechRuntimeDisabled}
                onChange={(event) =>
                  onChange({ ...settings, whisperLanguage: event.target.value as SettingsType['whisperLanguage'] })
                }
              >
                {whisperLanguageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">
                Quality mode
                <HelpHint text="Fast is quicker with lower search effort. Balanced keeps the current behavior. Accurate searches more and can be slower." />
              </span>
              <select
                value={settings.whisperQualityMode}
                disabled={localSpeechRuntimeDisabled}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    whisperQualityMode: event.target.value as SettingsType['whisperQualityMode'],
                  })
                }
              >
                {whisperQualityModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">
                Transcript minimum chunk seconds
                <HelpHint text="Controls the minimum meeting audio duration before Voclyra waits for a short silence and sends the chunk to Whisper." />
              </span>
                <input
                  type="number"
                  min={settingsLimits.transcriptLiveChunkSeconds.min}
                  max={settingsLimits.transcriptLiveChunkSeconds.max}
                  step={5}
                  value={settings.transcriptLiveChunkSeconds}
                  disabled={localSpeechRuntimeDisabled}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      transcriptLiveChunkSeconds: Math.max(
                        settingsLimits.transcriptLiveChunkSeconds.min,
                        Math.min(
                          settingsLimits.transcriptLiveChunkSeconds.max,
                          Math.round(Number(event.target.value) || settings.transcriptLiveChunkSeconds),
                        ),
                      ),
                    })
                  }
                />
            </label>
          </div>
        </div>
        )}
      </section>
      </>
      )}

      {settingsTab === 'shortcuts' && (
      <section className="settings-section focused-target" ref={shortcutsRef}>
        <SectionTitle icon={Keyboard} title="Shortcuts" />
        <div className="settings-grid shortcut-grid">
          <label>
            <span className="field-label">
              <Mic size={16} />
              Speak shortcut
              <HelpHint text="Global shortcut for Speak. While listening, the same shortcut stops the recording." />
            </span>
            <ShortcutInput
              ref={speakShortcutRef}
              value={settings.hotkeys.speak}
              onUnavailable={onShortcutUnavailable}
              onEditingChange={onShortcutEditingChange}
              onChange={(value) =>
                onChange({ ...settings, hotkeys: { ...settings.hotkeys, speak: value } })
              }
            />
          </label>
          <label>
            <span className="field-label">
              <Wand2 size={16} />
              Improve shortcut
              <HelpHint text="Global shortcut for Improve. It can use clipboard text or selected text depending on your settings." />
            </span>
            <ShortcutInput
              value={settings.hotkeys.improveText}
              onUnavailable={onShortcutUnavailable}
              onEditingChange={onShortcutEditingChange}
              onChange={(value) =>
                onChange({
                  ...settings,
                  hotkeys: { ...settings.hotkeys, improveText: value },
                })
              }
            />
          </label>
          <label>
            <span className="field-label">
              <Headphones size={16} />
              Transcript shortcut
              <HelpHint text="Global shortcut for Transcript. While listening, the same shortcut stops the recording." />
            </span>
            <ShortcutInput
              value={settings.hotkeys.transcript}
              onUnavailable={onShortcutUnavailable}
              onEditingChange={onShortcutEditingChange}
              onChange={(value) =>
                onChange({
                  ...settings,
                  hotkeys: { ...settings.hotkeys, transcript: value },
                })
              }
            />
          </label>
        </div>
      </section>
      )}
    </section>
  );
};

type SectionTitleProps = {
  icon: LucideIcon;
  title: string;
  text?: string;
};

const SectionTitle = ({ icon: Icon, title, text }: SectionTitleProps): JSX.Element => (
  <div className="settings-section-title">
    <div>
      <Icon size={19} />
    </div>
    <div>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  </div>
);

const HelpHint = ({ text }: { text: string }): JSX.Element => (
  <span className="settings-help-hint" title={text} aria-label={text} tabIndex={0}>
    <CircleHelp size={14} />
  </span>
);

const SettingsTabButton = ({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}): JSX.Element => (
  <button className={active ? 'active' : ''} type="button" role="tab" aria-selected={active} onClick={onClick}>
    <Icon size={15} />
    <span>{label}</span>
  </button>
);

const GpuSummary = ({ hardwareInfo }: { hardwareInfo: HardwareInfo }): JSX.Element => (
  <div className="gpu-summary">
    <Gauge size={15} />
    <span>{hardwareInfo.gpuName}</span>
    <strong>{hardwareInfo.gpuVramGb ? `${formatGb(hardwareInfo.gpuVramGb)} VRAM` : 'VRAM unknown'}</strong>
  </div>
);

const VramBadge = ({
  requiredGb,
  hardwareInfo,
}: {
  requiredGb: number;
  hardwareInfo: HardwareInfo;
}): JSX.Element => {
  const status = vramStatus(requiredGb, hardwareInfo.gpuVramGb);
  const availableLabel = hardwareInfo.gpuVramGb ? formatGbValue(hardwareInfo.gpuVramGb) : '?';
  return (
    <span className={`vram-badge ${status.kind}`} title={status.title}>
      <MemoryStick size={13} />
      <span>{`${formatGbValue(requiredGb)} / ${availableLabel} GB VRAM (${status.label})`}</span>
    </span>
  );
};

const vramStatus = (
  requiredGb: number,
  availableGb: number | null,
): { kind: 'fast' | 'slow' | 'very-slow'; label: string; title: string } => {
  if (!availableGb) {
    return {
      kind: 'very-slow',
      label: 'Unknown',
      title: 'GPU VRAM could not be detected.',
    };
  }
  if (requiredGb <= availableGb * 0.75) {
    return {
      kind: 'fast',
      label: 'Fast',
      title: 'Enough VRAM headroom for this model.',
    };
  }
  if (requiredGb <= availableGb) {
    return {
      kind: 'slow',
      label: 'Slow',
      title: 'This model fits, but VRAM headroom is tight.',
    };
  }
  return {
    kind: 'very-slow',
    label: 'Very slow',
    title: 'This model exceeds detected VRAM and may fall back to CPU or run very slowly.',
  };
};

const formatGb = (value: number): string => `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;
const formatGbValue = (value: number): string => `${Number.isInteger(value) ? value : value.toFixed(1)}`;
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : actionMessages.operationFailed;

const stopAudioCaptureTest = (test: AudioCaptureTest | null): void => {
  if (!test) {
    return;
  }
  window.clearTimeout(test.timer);
  window.clearInterval(test.tickTimer);
  test.removeLevelListener();
  void api.audioCapture.cancel(test.mode);
  try {
    test.oscillator?.stop();
  } catch {
  }
  test.oscillator?.disconnect();
  test.audio?.pause();
  if (test.audio) {
    test.audio.srcObject = null;
  }
  void test.context?.close();
};

const modelStateIcon = {
  ready: CheckCircle2,
  missing: CircleDashed,
  downloading: CircleDashed,
};

const modelStateLabel = (model: WhisperAvailableModel | LlmAvailableModel): string => {
  if (model.state === 'ready') {
    return 'Ready';
  }
  if (model.state === 'downloading') {
    return 'Downloading';
  }
  return 'Available';
};

const readyModelsFirst = <T extends { state: 'ready' | 'missing' | 'downloading'; label: string; vramGb: number }>(models: T[]): T[] =>
  [...models].sort((left, right) => {
    if (left.state === 'ready' && right.state !== 'ready') {
      return -1;
    }
    if (left.state !== 'ready' && right.state === 'ready') {
      return 1;
    }
    if (left.vramGb !== right.vramGb) {
      return left.vramGb - right.vramGb;
    }
    return left.label.localeCompare(right.label);
  });

type ShortcutInputProps = {
  value: string;
  onChange: (value: string) => void;
  onUnavailable: () => void;
  onEditingChange: (editing: boolean) => void;
  ref?: Ref<HTMLButtonElement>;
};

const ShortcutInput = ({
  value,
  onChange,
  onUnavailable,
  onEditingChange,
  ref,
}: ShortcutInputProps): JSX.Element => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const pressedModifiersRef = useRef<PressedModifiers>(emptyPressedModifiers());

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    onEditingChange(editing);
    pressedModifiersRef.current = emptyPressedModifiers();
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);

  const validateDraft = (): void => {
    onChange(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="shortcut-capture">
        <span>Press desired key combination and then press ENTER.</span>
        <div className="shortcut-capture-row">
          <input
            autoFocus
            readOnly
            value={formatShortcut(draft)}
            onKeyDown={(event) => {
              event.preventDefault();
              updatePressedModifier(pressedModifiersRef.current, event.key, true);
              const modifiers = shortcutModifiers(event, pressedModifiersRef.current);
              const hasModifier = modifiers.commandOrControl || modifiers.alt || modifiers.shift;
              if (event.key === 'Enter' && !hasModifier) {
                validateDraft();
                return;
              }
              if (event.key === 'Escape' && !hasModifier) {
                setDraft(value);
                setEditing(false);
                return;
              }
              const nextShortcut = keyboardEventToShortcut(event, modifiers);
              if (nextShortcut) {
                setDraft(nextShortcut);
                return;
              }
              if (hasModifier && !['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
                onUnavailable();
              }
            }}
            onKeyUp={(event) => {
              updatePressedModifier(pressedModifiersRef.current, event.key, false);
            }}
            onBlur={() => {
              pressedModifiersRef.current = emptyPressedModifiers();
            }}
          />
          <button type="button" title="Apply shortcut" aria-label="Apply shortcut" onClick={validateDraft}>
            <Check size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shortcut-display-row">
      <div className="shortcut-keys" aria-label={formatShortcut(value)}>
        {formatShortcut(value)
          .split('+')
          .map((key, index) => (
            <span
              className={index === 0 ? 'shortcut-key' : 'shortcut-key-with-separator'}
              key={`${key}-${index}`}
            >
              {index > 0 && <b>+</b>}
              <em>{key}</em>
            </span>
          ))}
      </div>
      <button ref={ref} type="button" title="Edit shortcut" onClick={() => setEditing(true)}>
        <Pencil size={15} />
        <span>Edit</span>
      </button>
    </div>
  );
};

const keyboardEventToShortcut = (
  event: KeyboardEvent<HTMLInputElement>,
  modifiers = shortcutModifiers(event),
): string => {
  return shortcutFromKey(event.key, event.code, modifiers);
};

type PressedModifiers = {
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
};

export type ShortcutModifiers = {
  commandOrControl: boolean;
  alt: boolean;
  shift: boolean;
};

export const shortcutFromKey = (key: string, code: string, modifiers: ShortcutModifiers): string => {
  const normalizedKey = shortcutKey(key, code);
  if (!normalizedKey || ['Control', 'Alt', 'Shift', 'Meta'].includes(normalizedKey)) {
    return '';
  }
  const keys = [
    modifiers.commandOrControl ? 'CommandOrControl' : '',
    modifiers.alt ? 'Alt' : '',
    modifiers.shift ? 'Shift' : '',
    normalizedKey,
  ].filter(Boolean);
  return keys.length >= 2 ? keys.join('+') : '';
};

const emptyPressedModifiers = (): PressedModifiers => ({
  control: false,
  meta: false,
  alt: false,
  shift: false,
});

const updatePressedModifier = (modifiers: PressedModifiers, key: string, pressed: boolean): void => {
  if (key === 'Control') {
    modifiers.control = pressed;
  } else if (key === 'Meta') {
    modifiers.meta = pressed;
  } else if (key === 'Alt') {
    modifiers.alt = pressed;
  } else if (key === 'Shift') {
    modifiers.shift = pressed;
  }
};

const shortcutModifiers = (
  event: KeyboardEvent<HTMLInputElement>,
  pressed: PressedModifiers = emptyPressedModifiers(),
): ShortcutModifiers => ({
  commandOrControl: event.ctrlKey || event.metaKey || pressed.control || pressed.meta,
  alt: event.altKey || pressed.alt,
  shift: event.shiftKey || pressed.shift,
});

export const shortcutKey = (key: string, code = ''): string => {
  const numpadMatch = /^Numpad([0-9])$/.exec(code);
  if (numpadMatch) {
    return `num${numpadMatch[1]}`;
  }
  if (key === ' ') {
    return 'Space';
  }
  if (/^[a-z0-9]$/i.test(key)) {
    return key.toUpperCase();
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) {
    return key.toUpperCase();
  }
  const namedKey = reliableNamedKeys.get(key);
  if (namedKey) {
    return namedKey;
  }
  return '';
};

const formatShortcut = (shortcut: string): string => shortcut.replace('CommandOrControl', 'Ctrl');

const reliableNamedKeys = new Map([
  ['Space', 'Space'],
  ['Tab', 'Tab'],
  ['Enter', 'Enter'],
  ['Escape', 'Escape'],
  ['Backspace', 'Backspace'],
  ['Delete', 'Delete'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['Home', 'Home'],
  ['End', 'End'],
  ['PageUp', 'PageUp'],
  ['PageDown', 'PageDown'],
]);
