import type { Settings } from '@shared/types';
import { correctionPromptText } from '@services/llama-service';

type RemoteImproveResult = {
  text: string;
  tokensGenerated?: number;
};

type RemoteTarget = 'speech' | 'improve';

export class RemoteOpenAiService {
  async testSpeech(settings: Settings): Promise<void> {
    await this.test('speech', settings);
  }

  async testImprove(settings: Settings): Promise<void> {
    await this.test('improve', settings);
  }

  async transcribe(audio: Uint8Array, settings: Settings): Promise<string> {
    const baseUrl = this.baseUrl(settings.remoteSpeechBaseUrl);
    const model = this.model(settings.remoteSpeechModel, 'Speech model is required.');
    const form = new FormData();
    form.set('model', model);
    form.set('file', new Blob([Buffer.from(audio)], { type: 'audio/wav' }), 'audio.wav');
    const response = await this.fetchJson(this.url(baseUrl, 'audio/transcriptions'), {
      method: 'POST',
      headers: this.headers(settings.remoteSpeechApiKey),
      body: form,
      timeoutMs: 300000,
    });
    const text = objectString(response, 'text');
    if (!text.trim()) {
      throw new Error('Remote speech server returned an empty response.');
    }
    return text.trim();
  }

  async improveText(settings: Settings, text: string): Promise<RemoteImproveResult> {
    const baseUrl = this.baseUrl(settings.remoteImproveBaseUrl);
    const model = this.model(settings.remoteImproveModel, 'Improve model is required.');
    const response = await this.fetchJson(this.url(baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: {
        ...this.headers(settings.remoteImproveApiKey),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: correctionPromptText(settings.correctionPrompt, text),
          },
        ],
        temperature: settings.llmTemperature,
        stream: false,
      }),
      timeoutMs: 120000,
    });
    const output = this.chatContent(response).trim();
    if (!output) {
      throw new Error('Remote improve server returned an empty response.');
    }
    return {
      text: output,
      tokensGenerated: objectNumber(objectValue(response, 'usage'), 'completion_tokens'),
    };
  }

  private async test(target: RemoteTarget, settings: Settings): Promise<void> {
    const baseUrl = this.baseUrl(target === 'speech' ? settings.remoteSpeechBaseUrl : settings.remoteImproveBaseUrl);
    this.model(target === 'speech' ? settings.remoteSpeechModel : settings.remoteImproveModel, `${target === 'speech' ? 'Speech' : 'Improve'} model is required.`);
    await this.fetchJson(this.url(baseUrl, 'models'), {
      method: 'GET',
      headers: this.headers(target === 'speech' ? settings.remoteSpeechApiKey : settings.remoteImproveApiKey),
      timeoutMs: 15000,
    });
  }

  private baseUrl(value: string): URL {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Server URL is required.');
    }
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error('Server URL is invalid.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Server URL must use HTTP or HTTPS.');
    }
    return url;
  }

  private model(value: string, message: string): string {
    const model = value.trim();
    if (!model) {
      throw new Error(message);
    }
    return model;
  }

  private url(baseUrl: URL, endpoint: string): string {
    const basePath = baseUrl.pathname.replace(/\/+$/g, '');
    const path = `${basePath}/${endpoint}`.replace(/\/{2,}/g, '/');
    const url = new URL(baseUrl.toString());
    url.pathname = path;
    return url.toString();
  }

  private headers(apiKey: string): Record<string, string> {
    const key = apiKey.trim();
    return key ? { authorization: `Bearer ${key}` } : {};
  }

  private async fetchJson(
    url: string,
    options: {
      method: 'GET' | 'POST';
      headers: Record<string, string>;
      body?: BodyInit;
      timeoutMs: number;
    },
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Remote server returned HTTP ${response.status}.`);
      }
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Remote server request timed out.');
      }
      if (error instanceof Error) {
        throw new Error(error.message || 'Remote server request failed.');
      }
      throw new Error('Remote server request failed.');
    } finally {
      clearTimeout(timer);
    }
  }

  private chatContent(value: unknown): string {
    if (!value || typeof value !== 'object' || !('choices' in value) || !Array.isArray(value.choices)) {
      return '';
    }
    const first = value.choices[0];
    if (!first || typeof first !== 'object' || !('message' in first)) {
      return '';
    }
    return objectString(first.message, 'content');
  }
}

const objectValue = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined;

const objectString = (value: unknown, key: string): string => {
  const result = objectValue(value, key);
  return typeof result === 'string' ? result : '';
};

const objectNumber = (value: unknown, key: string): number | undefined => {
  const result = objectValue(value, key);
  return typeof result === 'number' ? result : undefined;
};
