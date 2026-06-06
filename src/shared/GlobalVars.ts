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

export const whisperRuntimeConfig = {
  cudaRuntimeParts: ['runtimes', 'whisper-cuda', 'win-x64'],
  packagedRuntimeParts: ['whisper', 'win-x64'],
  devRuntimeParts: ['resources', 'whisper', 'win-x64'],
  executableName: 'whisper-cli.exe',
  cudaDllName: 'ggml-cuda.dll',
} as const;

export const logConfig = {
  processMaxBytes: 256 * 1024,
  errorMaxBytes: 256 * 1024,
  errorRotations: 5,
} as const;

export const appMessages = {
  copiedToClipboard: 'Copied to clipboard',
} as const;
