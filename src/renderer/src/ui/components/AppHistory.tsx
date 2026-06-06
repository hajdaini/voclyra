import type { JSX } from 'react';
import type { HistoryEntry } from '@shared/types';
import { HistoryView } from '../views/HistoryView';

type AppHistoryProps = {
  history: HistoryEntry[];
  onHistoryCopy: (entry: HistoryEntry) => void;
  onHistoryFavoriteToggle: (id: string) => void;
  onHistoryTitleUpdate: (id: string, title: string) => void;
  onHistoryDelete: (id: string) => void;
  onHistoryDeleteSelected: (ids: string[]) => void;
  onHistoryClear: () => void;
};

export const AppHistory = ({
  history,
  onHistoryCopy,
  onHistoryFavoriteToggle,
  onHistoryTitleUpdate,
  onHistoryDelete,
  onHistoryDeleteSelected,
  onHistoryClear,
}: AppHistoryProps): JSX.Element => (
  <HistoryView
    entries={history}
    onCopy={onHistoryCopy}
    onFavoriteToggle={onHistoryFavoriteToggle}
    onTitleUpdate={onHistoryTitleUpdate}
    onDelete={onHistoryDelete}
    onDeleteSelected={onHistoryDeleteSelected}
    onClear={onHistoryClear}
  />
);
