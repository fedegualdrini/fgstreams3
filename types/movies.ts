/** A single result from TMDB search (movie or TV show) */
export interface MediaResult {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;           // movie title or TV show name
  year: string;            // release year (may be empty)
  overview: string;
  posterPath: string | null; // relative path e.g. "/abc123.jpg" — prefix with TMDB_IMAGE_BASE
  voteAverage: number;
}

/** Season summary from TMDB /tv/{id} */
export interface TvSeason {
  seasonNumber: number;
  name: string;
  episodeCount: number;
}

/** Full TV show detail (season list) */
export interface TvDetail {
  tmdbId: number;
  title: string;
  seasons: TvSeason[];     // only regular seasons (seasonNumber > 0)
}
