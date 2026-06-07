import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react';
import { Calendar, Check, CheckSquare, Clipboard, Ear, FileDown, FileText, Headphones, History, Mic, Pencil, Search, Square, Star, Trash2, Wand2, X } from 'lucide-react';
import type { HistoryEntry } from '@shared/types';
import { api } from '../../api';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [audioLoadingIds, setAudioLoadingIds] = useState<string[]>([]);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const audioUrlsRef = useRef<Record<string, string>>({});
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

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  useEffect(() => () => {
    Object.values(audioUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (activeAudioId && !entries.some((entry) => entry.id === activeAudioId)) {
      setActiveAudioId(null);
    }
  }, [activeAudioId, entries]);

  const loadAudio = async (entry: HistoryEntry): Promise<void> => {
    if (!entry.audioFileName || audioLoadingIds.includes(entry.id)) {
      return;
    }
    if (audioUrls[entry.id]) {
      setActiveAudioId(entry.id);
      return;
    }
    setAudioLoadingIds((ids) => [...ids, entry.id]);
    try {
      const audio = await api.history.audio(entry.id);
      if (!audio) {
        return;
      }
      const url = URL.createObjectURL(new Blob([audio], { type: 'audio/wav' }));
      setAudioUrls((urls) => ({ ...urls, [entry.id]: url }));
      setActiveAudioId(entry.id);
    } finally {
      setAudioLoadingIds((ids) => ids.filter((id) => id !== entry.id));
    }
  };

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

  const saveTitle = (): void => {
    const title = editingTitle.trim();
    if (editingId && title) {
      onTitleUpdate(editingId, title);
    }
    setEditingId(null);
    setEditingTitle('');
  };
  const activeAudioEntry = activeAudioId ? entries.find((entry) => entry.id === activeAudioId) : undefined;

  return (
    <section className="page history-page">
      <div className="page-heading">
        <div>
          <h1 className="view-title">
            <History size={21} />
            <span>History</span>
          </h1>
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
      {activeAudioEntry && audioUrls[activeAudioEntry.id] && (
        <div className="history-player">
          <div className="history-player-title">
            <Ear size={15} />
            <span>{activeAudioEntry.title}</span>
          </div>
          <audio key={activeAudioEntry.id} controls autoPlay preload="metadata" src={audioUrls[activeAudioEntry.id]} />
        </div>
      )}
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
              <button
                className={`history-favorite ${entry.favorite ? 'active' : ''}`}
                type="button"
                title={entry.favorite ? 'Remove favorite' : 'Add favorite'}
                aria-label={entry.favorite ? 'Remove favorite' : 'Add favorite'}
                onClick={() => onFavoriteToggle(entry.id)}
              >
                <Star size={18} fill={entry.favorite ? 'currentColor' : 'none'} />
              </button>
              {editingId === entry.id ? (
                <div className="history-open history-title-editor">
                  <input
                    autoFocus
                    value={editingTitle}
                    maxLength={120}
                    aria-label="History title"
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        saveTitle();
                      } else if (event.key === 'Escape') {
                        setEditingId(null);
                        setEditingTitle('');
                      }
                    }}
                  />
                  <button className="history-title-save" type="button" title="Save title" aria-label="Save title" onClick={saveTitle}>
                    <Check size={17} />
                  </button>
                  <button
                    type="button"
                    title="Cancel editing"
                    aria-label="Cancel editing"
                    onClick={() => {
                      setEditingId(null);
                      setEditingTitle('');
                    }}
                  >
                    <X size={17} />
                  </button>
                </div>
                ) : (
                <div className="history-open">
                  <div className="history-content">
                    <div className="history-entry-title">
                      <button type="button" title="Select entry" onClick={(event) => toggleSelected(entry, event)}>
                        <span>{entry.title}</span>
                      </button>
                      <button
                        type="button"
                        title="Edit title"
                        aria-label="Edit title"
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditingTitle(entry.title);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
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
                </div>
              )}
              <div className="history-actions">
                {entry.audioFileName && (
                  <button
                    className={activeAudioId === entry.id ? 'active' : ''}
                    type="button"
                    title="Play audio"
                    aria-label="Play audio"
                    disabled={audioLoadingIds.includes(entry.id)}
                    onClick={() => void loadAudio(entry)}
                  >
                    <Ear size={18} />
                  </button>
                )}
                <button
                  type="button"
                  title="Export text"
                  aria-label="Export text"
                  onClick={() => void api.history.exportText(entry.id)}
                >
                  <FileDown size={18} />
                </button>
                <button type="button" title="Copy entry" aria-label="Copy entry" onClick={() => onCopy(entry)}>
                  <Clipboard size={18} />
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
