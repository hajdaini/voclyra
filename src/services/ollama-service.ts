import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { ProcessLogService } from '@services/process-log-service';

export class OllamaService {
  private readonly logger = new ProcessLogService();

  listModels(): Promise<string[]> {
    return new Promise((resolve) => {
      const args = ['list'];
      const process = spawn('ollama', args, {
        windowsHide: true,
        shell: false,
      });
      const chunks: Buffer[] = [];
      const errors: Buffer[] = [];
      const timeout = setTimeout(async () => {
        await this.appendCliLog(args, Buffer.concat(chunks).toString('utf8'), Buffer.concat(errors).toString('utf8'), 'timeout');
        process.kill();
        resolve([]);
      }, 6000);

      process.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      process.stderr.on('data', (chunk: Buffer) => {
        errors.push(chunk);
      });

      process.on('error', async (error) => {
        clearTimeout(timeout);
        await this.appendCliLog(args, Buffer.concat(chunks).toString('utf8'), Buffer.concat(errors).toString('utf8'), error.message);
        resolve([]);
      });

      process.on('close', async (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(chunks).toString('utf8');
        const stderr = Buffer.concat(errors).toString('utf8');
        await this.appendCliLog(args, stdout, stderr, `exit code: ${code ?? 'unknown'}`);
        resolve(this.parseList(stdout));
      });
    });
  }

  private parseList(output: string): string[] {
    return output
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((model): model is string => Boolean(model));
  }

  async improveText(model: string, correctionPrompt: string, text: string): Promise<string> {
    const prompt = [
      'Rewrite the text below.',
      'Return only the rewritten text.',
      'No thinking. No reasoning. No analysis. No explanation. No markdown. No label.',
      'Preserve the original language, meaning, and tone.',
      correctionPrompt.trim(),
      '',
      text.trim(),
    ].join('\n');

    try {
      return this.cleanOutput(await this.generateWithApi(model, prompt));
    } catch {
      return this.cleanOutput(await this.generateWithCli(model, prompt));
    }
  }

  private generateWithApi(model: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model,
        prompt,
        stream: false,
        think: false,
        options: {
          temperature: 0.1,
        },
      });

      const requestHandle = request(
        {
          hostname: '127.0.0.1',
          port: 11434,
          path: '/api/generate',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            void this.appendApiLog(model, body, `status code: ${response.statusCode ?? 'unknown'}`);
            if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
              reject(new Error('Ollama API failed.'));
              return;
            }

            try {
              const json = JSON.parse(body) as { response?: unknown };
              if (typeof json.response !== 'string') {
                reject(new Error('Ollama returned an invalid response.'));
                return;
              }
              resolve(json.response);
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      requestHandle.on('error', (error) => {
        void this.appendApiLog(model, '', error.message);
        reject(error);
      });
      requestHandle.setTimeout(120000, () => {
        void this.appendApiLog(model, '', 'timeout');
        requestHandle.destroy(new Error('Ollama request timed out.'));
      });
      requestHandle.end(payload);
    });
  }

  private generateWithCli(model: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['run', '--nowordwrap', model];
      const process = spawn('ollama', args, {
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      const timeout = setTimeout(async () => {
        await this.appendCliLog(args, Buffer.concat(output).toString('utf8'), Buffer.concat(errors).toString('utf8'), 'timeout');
        process.kill();
        reject(new Error('Ollama request timed out.'));
      }, 120000);

      process.stdout.on('data', (chunk: Buffer) => {
        output.push(chunk);
      });

      process.stderr.on('data', (chunk: Buffer) => {
        errors.push(chunk);
      });

      process.on('error', async (error) => {
        clearTimeout(timeout);
        await this.appendCliLog(args, Buffer.concat(output).toString('utf8'), Buffer.concat(errors).toString('utf8'), error.message);
        reject(error);
      });

      process.on('close', async (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(output).toString('utf8');
        const stderr = Buffer.concat(errors).toString('utf8');
        await this.appendCliLog(args, stdout, stderr, `exit code: ${code ?? 'unknown'}`);
        if (code !== 0) {
          reject(new Error(stderr.trim() || 'Ollama failed.'));
          return;
        }
        resolve(stdout);
      });

      process.stdin.end(prompt);
    });
  }

  private appendCliLog(args: string[], stdout: string, stderr: string, status: string): Promise<void> {
    const command = ['ollama', ...args].map((part) => `"${part}"`).join(' ');
    return this.logger.append('ollama.log', [`command: ${command}`, stdout, stderr, status]);
  }

  private appendApiLog(model: string, response: string, status: string): Promise<void> {
    return this.logger.append('ollama.log', [
      'request: POST http://127.0.0.1:11434/api/generate',
      `model: ${model}`,
      response,
      status,
    ]);
  }

  private cleanOutput(output: string): string {
    let text = output
      .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/[\b\r]/g, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .trim();

    text = text.replace(/^[\s\S]*?(?:\.\.\.)?done thinking\.?\s*/i, '').trim();
    text = text.replace(/^\s*thinking\s*(?:\.\.\.|:)?\s*/i, '').trim();
    text = text.replace(/^\s*thinking\s+process\s*:\s*/i, '').trim();

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^thinking\s*(?:\.\.\.|:)?$/i.test(line))
      .filter((line) => !/^thinking\s+process\s*:/i.test(line))
      .filter((line) => !/^(?:\.\.\.)?done thinking\.?$/i.test(line));

    const labelled = [...lines]
      .reverse()
      .find((line) => /^(final|final answer|answer|result|résultat)\s*:/i.test(line));

    let cleaned = labelled
      ? labelled.replace(/^(final|final answer|answer|result|résultat)\s*:\s*/i, '')
      : lines.join('\n');

    if (/^\d+\.\s+|^[-*]\s+|analy[sz]e|review|strategy|output generation/i.test(cleaned)) {
      const paragraphs = cleaned
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .filter((paragraph) => !/^\d+\.\s+/.test(paragraph))
        .filter((paragraph) => !/^(analy[sz]e|identify|determine|select|final review|output generation)/i.test(paragraph));
      cleaned = paragraphs[paragraphs.length - 1] ?? cleaned;
    }

    return cleaned
      .replace(/^(final|final answer|answer|result|résultat)\s*:\s*/i, '')
      .replace(/^\s*thinking(?:\s|\.|:|…)*\s*/i, '')
      .replace(/^['"“”]+|['"“”]+$/g, '')
      .trim();
  }
}
