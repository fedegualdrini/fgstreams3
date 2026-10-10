import type { Match } from '@/types/api';

/** The fields search and the sport tabs look at; any listing of matches satisfies it. */
export type FilterableMatch = Pick<Match, 'team1' | 'team2' | 'league' | 'sport'>;

export const ALL_SPORT_FILTER = 'All';

const normalize = (value: string) => value.trim().toLowerCase();

export function matchesSearch(match: FilterableMatch, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;

  const fields = [match.team1 ?? '', match.team2 ?? '', match.league ?? '', match.sport ?? ''];
  return fields.some((field) => field.toLowerCase().includes(needle));
}

export function matchesSport(match: FilterableMatch, sport: string): boolean {
  const wanted = normalize(sport);
  return wanted === normalize(ALL_SPORT_FILTER) || normalize(match.sport) === wanted;
}

export function matchesFilters(match: FilterableMatch, query: string, sport: string): boolean {
  return matchesSport(match, sport) && matchesSearch(match, query);
}

/** "All" followed by each distinct sport (case-insensitive), alphabetically. */
export function getAvailableSportFilters(matches: Array<Pick<Match, 'sport'>>): string[] {
  const sportsByKey = new Map<string, string>();

  for (const match of matches) {
    const sport = match.sport.trim();
    if (!sport) continue;

    const key = sport.toLowerCase();
    if (!sportsByKey.has(key)) sportsByKey.set(key, sport);
  }

  return [ALL_SPORT_FILTER, ...[...sportsByKey.values()].sort((a, b) => a.localeCompare(b))];
}
