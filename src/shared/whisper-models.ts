import type { WhisperModelId } from './types';

export const whisperModelCatalog: Record<
  WhisperModelId,
  {
    id: WhisperModelId;
    label: string;
    fileName: string;
    disk: string;
    memory: string;
    url: string;
  }
> = {
  tiny: {
    id: 'tiny',
    label: 'Tiny',
    fileName: 'ggml-tiny.bin',
    disk: '75 MiB',
    memory: '~273 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  },
  base: {
    id: 'base',
    label: 'Base',
    fileName: 'ggml-base.bin',
    disk: '142 MiB',
    memory: '~388 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  },
  small: {
    id: 'small',
    label: 'Small',
    fileName: 'ggml-small.bin',
    disk: '466 MiB',
    memory: '~852 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    fileName: 'ggml-medium.bin',
    disk: '1.5 GiB',
    memory: '~2.1 GB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  },
  large: {
    id: 'large',
    label: 'Large',
    fileName: 'ggml-large-v3.bin',
    disk: '2.9 GiB',
    memory: '~3.9 GB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
  },
};

export const whisperModelIds = Object.keys(whisperModelCatalog) as WhisperModelId[];
