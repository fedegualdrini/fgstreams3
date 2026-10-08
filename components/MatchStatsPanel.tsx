import type { FlashscoreDetail } from '@/types/api';
import StatsScore from './match-detail/StatsScore';
import StatsTimeline from './match-detail/StatsTimeline';
import StatsBars from './match-detail/StatsBars';
import StatsLineups from './match-detail/StatsLineups';

export default function MatchStatsPanel({ detail }: { detail: FlashscoreDetail }) {
  const { score, events, stats, lineups } = detail;
  const hasEvents = events.length > 0;
  const hasStats = stats.length > 0;
  if (!score && !hasEvents && !hasStats && !lineups) return null;

  return (
    <div className="stats-panel">
      <span className="label stats-heading stats-heading--title">Match Stats</span>

      {score && <StatsScore detail={detail} score={score} />}

      {hasEvents && <StatsTimeline events={events} />}
      {!hasEvents && score && !hasStats && !lineups && (
        <p className="stats-empty">No events yet</p>
      )}

      {hasStats && (
        <section className={hasEvents ? 'stats-section' : undefined}>
          <span className="label stats-heading">Statistics</span>
          <StatsBars stats={stats} />
        </section>
      )}

      {lineups && (
        <section className="stats-section">
          <span className="label stats-heading">Lineups</span>
          <StatsLineups lineups={lineups} />
        </section>
      )}
    </div>
  );
}
