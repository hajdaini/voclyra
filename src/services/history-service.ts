import type { HistoryEntry } from '@shared/types';
import { AppStorage } from '@storage/app-storage';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type AddHistoryEntry = Omit<HistoryEntry, 'id' | 'createdAt' | 'title' | 'audioFileName' | 'audioByteLength'> & {
  audio?: Uint8Array;
};

export class HistoryService {
  private readonly storage = new AppStorage();
  private readonly fileName = 'history.json';

  list(): Promise<HistoryEntry[]> {
    return this.storage.readJson<HistoryEntry[]>(this.fileName, []).then((entries) => this.sort(entries));
  }

  async add(entry: AddHistoryEntry, maxItems = 100): Promise<HistoryEntry> {
    const entries = await this.list();
    const limit = Math.max(1, Math.floor(maxItems));
    const id = crypto.randomUUID();
    const audioFileName = entry.audio ? this.audioFileName(entry.kind, id) : undefined;
    const nextEntry: HistoryEntry = {
      kind: entry.kind,
      text: entry.text,
      ...(audioFileName ? { audioFileName } : {}),
      ...(audioFileName && entry.audio ? { audioByteLength: entry.audio.byteLength } : {}),
      id,
      title: this.title(entry.text),
      createdAt: new Date().toISOString(),
      favorite: false,
    };
    const sorted = this.sort([nextEntry, ...entries]);
    const nextEntries = sorted.slice(0, limit);
    const purgedEntries = sorted.slice(limit);
    try {
      if (entry.audio && audioFileName) {
        await this.writeAudio(audioFileName, entry.audio);
      }
      await this.storage.writeJson(this.fileName, nextEntries);
      await this.deleteAudioForEntries(purgedEntries);
    } catch (error) {
      if (audioFileName) {
        await this.deleteAudio(audioFileName);
      }
      throw error;
    }
    return nextEntry;
  }

  async toggleFavorite(id: string): Promise<HistoryEntry[]> {
    const entries = await this.list();
    const nextEntries = entries.map((entry) =>
      entry.id === id ? { ...entry, favorite: !entry.favorite } : entry,
    );
    return this.storage.writeJson(this.fileName, this.sort(nextEntries));
  }

  async updateTitle(id: string, title: string): Promise<HistoryEntry[]> {
    const entries = await this.list();
    const normalizedTitle = title.replace(/\s+/g, ' ').trim();
    const nextEntries = entries.map((entry) =>
      entry.id === id ? { ...entry, title: normalizedTitle } : entry,
    );
    return this.storage.writeJson(this.fileName, this.sort(nextEntries));
  }

  async delete(id: string): Promise<void> {
    const entries = await this.list();
    const deletedEntries = entries.filter((entry) => entry.id === id);
    await this.storage.writeJson(
      this.fileName,
      entries.filter((entry) => entry.id !== id),
    );
    await this.deleteAudioForEntries(deletedEntries);
  }

  async clear(): Promise<HistoryEntry[]> {
    const entries = await this.list();
    await this.storage.writeJson(this.fileName, []);
    await this.deleteAudioForEntries(entries);
    return [];
  }

  async audio(id: string): Promise<Uint8Array | null> {
    const entry = (await this.list()).find((item) => item.id === id);
    if (!entry?.audioFileName || !this.validAudioFileName(entry.audioFileName)) {
      return null;
    }
    try {
      return await readFile(this.audioPath(entry.audioFileName));
    } catch {
      return null;
    }
  }

  private title(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized || 'Untitled';
  }

  private sort(entries: HistoryEntry[]): HistoryEntry[] {
    return [...entries].sort((left, right) => {
      if (Boolean(left.favorite) !== Boolean(right.favorite)) {
        return left.favorite ? -1 : 1;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }

  private audioFileName(kind: HistoryEntry['kind'], id: string): string | undefined {
    if (kind === 'speak') {
      return `speak/${id}.wav`;
    }
    if (kind === 'transcript') {
      return `transcript/${id}.wav`;
    }
    return undefined;
  }

  private async writeAudio(fileName: string, audio: Uint8Array): Promise<void> {
    const audioRoot = await this.storage.ensureDir('audio', fileName.startsWith('speak/') ? 'speak' : 'transcript');
    await writeFile(join(audioRoot, fileName.split('/').at(-1) ?? fileName), audio);
  }

  private async deleteAudioForEntries(entries: HistoryEntry[]): Promise<void> {
    await Promise.all(entries.map((entry) => entry.audioFileName ? this.deleteAudio(entry.audioFileName) : undefined));
  }

  private async deleteAudio(fileName: string): Promise<void> {
    if (!this.validAudioFileName(fileName)) {
      return;
    }
    await rm(this.audioPath(fileName), { force: true }).catch(() => {});
  }

  private validAudioFileName(fileName: string): boolean {
    return /^(speak|transcript)\/[\w.-]+\.wav$/i.test(fileName);
  }

  private audioPath(fileName: string): string {
    const [folder, name] = fileName.split('/');
    return join(this.storage.path('audio', folder ?? ''), name ?? '');
  }
}
