'use client';

import { useState, useEffect, useRef } from 'react';
import type { Match, FlashscoreEntry } from '@/types/api';
import { findMatchingEntry } from './scoreUtils';
import { SCORES_POLL_INTERVAL_MS } from './constants';

// Returns a Map<matchId, FlashscoreEntry> for live matches.
// Polling only runs when there are live matches; pauses when tab is hidden.
export function useLiveScores(liveMatches: Match[]): Map<string, FlashscoreEntry> {
  const [scoreMap, setScoreMap] = useState<Map<string, FlashscoreEntry>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep a stable ref to liveMatches so the polling callback always reads
  // the latest list without needing liveMatches in the effect's dep array.
  const liveMatchesRef = useRef(liveMatches);
  liveMatchesRef.current = liveMatches;

  // Derive a stable string key that changes only when the set of live match IDs changes.
  const matchesKey = liveMatches.map((m) => m.id).join(',');

  useEffect(() => {
    const currentMatches = liveMatchesRef.current;
    if (currentMatches.length === 0) {
      setScoreMap(new Map());
      return;
    }

    // Deduplicate sports present in live matches
    const sports = [...new Set(currentMatches.map((m) => m.sport.toLowerCase()))];

    async function fetchAndMatch() {
      if (document.visibilityState !== 'visible') return;

      try {
        // Fetch all sports in parallel
        const results = await Promise.all(
          sports.map((sport) =>
            fetch(`/api/scores/${encodeURIComponent(sport)}`)
              .then((r) => (r.ok ? (r.json() as Promise<FlashscoreEntry[]>) : []))
              .catch(() => [] as FlashscoreEntry[]),
          ),
        );
        const allEntries: FlashscoreEntry[] = results.flat();

        // Pre-match each live Streamed match to a flashscore entry
        const map = new Map<string, FlashscoreEntry>();
        for (const match of liveMatchesRef.current) {
          const entry = findMatchingEntry(match.team1, match.team2, allEntries);
          if (entry) map.set(match.id, entry);
        }
        setScoreMap(map);
      } catch {
        // Keep stale data on error; avoids clearing scores on transient network issues
      }
    }

    fetchAndMatch();
    intervalRef.current = setInterval(fetchAndMatch, SCORES_POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [matchesKey]);

  return scoreMap;
}
