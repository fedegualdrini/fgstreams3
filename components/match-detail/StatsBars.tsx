import type { FlashscoreStat } from '@/types/api';

/** Head-to-head statistic rows: home value, label, away value over a split bar. */
export default function StatsBars({ stats }: { stats: FlashscoreStat[] }) {
  return (
    <div className="stats-bars">
      {stats.map((stat, i) => (
        <StatRow key={i} stat={stat} />
      ))}
    </div>
  );
}

function StatRow({ stat }: { stat: FlashscoreStat }) {
  return (
    <div className="stat-row">
      <div className="stat-row__values">
        <span className="stat-row__value">{stat.home}</span>
        <span className="stat-row__label">{stat.label}</span>
        <span className="stat-row__value stat-row__value--away">{stat.away}</span>
      </div>
      <div className="stat-row__bar">
        <div className="stat-row__bar-home" style={{ width: `${stat.homePct}%` }} />
        <div className="stat-row__bar-away" style={{ width: `${stat.awayPct}%` }} />
      </div>
    </div>
  );
}
