import type { Match } from '@/types/api';

export const ALL_SPORT_FILTER = 'All';

export function matchesSearch(match: Match, q: string): boolean {
  const normalized = q.trim().toLowerCase();
  if (!normalized) return true;

  const fields = [match.team1 ?? '', match.team2 ?? '', match.league ?? '', match.sport ?? ''];
  return fields.some((field) => field.toLowerCase().includes(normalized));
}

export function matchesSport(match: Match, sport: string): boolean {
  const normalizedSport = sport.trim().toLowerCase();
  if (normalizedSport === ALL_SPORT_FILTER.toLowerCase()) return true;
  return match.sport.trim().toLowerCase() === normalizedSport;
}

export function matchesFilters(match: Match, query: string, sport: string): boolean {
  return matchesSport(match, sport) && matchesSearch(match, query);
}

export function getAvailableSportFilters(matches: Match[]): string[] {
  const sportsByKey = new Map<string, string>();

  for (const match of matches) {
    const sport = match.sport.trim();
    if (!sport) continue;

    const key = sport.toLowerCase();
    if (!sportsByKey.has(key)) {
      sportsByKey.set(key, sport);
    }
  }

  return [
    ALL_SPORT_FILTER,
    ...Array.from(sportsByKey.values()).sort((a, b) => a.localeCompare(b)),
  ];
}
