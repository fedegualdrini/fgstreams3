import type { Match, Stream } from '@/types/api';

export const DEFAULT_MAX_MATCHES = 4;

export type MatchLayout = 'grid' | 'side-by-side';

/** A match on the multi-view wall, with its resolved streams and player state. */
export interface ActiveMatch {
  match: Match;
  streams: Stream[];
  selectedStream: Stream | null;
  muted: boolean;
}

/** Value identifying a stream inside a `<select>`. */
export function streamOptionValue(stream: Stream): string {
  return stream.url || stream.embedUrl || '';
}

export function findStreamByValue(streams: Stream[], value: string): Stream | undefined {
  return streams.find((stream) => stream.url === value || stream.embedUrl === value);
}

/** Matches that can still be added: everything not already on the wall. */
export function matchesAvailableToAdd(available: Match[], active: ActiveMatch[]): Match[] {
  return available.filter((match) => !active.some((entry) => entry.match.id === match.id));
}

export function canAddMatch(active: ActiveMatch[], match: Match, maxMatches: number): boolean {
  return active.length < maxMatches && !active.some((entry) => entry.match.id === match.id);
}

export function removeActiveMatch(active: ActiveMatch[], matchId: string): ActiveMatch[] {
  return active.filter((entry) => entry.match.id !== matchId);
}

export function toggleActiveMatchMuted(active: ActiveMatch[], matchId: string): ActiveMatch[] {
  return active.map((entry) => (entry.match.id === matchId ? { ...entry, muted: !entry.muted } : entry));
}

export function selectActiveMatchStream(active: ActiveMatch[], matchId: string, stream: Stream): ActiveMatch[] {
  return active.map((entry) => (entry.match.id === matchId ? { ...entry, selectedStream: stream } : entry));
}
