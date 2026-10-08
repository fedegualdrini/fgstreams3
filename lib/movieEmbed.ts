import type { MediaResult } from '@/types/movies';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';
const VIDSRC_BASE = 'https://vsembed.ru/embed';

/** Shorter queries are not sent to the search API. */
export const MIN_SEARCH_LENGTH = 2;

export function hasSearchableQuery(query: string): boolean {
  return query.trim().length >= MIN_SEARCH_LENGTH;
}

export function buildEmbedUrl(item: MediaResult, season = 1, episode = 1): string {
  if (item.type === 'movie') {
    return `${VIDSRC_BASE}/movie?tmdb=${item.tmdbId}&ds_lang=en`;
  }
  return `${VIDSRC_BASE}/tv?tmdb=${item.tmdbId}&season=${season}&episode=${episode}&ds_lang=en`;
}
