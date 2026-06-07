export class DebugLogBuffer {
  private value = '';

  constructor(private readonly maxChars = 128 * 1024) {}

  append(text: string): void {
    if (!text) {
      return;
    }
    this.value += text;
    if (this.value.length > this.maxChars) {
      this.value = this.value.slice(-this.maxChars);
    }
  }

  text(): string {
    return this.value;
  }
}

export const errorDiagnostics = (error: unknown): string[] => {
  if (error instanceof Error) {
    return [
      `name: ${error.name}`,
      `message: ${error.message}`,
      `stack: ${error.stack ?? 'unknown'}`,
    ];
  }
  return [
    'name: unknown',
    `message: ${String(error)}`,
    'stack: unknown',
  ];
};
