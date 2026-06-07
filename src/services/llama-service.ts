import { access } from 'node:fs/promises';
import { llamaCudaRuntimeVersionConfig, llamaRuntimeConfig } from '@shared/GlobalVars';
import type { LlmRuntimeInfo, Settings } from '@shared/types';
import { errorDiagnostics } from '@services/debug-log-buffer';
import { llamaServerDiagnosticsFromError, llamaServerService, type LlamaServerDiagnostics } from '@services/llama-server-service';
import { ProcessLogService } from '@services/process-log-service';
import { RuntimePathService } from '@services/runtime-path-service';
import { SettingsService } from '@services/settings-service';

type LlamaRuntime = {
  path: string;
};

type LlamaProgress = {
  phase: 'thinking' | 'generating';
  tokensGenerated: number;
  progressLabel: string;
};

type LlamaImproveOptions = {
  onProgress?: (progress: LlamaProgress) => void;
};

type LlamaImproveResult = {
  text: string;
  tokensGenerated: number;
  tokensPerSecond: number;
};

export class LlamaService {
  private readonly runtimePaths = new RuntimePathService();
  private readonly server = llamaServerService;
  private readonly logger = new ProcessLogService();
  private readonly settingsService = new SettingsService();

  async runtimeInfo(): Promise<LlmRuntimeInfo> {
    const runtime = await this.runtime();
    const runtimeAvailable = await this.exists(runtime.path);
    return {
      runtimeAvailable,
    };
  }

  async runtimePath(): Promise<string> {
    return (await this.runtime()).path;
  }

  async warmup(modelPath: string): Promise<void> {
    if (!(await this.exists(modelPath))) {
      throw new Error('Local AI model file not found.');
    }
    const runtime = await this.runtime();
    if (!(await this.exists(runtime.path))) {
      throw new Error('Local AI runtime not found.');
    }
    const settings = await this.settingsService.get();
    await this.server.warmup(runtime.path, modelPath, {
      mode: 'auto',
      contextSize: settings.llmContextSize,
    });
  }

  async improveText(
    modelPath: string,
    correctionPrompt: string,
    text: string,
    options: LlamaImproveOptions = {},
  ): Promise<LlamaImproveResult> {
    const startedAt = Date.now();
    let runtime: LlamaRuntime | null = null;
    let settings: Settings | null = null;
    let inference: { maxTokens: number; contextSize: number; temperature: number } | null = null;
    let diagnostics: LlamaServerDiagnostics | null = null;

    try {
      if (!(await this.exists(modelPath))) {
        throw new Error('Local AI model file not found.');
      }

      runtime = await this.runtime();
      if (!(await this.exists(runtime.path))) {
        throw new Error('Local AI runtime not found.');
      }

      settings = await this.settingsService.get();
      inference = this.inferenceOptions(settings, text);
      options.onProgress?.({
        phase: 'thinking',
        tokensGenerated: 0,
        progressLabel: 'Generating...',
      });
      const result = await this.server.complete(runtime.path, modelPath, this.prompt(correctionPrompt, text), {
        mode: 'auto',
        ...inference,
        onProgress: (tokensGenerated) => {
          options.onProgress?.({
            phase: tokensGenerated > 0 ? 'generating' : 'thinking',
            tokensGenerated,
            progressLabel: tokensGenerated > 0 ? `${tokensGenerated} tokens` : 'Generating...',
          });
        },
      });
      diagnostics = result.diagnostics;
      const cleaned = this.cleanOutput(result.output);
      if (!cleaned.trim()) {
        throw new Error('Local AI returned an empty response.');
      }
      options.onProgress?.({
        phase: 'generating',
        tokensGenerated: result.tokensGenerated,
        progressLabel: `${result.tokensGenerated} tokens`,
      });
      const durationMs = Math.max(1, Date.now() - startedAt);
      const response = {
        text: cleaned,
        tokensGenerated: result.tokensGenerated,
        tokensPerSecond: Number((result.tokensGenerated / (durationMs / 1000)).toFixed(1)),
      };
      this.writeImproveLog({
        status: 'success',
        startedAt,
        durationMs,
        runtime,
        modelPath,
        settings,
        inference,
        inputChars: text.length,
        inputLines: lineCount(text),
        correctionPromptChars: correctionPrompt.length,
        diagnostics,
        result: response,
      });
      return response;
    } catch (error) {
      diagnostics = diagnostics ?? llamaServerDiagnosticsFromError(error);
      this.writeImproveLog({
        status: 'error',
        startedAt,
        durationMs: Math.max(1, Date.now() - startedAt),
        runtime,
        modelPath,
        settings,
        inference,
        inputChars: text.length,
        inputLines: lineCount(text),
        correctionPromptChars: correctionPrompt.length,
        diagnostics,
        error,
      });
      throw error;
    }
  }

  private async runtime(): Promise<LlamaRuntime> {
    const runtime = await this.runtimePaths.selectCudaRuntime(
      llamaRuntimeConfig.engineDirectory,
      llamaCudaRuntimeVersionConfig,
      llamaRuntimeConfig.platformDirectory,
      llamaRuntimeConfig.executableName,
    );
    return { path: runtime.path };
  }

  private prompt(correctionPrompt: string, text: string): string {
    return [
      'Return only this format:',
      '<voclyra_result>',
      'final corrected text here',
      '</voclyra_result>',
      '',
      'Do not write anything before or after the tags.',
      correctionPrompt.trim(),
      '',
      'Text to correct:',
      '',
      text.trim(),
    ].join('\n');
  }

  private inferenceOptions(settings: Settings, text: string): {
    maxTokens: number;
    contextSize: number;
    temperature: number;
  } {
    return {
      maxTokens: clamp(160 + Math.ceil(text.length / 4), 160, 900),
      contextSize: settings.llmContextSize,
      temperature: settings.llmTemperature,
    };
  }

  private cleanOutput(output: string): string {
    let text = output
      .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/[\b\r]/g, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .trim();

    const jsonText = this.parseJsonOutput(text);
    if (jsonText?.trim()) {
      return this.cleanCorrectedText(jsonText);
    }

    const tagged = text.match(/<voclyra_result>\s*([\s\S]*?)\s*<\/voclyra_result>/i);
    if (tagged?.[1]?.trim()) {
      return this.cleanCorrectedText(tagged[1]);
    }

    text = text
      .replace(/\[\s*Prompt:[\s\S]*$/i, '')
      .replace(/\bExiting\.\.\.\s*$/i, '')
      .trim();

    const blocks = text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .filter((block) => !/^Loading model/i.test(block))
      .filter((block) => !/^build\s*:/i.test(block))
      .filter((block) => !/^available commands:/i.test(block))
      .filter((block) => !/^>/i.test(block));
    text = blocks.length > 0 ? blocks.join('\n\n') : text;

    text = text.replace(/^\s*\d+\.\s+\*\*Analyze[\s\S]*?(?=\n[^\n]*[.!?…]"?$|$)/i, '').trim();
    text = text.replace(/^\s*\d+\.\s+\*\*[\s\S]*$/i, '').trim();
    text = text.replace(/^Analyze the (?:Request|Input Text)[\s\S]*$/i, '').trim();
    text = text.replace(/^[\s\S]*?(?:\.\.\.)?done thinking\.?\s*/i, '').trim();
    text = text.replace(/^\s*thinking\s*(?:\.\.\.|:)?\s*/i, '').trim();
    text = text.replace(/^\s*thinking\s+process\s*:\s*/i, '').trim();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !/^You are a text correction engine\.?$/i.test(line))
      .filter((line) => !/^Output only the corrected text\.?$/i.test(line))
      .filter((line) => !/^Do not analyze\./i.test(line))
      .filter((line) => !/^If you start writing analysis/i.test(line))
      .filter((line) => !/^Preserve the original language/i.test(line));
    return this.cleanCorrectedText(lines.join('\n').trim() || text);
  }

  private cleanCorrectedText(text: string): string {
    return text.replace(/[–—]/g, ',').trim();
  }

  private parseJsonOutput(output: string): string | null {
    const direct = this.tryParseJsonText(output);
    if (direct !== null) {
      return direct;
    }

    const match = output.match(/\{\s*"text"\s*:\s*"(?:\\.|[^"\\])*"\s*\}/s);
    return match ? this.tryParseJsonText(match[0]) : null;
  }

  private tryParseJsonText(output: string): string | null {
    try {
      const value = JSON.parse(output.trim()) as { text?: unknown };
      return typeof value.text === 'string' ? value.text : null;
    } catch {
      return null;
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private writeImproveLog(input: {
    status: 'success' | 'error';
    startedAt: number;
    durationMs: number;
    runtime: LlamaRuntime | null;
    modelPath: string;
    settings: Settings | null;
    inference: { maxTokens: number; contextSize: number; temperature: number } | null;
    inputChars: number;
    inputLines: number;
    correctionPromptChars: number;
    diagnostics: LlamaServerDiagnostics | null;
    result?: Pick<LlamaImproveResult, 'tokensGenerated' | 'tokensPerSecond'>;
    error?: unknown;
  }): void {
    void this.logger.writeSnapshot('improve.log', [
      '',
      '[ACTION]',
      'type: improve',
      `status: ${input.status}`,
      `duration ms: ${input.durationMs}`,
      'trigger/debug name: improve',
      '',
      '[SERVER PROCESS]',
      `engine: llama`,
      `executable: ${input.diagnostics?.executable ?? input.runtime?.path ?? 'unknown'}`,
      `args: ${input.diagnostics ? quoteArgs(input.diagnostics.args) : 'unknown'}`,
      `pid: ${input.diagnostics?.pid ?? 'unknown'}`,
      `host: ${input.diagnostics?.host ?? 'unknown'}`,
      `port: ${input.diagnostics?.port ?? 'unknown'}`,
      `url: ${input.diagnostics?.url ?? 'unknown'}`,
      `server reused: ${yesNo(input.diagnostics?.serverReused)}`,
      `server started during action: ${yesNo(input.diagnostics?.serverStartedDuringAction)}`,
      `startup duration ms: ${input.diagnostics?.startupDurationMs ?? 'unknown'}`,
      `alive before request: ${yesNo(input.diagnostics?.aliveBeforeRequest)}`,
      `alive after request: ${yesNo(input.diagnostics?.aliveAfterRequest)}`,
      '',
      '[SERVER STDOUT RAW TAIL]',
      input.diagnostics?.stdoutTail || 'empty',
      '',
      '[SERVER STDERR RAW TAIL]',
      input.diagnostics?.stderrTail || 'empty',
      '',
      '[CLIENT REQUEST]',
      `method: ${input.diagnostics?.method ?? 'unknown'}`,
      `endpoint: ${input.diagnostics?.endpoint ?? 'unknown'}`,
      `timeout ms: ${input.diagnostics?.timeoutMs ?? 'unknown'}`,
      `request started at: ${input.diagnostics?.requestStartedAt ?? new Date(input.startedAt).toISOString()}`,
      `request finished at: ${input.diagnostics?.requestFinishedAt ?? 'unknown'}`,
      `request duration ms: ${input.diagnostics?.requestDurationMs ?? 'unknown'}`,
      `http status: ${input.diagnostics?.httpStatus ?? 'unknown'}`,
      `http status text: ${input.diagnostics?.httpStatusText ?? 'unknown'}`,
      `content type: ${input.diagnostics?.contentType ?? 'unknown'}`,
      `request bytes: ${input.diagnostics?.requestBytes ?? 'unknown'}`,
      `response bytes: ${input.diagnostics?.responseBytes ?? 'unknown'}`,
      '',
      '[LLAMA]',
      `model: ${input.modelPath}`,
      `context size: ${input.inference?.contextSize ?? input.settings?.llmContextSize ?? 'unknown'}`,
      `max tokens: ${input.inference?.maxTokens ?? 'unknown'}`,
      'max tokens mode: auto',
      `temperature: ${input.inference?.temperature ?? input.settings?.llmTemperature ?? 'unknown'}`,
      'stream: true',
      `input chars: ${input.inputChars}`,
      `input lines: ${input.inputLines}`,
      `correction prompt chars: ${input.correctionPromptChars}`,
      `chunks received: ${input.diagnostics?.chunksReceived ?? 'unknown'}`,
      `first chunk after ms: ${input.diagnostics?.firstChunkAfterMs ?? 'unknown'}`,
      `last chunk after ms: ${input.diagnostics?.lastChunkAfterMs ?? 'unknown'}`,
      `tokens generated: ${input.result?.tokensGenerated ?? 'unknown'}`,
      `tokens per second: ${input.result?.tokensPerSecond ?? 'unknown'}`,
      '',
      '[HTTP RAW RESPONSE TAIL]',
      input.diagnostics?.rawResponseTail || 'empty',
      '',
      '[STREAM RAW CHUNKS TAIL]',
      input.diagnostics?.streamRawChunksTail || 'empty',
      '',
      '[ERROR]',
      ...(input.error ? errorDiagnostics(input.error) : ['name: none', 'message: none', 'stack: none']),
      `http error body tail: ${input.diagnostics?.httpErrorBodyTail || 'empty'}`,
      `server stdout tail: ${input.diagnostics?.stdoutTail || 'empty'}`,
      `server stderr tail: ${input.diagnostics?.stderrTail || 'empty'}`,
    ]).catch(() => {});
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const lineCount = (text: string): number => text ? text.split(/\r?\n/).length : 0;

const quoteArgs = (args: string[]): string => args.map((part) => `"${part}"`).join(' ');

const yesNo = (value: boolean | undefined): string => value === undefined ? 'unknown' : value ? 'yes' : 'no';
