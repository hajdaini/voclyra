import type { LlmModelId } from './types';

export const llmModelCatalog: Record<
  LlmModelId,
  {
    label: string;
    fileName: string;
    url: string;
    disk: string;
    memory: string;
    vramGb: number;
  }
> = {
  'gemma4:e2b-it-qat': {
    label: 'Gemma 4 E2B QAT',
    fileName: 'gemma-4-E2B_q4_0-it.gguf',
    url: 'https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/main/gemma-4-E2B_q4_0-it.gguf',
    disk: '3.35 GB',
    memory: '4.5 GB VRAM',
    vramGb: estimateLlmVramGb(3.35),
  },
  'gemma4:e4b-it-qat': {
    label: 'Gemma 4 E4B QAT',
    fileName: 'gemma-4-E4B_q4_0-it.gguf',
    url: 'https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf/resolve/main/gemma-4-E4B_q4_0-it.gguf',
    disk: '5.15 GB',
    memory: '6.5 GB VRAM',
    vramGb: estimateLlmVramGb(5.15),
  },
  'gemma4:12b-it-qat': {
    label: 'Gemma 4 12B QAT',
    fileName: 'gemma-4-12b-it-qat-q4_0.gguf',
    url: 'https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf/resolve/main/gemma-4-12b-it-qat-q4_0.gguf',
    disk: '6.98 GB',
    memory: '8.5 GB VRAM',
    vramGb: estimateLlmVramGb(6.98),
  },
  'gemma4:26b-a4b-it-qat': {
    label: 'Gemma 4 26B A4B QAT',
    fileName: 'gemma-4-26B_q4_0-it.gguf',
    url: 'https://huggingface.co/google/gemma-4-26B-A4B-it-qat-q4_0-gguf/resolve/main/gemma-4-26B_q4_0-it.gguf',
    disk: '14.4 GB',
    memory: '16.5 GB VRAM',
    vramGb: estimateLlmVramGb(14.4),
  },
  'gemma4:31b-it-qat': {
    label: 'Gemma 4 31B QAT',
    fileName: 'gemma-4-31B_q4_0-it.gguf',
    url: 'https://huggingface.co/google/gemma-4-31B-it-qat-q4_0-gguf/resolve/main/gemma-4-31B_q4_0-it.gguf',
    disk: '17.7 GB',
    memory: '21 GB VRAM',
    vramGb: estimateLlmVramGb(17.7),
  },
};

export const llmModelIds = Object.keys(llmModelCatalog) as LlmModelId[];

function estimateLlmVramGb(modelSizeGb: number): number {
  return roundUpHalf(modelSizeGb + llmRuntimeOverheadGb(modelSizeGb));
}

function llmRuntimeOverheadGb(modelSizeGb: number): number {
  if (modelSizeGb <= 1) {
    return 0.8;
  }
  if (modelSizeGb <= 3) {
    return 1;
  }
  if (modelSizeGb <= 6) {
    return 1.25;
  }
  if (modelSizeGb <= 10) {
    return 1.5;
  }
  if (modelSizeGb <= 16) {
    return 2;
  }
  return 3;
}

function roundUpHalf(value: number): number {
  return Math.ceil(value * 2) / 2;
}
