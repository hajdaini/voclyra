import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DebugLogBuffer, errorDiagnostics } from '@services/debug-log-buffer';
import { AppStorage } from '@storage/app-storage';

type LlamaServerKey = {
  executable: string;
  modelPath: string;
  mode: 'auto' | 'cpu';
  contextSize: number;
};

type LlamaServerState = {
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

type LlamaServerResult = {
  output: string;
  tokensGenerated: number;
  diagnostics: LlamaServerDiagnostics;
};

export type LlamaServerDiagnostics = {
  engine: 'llama';
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
  chunksReceived: number;
  firstChunkAfterMs: number | null;
  lastChunkAfterMs: number | null;
  streamRawChunksTail: string;
  httpErrorBodyTail: string;
  errorLines: string[];
};

export class LlamaServerService {
  private state: LlamaServerState | null = null;
  private startup: Promise<LlamaServerState> | null = null;
  private readonly storage = new AppStorage();

  async complete(
    executable: string,
    modelPath: string,
    prompt: string,
    options: {
      mode: 'auto' | 'cpu';
      maxTokens: number;
      contextSize: number;
      temperature: number;
      timeoutMs?: number;
      onProgress?: (tokensGenerated: number) => void;
    },
  ): Promise<LlamaServerResult> {
    const server = await this.ensureServer({
      executable,
      modelPath,
      mode: options.mode,
      contextSize: options.contextSize,
    });
    const endpoint = '/completion';
    const timeoutMs = options.timeoutMs ?? 45000;
    const requestStartedAtMs = Date.now();
    const requestStartedAt = new Date(requestStartedAtMs).toISOString();
    const requestBody = JSON.stringify({
      prompt,
      n_predict: options.maxTokens,
      temperature: options.temperature,
      stream: true,
    });
    const diagnosticsBase = (): Omit<LlamaServerDiagnostics, 'requestFinishedAt' | 'requestDurationMs' | 'httpStatus' | 'httpStatusText' | 'contentType' | 'responseBytes' | 'rawResponseTail' | 'chunksReceived' | 'firstChunkAfterMs' | 'lastChunkAfterMs' | 'streamRawChunksTail' | 'httpErrorBodyTail' | 'errorLines'> => ({
      engine: 'llama',
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
      timeoutMs,
      requestStartedAt,
      requestBytes: Buffer.byteLength(requestBody, 'utf8'),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${server.url}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw serverError(`Llama server failed: ${response.status}`, body);
      }
      const stream = await this.textFromStream(response, requestStartedAtMs, options.onProgress);
      const output = stream.output;
      return {
        output,
        tokensGenerated: estimateTokenCount(output),
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
          responseBytes: Buffer.byteLength(output, 'utf8'),
          rawResponseTail: stream.rawResponseTail,
          chunksReceived: stream.chunksReceived,
          firstChunkAfterMs: stream.firstChunkAfterMs,
          lastChunkAfterMs: stream.lastChunkAfterMs,
          streamRawChunksTail: stream.rawChunksTail,
          httpErrorBodyTail: '',
          errorLines: [],
        },
      };
    } catch (error) {
      const diagnostics: LlamaServerDiagnostics = {
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
        chunksReceived: 0,
        firstChunkAfterMs: null,
        lastChunkAfterMs: null,
        streamRawChunksTail: '',
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
      mode: 'auto' | 'cpu';
      contextSize: number;
    },
  ): Promise<void> {
    await this.ensureServer({
      executable,
      modelPath,
      mode: options.mode,
      contextSize: options.contextSize,
    });
  }

  stop(): void {
    this.state?.child.kill();
    this.state = null;
    this.startup = null;
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

  private async ensureServer(key: LlamaServerKey): Promise<LlamaServerState> {
    const nextKey = JSON.stringify(key);
    if (this.state?.key === nextKey) {
      this.state.startedDuringLastEnsure = false;
      this.state.startupDurationMs = 0;
      return this.state;
    }
    if (this.startup) {
      const state = await this.startup;
      if (state.key === nextKey) {
        return state;
      }
    }

    this.stop();
    this.startup = this.startServer(key, nextKey).finally(() => {
      this.startup = null;
    });
    return this.startup;
  }

  private async startServer(key: LlamaServerKey, stateKey: string): Promise<LlamaServerState> {
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
        this.state = state;
        await this.appendServerLog(state);
        return state;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Unable to start Llama server.');
  }

  private async tryStartServer(
    key: LlamaServerKey,
    stateKey: string,
    port: number,
  ): Promise<LlamaServerState> {
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

  private serverArgs(key: LlamaServerKey, port: number): string[] {
    const args = [
      '-m',
      key.modelPath,
      '--host',
      serverHost,
      '--port',
      String(port),
      '-c',
      String(key.contextSize),
      '--no-webui',
    ];
    if (key.mode === 'auto') {
      args.push('-ngl', 'auto');
    } else {
      args.push('-ngl', '0');
    }
    return args;
  }

  private async waitUntilReady(url: string, child: ChildProcessWithoutNullStreams): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30000) {
      if (child.exitCode !== null) {
        throw new Error('Llama server stopped during startup.');
      }
      try {
        await fetch(url);
        return;
      } catch {
        await delay(150);
      }
    }
    throw new Error('Llama server startup timed out.');
  }

  private textFromResponse(raw: string): string {
    try {
      const value = JSON.parse(raw) as { content?: unknown; response?: unknown; text?: unknown };
      if (typeof value.content === 'string') {
        return value.content.trim();
      }
      if (typeof value.response === 'string') {
        return value.response.trim();
      }
      if (typeof value.text === 'string') {
        return value.text.trim();
      }
      return raw.trim();
    } catch {
      return raw.trim();
    }
  }

  private async textFromStream(
    response: Response,
    startedAtMs: number,
    onProgress?: (tokensGenerated: number) => void,
  ): Promise<{
    output: string;
    chunksReceived: number;
    firstChunkAfterMs: number | null;
    lastChunkAfterMs: number | null;
    rawResponseTail: string;
    rawChunksTail: string;
  }> {
    if (!response.body) {
      const raw = await response.text();
      return {
        output: this.textFromResponse(raw),
        chunksReceived: raw ? 1 : 0,
        firstChunkAfterMs: raw ? Date.now() - startedAtMs : null,
        lastChunkAfterMs: raw ? Date.now() - startedAtMs : null,
        rawResponseTail: raw,
        rawChunksTail: raw,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const rawResponse = new DebugLogBuffer();
    const rawChunks = new DebugLogBuffer();
    let buffer = '';
    let output = '';
    let chunksReceived = 0;
    let firstChunkAfterMs: number | null = null;
    let lastChunkAfterMs: number | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunksReceived += 1;
      firstChunkAfterMs ??= Date.now() - startedAtMs;
      lastChunkAfterMs = Date.now() - startedAtMs;
      const chunkText = decoder.decode(value, { stream: true });
      rawResponse.append(chunkText);
      rawChunks.append(chunkText);
      buffer += chunkText;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const content = this.contentFromStreamLine(line);
        if (!content) {
          continue;
        }
        output += content;
        onProgress?.(estimateTokenCount(output));
      }
    }

    const finalText = decoder.decode();
    rawResponse.append(finalText);
    buffer += finalText;
    for (const line of buffer.split(/\r?\n/)) {
      const content = this.contentFromStreamLine(line);
      if (!content) {
        continue;
      }
      output += content;
      onProgress?.(estimateTokenCount(output));
    }

    return {
      output: output.trim(),
      chunksReceived,
      firstChunkAfterMs,
      lastChunkAfterMs,
      rawResponseTail: rawResponse.text(),
      rawChunksTail: rawChunks.text(),
    };
  }

  private contentFromStreamLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') {
      return '';
    }
    const raw = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!raw) {
      return '';
    }
    try {
      const value = JSON.parse(raw) as {
        content?: unknown;
        response?: unknown;
        text?: unknown;
        choices?: Array<{ text?: unknown; delta?: { content?: unknown } }>;
      };
      if (typeof value.content === 'string') {
        return value.content;
      }
      if (typeof value.response === 'string') {
        return value.response;
      }
      if (typeof value.text === 'string') {
        return value.text;
      }
      const choice = value.choices?.[0];
      if (typeof choice?.text === 'string') {
        return choice.text;
      }
      if (typeof choice?.delta?.content === 'string') {
        return choice.delta.content;
      }
      return '';
    } catch {
      return raw;
    }
  }

  private async appendServerLog(state: LlamaServerState): Promise<void> {
    const logsRoot = await this.storage.ensureDir('logs');
    await appendFile(
      join(logsRoot, 'app.log'),
      [
        '',
        '',
        '[LLAMA SERVER]',
        `llama server host: ${state.host}`,
        `llama server port: ${state.port}`,
        `llama server url: ${state.url}`,
      ].join('\n'),
      'utf8',
    );
  }
}

export const llamaServerService = new LlamaServerService();

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
        reject(new Error('Unable to allocate Llama server port.'));
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

const withDiagnostics = (error: unknown, diagnostics: LlamaServerDiagnostics): Error => {
  const nextError = error instanceof Error ? error : new Error(String(error));
  (nextError as Error & { diagnostics?: LlamaServerDiagnostics }).diagnostics = diagnostics;
  return nextError;
};

export const llamaServerDiagnosticsFromError = (error: unknown): LlamaServerDiagnostics | null =>
  error && typeof error === 'object' && 'diagnostics' in error
    ? ((error as { diagnostics?: LlamaServerDiagnostics }).diagnostics ?? null)
    : null;

const estimateTokenCount = (text: string): number => {
  const cleaned = text
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .trim();
  if (!cleaned) {
    return 0;
  }
  return Math.max(1, Math.ceil(cleaned.length / 4));
};
