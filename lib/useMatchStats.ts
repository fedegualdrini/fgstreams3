'use client';

import { useState, useEffect, useRef } from 'react';
import type { Match, FlashscoreEntry, FlashscoreDetail } from '@/types/api';
import { findMatchingEntry } from './scoreUtils';
import { FIXTURE_POLL_INTERVAL_MS } from './constants';

// Returns full match detail (score + events) for a match page.
// Step 1: resolves the flashscoreId by fetching the sport's live list.
// Step 2: polls the match detail endpoint every 30s while live.
export function useMatchStats(match: Match): FlashscoreDetail | null {
  const [detail, setDetail] = useState<FlashscoreDetail | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashscoreIdRef = useRef<string | null>(null);

  // Stable ref so resolveAndFetch always reads current match fields
  // without needing the full match object in the effect dep array.
  const matchRef = useRef(match);
  matchRef.current = match;

  useEffect(() => {
    let cancelled = false;

    async function resolveAndFetch() {
      // Step 1: find the flashscore match ID from the live scores list
      if (!flashscoreIdRef.current) {
        try {
          const { sport, team1, team2 } = matchRef.current;
          const res = await fetch(`/api/scores/${encodeURIComponent(sport.toLowerCase())}`);
          if (!res.ok || cancelled) return;
          const entries: FlashscoreEntry[] = await res.json();
          const entry = findMatchingEntry(team1, team2, entries);
          if (!entry || cancelled) return;
          flashscoreIdRef.current = entry.flashscoreId;
        } catch {
          return;
        }
      }

      // Step 2: fetch match detail
      await fetchDetail();
    }

    async function fetchDetail() {
      if (!flashscoreIdRef.current || cancelled) return;
      try {
        const res = await fetch(`/api/scores/match/${flashscoreIdRef.current}`);
        if (!res.ok || cancelled) return;
        const data: FlashscoreDetail | null = await res.json();
        if (cancelled) return;
        setDetail(data);

        // Stop polling once the match is finished
        if (data?.status === 'fin' && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch {
        // Keep stale data on error
      }
    }

    resolveAndFetch().then(() => {
      if (!cancelled && flashscoreIdRef.current) {
        intervalRef.current = setInterval(fetchDetail, FIXTURE_POLL_INTERVAL_MS);
      }
    });

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      flashscoreIdRef.current = null;
    };
  // Re-run only when navigating to a different match.
  // matchRef.current provides latest team/sport fields without triggering re-runs.
  }, [match.id]);

  return detail;
}
