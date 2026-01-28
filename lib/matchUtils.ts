import type { Match } from '@/types/api';

export function generateMatchId(match: Partial<Match>): string {
  if (match.id) return String(match.id);

  const parts = [
    match.sport,
    match.league,
    match.team1,
    match.team2,
    match.startTime,
  ].filter(Boolean);

  if (match.sources && match.sources.length > 0) {
    parts.push(match.sources[0].id);
  }

  const idString = parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  let hash = 0;
  for (let i = 0; i < idString.length; i++) {
    const char = idString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function parseTeamsFromTitle(title: string): { team1: string; team2: string } {
  const separators = [' - ', ' vs ', ' VS ', ' v ', ' V '];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      return {
        team1: parts[0]?.trim() || '',
        team2: parts[1]?.trim() || '',
      };
    }
  }
  return { team1: title, team2: '' };
}

export function normalizeMatches(matches: any[]): Match[] {
  return matches.map(match => {
    const id = match.id ? String(match.id) : generateMatchId(match);
    const { team1, team2 } = match.title
      ? parseTeamsFromTitle(match.title)
      : { team1: match.team1 || '', team2: match.team2 || '' };

    let startTime: string | undefined;
    if (match.date) {
      if (typeof match.date === 'number') {
        startTime = new Date(match.date).toISOString();
      } else if (typeof match.date === 'string') {
        startTime = match.date;
      }
    } else {
      startTime = match.startTime || match.start_time || match.time;
    }

    let isLive = false;
    if (match.date && typeof match.date === 'number') {
      const matchDate = new Date(match.date);
      const now = new Date();
      const hoursDiff = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60);
      isLive = hoursDiff >= 0 && hoursDiff <= 3;
    } else {
      isLive = match.isLive !== undefined ? match.isLive : (match.is_live || match.live || false);
    }

    return {
      id,
      sport: match.sport || match.category || '',
      league: match.league || match.tournament || match.competition || '',
      team1,
      team2,
      startTime,
      isLive,
      sources: match.sources || [],
      image1: match.image1 || match.homeImage || match.team1Image,
      image2: match.image2 || match.awayImage || match.team2Image,
      poster: match.poster || match.posterImage || match.posterUrl,
    };
  });
}
