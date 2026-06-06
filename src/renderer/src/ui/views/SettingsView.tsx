import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type Ref } from 'react';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Download,
  Gauge,
  Headphones,
  History as HistoryIcon,
  Keyboard,
  MemoryStick,
  Mic,
  Pencil,
  RefreshCw,
  Settings2,
  Square,
  Trash2,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { llamaCudaRuntimeVersionConfig, whisperCudaRuntimeVersionConfig } from '@shared/GlobalVars';
import type {
  LlmAvailableModel,
  HardwareInfo,
  Settings as SettingsType,
  WhisperAvailableModel,
  WhisperModelId,
} from '@shared/types';
import { ProgressRing } from '../components/ProgressRing';

type AudioInputDevice = {
  deviceId: string;
  label: string;
};

type MicrophoneTest = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
};

export type SettingsViewProps = {
  settings: SettingsType;
  llmModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  availableLlmModels: LlmAvailableModel[];
  hardwareInfo: HardwareInfo;
  onChange: (settings: SettingsType) => void;
  onRefreshModels: () => void;
  onDownloadWhisperModel: (id: WhisperModelId) => void;
  onDeleteWhisperModel: (id: WhisperModelId) => void;
  onDownloadLlmModel: (id: LlmAvailableModel['id']) => void;
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
  hardwareInfo,
  onChange,
  onRefreshModels,
  onDownloadWhisperModel,
  onDeleteWhisperModel,
  onDownloadLlmModel,
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
  const microphoneTestRef = useRef<MicrophoneTest | null>(null);
  const [audioInputs, setAudioInputs] = useState<AudioInputDevice[]>([]);
  const [isMicrophoneTesting, setIsMicrophoneTesting] = useState(false);
  const [microphoneTestLevels, setMicrophoneTestLevels] = useState<number[]>(Array.from({ length: 16 }, () => 0.08));
  const [microphoneTestError, setMicrophoneTestError] = useState('');

  useEffect(() => {
    if (!focusSection) {
      return;
    }
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
    const loadAudioInputs = async (): Promise<void> => {
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
      } catch {
        if (mounted) {
          setAudioInputs([]);
        }
      }
    };
    void loadAudioInputs();
    navigator.mediaDevices.addEventListener('devicechange', loadAudioInputs);
    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', loadAudioInputs);
    };
  }, []);

  useEffect(() => () => {
    stopMicrophoneTest(microphoneTestRef.current);
  }, []);

  const toggleMicrophoneTest = async (): Promise<void> => {
    if (microphoneTestRef.current) {
      stopMicrophoneTest(microphoneTestRef.current);
      microphoneTestRef.current = null;
      setIsMicrophoneTesting(false);
      return;
    }

    try {
      setMicrophoneTestError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: settings.microphoneEchoCancellation,
          noiseSuppression: settings.microphoneNoiseSuppression,
          autoGainControl: settings.microphoneAutoGainControl,
          ...(settings.microphoneDeviceId ? { deviceId: { exact: settings.microphoneDeviceId } } : {}),
        },
      });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        let sum = 0;
        for (const sample of input) {
          sum += sample * sample;
        }
        const level = Math.min(1, Math.sqrt(sum / input.length) * 8);
        setMicrophoneTestLevels((current) => [...current.slice(1), Math.max(0.08, level)]);
      };
      source.connect(processor);
      processor.connect(context.destination);
      microphoneTestRef.current = { stream, context, source, processor };
      setIsMicrophoneTesting(true);
    } catch {
      setMicrophoneTestError('Microphone test failed.');
      setIsMicrophoneTesting(false);
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

      <section className="settings-section">
        <SectionTitle icon={Settings2} title="General" />
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.pasteAfterDictation}
            onChange={(event) => onChange({ ...settings, pasteAfterDictation: event.target.checked })}
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
            checked={settings.improveSelectedText}
            onChange={(event) => onChange({ ...settings, improveSelectedText: event.target.checked })}
          />
          <span className="settings-option-label">
            Copy automatically selected text for Improve
            <HelpHint text="When enabled, Improve first copies the current selection from the active app before correcting it." />
          </span>
        </label>
      </section>

      <section className="settings-section focused-target" ref={microphoneRef}>
        <SectionTitle icon={Mic} title="Microphone settings" />
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
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.microphoneEchoCancellation}
            onChange={(event) => onChange({ ...settings, microphoneEchoCancellation: event.target.checked })}
          />
          <span className="settings-option-label">
            Echo cancellation
            <HelpHint text="Reduces audio echo on the microphone stream. Useful with speakers, but can slightly alter the captured voice." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.microphoneNoiseSuppression}
            onChange={(event) => onChange({ ...settings, microphoneNoiseSuppression: event.target.checked })}
          />
          <span className="settings-option-label">
            Noise suppression
            <HelpHint text="Reduces background noise on the microphone stream. It can improve clarity, but may remove very quiet speech." />
          </span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.microphoneAutoGainControl}
            onChange={(event) => onChange({ ...settings, microphoneAutoGainControl: event.target.checked })}
          />
          <span className="settings-option-label">
            Auto gain control
            <HelpHint text="Automatically adjusts microphone volume. It helps with low input levels, but can change volume during recording." />
          </span>
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
            <div className={`microphone-test-wave ${isMicrophoneTesting ? 'active' : ''}`} aria-hidden="true">
              {microphoneTestLevels.map((level, index) => (
                <span key={index} style={{ height: `${Math.round(5 + level * 28)}px` }} />
              ))}
            </div>
          </div>
          {microphoneTestError && <span className="microphone-test-error">{microphoneTestError}</span>}
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
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
      </section>

      <section className="settings-section focused-target" ref={historyRef}>
        <SectionTitle icon={HistoryIcon} title="History settings" />
        <label className="compact-number-field">
          <span className="field-label">
            Max history items
            <HelpHint text="Limits how many history entries Voclyra keeps. Lower values reduce stored local data." />
          </span>
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={settings.maxHistoryItems}
            onChange={(event) =>
              onChange({
                ...settings,
                maxHistoryItems: Math.max(1, Math.min(10000, Number(event.target.value) || 1)),
              })
            }
          />
        </label>
      </section>

      <section className="settings-section focused-target" ref={improveAiRef}>
        <div className="settings-title-row">
          <SectionTitle icon={Wand2} title="Improve AI" />
          <button type="button" title="Refresh models" onClick={onRefreshModels}>
            <RefreshCw size={17} />
            <span>Refresh models</span>
          </button>
        </div>
        <div className="model-settings-group">
          <div className="settings-grid models-select-grid">
            <label>
              <span className="field-label">
                Model
                <HelpHint text="Select the local LLM used by Improve. No model means Improve cannot run." />
              </span>
              <select
                value={settings.llmModel}
                disabled={llmModels.length === 0 && !settings.llmModel}
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
            <label>
              <span className="field-label">
                Runtime
                <HelpHint text="Select which local llama.cpp CUDA runtime Improve uses. Pick the runtime that exists and works on this machine." />
              </span>
              <select
                value={settings.llmCudaRuntimeVersion}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    llmCudaRuntimeVersion: event.target.value as SettingsType['llmCudaRuntimeVersion'],
                  })
                }
              >
                {Object.entries(llamaCudaRuntimeVersionConfig).map(([value, config]) => (
                  <option key={value} value={value}>
                    {config.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="inline-download-heading">
            <Download size={16} />
            <span>Download local AI models</span>
          </div>
          <GpuSummary hardwareInfo={hardwareInfo} />
          <div className="model-download-list compact-list">
            {availableLlmModels.map((model) => {
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
                        onClick={() => onDeleteLlmModel(model.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                    {model.state === 'missing' && (
                      <button
                        type="button"
                        title={`Download ${model.label}`}
                        aria-label={`Download ${model.label}`}
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
                Max output tokens
                <HelpHint text="Controls how much text Improve may generate. Auto adapts to input length; Fixed uses your exact limit." />
              </span>
              <select
                value={settings.llmMaxTokensMode}
                onChange={(event) =>
                  onChange({ ...settings, llmMaxTokensMode: event.target.value as SettingsType['llmMaxTokensMode'] })
                }
              >
                <option value="auto">Auto</option>
                <option value="fixed">Fixed</option>
              </select>
            </label>
            <label>
              <span className="field-label">
                Fixed max tokens
                <HelpHint text="Used only in Fixed mode. A lower value is faster but can cut long corrections." />
              </span>
              <input
                type="number"
                min={64}
                max={1200}
                step={16}
                value={settings.llmMaxTokens}
                disabled={settings.llmMaxTokensMode === 'auto'}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    llmMaxTokens: Math.max(64, Math.min(1200, Math.round(Number(event.target.value) || 160))),
                  })
                }
              />
            </label>
            <label>
              <span className="field-label">
                Context size
                <HelpHint text="Controls how much text the model can consider. Smaller is faster; larger handles longer inputs better." />
              </span>
              <select
                value={settings.llmContextSize}
                onChange={(event) =>
                  onChange({ ...settings, llmContextSize: Number(event.target.value) as SettingsType['llmContextSize'] })
                }
              >
                <option value={2048}>2048</option>
                <option value={3072}>3072</option>
                <option value={4096}>4096</option>
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
              onChange={(event) => onChange({ ...settings, correctionPrompt: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="settings-section focused-target" ref={speechAiRef}>
        <div className="settings-title-row">
          <SectionTitle icon={Headphones} title="Speak and Transcript AI" />
          <button type="button" title="Refresh models" onClick={onRefreshModels}>
            <RefreshCw size={17} />
            <span>Refresh models</span>
          </button>
        </div>
        <div className="model-settings-group">
          <div className="settings-grid models-select-grid">
            <label>
              <span className="field-label">
                Model
                <HelpHint text="Select the local Whisper model used by Speak and Transcript. Larger models are usually more accurate but slower." />
              </span>
              <select
                value={settings.whisperModel}
                disabled={whisperModels.length === 0 && !settings.whisperModel}
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
            <label>
              <span className="field-label">
                Runtime
                <HelpHint text="Select which local Whisper CUDA runtime Speak and Transcript use. If missing, both actions cannot transcribe." />
              </span>
              <select
                value={settings.whisperCudaRuntimeVersion}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    whisperCudaRuntimeVersion: event.target.value as SettingsType['whisperCudaRuntimeVersion'],
                  })
                }
              >
                {Object.entries(whisperCudaRuntimeVersionConfig).map(([value, config]) => (
                  <option key={value} value={value}>
                    {config.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">
                Whisper language
                <HelpHint text="Auto detects the spoken language. A fixed language can be faster and more stable when you always speak the same language." />
              </span>
              <select
                value={settings.whisperLanguage}
                onChange={(event) =>
                  onChange({ ...settings, whisperLanguage: event.target.value as SettingsType['whisperLanguage'] })
                }
              >
                <option value="auto">Auto</option>
                <option value="fr">French</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
              </select>
            </label>
            <label>
              <span className="field-label">
                Quality mode
                <HelpHint text="Fast is quicker with lower search effort. Balanced keeps the current behavior. Accurate searches more and can be slower." />
              </span>
              <select
                value={settings.whisperQualityMode}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    whisperQualityMode: event.target.value as SettingsType['whisperQualityMode'],
                  })
                }
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="accurate">Accurate</option>
              </select>
            </label>
          </div>
          <div className="inline-download-heading">
            <Download size={16} />
            <span>Download Whisper models</span>
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
        </div>
      </section>

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

const stopMicrophoneTest = (test: MicrophoneTest | null): void => {
  if (!test) {
    return;
  }
  test.processor.disconnect();
  test.source.disconnect();
  test.stream.getTracks().forEach((track) => track.stop());
  void test.context.close();
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

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    onEditingChange(editing);
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
              const hasModifier = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
              if (event.key === 'Enter' && !hasModifier) {
                validateDraft();
                return;
              }
              if (event.key === 'Escape' && !hasModifier) {
                setDraft(value);
                setEditing(false);
                return;
              }
              const nextShortcut = keyboardEventToShortcut(event);
              if (nextShortcut) {
                setDraft(nextShortcut);
                return;
              }
              if (hasModifier && !['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
                onUnavailable();
              }
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

const keyboardEventToShortcut = (event: KeyboardEvent<HTMLInputElement>): string => {
  const key = shortcutKey(event.key);
  if (!key || ['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return '';
  }
  const keys = [
    event.ctrlKey || event.metaKey ? 'CommandOrControl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    key,
  ].filter(Boolean);
  return keys.length >= 2 ? keys.join('+') : '';
};

const shortcutKey = (key: string): string => {
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
