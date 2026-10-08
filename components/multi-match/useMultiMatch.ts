import { useCallback, useEffect, useRef, useState } from 'react';
import type { Match, Stream } from '@/types/api';
import { fetchMatches, fetchStreams } from '@/lib/api';
import { selectBestStream } from '@/lib/streamSelector';
import {
  canAddMatch,
  removeActiveMatch,
  selectActiveMatchStream,
  toggleActiveMatchMuted,
  type ActiveMatch,
} from '@/lib/multiMatch';

const LOAD_ERROR_MESSAGE = 'Failed to load matches. Please refresh to try again.';

/** Resolves every source's streams for a match and picks the best one to start with. */
async function loadActiveMatch(match: Match, muted: boolean): Promise<ActiveMatch | null> {
  try {
    const sources = match.sources ?? [];
    const streamsPerSource = await Promise.all(
      sources.map((source) => fetchStreams(source.source, source.id).catch((): Stream[] => [])),
    );
    const streams = streamsPerSource.flat();
    return { match, streams, selectedStream: selectBestStream(streams), muted };
  } catch (error) {
    console.error('Error initializing match:', error);
    return null;
  }
}

/**
 * Owns the multi-view wall: the list of other matches that can be added, and the
 * matches currently playing (starting with `currentMatch`).
 */
export function useMultiMatch(currentMatch: Match, maxMatches: number) {
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
  const [availableMatches, setAvailableMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The load effect re-runs only when the match id changes, but must read the
  // latest match and wall without listing them as dependencies.
  const currentMatchRef = useRef(currentMatch);
  currentMatchRef.current = currentMatch;
  const activeMatchesRef = useRef(activeMatches);
  activeMatchesRef.current = activeMatches;

  useEffect(() => {
    async function load() {
      try {
        const current = currentMatchRef.current;
        const matches = await fetchMatches();
        setAvailableMatches(matches.filter((match) => match.id !== current.id));

        if (activeMatchesRef.current.length === 0) {
          const initial = await loadActiveMatch(current, false);
          if (initial) setActiveMatches([initial]);
        }
      } catch (error) {
        console.error('Error loading matches:', error);
        setLoadError(LOAD_ERROR_MESSAGE);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentMatch.id]);

  /** Resolves true when the match joined the wall. */
  const addMatch = useCallback(async (match: Match): Promise<boolean> => {
    const wall = activeMatchesRef.current;
    if (!canAddMatch(wall, match, maxMatches)) return false;

    // Only the first match on the wall plays with sound.
    const added = await loadActiveMatch(match, wall.length > 0);
    if (!added) return false;
    setActiveMatches((prev) => [...prev, added]);
    return true;
  }, [maxMatches]);

  const removeMatch = useCallback((matchId: string) => {
    setActiveMatches((prev) => removeActiveMatch(prev, matchId));
  }, []);

  const toggleMute = useCallback((matchId: string) => {
    setActiveMatches((prev) => toggleActiveMatchMuted(prev, matchId));
  }, []);

  const changeStream = useCallback((matchId: string, stream: Stream) => {
    setActiveMatches((prev) => selectActiveMatchStream(prev, matchId, stream));
  }, []);

  const keepOnlyFirst = useCallback(() => {
    setActiveMatches((prev) => prev.slice(0, 1));
  }, []);

  return {
    loading,
    loadError,
    activeMatches,
    availableMatches,
    addMatch,
    removeMatch,
    toggleMute,
    changeStream,
    keepOnlyFirst,
  };
}
