import type { MediaResult, TvDetail } from '@/types/movies';

interface MediaPlayerPanelProps {
  item: MediaResult;
  embedUrl: string;
  tvDetail: TvDetail | null;
  season: number;
  episode: number;
  episodeCount: number;
  onSeasonChange: (season: number) => void;
  onEpisodeChange: (episode: number) => void;
  onClose: () => void;
}

/** Title bar (with season/episode pickers for TV) above the 16:9 embed. */
export default function MediaPlayerPanel({
  item, embedUrl, tvDetail, season, episode, episodeCount,
  onSeasonChange, onEpisodeChange, onClose,
}: MediaPlayerPanelProps) {
  return (
    <div id="media-player" className="media-player">
      <div className="media-player__bar">
        <span className="media-player__title">{item.title}</span>
        {item.year && <span className="media-player__year">{item.year}</span>}

        {item.type === 'tv' && tvDetail && (
          <div className="media-player__selectors">
            <select
              className="media-select"
              aria-label="Season"
              value={season}
              onChange={(e) => onSeasonChange(Number(e.target.value))}
            >
              {tvDetail.seasons.map((s) => (
                <option key={s.seasonNumber} value={s.seasonNumber}>{s.name}</option>
              ))}
            </select>

            {episodeCount > 0 && (
              <select
                className="media-select"
                aria-label="Episode"
                value={episode}
                onChange={(e) => onEpisodeChange(Number(e.target.value))}
              >
                {Array.from({ length: episodeCount }, (_, i) => i + 1).map((ep) => (
                  <option key={ep} value={ep}>Episode {ep}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <button type="button" className="media-player__close" aria-label="Close player" onClick={onClose}>
          ✕ Close
        </button>
      </div>

      <div className="video-container">
        <iframe
          key={embedUrl}
          src={embedUrl}
          allowFullScreen
          allow="fullscreen; autoplay"
          referrerPolicy="origin"
          title={item.title}
        />
      </div>
    </div>
  );
}
