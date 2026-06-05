import type { JSX } from 'react';
import { Headphones, Keyboard, Mic, Pencil } from 'lucide-react';
import type { AppSection, Settings } from '@shared/types';
import logoUrl from '@assets/logo.svg';
import { navItems } from '../appState';

type AppSidebarProps = {
  section: AppSection;
  settings: Settings;
  onSectionChange: (section: AppSection) => void;
  onShortcutSettings: () => void;
};

export const AppSidebar = ({
  section,
  settings,
  onSectionChange,
  onShortcutSettings,
}: AppSidebarProps): JSX.Element => (
  <aside className="sidebar">
    <div className="logo" aria-label="Voclyra">
      <img src={logoUrl} alt="" />
    </div>
    <nav className="nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={`nav-item ${section === item.id ? 'active' : ''}`}
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onSectionChange(item.id)}
          >
            <Icon size={22} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
    <div className="sidebar-shortcuts">
      <button className="shortcut-card" type="button" title="Edit Speak shortcut" onClick={onShortcutSettings}>
        <Mic size={20} />
        <div>
          <span>Speak shortcut</span>
          <strong>{settings.hotkeys.speak.replace('CommandOrControl', 'Ctrl')}</strong>
        </div>
        <Keyboard size={17} />
      </button>
      <button className="shortcut-card" type="button" title="Edit Improve shortcut" onClick={onShortcutSettings}>
        <Pencil size={19} />
        <div>
          <span>Improve shortcut</span>
          <strong>{settings.hotkeys.improveText.replace('CommandOrControl', 'Ctrl')}</strong>
        </div>
        <Keyboard size={17} />
      </button>
      <button className="shortcut-card" type="button" title="Edit Transcript shortcut" onClick={onShortcutSettings}>
        <Headphones size={19} />
        <div>
          <span>Transcript shortcut</span>
          <strong>{settings.hotkeys.transcript.replace('CommandOrControl', 'Ctrl')}</strong>
        </div>
        <Keyboard size={17} />
      </button>
    </div>
  </aside>
);
