'use client';

import type { Match, ApiFootballFixtureDetail, ApiFootballLineup } from '@/types/api';
import { useApiFootballStats } from '@/lib/useApiFootballStats';

interface OfficialStatsPanelProps {
  match: Match;
}

// Official World Cup data (lineups, events, team stats) from API-Football,
// shown beneath the Flashscore stats when a fixture match is found. Renders
// nothing for non-World-Cup matches or when data is unavailable.
export default function OfficialStatsPanel({ match }: OfficialStatsPanelProps) {
  const detail = useApiFootballStats(match);
  if (!detail) return null;

  const hasContent =
    detail.lineups.length > 0 || detail.events.length > 0 || detail.statistics.length > 0;
  if (!hasContent) return null;

  return (
    <div style={{ marginTop: '2rem', borderTop: '1px solid var(--line)', paddingTop: '1.5rem' }}>
      <span className="label" style={{ fontSize: '0.6rem', display: 'block', marginBottom: '1rem' }}>
        Official Stats
      </span>

      {detail.statistics.length === 2 && <StatBars stats={detail.statistics} />}
      {detail.events.length > 0 && <Events events={detail.events} />}
      {detail.lineups.length > 0 && <Lineups lineups={detail.lineups} />}
    </div>
  );
}

function toNumber(v: number | string | null): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function StatBars({ stats }: { stats: ApiFootballFixtureDetail['statistics'] }) {
  const [home, away] = stats;
  return (
    <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {home.statistics.map((s, i) => {
        const h = toNumber(s.value);
        const a = toNumber(away.statistics[i]?.value ?? 0);
        const total = h + a || 1;
        const hPct = Math.round((h / total) * 100);
        return (
          <div key={s.type} style={{ fontFamily: 'var(--font-body)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
              <span style={{ color: 'var(--text)' }}>{s.value ?? 0}</span>
              <span style={{ color: 'var(--muted)' }}>{s.type}</span>
              <span style={{ color: 'var(--text)' }}>{away.statistics[i]?.value ?? 0}</span>
            </div>
            <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', background: 'var(--bg-3)' }}>
              <div style={{ width: `${hPct}%`, background: 'var(--accent)' }} />
              <div style={{ width: `${100 - hPct}%`, background: 'var(--subtle)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Events({ events }: { events: ApiFootballFixtureDetail['events'] }) {
  const icon = (type: string, detail: string): string => {
    if (type === 'Goal') return '⚽';
    if (type === 'Card') return detail.toLowerCase().includes('red') ? '🟥' : '🟨';
    if (type === 'subst') return '↕';
    return '•';
  };
  return (
    <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {events.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.68rem', fontFamily: 'var(--font-body)', color: 'var(--text-dim)' }}>
          <span style={{ width: '2rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            {e.time.elapsed}{e.time.extra ? `+${e.time.extra}` : ''}&apos;
          </span>
          <span>{icon(e.type, e.detail)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.player.name ?? '—'} <span style={{ color: 'var(--muted)' }}>({e.team.name})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Lineups({ lineups }: { lineups: ApiFootballLineup[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {lineups.map((l) => (
        <div key={l.team.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            {l.team.logo && <img src={l.team.logo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{l.team.name}</span>
            {l.formation && <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>{l.formation}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {l.startXI.map((p) => (
              <div key={p.player.id} style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                <span style={{ color: 'var(--muted)', display: 'inline-block', width: '1.5rem' }}>{p.player.number}</span>
                {p.player.name}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
