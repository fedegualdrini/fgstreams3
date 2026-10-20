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
    const controller = new AbortController();
    let flashscoreId: string | null = null;
    let pollTimer: number | undefined;
    let inFlight = false;
    let finished = false;

    async function resolveFlashscoreId(): Promise<string | null> {
      try {
        const { sport, team1, team2 } = matchRef.current;
        const res = await fetch(`/api/scores/${encodeURIComponent(sport.toLowerCase())}`, {
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) return null;
        const entries: FlashscoreEntry[] = await res.json();
        return controller.signal.aborted ? null : findMatchingEntry(team1, team2, entries)?.flashscoreId ?? null;
      } catch {
        return null;
      }
    }

    async function fetchDetail() {
      if (!flashscoreId || controller.signal.aborted || finished || inFlight
        || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const res = await fetch(`/api/scores/match/${flashscoreId}`, { signal: controller.signal });
        if (!res.ok || controller.signal.aborted) return;
        const data: FlashscoreDetail | null = await res.json();
        if (controller.signal.aborted) return;
        setDetail(data);

        if (data?.status === 'fin') {
          finished = true;
          clearInterval(pollTimer);
        }
      } catch {
        // Keep stale data on error.
      } finally {
        inFlight = false;
      }
    }

    async function start() {
      flashscoreId = await resolveFlashscoreId();
      if (!flashscoreId || controller.signal.aborted) return;
      await fetchDetail();
      if (controller.signal.aborted || finished) return;
      pollTimer = window.setInterval(fetchDetail, FIXTURE_POLL_INTERVAL_MS);
    }

    start();

    return () => {
      controller.abort();
      clearInterval(pollTimer);
    };
  }, [match.id]);

  return detail;
}
