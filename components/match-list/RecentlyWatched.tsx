import Link from 'next/link';
import { getPosterUrl } from '@/lib/api';
import type { HistoryEntry } from '@/lib/watchHistory';
import PosterImage from './PosterImage';

interface RecentlyWatchedProps {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
}

export default function RecentlyWatched({ entries, onOpen }: RecentlyWatchedProps) {
  return (
    <section className="match-section match-section--history">
      <div className="section-header">
        <h2 className="section-header__title">Recently Watched</h2>
        <div className="section-header__rule" />
      </div>
      <div className="history-row">
        {entries.map((entry) => (
          <HistoryCard key={entry.id} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function HistoryCard({ entry, onOpen }: { entry: HistoryEntry; onOpen: (entry: HistoryEntry) => void }) {
  return (
    <Link href={`/match/${entry.id}`} onClick={() => onOpen(entry)} className="history-card">
      {entry.poster && (
        <div className="history-card__poster">
          <PosterImage
            src={getPosterUrl(entry.poster)}
            alt=""
            sizes="160px"
            className="history-card__image"
          />
        </div>
      )}
      <div className="history-card__body">
        <div className="history-card__title truncate">
          {entry.team1}{entry.team2 ? ` vs ${entry.team2}` : ''}
        </div>
        <div className="history-card__meta truncate">{entry.league || entry.sport}</div>
      </div>
    </Link>
  );
}
