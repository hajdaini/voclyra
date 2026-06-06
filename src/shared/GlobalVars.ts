import packageJson from '../../package.json';

export const packageInfo = {
  name: packageJson.name,
  productName: packageJson.build.productName,
  appId: packageJson.build.appId,
  version: packageJson.version,
  author: packageJson.author,
} as const;

export const appStorageConfig = {
  directoryName: '.voclyra',
} as const;

export const appAssetConfig = {
  iconIco: 'icon.ico',
  iconPng: 'icon.png',
  packagedAssetDir: 'assets',
  devAssetDir: 'resources',
} as const;

export const whisperCudaRuntimeVersionConfig = {
  'cuda-11': {
    label: 'CUDA 11.8',
    directory: 'cuda-11',
  },
  'cuda-12': {
    label: 'CUDA 12.4',
    directory: 'cuda-12',
  },
} as const;

export const llamaCudaRuntimeVersionConfig = {
  'cuda-12': {
    label: 'CUDA 12.4',
    directory: 'cuda-12',
  },
  'cuda-13': {
    label: 'CUDA 13.3',
    directory: 'cuda-13',
  },
} as const;

export const whisperRuntimeConfig = {
  runtimeParts: ['runtimes'],
  engineDirectory: 'whisper',
  platformDirectory: 'win-x64',
  executableName: 'whisper-cli.exe',
  cudaDllName: 'ggml-cuda.dll',
} as const;

export const llamaRuntimeConfig = {
  runtimeParts: ['runtimes'],
  engineDirectory: 'llama',
  platformDirectory: 'win-x64',
  executableName: 'llama-completion.exe',
} as const;

export const logConfig = {
  processMaxBytes: 256 * 1024,
  errorMaxBytes: 256 * 1024,
  errorRotations: 5,
} as const;

export const appMessages = {
  copiedToClipboard: 'Copied to clipboard',
} as const;
