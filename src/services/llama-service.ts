import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { llamaCudaRuntimeVersionConfig, llamaRuntimeConfig } from '@shared/GlobalVars';
import type { LlmRuntimeInfo, Settings } from '@shared/types';
import { AppStorage } from '@storage/app-storage';
import { ProcessLogService } from '@services/process-log-service';
import { SettingsService } from '@services/settings-service';

type LlamaRuntime = {
  path: string;
  backend: 'gpu' | 'cpu' | 'unknown';
};

type LlamaRunDiagnostics = {
  status: string;
  durationMs: number;
  stdout: string;
  stderr: string;
  command: string;
};

type LlamaPromptFiles = {
  root: string;
  promptPath: string;
  schemaPath: string;
};

export class LlamaService {
  private readonly storage = new AppStorage();
  private readonly logger = new ProcessLogService();
  private readonly settingsService = new SettingsService();

  async runtimeInfo(): Promise<LlmRuntimeInfo> {
    const runtime = await this.runtime();
    const version = (await this.settingsService.get()).llmCudaRuntimeVersion;
    return {
      backend: runtime.backend,
      runtimeAvailable: runtime.backend !== 'unknown' && (await this.exists(runtime.path)),
      device: runtime.backend === 'gpu' ? 'CUDA' : runtime.backend === 'cpu' ? 'CPU' : 'Unknown',
      version,
    };
  }

  async runtimePath(): Promise<string> {
    return (await this.runtime()).path;
  }

  async improveText(modelPath: string, correctionPrompt: string, text: string): Promise<string> {
    if (!(await this.exists(modelPath))) {
      throw new Error('Local AI model file not found.');
    }

    const runtime = await this.runtime();
    if (runtime.backend === 'unknown' || !(await this.exists(runtime.path))) {
      throw new Error('Local AI runtime not found.');
    }

    const settings = await this.settingsService.get();
    const promptFiles = await this.writePromptFiles(correctionPrompt, text);
    try {
      const output = await this.run(runtime, modelPath, promptFiles, this.inferenceOptions(settings, text));
      const cleaned = this.cleanOutput(output);
      if (!cleaned.trim()) {
        throw new Error('Local AI returned an empty response.');
      }
      return cleaned;
    } finally {
      await rm(promptFiles.root, { force: true, recursive: true }).catch(() => {});
    }
  }

  private async runtime(): Promise<LlamaRuntime> {
    const version = (await this.settingsService.get()).llmCudaRuntimeVersion;
    const userCudaPath = join(
      this.storage.path(),
      ...llamaRuntimeConfig.runtimeParts,
      llamaRuntimeConfig.engineDirectory,
      llamaCudaRuntimeVersionConfig[version].directory,
      llamaRuntimeConfig.platformDirectory,
      llamaRuntimeConfig.executableName,
    );
    if (!existsSync(userCudaPath)) {
      return { path: userCudaPath, backend: 'unknown' };
    }
    return { path: userCudaPath, backend: this.hasCudaFiles(userCudaPath) ? 'gpu' : 'cpu' };
  }

  private hasCudaFiles(executablePath: string): boolean {
    const root = dirname(executablePath);
    return existsSync(join(root, 'ggml-cuda.dll')) || existsSync(join(root, 'cudart64_12.dll'));
  }

  private async writePromptFiles(correctionPrompt: string, text: string): Promise<LlamaPromptFiles> {
    const root = await this.storage.ensureDir('tmp', `llm-${randomUUID()}`);
    const promptPath = join(root, 'prompt.txt');
    const schemaPath = join(root, 'schema.json');
    await Promise.all([
      writeFile(promptPath, this.prompt(correctionPrompt, text), 'utf8'),
      writeFile(schemaPath, this.jsonSchema(), 'utf8'),
    ]);
    return { root, promptPath, schemaPath };
  }

  private prompt(correctionPrompt: string, text: string): string {
    return [
      'You are a text correction engine.',
      'Return a JSON object only with exactly one property named text.',
      'The text property must contain only the full corrected text.',
      'Do not include markdown, analysis, comments, or any extra property.',
      'Preserve the original language, meaning, tone, paragraphs, and line breaks.',
      correctionPrompt.trim(),
      '',
      text.trim(),
    ].join('\n');
  }

  private jsonSchema(): string {
    return JSON.stringify({
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: {
          type: 'string',
        },
      },
    });
  }

  private run(
    runtime: LlamaRuntime,
    modelPath: string,
    promptFiles: LlamaPromptFiles,
    options: { maxTokens: number; contextSize: number; temperature: number },
  ): Promise<string> {
    return new Promise((resolveRun, rejectRun) => {
      let settled = false;
      const args = [
        '-m',
        modelPath,
        '-f',
        promptFiles.promptPath,
        '-jf',
        promptFiles.schemaPath,
        '-n',
        String(options.maxTokens),
        '-c',
        String(options.contextSize),
        '--temp',
        String(options.temperature),
        '--no-display-prompt',
        '--no-perf',
        '--simple-io',
        '-no-cnv',
        '-rea',
        'off',
        '--reasoning-budget',
        '0',
      ];
      if (runtime.backend === 'gpu') {
        args.push('-ngl', '99');
      }

      const child = spawn(runtime.path, args, {
        windowsHide: true,
        shell: false,
      });
      const startedAt = Date.now();
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      const timeout = setTimeout(async () => {
        if (settled) {
          return;
        }
        settled = true;
        await this.appendLog(runtime, modelPath, options, {
          status: 'timeout',
          durationMs: Date.now() - startedAt,
          stdout: Buffer.concat(output).toString('utf8'),
          stderr: Buffer.concat(errors).toString('utf8'),
          command: this.commandForLog(runtime.path, args),
        });
        child.kill();
        rejectRun(new Error('Local AI request timed out.'));
      }, 45000);

      child.stdout.on('data', (chunk: Buffer) => {
        output.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        errors.push(chunk);
      });

      child.on('error', async (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        await this.appendLog(runtime, modelPath, options, {
          status: error.message,
          durationMs: Date.now() - startedAt,
          stdout: Buffer.concat(output).toString('utf8'),
          stderr: Buffer.concat(errors).toString('utf8'),
          command: this.commandForLog(runtime.path, args),
        });
        rejectRun(error);
      });

      child.on('close', async (code, signal) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const stdoutRaw = Buffer.concat(output).toString('utf8');
        const stderrRaw = Buffer.concat(errors).toString('utf8');
        const stderr = this.cleanError(stderrRaw);
        const status = signal ? `signal: ${signal}` : `exit code: ${code ?? 'unknown'}`;
        await this.appendLog(runtime, modelPath, options, {
          status,
          durationMs: Date.now() - startedAt,
          stdout: stdoutRaw,
          stderr: stderrRaw,
          command: this.commandForLog(runtime.path, args),
        });
        if (code !== 0) {
          rejectRun(new Error(stderr || 'Local AI failed.'));
          return;
        }
        resolveRun(stdoutRaw);
      });
    });
  }

  private appendLog(
    runtime: LlamaRuntime,
    modelPath: string,
    options: { maxTokens: number; contextSize: number; temperature: number },
    diagnostics: LlamaRunDiagnostics,
  ): Promise<void> {
    return this.logger.append('improve.log', [
      `runtime: ${runtime.path}`,
      `backend: ${runtime.backend}`,
      `model: ${modelPath}`,
      `command: ${diagnostics.command}`,
      `max tokens: ${options.maxTokens}`,
      `context size: ${options.contextSize}`,
      `temperature: ${options.temperature}`,
      `duration ms: ${diagnostics.durationMs}`,
      `stdout bytes: ${Buffer.byteLength(diagnostics.stdout, 'utf8')}`,
      `stderr bytes: ${Buffer.byteLength(diagnostics.stderr, 'utf8')}`,
      `stdout lines: ${this.lineCount(diagnostics.stdout)}`,
      `stderr lines: ${this.lineCount(diagnostics.stderr)}`,
      `stdout diagnostics: ${this.outputDiagnostics(diagnostics.stdout)}`,
      `stderr diagnostics: ${this.outputDiagnostics(diagnostics.stderr)}`,
      `stderr tail: ${this.cleanLogOutput(diagnostics.stderr).slice(-2500) || 'empty'}`,
      diagnostics.status,
    ]);
  }

  private commandForLog(executable: string, args: string[]): string {
    return [executable, ...args].map((part) => `"${part}"`).join(' ');
  }

  private lineCount(output: string): number {
    return output ? output.split(/\r?\n/).length : 0;
  }

  private outputDiagnostics(output: string): string {
    const checks = [
      /▄▄|██|▀▀/.test(output) ? 'banner' : '',
      /available commands:/i.test(output) ? 'commands' : '',
      />\s+/.test(output) ? 'prompt_echo' : '',
      /\[Start thinking\]/i.test(output) ? 'thinking_start' : '',
      /\[End thinking\]/i.test(output) ? 'thinking_end' : '',
      /Exiting\.\.\./i.test(output) ? 'exiting' : '',
      /Objective:/i.test(output) ? 'objective_echo' : '',
      /Output:/i.test(output) ? 'output_echo' : '',
    ].filter(Boolean);
    return checks.length > 0 ? checks.join(', ') : 'none';
  }

  private cleanLogOutput(output: string): string {
    return output
      .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/[\b\r]/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^>/.test(line))
      .join('\n');
  }

  private inferenceOptions(settings: Settings, text: string): {
    maxTokens: number;
    contextSize: number;
    temperature: number;
  } {
    return {
      maxTokens:
        settings.llmMaxTokensMode === 'fixed'
          ? settings.llmMaxTokens
          : clamp(160 + Math.ceil(text.length / 4), 160, 900),
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
      return jsonText.trim();
    }

    const tagged = text.match(/<voclyra_result>\s*([\s\S]*?)\s*<\/voclyra_result>/i);
    if (tagged?.[1]?.trim()) {
      return tagged[1].trim();
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
    return lines.join('\n').trim() || text;
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

  private cleanError(output: string): string {
    return output
      .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^build:/i.test(line))
      .filter((line) => !/^main:/i.test(line))
      .filter((line) => !/^llama_/i.test(line))
      .filter((line) => !/^ggml_/i.test(line))
      .slice(-4)
      .join(' ')
      .slice(0, 220)
      .trim();
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
