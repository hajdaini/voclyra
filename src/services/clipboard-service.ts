import { clipboard } from 'electron';

export class ClipboardService {
  read(): string {
    return clipboard.readText();
  }

  write(text: string): void {
    clipboard.writeText(text);
  }
}
