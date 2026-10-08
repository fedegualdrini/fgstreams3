import { useCallback, useEffect, useState } from 'react';
import type { Match } from '@/types/api';
import { addToHistory, getHistory, historyEntryFromMatch, type HistoryEntry } from '@/lib/watchHistory';

/**
 * Watch history backed by localStorage. Read after mount so server and first
 * client render agree (history is empty on both).
 */
export function useWatchHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const recordEntry = useCallback((entry: HistoryEntry) => {
    addToHistory(entry);
    setHistory(getHistory());
  }, []);

  const recordMatch = useCallback(
    (match: Match) => recordEntry(historyEntryFromMatch(match)),
    [recordEntry],
  );

  return { history, recordEntry, recordMatch };
}
