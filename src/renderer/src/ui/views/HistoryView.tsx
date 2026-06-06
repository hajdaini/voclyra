import { useEffect, useMemo, useState, type JSX, type MouseEvent } from 'react';
import { Calendar, CheckSquare, Clipboard, FileText, Headphones, Mic, Pencil, Search, Square, Star, Trash2, Wand2 } from 'lucide-react';
import type { HistoryEntry } from '@shared/types';

export type HistoryViewProps = {
  entries: HistoryEntry[];
  onCopy: (entry: HistoryEntry) => void;
  onFavoriteToggle: (id: string) => void;
  onTitleUpdate: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onDeleteSelected: (ids: string[]) => void;
  onClear: () => void;
};

export const HistoryView = ({
  entries,
  onCopy,
  onFavoriteToggle,
  onTitleUpdate,
  onDelete,
  onDeleteSelected,
  onClear,
}: HistoryViewProps): JSX.Element => {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'dictation' | 'improvement' | 'transcript'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesKind = kindFilter === 'all' || entry.kind === kindFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${entry.kind} ${entry.title} ${entry.text} ${entry.createdAt}`.toLowerCase().includes(normalizedQuery);
      return matchesKind && matchesQuery;
    });
  }, [entries, kindFilter, query]);
  const visibleIds = filteredEntries.map((entry) => entry.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => entries.some((entry) => entry.id === id)));
  }, [entries]);

  const toggleSelected = (entry: HistoryEntry, event: MouseEvent<HTMLButtonElement>): void => {
    if (event.shiftKey && lastSelectedId) {
      const currentIndex = visibleIds.indexOf(entry.id);
      const lastIndex = visibleIds.indexOf(lastSelectedId);
      if (currentIndex >= 0 && lastIndex >= 0) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        const range = visibleIds.slice(start, end + 1);
        setSelectedIds((ids) => [...new Set([...ids, ...range])]);
        setLastSelectedId(entry.id);
        return;
      }
    }
    setSelectedIds((ids) =>
      ids.includes(entry.id) ? ids.filter((id) => id !== entry.id) : [...ids, entry.id],
    );
    setLastSelectedId(entry.id);
  };

  const toggleAllVisible = (): void => {
    if (allVisibleSelected) {
      setSelectedIds((ids) => ids.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((ids) => [...new Set([...ids, ...visibleIds])]);
  };

  const deleteSelected = (): void => {
    onDeleteSelected(selectedIds);
    setSelectedIds([]);
    setLastSelectedId(null);
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>History</h1>
        </div>
        <button className="danger-action" type="button" title="Clear all history" disabled={entries.length === 0} onClick={onClear}>
          <Trash2 size={17} />
          <span>Clear all</span>
        </button>
      </div>
      <div className="history-toolbar">
        <label className="history-search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search history"
          />
        </label>
        <label className="history-filter">
          <select
            value={kindFilter}
            onChange={(event) =>
              setKindFilter(event.target.value as 'all' | 'dictation' | 'improvement' | 'transcript')
            }
            aria-label="Filter history"
          >
            <option value="all">All</option>
            <option value="dictation">Speak</option>
            <option value="improvement">Improve</option>
            <option value="transcript">Transcript</option>
          </select>
        </label>
        <div className="history-selection-tools">
          <button type="button" title="Select visible entries" disabled={visibleIds.length === 0} onClick={toggleAllVisible}>
            {allVisibleSelected ? <CheckSquare size={17} /> : <Square size={17} />}
            <span>{selectedIds.length} selected</span>
          </button>
          <button
            className="danger-action"
            type="button"
            title="Delete selected entries"
            disabled={selectedIds.length === 0}
            onClick={deleteSelected}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <div className="history-list">
        {filteredEntries.length === 0 && (
          <div className="history-empty">
            <FileText size={28} />
            <strong>{entries.length === 0 ? 'No history yet' : 'No matching history'}</strong>
            <span>Your dictations, improvements, and transcripts will appear here.</span>
          </div>
        )}
        {filteredEntries.map((entry) => {
          const selected = selectedIds.includes(entry.id);
          return (
            <article className={`history-entry ${selected ? 'selected' : ''}`} key={entry.id}>
              <button
                className="history-select"
                type="button"
                title={`Select ${entry.kind}`}
                aria-label={`Select ${entry.kind}`}
                onClick={(event) => toggleSelected(entry, event)}
              >
                {selected ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <button className="history-open" type="button" title="Select entry" onClick={(event) => toggleSelected(entry, event)}>
                <div className="history-content">
                  <p>{entry.title}</p>
                  <div className="history-title-row">
                    <span className={`history-kind-tag ${entry.kind}`}>
                      {entry.kind === 'dictation' ? (
                        <Mic size={13} />
                      ) : entry.kind === 'improvement' ? (
                        <Wand2 size={13} />
                      ) : (
                        <Headphones size={13} />
                      )}
                      {entry.kind === 'dictation' ? 'Speak' : entry.kind === 'improvement' ? 'Improve' : 'Transcript'}
                    </span>
                    <time>
                      <Calendar size={13} />
                      {new Date(entry.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                </div>
              </button>
              <div className="history-actions">
                <button
                  className={`favorite-action ${entry.favorite ? 'active' : ''}`}
                  type="button"
                  title={entry.favorite ? 'Remove favorite' : 'Add favorite'}
                  aria-label={entry.favorite ? 'Remove favorite' : 'Add favorite'}
                  onClick={() => onFavoriteToggle(entry.id)}
                >
                  <Star size={18} />
                </button>
                <button type="button" title="Copy entry" aria-label="Copy entry" onClick={() => onCopy(entry)}>
                  <Clipboard size={18} />
                </button>
                <button
                  type="button"
                  title="Edit title"
                  aria-label="Edit title"
                  onClick={() => {
                    const title = window.prompt('Edit title', entry.title)?.trim();
                    if (title && title !== entry.title) {
                      onTitleUpdate(entry.id, title);
                    }
                  }}
                >
                  <Pencil size={18} />
                </button>
                <button
                  className="danger-action"
                  type="button"
                  title="Delete entry"
                  aria-label="Delete entry"
                  onClick={() => onDelete(entry.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
