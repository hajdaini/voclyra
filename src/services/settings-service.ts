import { defaultSettings } from '@shared/defaults';
import type { Settings } from '@shared/types';
import { AppStorage } from '@storage/app-storage';

export class SettingsService {
  private readonly storage = new AppStorage();

  async get(): Promise<Settings> {
    const settings = await this.storage.readJson('settings.json', defaultSettings);
    const migratedSettings = {
      ...settings,
      pasteAfterDictation: settings.pasteAfterDictation ?? defaultSettings.pasteAfterDictation,
      pasteAfterImprovement: settings.pasteAfterImprovement ?? defaultSettings.pasteAfterImprovement,
      improveSelectedText: settings.improveSelectedText ?? defaultSettings.improveSelectedText,
      microphoneDeviceId: settings.microphoneDeviceId ?? defaultSettings.microphoneDeviceId,
      microphoneDeviceLabel: settings.microphoneDeviceLabel ?? defaultSettings.microphoneDeviceLabel,
      microphoneEchoCancellation:
        settings.microphoneEchoCancellation ?? defaultSettings.microphoneEchoCancellation,
      microphoneNoiseSuppression:
        settings.microphoneNoiseSuppression ?? defaultSettings.microphoneNoiseSuppression,
      microphoneAutoGainControl:
        settings.microphoneAutoGainControl ?? defaultSettings.microphoneAutoGainControl,
      maxHistoryItems: settings.maxHistoryItems ?? defaultSettings.maxHistoryItems,
      hotkeys: {
        speak:
          settings.hotkeys.speak === 'CommandOrControl+Alt+S' ||
          settings.hotkeys.speak === 'CommandOrControl+,'
            ? defaultSettings.hotkeys.speak
            : settings.hotkeys.speak,
        improveText:
          settings.hotkeys.improveText === 'CommandOrControl+Alt+I'
            ? defaultSettings.hotkeys.improveText
            : settings.hotkeys.improveText,
        transcript: settings.hotkeys.transcript ?? defaultSettings.hotkeys.transcript,
      },
    };
    if (
      migratedSettings.hotkeys.speak !== settings.hotkeys.speak ||
      migratedSettings.hotkeys.improveText !== settings.hotkeys.improveText ||
      migratedSettings.hotkeys.transcript !== settings.hotkeys.transcript ||
      migratedSettings.pasteAfterDictation !== settings.pasteAfterDictation ||
      migratedSettings.pasteAfterImprovement !== settings.pasteAfterImprovement ||
      migratedSettings.improveSelectedText !== settings.improveSelectedText ||
      migratedSettings.microphoneDeviceId !== settings.microphoneDeviceId ||
      migratedSettings.microphoneDeviceLabel !== settings.microphoneDeviceLabel ||
      migratedSettings.microphoneEchoCancellation !== settings.microphoneEchoCancellation ||
      migratedSettings.microphoneNoiseSuppression !== settings.microphoneNoiseSuppression ||
      migratedSettings.microphoneAutoGainControl !== settings.microphoneAutoGainControl ||
      migratedSettings.maxHistoryItems !== settings.maxHistoryItems
    ) {
      await this.save(migratedSettings);
    }
    return migratedSettings;
  }

  save(settings: Settings): Promise<Settings> {
    return this.storage.writeJson('settings.json', settings);
  }
}
