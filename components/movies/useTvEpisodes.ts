import { useEffect, useState } from 'react';
import type { MediaResult, TvDetail } from '@/types/movies';

/**
 * Season/episode selection for the selected TV show. Loads the show's season
 * structure when a show is selected and restarts at S1E1 for each show, and at
 * episode 1 for each season.
 */
export function useTvEpisodes(selected: MediaResult | null) {
  const [tvDetail, setTvDetail] = useState<TvDetail | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

  useEffect(() => {
    if (!selected || selected.type !== 'tv') { setTvDetail(null); return; }
    setSeason(1);
    setEpisode(1);
    let stale = false;
    fetch(`/api/media/tv/${selected.tmdbId}`)
      .then(r => r.ok ? r.json() : null)
      .then(detail => { if (!stale) setTvDetail(detail); })
      .catch(() => { if (!stale) setTvDetail(null); });
    return () => { stale = true; };
  }, [selected]);

  useEffect(() => { setEpisode(1); }, [season]);

  const episodeCount = tvDetail?.seasons.find(s => s.seasonNumber === season)?.episodeCount ?? 0;

  return { tvDetail, season, setSeason, episode, setEpisode, episodeCount };
}
