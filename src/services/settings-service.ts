import { defaultSettings } from '@shared/defaults';
import { settingsSchema } from '@shared/schemas';
import type { Settings } from '@shared/types';
import { AppStorage } from '@storage/app-storage';

export class SettingsService {
  private readonly storage = new AppStorage();

  async get(): Promise<Settings> {
    const rawSettings = await this.storage.readJson<unknown>('settings.json', defaultSettings);
    const parsedSettings = settingsSchema.safeParse(rawSettings);

    if (!parsedSettings.success) {
      return this.save(defaultSettings);
    }

    const settings = parsedSettings.data;
    if (JSON.stringify(settings) !== JSON.stringify(rawSettings)) {
      await this.save(settings);
    }

    return settings;
  }

  save(settings: Settings): Promise<Settings> {
    return this.storage.writeJson('settings.json', settings);
  }
}
