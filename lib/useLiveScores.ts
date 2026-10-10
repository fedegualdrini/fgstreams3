'use client';

import { useState, useEffect, useRef } from 'react';
import type { Match, FlashscoreEntry } from '@/types/api';
import { findMatchingEntry } from './scoreUtils';
import { SCORES_POLL_INTERVAL_MS } from './constants';

/** The fields score matching reads; both full and listing matches satisfy it. */
type ScoredMatch = Pick<Match, 'id' | 'team1' | 'team2' | 'sport'>;

async function fetchSportEntries(sport: string): Promise<FlashscoreEntry[]> {
  try {
    const response = await fetch(`/api/scores/${encodeURIComponent(sport)}`);
    return response.ok ? ((await response.json()) as FlashscoreEntry[]) : [];
  } catch {
    return [];
  }
}

/** Pairs each live match with its best-matching score entry, keyed by match id. */
function pairMatchesWithEntries(matches: ScoredMatch[], entries: FlashscoreEntry[]): Map<string, FlashscoreEntry> {
  const scores = new Map<string, FlashscoreEntry>();
  for (const match of matches) {
    const entry = findMatchingEntry(match.team1, match.team2, entries);
    if (entry) scores.set(match.id, entry);
  }
  return scores;
}

/**
 * Live scores keyed by match id. Polling only runs while there are live
 * matches and is skipped while the tab is hidden.
 */
export function useLiveScores(liveMatches: ScoredMatch[]): Map<string, FlashscoreEntry> {
  const [scoreMap, setScoreMap] = useState<Map<string, FlashscoreEntry>>(new Map());

  // The polling callback reads the latest list through a ref, so the effect
  // restarts only when the set of live ids changes, not on every new array.
  const liveMatchesRef = useRef(liveMatches);
  liveMatchesRef.current = liveMatches;
  const liveIdsKey = liveMatches.map((match) => match.id).join(',');

  useEffect(() => {
    const matches = liveMatchesRef.current;
    if (matches.length === 0) {
      setScoreMap(new Map());
      return;
    }

    const sports = [...new Set(matches.map((match) => match.sport.toLowerCase()))];

    async function refresh() {
      if (document.visibilityState !== 'visible') return;

      try {
        const entries = (await Promise.all(sports.map(fetchSportEntries))).flat();
        setScoreMap(pairMatchesWithEntries(liveMatchesRef.current, entries));
      } catch {
        // Keep stale scores on error; a transient network issue should not clear them.
      }
    }

    refresh();
    const interval = setInterval(refresh, SCORES_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [liveIdsKey]);

  return scoreMap;
}
