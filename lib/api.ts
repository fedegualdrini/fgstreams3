import type { z } from 'zod';
import type { Match, RawMatch, RawStream, Stream, Sport } from '@/types/api';
import { normalizeMatches } from './matchUtils';
import {
  API_MAX_RETRIES,
  REVALIDATE_MATCHES,
  REVALIDATE_SPORTS,
  REVALIDATE_STREAMS,
} from './constants';
import { fetchJson } from './httpClient';
import { createLogger } from './logger';
import { RawMatchArraySchema, RawStreamResponseSchema, SportArraySchema } from './schemas';

const API_BASE = 'https://streamed.pk/api';
const SITE_ORIGIN = 'https://streamed.pk';

const log = createLogger('api');

/** GET `path` on the streamed.pk API; null when the request failed or the body is not the expected shape. */
function fetchApi<S extends z.ZodType>(
  path: string,
  schema: S,
  revalidate: number,
): Promise<z.infer<S> | null> {
  return fetchJson(`${API_BASE}${path}`, schema, {
    log,
    label: `GET ${path}`,
    revalidate,
    headers: { Accept: 'application/json' },
    retries: API_MAX_RETRIES,
  });
}

async function fetchRawMatchesForSport(sportId: string): Promise<RawMatch[]> {
  return (await fetchApi(`/matches/${sportId}`, RawMatchArraySchema, REVALIDATE_MATCHES)) ?? [];
}

/**
 * Every match streamed.pk knows about for the current day, in one request.
 * `/matches/all-today` returns exactly the union of the per-sport endpoints, so
 * the previous fan-out (one request per sport) only multiplied the failure
 * modes and the latency. It remains as the fallback.
 */
export async function fetchAllMatches(): Promise<RawMatch[]> {
  const matches = await fetchApi('/matches/all-today', RawMatchArraySchema, REVALIDATE_MATCHES);
  // An empty all-today response is indistinguishable from an upstream hiccup,
  // so fall back rather than render an empty site.
  return matches && matches.length > 0 ? matches : fetchMatchesPerSport();
}

async function fetchMatchesPerSport(): Promise<RawMatch[]> {
  const sports = await fetchSports();
  if (sports.length === 0) {
    log.warn('no sports available');
    return [];
  }

  const perSport = await Promise.all(sports.map(sport => fetchRawMatchesForSport(sport.id)));
  return perSport.flat();
}

/**
 * Ids of the matches streamed.pk currently flags as live. Its own signal beats
 * inferring liveness from kickoff time, which mislabels delayed and long events.
 */
export async function fetchLiveMatchIds(): Promise<Set<string>> {
  const live = await fetchApi('/matches/live', RawMatchArraySchema, REVALIDATE_MATCHES);
  return new Set((live ?? []).map(match => String(match.id)).filter(Boolean));
}

export async function fetchMatches(sport?: string): Promise<Match[]> {
  if (!sport) return normalizeMatches(await fetchAllMatches());
  return normalizeMatches(await fetchRawMatchesForSport(sport));
}

/**
 * The outcome of a stream lookup.
 *
 * `ok: false` means the lookup failed, which is emphatically not the same as a
 * source carrying no streams: over half of them legitimately return nothing,
 * and callers decide whether a match is watchable on exactly that basis. A
 * failed request reported as "empty" silently removes a live event.
 */
export interface StreamLookup {
  streams: Stream[];
  ok: boolean;
}

function toStream(raw: RawStream, source: string): Stream {
  return {
    url: raw.url || raw.embedUrl || '',
    embedUrl: raw.embedUrl || raw.url || '',
    language: raw.language,
    quality: raw.hd ? 'HD' : (raw.quality || 'SD'),
    source: raw.source || source,
  };
}

export async function fetchStreamLookup(source: string, id: string): Promise<StreamLookup> {
  const raw = await fetchApi(`/stream/${source}/${id}`, RawStreamResponseSchema, REVALIDATE_STREAMS);
  if (raw === null) return { streams: [], ok: false };

  const entries: RawStream[] = Array.isArray(raw) ? raw : [raw];
  return { streams: entries.map(entry => toStream(entry, source)), ok: true };
}

/** Streams only. Use `fetchStreamLookup` where a failed lookup must be told apart from an empty one. */
export async function fetchStreams(source: string, id: string): Promise<Stream[]> {
  return (await fetchStreamLookup(source, id)).streams;
}

export async function fetchSports(): Promise<Sport[]> {
  return (await fetchApi('/sports', SportArraySchema, REVALIDATE_SPORTS)) ?? [];
}

/** Resolve a path the API returns relative to the site into an absolute URL. */
function toAbsoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getImageUrl(path: string): string {
  if (!path) return '';
  return path.startsWith('http') ? path : toAbsoluteUrl(path);
}

const IMAGE_EXTENSION_PATTERN = /\.(webp|jpg|jpeg|png)$/i;

export function getPosterUrl(posterPath: string | undefined): string {
  if (!posterPath) return '';
  if (posterPath.startsWith('http')) return posterPath;
  const url = toAbsoluteUrl(posterPath);
  // The API omits the extension on poster paths; they are served as webp.
  return IMAGE_EXTENSION_PATTERN.test(url) ? url : `${url}.webp`;
}
