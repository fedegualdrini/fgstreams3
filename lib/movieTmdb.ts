import type { MediaResult, TvDetail, TvSeason } from '@/types/movies';

export const TMDB_BASE = 'https://api.themoviedb.org/3';

/** How many search hits the UI shows. */
const MAX_SEARCH_RESULTS = 12;

interface TmdbSearchItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
}

interface TmdbSeason {
  season_number: number;
  name?: string;
  episode_count?: number;
}

export interface TmdbSearchResponse { results?: TmdbSearchItem[] }
export interface TmdbTvResponse { name?: string; seasons?: TmdbSeason[] }

export function toMediaResults(data: TmdbSearchResponse, type: 'movie' | 'tv'): MediaResult[] {
  return (data.results ?? []).slice(0, MAX_SEARCH_RESULTS).map(item => ({
    tmdbId: item.id,
    type,
    title: (type === 'movie' ? item.title : item.name) as string,
    year: ((type === 'movie' ? item.release_date : item.first_air_date) ?? '').slice(0, 4),
    overview: item.overview ?? '',
    posterPath: item.poster_path ?? null,
    voteAverage: item.vote_average ?? 0,
  }));
}

/** Regular seasons only: TMDB lists specials as season 0. */
export function toTvDetail(tmdbId: number, data: TmdbTvResponse): TvDetail {
  const seasons: TvSeason[] = (data.seasons ?? [])
    .filter(s => s.season_number > 0)
    .map(s => ({
      seasonNumber: s.season_number,
      name: s.name ?? `Season ${s.season_number}`,
      episodeCount: s.episode_count ?? 0,
    }));

  return { tmdbId, title: data.name ?? '', seasons };
}
