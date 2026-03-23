import type { Match, Stream, Sport } from '@/types/api';
import { normalizeMatches } from './matchUtils';

const API_BASE = 'https://streamed.pk/api';

export async function fetchMatches(sport?: string): Promise<Match[]> {
  if (sport) {
    try {
      const response = await fetch(`${API_BASE}/matches/${sport}`, {
        next: { revalidate: 30 },
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        console.error(`API Error: ${response.status} ${response.statusText} for ${API_BASE}/matches/${sport}`);
        return [];
      }
      const matches = await response.json();
      if (!matches || !Array.isArray(matches)) return [];
      return normalizeMatches(matches);
    } catch (error) {
      console.error(`Error fetching matches for ${sport}:`, error);
      return [];
    }
  }

  try {
    const sports = await fetchSports();
    if (sports.length === 0) {
      console.warn('No sports available');
      return [];
    }

    const matchPromises = sports.map(sportItem =>
      fetch(`${API_BASE}/matches/${sportItem.id}`, {
        next: { revalidate: 30 },
        headers: { Accept: 'application/json' },
      })
        .then(response => {
          if (!response.ok) {
            console.warn(`Failed to fetch matches for ${sportItem.name}: ${response.status}`);
            return [];
          }
          return response.json();
        })
        .then((data: any) => Array.isArray(data) ? data : [])
        .catch(error => {
          console.error(`Error fetching ${sportItem.name} matches:`, error);
          return [];
        })
    );

    const allMatchesArrays = await Promise.all(matchPromises);
    const allMatches = allMatchesArrays.flat();
    return normalizeMatches(allMatches);
  } catch (error) {
    console.error('Error fetching all matches:', error);
    return [];
  }
}

export async function fetchStreams(source: string, id: string): Promise<Stream[]> {
  try {
    const response = await fetch(`${API_BASE}/stream/${source}/${id}`, {
      next: { revalidate: 60 },
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.error(`Failed to fetch streams for ${source}/${id}: ${response.status} ${response.statusText}`);
      return [];
    }
    const data = await response.json();

    if (Array.isArray(data)) {
      return data.map((stream: any) => ({
        url: stream.url || stream.embedUrl || '',
        embedUrl: stream.embedUrl || stream.url || '',
        language: stream.language,
        quality: stream.hd ? 'HD' : (stream.quality || 'SD'),
        source: stream.source || source,
      }));
    }
    if (data && typeof data === 'object') {
      return [{
        url: data.url || data.embedUrl || '',
        embedUrl: data.embedUrl || data.url || '',
        language: data.language,
        quality: data.hd ? 'HD' : (data.quality || 'SD'),
        source: data.source || source,
      }];
    }
    return [];
  } catch (error) {
    console.error(`Error fetching streams for ${source}/${id}:`, error);
    return [];
  }
}

export async function fetchSports(): Promise<Sport[]> {
  try {
    const response = await fetch(`${API_BASE}/sports`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`Failed to fetch sports: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching sports:', error);
    return [];
  }
}

export function getImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://streamed.pk${path.startsWith('/') ? path : '/' + path}`;
}

export function getPosterUrl(posterPath: string | undefined): string {
  if (!posterPath) return '';
  if (posterPath.startsWith('http')) return posterPath;
  const path = posterPath.startsWith('/') ? posterPath : `/${posterPath}`;
  const hasExtension = path.match(/\.(webp|jpg|jpeg|png)$/i);
  return `https://streamed.pk${path}${hasExtension ? '' : '.webp'}`;
}
