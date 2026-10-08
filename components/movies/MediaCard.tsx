import type { MediaResult } from '@/types/movies';
import { TMDB_IMAGE_BASE } from '@/lib/movieEmbed';

interface MediaCardProps {
  item: MediaResult;
  isSelected: boolean;
  onSelect: (item: MediaResult) => void;
}

export default function MediaCard({ item, isSelected, onSelect }: MediaCardProps) {
  return (
    <button
      type="button"
      className={isSelected ? 'media-card is-selected' : 'media-card'}
      onClick={() => onSelect(item)}
    >
      <div className="media-card__poster">
        {item.posterPath ? (
          // TMDB's image host is not in next.config remotePatterns; plain <img> avoids proxying every poster.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${TMDB_IMAGE_BASE}${item.posterPath}`} alt={item.title} loading="lazy" />
        ) : (
          <PosterPlaceholder />
        )}
      </div>

      <div className="media-card__info">
        <div className="media-card__title">{item.title}</div>
        <div className="media-card__meta">
          {item.year && <span>{item.year}</span>}
          {item.voteAverage > 0 && (
            <span className="media-card__rating">★ {item.voteAverage.toFixed(1)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function PosterPlaceholder() {
  return (
    <svg
      className="media-card__placeholder"
      width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  );
}
