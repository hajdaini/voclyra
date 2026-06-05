import { HistoryService } from '@services/history-service';
import { WhisperService } from '@services/whisper-service';

export class TranscriptService {
  constructor(
    private readonly whisperService: WhisperService,
    private readonly historyService: HistoryService,
  ) {}

  async transcribe(audio: Uint8Array, whisperModel: string, maxHistoryItems: number): Promise<string> {
    const text = await this.whisperService.transcribeMeeting(audio, whisperModel, { timeoutMs: null });
    if (text.trim()) {
      await this.historyService.add({ kind: 'transcript', text }, maxHistoryItems);
    }
    return text;
  }
}
