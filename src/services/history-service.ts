import type { HistoryEntry } from '@shared/types';
import { AppStorage } from '@storage/app-storage';

export class HistoryService {
  private readonly storage = new AppStorage();
  private readonly fileName = 'history.json';

  list(): Promise<HistoryEntry[]> {
    return this.storage.readJson<HistoryEntry[]>(this.fileName, []).then((entries) => this.sort(entries));
  }

  async add(entry: Omit<HistoryEntry, 'id' | 'createdAt' | 'title'>, maxItems = 100): Promise<HistoryEntry> {
    const entries = await this.list();
    const limit = Math.max(1, Math.floor(maxItems));
    const nextEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      title: this.title(entry.text),
      createdAt: new Date().toISOString(),
      favorite: false,
    };
    await this.storage.writeJson(this.fileName, this.sort([nextEntry, ...entries]).slice(0, limit));
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
    await this.storage.writeJson(
      this.fileName,
      entries.filter((entry) => entry.id !== id),
    );
  }

  clear(): Promise<HistoryEntry[]> {
    return this.storage.writeJson(this.fileName, []);
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
}
