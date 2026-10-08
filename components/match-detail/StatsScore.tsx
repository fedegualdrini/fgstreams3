import type { FlashscoreDetail } from '@/types/api';

function getStatusLabel({ status, minute }: Pick<FlashscoreDetail, 'status' | 'minute'>): string {
  if (status === 'fin') return 'FT';
  if (status !== 'live') return '';
  return minute || 'LIVE';
}

/** Big centered score with a status chip (FT / minute / LIVE) and period breakdown. */
export default function StatsScore({ detail, score }: { detail: FlashscoreDetail; score: string }) {
  const statusLabel = getStatusLabel(detail);
  const isFinal = detail.status === 'fin';

  return (
    <div className="stats-score">
      <span className="stats-score__value">{score}</span>
      {statusLabel && (
        <span className={isFinal ? 'stats-score__status stats-score__status--final' : 'stats-score__status'}>
          {statusLabel}
        </span>
      )}
      {detail.periods && <span className="stats-score__periods">{detail.periods}</span>}
    </div>
  );
}
