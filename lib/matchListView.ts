import type { CatalogMatch } from '@/types/api';
import { ALL_SPORT_FILTER, matchesFilters } from './matchFilters';

export interface MatchListFilters {
  query: string;
  sport: string;
}

export interface FilteredMatchLists {
  live: CatalogMatch[];
  upcoming: CatalogMatch[];
}

/** Applies the search box and sport tab to both sections of the listing. */
export function filterMatchLists(
  live: CatalogMatch[],
  upcoming: CatalogMatch[],
  { query, sport }: MatchListFilters,
): FilteredMatchLists {
  return {
    live: live.filter((match) => matchesFilters(match, query, sport)),
    upcoming: upcoming.filter((match) => matchesFilters(match, query, sport)),
  };
}

/** Recently-watched is a landing shortcut: it hides as soon as the user narrows the listing. */
export function shouldShowRecentlyWatched(
  historyLength: number,
  { query, sport }: MatchListFilters,
): boolean {
  return historyLength > 0 && query.trim() === '' && sport === ALL_SPORT_FILTER;
}

/** Only an active search can produce "no results"; an empty catalog has its own message. */
export function hasNoSearchResults(query: string, filtered: FilteredMatchLists): boolean {
  return query.trim().length > 0 && filtered.live.length === 0 && filtered.upcoming.length === 0;
}
