import { defaultSettings } from '@shared/defaults';
import { settingsSchema } from '@shared/schemas';
import type { Settings } from '@shared/types';
import { AppStorage } from '@storage/app-storage';

export class SettingsService {
  private readonly storage = new AppStorage();

  async get(): Promise<Settings> {
    const rawSettings = await this.storage.readJson<unknown>('settings.json', defaultSettings);
    const isFallbackSettings = rawSettings === defaultSettings;
    const settingsInput = isSettingsObject(rawSettings) ? { ...defaultSettings, ...withoutStartupSetting(rawSettings) } : rawSettings;
    const parsedSettings = settingsSchema.safeParse(settingsInput);

    if (!parsedSettings.success) {
      return this.save(defaultSettings);
    }

    const settings = parsedSettings.data;
    const storedSettings = withoutStartupSetting(settings);
    if (!isFallbackSettings && JSON.stringify(storedSettings) !== JSON.stringify(rawSettings)) {
      await this.storage.writeJson('settings.json', storedSettings);
    }

    return settings;
  }

  save(settings: Settings): Promise<Settings> {
    return this.storage.writeJson('settings.json', withoutStartupSetting(settings)).then(() => settings);
  }
}

const isSettingsObject = (value: unknown): value is Partial<Settings> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const withoutStartupSetting = (settings: Partial<Settings>): Omit<Partial<Settings>, 'startAtStartup'> => {
  const { startAtStartup: _startAtStartup, ...rest } = settings;
  return rest;
};
