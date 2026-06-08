export const customLlmModelUrlError = (value: string): string => {
  const url = parseUrl(value);
  if (!url) {
    return 'Enter a valid Hugging Face model URL.';
  }
  if (!isAllowedModelHost(url.hostname)) {
    return 'Only Hugging Face model URLs are allowed.';
  }
  const fileName = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  if (!/^[\w.-]+\.gguf$/.test(fileName)) {
    return 'Custom local AI models must be .gguf files.';
  }
  return '';
};

export const isAllowedModelHost = (hostname: string): boolean =>
  hostname === 'huggingface.co' ||
  hostname.endsWith('.huggingface.co') ||
  hostname === 'hf.co' ||
  hostname.endsWith('.hf.co');

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
};
