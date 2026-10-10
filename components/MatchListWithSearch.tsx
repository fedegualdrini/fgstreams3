'use client';

import { useState } from 'react';
import type { ListedMatch } from '@/types/api';
import { useLiveScores } from '@/lib/useLiveScores';
import { ALL_SPORT_FILTER, getAvailableSportFilters } from '@/lib/matchFilters';
import { filterMatchLists, hasNoSearchResults, shouldShowRecentlyWatched } from '@/lib/matchListView';
import MatchToolbar from '@/components/match-list/MatchToolbar';
import RecentlyWatched from '@/components/match-list/RecentlyWatched';
import LiveMatchRow from '@/components/match-list/LiveMatchRow';
import UpcomingMatchGrid from '@/components/match-list/UpcomingMatchGrid';
import EmptyState from '@/components/match-list/EmptyState';
import { useWatchHistory } from '@/components/match-list/useWatchHistory';

interface MatchListWithSearchProps {
  liveMatches: ListedMatch[];
  upcomingMatches: ListedMatch[];
}

export default function MatchListWithSearch({ liveMatches, upcomingMatches }: MatchListWithSearchProps) {
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState(ALL_SPORT_FILTER);
  const scores = useLiveScores(liveMatches);
  const { history, recordEntry, recordMatch } = useWatchHistory();

  const filters = { query, sport };
  const filtered = filterMatchLists(liveMatches, upcomingMatches, filters);
  const sports = getAvailableSportFilters([...liveMatches, ...upcomingMatches]);

  return (
    <>
      <MatchToolbar
        query={query}
        onQueryChange={setQuery}
        sports={sports}
        sport={sport}
        onSportChange={setSport}
      />

      {shouldShowRecentlyWatched(history.length, filters) && (
        <RecentlyWatched entries={history} onOpen={recordEntry} />
      )}

      {filtered.live.length > 0 && (
        <LiveMatchRow matches={filtered.live} scores={scores} onOpen={recordMatch} />
      )}

      {filtered.upcoming.length > 0 && (
        <UpcomingMatchGrid
          // New filters start again from the first page of results.
          key={`${sport}|${query}`}
          matches={filtered.upcoming}
          hasLiveSection={filtered.live.length > 0}
          onOpen={recordMatch}
        />
      )}

      {liveMatches.length === 0 && upcomingMatches.length === 0 && (
        <EmptyState icon="📺" hint="Only matches with a working source are listed — check back closer to kickoff.">
          No matches available right now
        </EmptyState>
      )}
      {hasNoSearchResults(query, filtered) && (
        <EmptyState icon="🔍" hint="Try searching for a team name, league, or sport.">
          No matches for &ldquo;{query}&rdquo;
        </EmptyState>
      )}
    </>
  );
}
