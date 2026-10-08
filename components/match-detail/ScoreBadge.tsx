import type { FlashscoreDetail } from '@/types/api';

/** Live score (with match minute) when known, otherwise a plain "VS". */
export default function ScoreBadge({ stats }: { stats: FlashscoreDetail | null }) {
  if (!stats?.score) return <span className="match-vs">VS</span>;

  return (
    <div className="match-score">
      <div className="match-score__value">{stats.score}</div>
      {stats.minute && <div className="match-score__minute">{stats.minute}</div>}
    </div>
  );
}
