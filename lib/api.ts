import type { Match, RawMatch, Stream, Sport } from '@/types/api';
import { normalizeMatches } from './matchUtils';
import { REVALIDATE_MATCHES, REVALIDATE_STREAMS, REVALIDATE_SPORTS } from './constants';
import { RawStreamArraySchema, RawStreamSchema, RawMatchArraySchema, SportArraySchema } from './schemas';

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

/**
 * Every match streamed.pk knows about for the current day, in one request.
 * `/matches/all-today` returns exactly the union of the per-sport endpoints, so
 * the previous fan-out (one request per sport) only multiplied the failure
 * modes and the latency.
 */
export async function fetchAllMatches(): Promise<RawMatch[]> {
  try {
    const response = await fetchWithRetry(`${API_BASE}/matches/all-today`, {
      next: { revalidate: REVALIDATE_MATCHES },
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText} for /matches/all-today`);
      return fetchMatchesPerSport();
    }
    const result = RawMatchArraySchema.safeParse(await response.json());
    if (!result.success) {
      console.warn('fetchAllMatches: unexpected response shape:', result.error.issues);
      return fetchMatchesPerSport();
    }
    // An empty all-today response is indistinguishable from an upstream hiccup,
    // so fall back rather than render an empty site.
    return result.data.length > 0 ? result.data : fetchMatchesPerSport();
  } catch (error) {
    console.error('Error fetching all-today matches:', error);
    return fetchMatchesPerSport();
  }
}

/** Fallback path: fan out over the per-sport endpoints. */
async function fetchMatchesPerSport(): Promise<RawMatch[]> {
  try {
    const sports = await fetchSports();
    if (sports.length === 0) {
      console.warn('No sports available');
      return [];
    }

    const matchArrays = await Promise.all(
      sports.map(sportItem =>
        fetchWithRetry(`${API_BASE}/matches/${sportItem.id}`, {
          next: { revalidate: REVALIDATE_MATCHES },
          headers: { Accept: 'application/json' },
        })
          .then(response => (response.ok ? response.json() : []))
          .then((data: unknown) => {
            const parsed = RawMatchArraySchema.safeParse(data);
            return parsed.success ? parsed.data : [];
          })
          .catch(error => {
            console.error(`Error fetching ${sportItem.name} matches:`, error);
            return [] as RawMatch[];
          })
      )
    );
    return matchArrays.flat();
  } catch (error) {
    console.error('Error fetching matches per sport:', error);
    return [];
  }
}

/**
 * Ids of the matches streamed.pk currently flags as live. Its own signal beats
 * inferring liveness from kickoff time, which mislabels delayed and long events.
 */
export async function fetchLiveMatchIds(): Promise<Set<string>> {
  try {
    const response = await fetchWithRetry(`${API_BASE}/matches/live`, {
      next: { revalidate: REVALIDATE_MATCHES },
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return new Set();
    const result = RawMatchArraySchema.safeParse(await response.json());
    if (!result.success) return new Set();
    return new Set(result.data.map(match => String(match.id)).filter(Boolean));
  } catch (error) {
    console.error('Error fetching live matches:', error);
    return new Set();
  }
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
      const result = RawMatchArraySchema.safeParse(await response.json());
      if (!result.success) {
        console.warn(`fetchMatches: unexpected response shape for ${sport}:`, result.error.issues);
        return [];
      }
      return normalizeMatches(result.data);
    } catch (error) {
      console.error(`Error fetching matches for ${sport}:`, error);
      return [];
    }
  }

  return normalizeMatches(await fetchAllMatches());
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
    const raw = await response.json();

    // streamed.pk returns either an array of streams or a single stream object.
    // Both shapes are validated with Zod then normalized to Stream[].
    const arrayResult = RawStreamArraySchema.safeParse(raw);
    if (arrayResult.success) {
      return arrayResult.data.map((stream) => ({
        url: stream.url || stream.embedUrl || '',
        embedUrl: stream.embedUrl || stream.url || '',
        language: stream.language,
        quality: stream.hd ? 'HD' : (stream.quality || 'SD'),
        source: stream.source || source,
      }));
    }

    const singleResult = RawStreamSchema.safeParse(raw);
    if (singleResult.success) {
      const stream = singleResult.data;
      return [{
        url: stream.url || stream.embedUrl || '',
        embedUrl: stream.embedUrl || stream.url || '',
        language: stream.language,
        quality: stream.hd ? 'HD' : (stream.quality || 'SD'),
        source: stream.source || source,
      }];
    }

    console.warn(`fetchStreams: unexpected response shape for ${source}/${id}`);
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
    const raw = await response.json();
    const result = SportArraySchema.safeParse(raw);
    if (!result.success) {
      console.warn('fetchSports: unexpected response shape:', result.error.issues);
      return [];
    }
    return result.data as Sport[];
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
