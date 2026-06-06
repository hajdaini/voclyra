import type { Settings } from '@shared/types';

export const syncModelSettings = (
  settings: Settings,
  models: { llm: string[]; whisper: string[] },
): Settings => ({
  ...settings,
  llmModel: selectModel(settings.llmModel, models.llm),
  whisperModel: selectModel(settings.whisperModel, models.whisper),
});

const selectModel = (currentModel: string, availableModels: string[]): string => {
  if (availableModels.length === 0) {
    return currentModel;
  }
  if (currentModel && availableModels.includes(currentModel)) {
    return currentModel;
  }
  return availableModels[0] ?? currentModel;
};
