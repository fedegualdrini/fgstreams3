import type { Match } from '@/types/api';

const MAX_HISTORY = 10;
const STORAGE_KEY = 'fgstreams-watch-history';

export interface HistoryEntry {
  id: string;
  team1: string;
  team2: string | null;
  league: string | null;
  sport: string;
  poster: string;
}

export function historyEntryFromMatch(match: Match): HistoryEntry {
  return {
    id: match.id,
    team1: match.team1,
    team2: match.team2 ?? null,
    league: match.league ?? null,
    sport: match.sport,
    poster: match.poster ?? '',
  };
}

export function addToHistory(entry: HistoryEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getHistory();
    const deduped = current.filter(e => e.id !== entry.id);
    const updated = [entry, ...deduped].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* quota exceeded or private mode */ }
}

export function getHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}
