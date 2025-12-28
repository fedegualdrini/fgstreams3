import { Match } from '@/types/api';

/**
 * Generate a stable ID for a match based on its properties
 * Since the API might not provide IDs, we create one from match data
 */
export function generateMatchId(match: Partial<Match>): string {
  // If match already has an ID, use it
  if (match.id) {
    return String(match.id);
  }

  // Otherwise, generate a stable ID from match properties
  const parts = [
    match.sport,
    match.league,
    match.team1,
    match.team2,
    match.startTime,
  ].filter(Boolean);

  // If we have source ID, use that as part of the ID
  if (match.sources && match.sources.length > 0) {
    parts.push(match.sources[0].id);
  }

  // Create a simple hash-like ID
  const idString = parts.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  // Simple hash function for generating stable IDs
  let hash = 0;
  for (let i = 0; i < idString.length; i++) {
    const char = idString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Parse team names from title (format: "Team1 - Team2" or "Team1 vs Team2")
 */
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
  // If no separator found, return title as team1
  return { team1: title, team2: '' };
}

/**
 * Add IDs to matches that don't have them
 * Also ensures all required fields have default values
 * Maps the actual API response format to our Match interface
 */
export function normalizeMatches(matches: any[]): Match[] {
  return matches.map(match => {
    // Ensure ID exists
    const id = match.id ? String(match.id) : generateMatchId(match);
    
    // Parse teams from title (API format: "Team1 - Team2")
    const { team1, team2 } = match.title 
      ? parseTeamsFromTitle(match.title)
      : { team1: match.team1 || '', team2: match.team2 || '' };
    
    // Convert timestamp to ISO string if it's a number
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
    
    // Determine if match is live (check if date is in the past and within last few hours)
    let isLive = false;
    if (match.date && typeof match.date === 'number') {
      const matchDate = new Date(match.date);
      const now = new Date();
      const hoursDiff = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60);
      // Consider live if match started in last 3 hours and is not too far in future
      isLive = hoursDiff >= 0 && hoursDiff <= 3;
    } else {
      isLive = match.isLive !== undefined ? match.isLive : (match.is_live || match.live || false);
    }
    
    // Map API response to our Match interface
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
