'use client';

import { useCallback, useState } from 'react';
import type { MediaResult } from '@/types/movies';
import { useToast } from '@/components/Toast';
import { buildEmbedUrl, hasSearchableQuery } from '@/lib/movieEmbed';
import MediaPlayerPanel from '@/components/movies/MediaPlayerPanel';
import MediaResultsGrid from '@/components/movies/MediaResultsGrid';
import MediaSearchField from '@/components/movies/MediaSearchField';
import MediaTypeToggle from '@/components/movies/MediaTypeToggle';
import { useMediaSearch } from '@/components/movies/useMediaSearch';
import { useTvEpisodes } from '@/components/movies/useTvEpisodes';

const SCROLL_TO_PLAYER_DELAY_MS = 100;

export default function MoviesPageClient() {
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [selected, setSelected] = useState<MediaResult | null>(null);
  const { showToast, ToastComponent } = useToast();
  const reportSearchError = useCallback((message: string) => showToast(message, 'error'), [showToast]);

  const { query, setQuery, results, loading, reset } = useMediaSearch(mediaType, reportSearchError);
  const tv = useTvEpisodes(selected);

  const embedUrl = selected ? buildEmbedUrl(selected, tv.season, tv.episode) : null;
  const searchable = hasSearchableQuery(query);

  const changeMediaType = (type: 'movie' | 'tv') => {
    setMediaType(type);
    setSelected(null);
    reset();
  };

  const selectItem = (item: MediaResult) => {
    setSelected(item);
    setTimeout(() => {
      document.getElementById('media-player')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, SCROLL_TO_PLAYER_DELAY_MS);
  };

  return (
    <div className="movies-root">
      <MediaTypeToggle value={mediaType} onChange={changeMediaType} />

      <MediaSearchField
        value={query}
        placeholder={mediaType === 'movie' ? 'Search movies…' : 'Search TV series…'}
        loading={loading}
        onChange={setQuery}
      />

      {selected && embedUrl && (
        <MediaPlayerPanel
          item={selected}
          embedUrl={embedUrl}
          tvDetail={tv.tvDetail}
          season={tv.season}
          episode={tv.episode}
          episodeCount={tv.episodeCount}
          onSeasonChange={tv.setSeason}
          onEpisodeChange={tv.setEpisode}
          onClose={() => setSelected(null)}
        />
      )}

      {results.length > 0 && (
        <MediaResultsGrid results={results} selectedId={selected?.tmdbId} onSelect={selectItem} />
      )}

      {searchable && !loading && results.length === 0 && (
        <div className="media-empty">No results for &ldquo;{query}&rdquo;</div>
      )}
      {!searchable && !selected && (
        <div className="media-empty">Type at least 2 characters to search</div>
      )}
      {ToastComponent}
    </div>
  );
}
