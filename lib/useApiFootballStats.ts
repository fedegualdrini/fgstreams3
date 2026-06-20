'use client';

import { useState, useEffect } from 'react';
import type { Match, ApiFootballFixture, ApiFootballFixtureDetail } from '@/types/api';
import { findMatchingFixture } from './fixtureMatch';

/**
 * Resolves a Streamed match to its API-Football World Cup 2026 fixture and
 * fetches the combined official detail (lineups + events + statistics).
 *
 * Self-limiting to World Cup matches: the /api/football/fixtures route only
 * returns WC fixtures, so findMatchingFixture returns null for anything else
 * and no per-fixture call is made. All data is served from the cached routes.
 */
export function useApiFootballStats(match: Match): ApiFootballFixtureDetail | null {
  const [detail, setDetail] = useState<ApiFootballFixtureDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch('/api/football/fixtures');
        if (!res.ok || cancelled) return;
        const fixtures: ApiFootballFixture[] = await res.json();
        const fixture = findMatchingFixture(match.team1, match.team2, fixtures);
        if (!fixture || cancelled) return;

        const detailRes = await fetch(`/api/football/fixture/${fixture.fixture.id}`);
        if (!detailRes.ok || cancelled) return;
        const data: ApiFootballFixtureDetail = await detailRes.json();
        if (!cancelled) setDetail(data);
      } catch {
        // Additive data — silently degrade.
      }
    }

    run();
    return () => { cancelled = true; };
  }, [match.id, match.team1, match.team2]);

  return detail;
}
