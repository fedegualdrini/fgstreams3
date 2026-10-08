'use client';

import { useState, useEffect, useRef } from 'react';
import type { Match, FlashscoreEntry, FlashscoreDetail } from '@/types/api';
import { findMatchingEntry } from './scoreUtils';
import { FIXTURE_POLL_INTERVAL_MS } from './constants';

/**
 * Full match detail (score + events) for a match page.
 * Resolves the Flashscore id from the sport's live list, then polls the detail
 * endpoint until the match is finished.
 */
export function useMatchStats(match: Match): FlashscoreDetail | null {
  const [detail, setDetail] = useState<FlashscoreDetail | null>(null);

  // Read team/sport through a ref so the effect re-runs only when navigating
  // to a different match, not whenever the `match` object identity changes.
  const matchRef = useRef(match);
  matchRef.current = match;

  useEffect(() => {
    let cancelled = false;
    let flashscoreId: string | null = null;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    async function resolveFlashscoreId(): Promise<string | null> {
      try {
        const { sport, team1, team2 } = matchRef.current;
        const res = await fetch(`/api/scores/${encodeURIComponent(sport.toLowerCase())}`);
        if (!res.ok || cancelled) return null;
        const entries: FlashscoreEntry[] = await res.json();
        return findMatchingEntry(team1, team2, entries)?.flashscoreId ?? null;
      } catch {
        return null;
      }
    }

    async function fetchDetail() {
      if (!flashscoreId || cancelled) return;
      try {
        const res = await fetch(`/api/scores/match/${flashscoreId}`);
        if (!res.ok || cancelled) return;
        const data: FlashscoreDetail | null = await res.json();
        if (cancelled) return;
        setDetail(data);

        if (data?.status === 'fin') clearInterval(pollTimer);
      } catch {
        // Keep stale data on error.
      }
    }

    async function start() {
      flashscoreId = await resolveFlashscoreId();
      if (!flashscoreId || cancelled) return;
      await fetchDetail();
      if (cancelled) return;
      pollTimer = setInterval(fetchDetail, FIXTURE_POLL_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [match.id]);

  return detail;
}
