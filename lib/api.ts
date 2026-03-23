import type { Match, Stream, Sport, RawStream, RawMatch } from '@/types/api';
import { normalizeMatches } from './matchUtils';
import { REVALIDATE_MATCHES, REVALIDATE_STREAMS, REVALIDATE_SPORTS } from './constants';

const API_BASE = 'https://streamed.pk/api';

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || attempt === retries) return res;
      // Only retry on 5xx server errors, not 4xx client errors
      if (res.status < 500) return res;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${url}`);
}

export async function fetchMatches(sport?: string): Promise<Match[]> {
  if (sport) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/matches/${sport}`, {
        next: { revalidate: REVALIDATE_MATCHES },
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
      fetchWithRetry(`${API_BASE}/matches/${sportItem.id}`, {
        next: { revalidate: REVALIDATE_MATCHES },
        headers: { Accept: 'application/json' },
      })
        .then(response => {
          if (!response.ok) {
            console.warn(`Failed to fetch matches for ${sportItem.name}: ${response.status}`);
            return [];
          }
          return response.json();
        })
        .then((data: RawMatch[]) => Array.isArray(data) ? data : [])
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
    const response = await fetchWithRetry(`${API_BASE}/stream/${source}/${id}`, {
      next: { revalidate: REVALIDATE_STREAMS },
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.error(`Failed to fetch streams for ${source}/${id}: ${response.status} ${response.statusText}`);
      return [];
    }
    const data = await response.json();

    // streamed.pk returns either an array of streams or a single stream object.
    // Both shapes are normalized to Stream[] here.
    if (Array.isArray(data)) {
      return data.map((stream: RawStream) => ({
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
    const response = await fetchWithRetry(`${API_BASE}/sports`, {
      next: { revalidate: REVALIDATE_SPORTS },
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
