import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type Ref } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  Download,
  FolderOpen,
  Headphones,
  HardDrive,
  Keyboard,
  LoaderCircle,
  MemoryStick,
  Mic,
  Pencil,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  Settings as SettingsType,
  WhisperAvailableModel,
  WhisperModelId,
} from '@shared/types';

export type SettingsViewProps = {
  settings: SettingsType;
  ollamaModels: string[];
  whisperModels: string[];
  availableWhisperModels: WhisperAvailableModel[];
  onChange: (settings: SettingsType) => void;
  onRefreshModels: () => void;
  onDownloadWhisperModel: (id: WhisperModelId) => void;
  onDeleteWhisperModel: (id: WhisperModelId) => void;
  focusSection: 'shortcuts' | null;
  onFocusHandled: () => void;
  onShortcutUnavailable: () => void;
  onShortcutEditingChange: (editing: boolean) => void;
  onOpenDataFolder: () => void;
};

export const SettingsView = ({
  settings,
  ollamaModels,
  whisperModels,
  availableWhisperModels,
  onChange,
  onRefreshModels,
  onDownloadWhisperModel,
  onDeleteWhisperModel,
  focusSection,
  onFocusHandled,
  onShortcutUnavailable,
  onShortcutEditingChange,
  onOpenDataFolder,
}: SettingsViewProps): JSX.Element => {
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const speakShortcutRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusSection !== 'shortcuts') {
      return;
    }
    shortcutsRef.current?.scrollIntoView({ block: 'center' });
    speakShortcutRef.current?.focus();
    onFocusHandled();
  }, [focusSection, onFocusHandled]);

  return (
    <section className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
        </div>
        <button type="button" title="Open .voclyra folder" onClick={onOpenDataFolder}>
          <FolderOpen size={17} />
          <span>Open .voclyra folder</span>
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
          <span>Paste Speak result into active app</span>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.pasteAfterImprovement}
            onChange={(event) => onChange({ ...settings, pasteAfterImprovement: event.target.checked })}
          />
          <span>Paste Improve result into active app</span>
        </label>
        <label className="compact-number-field">
          Max history items
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

      <section className="settings-section">
        <SectionTitle icon={Sparkles} title="Writing" />
        <label>
          Correction prompt
          <textarea
            value={settings.correctionPrompt}
            onChange={(event) => onChange({ ...settings, correctionPrompt: event.target.value })}
          />
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-title-row">
          <SectionTitle icon={Bot} title="Models" />
          <button type="button" title="Refresh models" onClick={onRefreshModels}>
            <RefreshCw size={17} />
            <span>Refresh models</span>
          </button>
        </div>
        <div className="settings-grid models-select-grid">
          <label>
            Ollama model
            <select
              value={settings.ollamaModel}
              disabled={ollamaModels.length === 0}
              onChange={(event) => onChange({ ...settings, ollamaModel: event.target.value })}
            >
              {ollamaModels.length === 0 && (
                <option value={settings.ollamaModel}>No Ollama model found</option>
              )}
              {ollamaModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label>
            Whisper model
            <select
              value={settings.whisperModel}
              disabled={whisperModels.length === 0}
              onChange={(event) => onChange({ ...settings, whisperModel: event.target.value })}
            >
              {whisperModels.length === 0 && <option value="">No Whisper model found</option>}
              {whisperModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="whisper-model-panel full-width-model-panel">
          <div className="inline-download-heading">
            <Download size={16} />
            <span>Download Whisper models</span>
          </div>
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
                        <HardDrive size={14} />
                        {model.disk}
                        <MemoryStick size={14} />
                        {model.memory}
                      </span>
                    </div>
                  </div>
                  <div className="model-state">
                    <span className={model.state}>
                      {model.state === 'ready' && <CheckCircle2 size={14} />}
                      {modelStateLabel(model)}
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
                        <span>Download</span>
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
              <Pencil size={16} />
              Improve shortcut
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
  icon: typeof Sparkles;
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

const modelStateIcon = {
  ready: CheckCircle2,
  missing: CircleDashed,
  downloading: LoaderCircle,
};

const modelStateLabel = (model: WhisperAvailableModel): string => {
  if (model.state === 'ready') {
    return 'Ready';
  }
  if (model.state === 'downloading') {
    return `${model.progress}%`;
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
