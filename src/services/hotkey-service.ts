import { globalShortcut } from 'electron';
import type { Settings } from '@shared/types';

export type HotkeyRegistrationResult = {
  speak: boolean;
  improveText: boolean;
  transcript: boolean;
};

export class HotkeyService {
  register(
    settings: Settings,
    handlers: { speak: () => void; improveText: () => void; transcript: () => void },
  ): HotkeyRegistrationResult {
    this.unregisterAll();
    return {
      speak: this.registerOne(settings.hotkeys.speak, handlers.speak),
      improveText: this.registerOne(settings.hotkeys.improveText, handlers.improveText),
      transcript: this.registerOne(settings.hotkeys.transcript, handlers.transcript),
    };
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll();
  }

  private registerOne(accelerator: string, handler: () => void): boolean {
    if (!accelerator.trim()) {
      return false;
    }
    return globalShortcut.register(accelerator, handler);
  }
}
