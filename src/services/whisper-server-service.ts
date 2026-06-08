import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DebugLogBuffer, errorDiagnostics } from '@services/debug-log-buffer';
import { AppStorage } from '@storage/app-storage';

type WhisperServerKey = {
  executable: string;
  modelPath: string;
  language: string;
  threads: number;
  qualityArgs: string[];
  prompt?: string;
};

type WhisperServerState = {
  key: string;
  child: ChildProcessWithoutNullStreams;
  executable: string;
  args: string[];
  host: string;
  port: number;
  url: string;
  startedDuringLastEnsure: boolean;
  startupDurationMs: number;
  stdout: DebugLogBuffer;
  stderr: DebugLogBuffer;
};

export type WhisperServerResult = {
  text: string;
  diagnostics: WhisperServerDiagnostics;
};

export type WhisperServerDiagnostics = {
  engine: 'whisper';
  executable: string;
  args: string[];
  pid: number | null;
  host: string;
  port: number;
  url: string;
  serverReused: boolean;
  serverStartedDuringAction: boolean;
  startupDurationMs: number;
  aliveBeforeRequest: boolean;
  aliveAfterRequest: boolean;
  stdoutTail: string;
  stderrTail: string;
  method: string;
  endpoint: string;
  timeoutMs: number;
  requestStartedAt: string;
  requestFinishedAt: string;
  requestDurationMs: number;
  httpStatus: number | null;
  httpStatusText: string;
  contentType: string;
  requestBytes: number;
  responseBytes: number;
  rawResponseTail: string;
  httpErrorBodyTail: string;
  errorLines: string[];
};

export class WhisperServerService {
  private state: WhisperServerState | null = null;
  private readonly storage = new AppStorage();

  async transcribe(
    executable: string,
    modelPath: string,
    audio: Uint8Array,
    options: {
      language: string;
      threads: number;
      qualityArgs: string[];
      prompt?: string;
      timeoutMs?: number | null;
    },
  ): Promise<WhisperServerResult> {
    const server = await this.ensureServer({
      executable,
      modelPath,
      language: options.language,
      threads: options.threads,
      qualityArgs: options.qualityArgs,
      prompt: options.prompt,
    });
    const form = new FormData();
    form.set('file', new Blob([Buffer.from(audio)], { type: 'audio/wav' }), 'audio.wav');
    form.set('response_format', 'json');
    const endpoint = '/inference';
    const timeout = options.timeoutMs === null ? 180000 : (options.timeoutMs ?? 180000);
    const requestStartedAtMs = Date.now();
    const requestStartedAt = new Date(requestStartedAtMs).toISOString();
    const diagnosticsBase = (): Omit<WhisperServerDiagnostics, 'requestFinishedAt' | 'requestDurationMs' | 'httpStatus' | 'httpStatusText' | 'contentType' | 'responseBytes' | 'rawResponseTail' | 'httpErrorBodyTail' | 'errorLines'> => ({
      engine: 'whisper',
      executable: server.executable,
      args: server.args,
      pid: server.child.pid ?? null,
      host: server.host,
      port: server.port,
      url: server.url,
      serverReused: !server.startedDuringLastEnsure,
      serverStartedDuringAction: server.startedDuringLastEnsure,
      startupDurationMs: server.startupDurationMs,
      aliveBeforeRequest: server.child.exitCode === null,
      aliveAfterRequest: server.child.exitCode === null,
      stdoutTail: server.stdout.text(),
      stderrTail: server.stderr.text(),
      method: 'POST',
      endpoint,
      timeoutMs: timeout,
      requestStartedAt,
      requestBytes: audio.byteLength,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${server.url}${endpoint}`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw serverError(`Whisper server failed: ${response.status}`, body);
      }
      const raw = await response.text();
      return {
        text: this.textFromResponse(raw),
        diagnostics: {
          ...diagnosticsBase(),
          aliveAfterRequest: server.child.exitCode === null,
          stdoutTail: server.stdout.text(),
          stderrTail: server.stderr.text(),
          requestFinishedAt: new Date().toISOString(),
          requestDurationMs: Date.now() - requestStartedAtMs,
          httpStatus: response.status,
          httpStatusText: response.statusText,
          contentType: response.headers.get('content-type') ?? 'unknown',
          responseBytes: Buffer.byteLength(raw, 'utf8'),
          rawResponseTail: raw,
          httpErrorBodyTail: '',
          errorLines: [],
        },
      };
    } catch (error) {
      const diagnostics: WhisperServerDiagnostics = {
        ...diagnosticsBase(),
        aliveAfterRequest: server.child.exitCode === null,
        stdoutTail: server.stdout.text(),
        stderrTail: server.stderr.text(),
        requestFinishedAt: new Date().toISOString(),
        requestDurationMs: Date.now() - requestStartedAtMs,
        httpStatus: null,
        httpStatusText: 'unknown',
        contentType: 'unknown',
        responseBytes: 0,
        rawResponseTail: '',
        httpErrorBodyTail: httpErrorBody(error),
        errorLines: errorDiagnostics(error),
      };
      throw withDiagnostics(error, diagnostics);
    } finally {
      clearTimeout(timer);
      server.startedDuringLastEnsure = false;
      server.startupDurationMs = 0;
    }
  }

  async warmup(
    executable: string,
    modelPath: string,
    options: {
      language: string;
      threads: number;
      qualityArgs: string[];
      prompt?: string;
    },
  ): Promise<void> {
    await this.ensureServer({
      executable,
      modelPath,
      language: options.language,
      threads: options.threads,
      qualityArgs: options.qualityArgs,
      prompt: options.prompt,
    });
  }

  stop(): void {
    this.state?.child.kill();
    this.state = null;
  }

  info(): { host: string; port: number; url: string } | null {
    return this.state
      ? {
          host: this.state.host,
          port: this.state.port,
          url: this.state.url,
        }
      : null;
  }

  private async ensureServer(key: WhisperServerKey): Promise<WhisperServerState> {
    const nextKey = JSON.stringify(key);
    if (this.state?.key === nextKey) {
      this.state.startedDuringLastEnsure = false;
      this.state.startupDurationMs = 0;
      return this.state;
    }

    this.stop();
    const state = await this.startServer(key, nextKey);
    this.state = state;
    return state;
  }

  private async startServer(key: WhisperServerKey, stateKey: string): Promise<WhisperServerState> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const port = await availablePort(serverHost);
      const startedAt = Date.now();
      const state = await this.tryStartServer(key, stateKey, port).catch((error: unknown) => {
        lastError = error;
        return null;
      });
      if (state) {
        state.startupDurationMs = Date.now() - startedAt;
        await this.appendServerLog(state);
        return state;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Unable to start Whisper server.');
  }

  private async tryStartServer(
    key: WhisperServerKey,
    stateKey: string,
    port: number,
  ): Promise<WhisperServerState> {
    const args = this.serverArgs(key, port);
    const child = spawn(key.executable, args, {
      windowsHide: true,
      shell: false,
    });
    const stdout = new DebugLogBuffer();
    const stderr = new DebugLogBuffer();
    child.on('exit', () => {
      if (this.state?.child === child) {
        this.state = null;
      }
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.append(chunk.toString('utf8')));
    child.stdout.on('data', (chunk: Buffer) => stdout.append(chunk.toString('utf8')));
    const state = {
      key: stateKey,
      child,
      executable: key.executable,
      args,
      host: serverHost,
      port,
      url: `http://${serverHost}:${port}`,
      startedDuringLastEnsure: true,
      startupDurationMs: 0,
      stdout,
      stderr,
    };
    await this.waitUntilReady(state.url, child);
    return state;
  }

  private serverArgs(key: WhisperServerKey, port: number): string[] {
    const args = [
      '-m',
      key.modelPath,
      '--host',
      serverHost,
      '--port',
      String(port),
      '-l',
      key.language,
      '-nt',
      '-sns',
      '-t',
      String(key.threads),
      '-nth',
      '0.5',
      '-lpt',
      '-0.8',
      ...key.qualityArgs,
    ];
    if (key.prompt) {
      args.push('-mc', '0', '--prompt', key.prompt);
    }
    return args;
  }

  private async waitUntilReady(url: string, child: ChildProcessWithoutNullStreams): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15000) {
      if (child.exitCode !== null) {
        throw new Error('Whisper server stopped during startup.');
      }
      try {
        await fetch(url);
        return;
      } catch {
        await delay(100);
      }
    }
    throw new Error('Whisper server startup timed out.');
  }

  private textFromResponse(raw: string): string {
    try {
      const value = JSON.parse(raw) as { text?: unknown };
      return typeof value.text === 'string' ? value.text.trim() : raw.trim();
    } catch {
      return raw.trim();
    }
  }

  private async appendServerLog(state: WhisperServerState): Promise<void> {
    const logsRoot = await this.storage.ensureDir('logs');
    await appendFile(
      join(logsRoot, 'app.log'),
      [
        '',
        '',
        '[WHISPER SERVER]',
        `whisper server host: ${state.host}`,
        `whisper server port: ${state.port}`,
        `whisper server url: ${state.url}`,
      ].join('\n'),
      'utf8',
    );
  }
}

export const whisperServerService = new WhisperServerService();

const serverHost = '127.0.0.1';

const availablePort = (host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const server: Server = createServer();
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
          return;
        }
        reject(new Error('Unable to allocate Whisper server port.'));
      });
    });
    server.on('error', reject);
  });

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const serverError = (message: string, body: string): Error => {
  const error = new Error(message) as Error & { httpBody?: string };
  error.httpBody = body;
  return error;
};

const httpErrorBody = (error: unknown): string =>
  error && typeof error === 'object' && 'httpBody' in error && typeof error.httpBody === 'string'
    ? error.httpBody
    : '';

const withDiagnostics = (error: unknown, diagnostics: WhisperServerDiagnostics): Error => {
  const nextError = error instanceof Error ? error : new Error(String(error));
  (nextError as Error & { diagnostics?: WhisperServerDiagnostics }).diagnostics = diagnostics;
  return nextError;
};

export const whisperServerDiagnosticsFromError = (error: unknown): WhisperServerDiagnostics | null =>
  error && typeof error === 'object' && 'diagnostics' in error
    ? ((error as { diagnostics?: WhisperServerDiagnostics }).diagnostics ?? null)
    : null;
