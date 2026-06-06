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
  'qwen3-0_6b-q8': {
    label: 'Qwen3 0.6B Q8',
    fileName: 'Qwen3-0.6B-Q8_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    disk: '0.6 GB',
    memory: '1.5 GB VRAM',
    vramGb: estimateLlmVramGb(0.6),
  },
  'qwen3-1_7b-q8': {
    label: 'Qwen3 1.7B Q8',
    fileName: 'Qwen3-1.7B-Q8_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf',
    disk: '1.83 GB',
    memory: '3 GB VRAM',
    vramGb: estimateLlmVramGb(1.83),
  },
  'llama3_2-3b-q4': {
    label: 'Llama 3.2 3B Q4',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/Mechanika/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    disk: '2.02 GB',
    memory: '3.5 GB VRAM',
    vramGb: estimateLlmVramGb(2.02),
  },
  'smollm3-3b-q4': {
    label: 'SmolLM3 3B Q4',
    fileName: 'SmolLM3-Q4_K_M.gguf',
    url: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf',
    disk: '2.0 GB',
    memory: '3 GB VRAM',
    vramGb: estimateLlmVramGb(2),
  },
  'phi4-mini-q4': {
    label: 'Phi-4 Mini Q4',
    fileName: 'Phi-4-mini-instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf',
    disk: '2.5 GB',
    memory: '3.5 GB VRAM',
    vramGb: estimateLlmVramGb(2.5),
  },
  'qwen3-4b-q4': {
    label: 'Qwen3 4B Q4',
    fileName: 'Qwen3-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    disk: '2.5 GB',
    memory: '3.5 GB VRAM',
    vramGb: estimateLlmVramGb(2.5),
  },
  'gemma-e4b-q4': {
    label: 'Gemma E4B Q4',
    fileName: 'gemma-4-e4b-it.Q4_K_M.gguf',
    url: 'https://huggingface.co/DuoNeural/Gemma-4-E4B-Q4_K_M/resolve/main/gemma-4-e4b-it.Q4_K_M.gguf',
    disk: '5.0 GB',
    memory: '6.5 GB VRAM',
    vramGb: estimateLlmVramGb(5),
  },
  'qwen3-8b-q4': {
    label: 'Qwen3 8B Q4',
    fileName: 'Qwen3-8B-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf',
    disk: '5.0 GB',
    memory: '6.5 GB VRAM',
    vramGb: estimateLlmVramGb(5),
  },
  'qwen3-14b-q4': {
    label: 'Qwen3 14B Q4',
    fileName: 'Qwen3-14B-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf',
    disk: '8.9 GB',
    memory: '10.5 GB VRAM',
    vramGb: estimateLlmVramGb(8.9),
  },
  'mistral-small-3_2-24b-iq4': {
    label: 'Mistral Small 3.2 24B IQ4',
    fileName: 'Mistral-Small-3.2-24B-Instruct-2506-UD-Q4_K_XL.gguf',
    url: 'https://huggingface.co/unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/Mistral-Small-3.2-24B-Instruct-2506-UD-Q4_K_XL.gguf',
    disk: '12.0 GB',
    memory: '14 GB VRAM',
    vramGb: estimateLlmVramGb(12),
  },
  'qwen3-30b-a3b-q4': {
    label: 'Qwen3 30B-A3B Q4',
    fileName: 'Qwen3-30B-A3B-Q4_K_M.gguf',
    url: 'https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf',
    disk: '18.0 GB',
    memory: '21 GB VRAM',
    vramGb: estimateLlmVramGb(18),
  },
  'mistral-small-3_2-24b-q4': {
    label: 'Mistral Small 3.2 24B Q4',
    fileName: 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf',
    url: 'https://huggingface.co/lmstudio-community/Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf',
    disk: '14.0 GB',
    memory: '16 GB VRAM',
    vramGb: estimateLlmVramGb(14),
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
