import type { MediaResult } from '@/types/movies';
import MediaCard from './MediaCard';

interface MediaResultsGridProps {
  results: MediaResult[];
  selectedId: number | undefined;
  onSelect: (item: MediaResult) => void;
}

export default function MediaResultsGrid({ results, selectedId, onSelect }: MediaResultsGridProps) {
  return (
    <>
      <div className="media-results__head">
        <h2 className="media-results__title">
          Results
          <span className="media-results__count">{results.length}</span>
        </h2>
        <div className="media-results__rule" />
      </div>

      <div className="media-grid">
        {results.map((item) => (
          <MediaCard
            key={item.tmdbId}
            item={item}
            isSelected={selectedId === item.tmdbId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}
