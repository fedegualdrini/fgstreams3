'use client';

import { useState, useEffect, useRef } from 'react';
import type { Match, FlashscoreEntry } from '@/types/api';
import { findMatchingEntry } from './scoreUtils';
import { SCORES_POLL_INTERVAL_MS } from './constants';

/** The fields score matching reads; both full and listing matches satisfy it. */
type ScoredMatch = Pick<Match, 'id' | 'team1' | 'team2' | 'sport'>;

async function fetchSportEntries(sport: string, signal: AbortSignal): Promise<FlashscoreEntry[] | null> {
  try {
    const response = await fetch(`/api/scores/${encodeURIComponent(sport)}`, { signal });
    return response.ok ? ((await response.json()) as FlashscoreEntry[]) : null;
  } catch {
    return null;
  }
}

/** Pairs each live match with its best-matching score entry, keyed by match id. */
function pairMatchesWithEntries(
  matches: ScoredMatch[],
  entriesBySport: Map<string, FlashscoreEntry[] | null>,
  previous: Map<string, FlashscoreEntry>,
): Map<string, FlashscoreEntry> {
  const scores = new Map<string, FlashscoreEntry>();
  for (const match of matches) {
    const entries = entriesBySport.get(match.sport.toLowerCase());
    const entry = entries == null ? previous.get(match.id) : findMatchingEntry(match.team1, match.team2, entries);
    if (entry) scores.set(match.id, entry);
  }
  return scores;
}

/** Compare every returned field, not just the score: status and metadata change too. */
function sameEntry(previous: FlashscoreEntry, next: FlashscoreEntry): boolean {
  for (const key in previous) {
    if (!Object.prototype.hasOwnProperty.call(next, key)
      || previous[key as keyof FlashscoreEntry] !== next[key as keyof FlashscoreEntry]) return false;
  }
  for (const key in next) {
    if (!Object.prototype.hasOwnProperty.call(previous, key)) return false;
  }
  return true;
}

function retainUnchangedScores(
  previous: Map<string, FlashscoreEntry>,
  next: Map<string, FlashscoreEntry>,
): Map<string, FlashscoreEntry> {
  let changed = previous.size !== next.size;
  for (const [id, entry] of next) {
    const oldEntry = previous.get(id);
    if (oldEntry && sameEntry(oldEntry, entry)) next.set(id, oldEntry);
    else changed = true;
  }
  return changed ? next : previous;
}

/**
 * Live scores keyed by match id. Polling only runs while there are live
 * matches and is skipped while the tab is hidden.
 */
export function useLiveScores(liveMatches: ScoredMatch[]): Map<string, FlashscoreEntry> {
  const [scoreMap, setScoreMap] = useState<Map<string, FlashscoreEntry>>(() => new Map());

  // The polling callback reads the latest list through a ref, so the effect
  // restarts only when the set of live ids changes, not on every new array.
  const liveMatchesRef = useRef(liveMatches);
  liveMatchesRef.current = liveMatches;
  const liveIdsKey = liveMatches.map((match) => match.id).join(',');

  useEffect(() => {
    const matches = liveMatchesRef.current;
    if (matches.length === 0) {
      setScoreMap(previous => previous.size === 0 ? previous : new Map());
      return;
    }

    const sports = [...new Set(matches.map((match) => match.sport.toLowerCase()))];
    const controller = new AbortController();
    let inFlight = false;

    async function refresh() {
      if (controller.signal.aborted || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;

      try {
        const results = await Promise.all(sports.map(sport => fetchSportEntries(sport, controller.signal)));
        if (controller.signal.aborted) return;
        const entriesBySport = new Map(sports.map((sport, index) => [sport, results[index]]));
        setScoreMap(previous => retainUnchangedScores(
          previous,
          pairMatchesWithEntries(liveMatchesRef.current, entriesBySport, previous),
        ));
      } catch {
        // Keep stale scores on error; a transient network issue should not clear them.
      } finally {
        inFlight = false;
      }
    }

    refresh();
    const interval = setInterval(refresh, SCORES_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [liveIdsKey]);

  return scoreMap;
}
