import type { CatalogMatch, ListedMatch } from '@/types/api';
import { ALL_SPORT_FILTER, matchesFilters, type FilterableMatch } from './matchFilters';

export interface MatchListFilters {
  query: string;
  sport: string;
}

export interface FilteredMatchLists<T> {
  live: T[];
  upcoming: T[];
}

/**
 * The slice of a catalog match the home listing renders. The full match carries
 * every stream URL and broadcast option, which only the match page needs, so
 * sending it to the list would more than double the page payload.
 */
export function toListedMatch(match: CatalogMatch): ListedMatch {
  return {
    id: match.id,
    sport: match.sport,
    league: match.league,
    team1: match.team1,
    team2: match.team2,
    startTime: match.startTime,
    isLive: match.isLive,
    poster: match.poster,
    broadcasts: match.broadcasts.map(({ channel, network }) => ({ channel, network })),
  };
}

/** Applies the search box and sport tab to both sections of the listing. */
export function filterMatchLists<T extends FilterableMatch>(
  live: T[],
  upcoming: T[],
  { query, sport }: MatchListFilters,
): FilteredMatchLists<T> {
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
export function hasNoSearchResults(query: string, filtered: FilteredMatchLists<unknown>): boolean {
  return query.trim().length > 0 && filtered.live.length === 0 && filtered.upcoming.length === 0;
}
