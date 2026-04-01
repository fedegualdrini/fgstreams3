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

  useEffect(() => {
    if (liveMatches.length === 0) {
      setScoreMap(new Map());
      return;
    }

    // Deduplicate sports present in live matches
    const sports = [...new Set(liveMatches.map((m) => m.sport.toLowerCase()))];

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
        for (const match of liveMatches) {
          const entry = findMatchingEntry(match.team1, match.team2, allEntries);
          if (entry) map.set(match.id, entry);
        }
        setScoreMap(map);
      } catch {
        // Keep stale data on error
      }
    }

    fetchAndMatch();
    intervalRef.current = setInterval(fetchAndMatch, SCORES_POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMatches.length, liveMatches.map((m) => m.id).join(',')]);

  return scoreMap;
}
