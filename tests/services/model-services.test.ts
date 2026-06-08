import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { llmModelCatalog } from '@shared/llm-models';
import { whisperModelCatalog } from '@shared/whisper-models';

const files = new Set<string>();
const sizes = new Map<string, number>();
let httpMode: 'success' | 'empty' | 'status-error' | 'timeout' = 'success';

class FakeFile extends EventEmitter {
  constructor(readonly path: string) {
    super();
  }

  close(callback: () => void): void {
    callback();
  }
}

class FakeResponse extends EventEmitter {
  statusCode = httpMode === 'status-error' ? 500 : 200;
  headers = { 'content-length': httpMode === 'empty' ? '0' : '100' };

  resume(): void {}

  pipe(file: FakeFile): FakeFile {
    queueMicrotask(() => {
      if (this.statusCode === 200) {
        if (httpMode !== 'empty') {
          this.emit('data', Buffer.alloc(50));
          this.emit('data', Buffer.alloc(50));
          files.add(file.path);
          sizes.set(file.path, 100);
        } else {
          files.add(file.path);
          sizes.set(file.path, 0);
        }
      }
      file.emit('finish');
    });
    return file;
  }
}

vi.mock('node:fs', () => ({
  createWriteStream: vi.fn((path: string) => new FakeFile(path)),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async (path: string) => {
    if (!files.has(path)) {
      throw new Error('missing');
    }
  }),
  mkdir: vi.fn(async () => {}),
  readdir: vi.fn(async () => []),
  rename: vi.fn(async (from: string, to: string) => {
    files.delete(from);
    files.add(to);
    sizes.set(to, sizes.get(from) ?? 0);
    sizes.delete(from);
  }),
  rm: vi.fn(async (path: string) => {
    files.delete(path);
    sizes.delete(path);
  }),
  stat: vi.fn(async (path: string) => ({ size: sizes.get(path) ?? 0 })),
}));

vi.mock('node:https', () => ({
  get: vi.fn((_url: URL | string, callback: (response: FakeResponse) => void) => {
    const request = new EventEmitter() as EventEmitter & {
      setTimeout: (ms: number, callback: () => void) => void;
      destroy: (error: Error) => void;
    };
    request.setTimeout = (_ms, timeoutCallback) => {
      if (httpMode === 'timeout') {
        queueMicrotask(timeoutCallback);
      }
    };
    request.destroy = (error) => {
      request.emit('error', error);
    };
    if (httpMode !== 'timeout') {
      queueMicrotask(() => callback(new FakeResponse()));
    }
    return request;
  }),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter();
    return child;
  }),
}));

vi.mock('@storage/app-storage', () => ({
  AppStorage: class {
    root = 'C:\\test\\.voclyra';

    path(...parts: string[]): string {
      return ['C:\\test\\.voclyra', ...parts].join('\\');
    }

    async ensureDir(...parts: string[]): Promise<string> {
      return this.path(...parts);
    }
  },
}));

describe('Model downloads', () => {
  beforeEach(() => {
    files.clear();
    sizes.clear();
    httpMode = 'success';
  });

  it('shows missing and ready models', async () => {
    const { LlmModelService } = await import('@services/llm-model-service');
    const service = new LlmModelService();
    const model = llmModelCatalog['gemma4:e4b-it-qat'];

    expect((await service.availableModels()).find((item) => item.id === 'gemma4:e4b-it-qat')).toMatchObject({
      state: 'missing',
      progress: 0,
    });

    files.add(service.modelPath(model.fileName));

    expect((await service.availableModels()).find((item) => item.id === 'gemma4:e4b-it-qat')).toMatchObject({
      state: 'ready',
      progress: 100,
    });
  });

  it('downloads an LLM model', async () => {
    const { LlmModelService } = await import('@services/llm-model-service');
    const service = new LlmModelService();
    const progress: unknown[] = [];

    const models = await service.downloadModel('gemma4:e4b-it-qat', (event) => progress.push(event));

    expect(progress).toEqual([
      { id: 'gemma4:e4b-it-qat', state: 'downloading', progress: 0 },
      { id: 'gemma4:e4b-it-qat', state: 'downloading', progress: 50 },
      { id: 'gemma4:e4b-it-qat', state: 'downloading', progress: 99 },
      { id: 'gemma4:e4b-it-qat', state: 'ready', progress: 100 },
    ]);
    expect(models.find((item) => item.id === 'gemma4:e4b-it-qat')).toMatchObject({ state: 'ready', progress: 100 });
  });

  it('rejects empty downloads', async () => {
    const { LlmModelService } = await import('@services/llm-model-service');
    const progress: unknown[] = [];
    httpMode = 'empty';

    await expect(new LlmModelService().downloadModel('gemma4:e4b-it-qat', (event) => progress.push(event))).rejects.toThrow(
      'Downloaded model is empty.',
    );
    expect(progress.at(-1)).toEqual({ id: 'gemma4:e4b-it-qat', state: 'missing', progress: 0 });
  });

  it('rejects failed downloads', async () => {
    const { LlmModelService } = await import('@services/llm-model-service');
    httpMode = 'status-error';
    await expect(new LlmModelService().downloadModel('gemma4:e4b-it-qat', () => {})).rejects.toThrow(
      'Model download failed with status 500.',
    );

    httpMode = 'timeout';
    await expect(new LlmModelService().downloadModel('gemma4:e4b-it-qat', () => {})).rejects.toThrow(
      'Model download timed out.',
    );
  });

  it('deletes a local model', async () => {
    const { LlmModelService } = await import('@services/llm-model-service');
    const service = new LlmModelService();
    const model = llmModelCatalog['gemma4:e4b-it-qat'];
    files.add(service.modelPath(model.fileName));

    expect((await service.deleteModel('gemma4:e4b-it-qat')).find((item) => item.id === 'gemma4:e4b-it-qat')).toMatchObject({
      state: 'missing',
    });
    await expect(service.deleteModel('gemma4:e4b-it-qat')).resolves.toEqual(expect.any(Array));
  });

  it('downloads a Whisper model', async () => {
    const { WhisperModelService } = await import('@services/whisper-model-service');
    const progress: unknown[] = [];

    const models = await new WhisperModelService().downloadModel('tiny', (event) => progress.push(event));

    expect(progress.at(0)).toEqual({ id: 'tiny', state: 'downloading', progress: 0 });
    expect(progress.at(-1)).toEqual({ id: 'tiny', state: 'ready', progress: 100 });
    expect(models.find((item) => item.id === 'tiny')).toMatchObject({
      fileName: whisperModelCatalog.tiny.fileName,
      state: 'ready',
      progress: 100,
    });
  });
});
