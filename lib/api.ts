import type { z } from 'zod';
import type { Match, RawMatch, Stream, Sport } from '@/types/api';
import { normalizeMatches } from './matchUtils';
import {
  API_MAX_RETRIES,
  REVALIDATE_MATCHES,
  REVALIDATE_SPORTS,
  REVALIDATE_STREAMS,
} from './constants';
import { fetchJson } from './httpClient';
import { createLogger } from './logger';
import {
  StreamFreeStreamsResponseSchema,
  StreamFreeSourcesResponseSchema,
  StreamFreeCategoriesResponseSchema,
} from './schemas';
import { STREAMFREE_SOURCE, toStreamFreeSources } from './streamfree';

const API_BASE = 'https://strmfree.st/api/v1';
const SITE_ORIGIN = 'https://strmfree.st';

const log = createLogger('api');

/** Null means the request failed or the response did not match its schema. */
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

/** One request for the complete feed; an empty feed is a successful response. */
export async function fetchAllMatches(): Promise<RawMatch[] | null> {
  const response = await fetchApi('/streams', StreamFreeStreamsResponseSchema, REVALIDATE_MATCHES);
  return response?.streams ?? null;
}

export async function fetchMatches(sport?: string): Promise<Match[]> {
  if (!sport) return normalizeMatches((await fetchAllMatches()) ?? []);
  const response = await fetchApi(
    `/streams?category=${encodeURIComponent(sport)}`,
    StreamFreeStreamsResponseSchema,
    REVALIDATE_MATCHES,
  );
  return normalizeMatches(response?.streams ?? []);
}

/** Failed lookups are unknown, not evidence that a source has no streams. */
export interface StreamLookup {
  streams: Stream[];
  ok: boolean;
}

export async function fetchStreamLookup(source: string, id: string): Promise<StreamLookup> {
  if (source !== STREAMFREE_SOURCE) return { streams: [], ok: true };
  const response = await fetchApi(
    `/sources/${encodeURIComponent(id)}`,
    StreamFreeSourcesResponseSchema,
    REVALIDATE_STREAMS,
  );
  if (response === null) return { streams: [], ok: false };
  return { streams: toStreamFreeSources(response), ok: true };
}

/** Streams only. Use fetchStreamLookup to distinguish failure from an empty result. */
export async function fetchStreams(source: string, id: string): Promise<Stream[]> {
  return (await fetchStreamLookup(source, id)).streams;
}

export async function fetchSports(): Promise<Sport[]> {
  const response = await fetchApi('/categories', StreamFreeCategoriesResponseSchema, REVALIDATE_SPORTS);
  return (response?.categories ?? []).map(id => ({
    id,
    slug: id,
    name: id === 'football' ? 'American Football' : id.charAt(0).toUpperCase() + id.slice(1),
  }));
}

/** Absolute API image URLs are unchanged; relative images resolve against StreamFree. */
export function getImageUrl(path: string): string {
  return path ? new URL(path, SITE_ORIGIN).href : '';
}

export function getPosterUrl(posterPath: string | undefined): string {
  return posterPath ? getImageUrl(posterPath) : '';
}
