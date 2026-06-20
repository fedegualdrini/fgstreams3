'use client';

import { useState, useEffect } from 'react';
import type {
  ApiFootballStandingRow,
  ApiFootballFixture,
  ApiFootballTopScorer,
} from '@/types/api';
import { tabButtonStyle } from '@/lib/styles';

type Tab = 'standings' | 'schedule' | 'scorers';

// Self-contained World Cup 2026 data panel: lazily fetches standings, schedule,
// and top scorers from the cached /api/football/* routes. Rendered in the
// Mundial 2026 channel sidebar. All data is additive — failures render nothing.
export default function WorldCupPanel() {
  const [tab, setTab] = useState<Tab>('standings');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', gap: '0.4rem', padding: '0.85rem 1rem', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <button type="button" style={tabButtonStyle(tab === 'standings')} onClick={() => setTab('standings')}>Table</button>
        <button type="button" style={tabButtonStyle(tab === 'schedule')} onClick={() => setTab('schedule')}>Fixtures</button>
        <button type="button" style={tabButtonStyle(tab === 'scorers')} onClick={() => setTab('scorers')}>Scorers</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem' }}>
        {tab === 'standings' && <StandingsTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'scorers' && <ScorersTab />}
      </div>
    </div>
  );
}

function useJson<T>(url: string): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);
  return { data, loading };
}

const muted: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--muted)',
  fontFamily: 'var(--font-body)',
  textAlign: 'center',
  padding: '2rem 0',
};

function StandingsTab() {
  const { data, loading } = useJson<ApiFootballStandingRow[][]>('/api/football/standings');
  if (loading) return <p style={muted}>Loading table…</p>;
  if (!data || data.length === 0) return <p style={muted}>No standings available.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {data.map((group, gi) => (
        <div key={gi}>
          {group[0]?.group && (
            <div className="label" style={{ fontSize: '0.6rem', marginBottom: '0.5rem' }}>{group[0].group}</div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '0.25rem 0.3rem' }}>#</th>
                <th style={{ padding: '0.25rem 0.3rem' }}>Team</th>
                <th style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>P</th>
                <th style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>GD</th>
                <th style={{ padding: '0.25rem 0.3rem', textAlign: 'center' }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.map((row) => (
                <tr key={row.team.id} style={{ borderTop: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                  <td style={{ padding: '0.3rem' }}>{row.rank}</td>
                  <td style={{ padding: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {row.team.logo && <img src={row.team.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.team.name}</span>
                  </td>
                  <td style={{ padding: '0.3rem', textAlign: 'center' }}>{row.all.played}</td>
                  <td style={{ padding: '0.3rem', textAlign: 'center' }}>{row.goalsDiff}</td>
                  <td style={{ padding: '0.3rem', textAlign: 'center', color: 'var(--text)', fontWeight: 700 }}>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ScheduleTab() {
  const { data, loading } = useJson<ApiFootballFixture[]>('/api/football/fixtures');
  if (loading) return <p style={muted}>Loading fixtures…</p>;
  if (!data || data.length === 0) return <p style={muted}>No fixtures available.</p>;

  const sorted = [...data].sort(
    (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime(),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {sorted.map((f) => {
        const d = new Date(f.fixture.date);
        const when = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const finished = f.fixture.status.short === 'FT';
        return (
          <div key={f.fixture.id} style={{ padding: '0.55rem 0.6rem', border: '1px solid var(--line)', borderRadius: '4px', fontFamily: 'var(--font-body)' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>{f.league.round}</span>
              <span>{when}</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.teams.home.name}</span>
              <span style={{ color: finished ? 'var(--text)' : 'var(--muted)', fontWeight: 700, flexShrink: 0 }}>
                {finished ? `${f.goals.home ?? 0}–${f.goals.away ?? 0}` : 'vs'}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{f.teams.away.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScorersTab() {
  const { data, loading } = useJson<ApiFootballTopScorer[]>('/api/football/topscorers');
  if (loading) return <p style={muted}>Loading scorers…</p>;
  if (!data || data.length === 0) return <p style={muted}>No top scorers yet.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {data.map((s, i) => {
        const stat = s.statistics[0];
        return (
          <div key={s.player.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.3rem', borderTop: i === 0 ? 'none' : '1px solid var(--line)', fontFamily: 'var(--font-body)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', width: '1.2rem' }}>{i + 1}</span>
            {s.player.photo && <img src={s.player.photo} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />}
            <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.player.name}</span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text)', fontWeight: 700 }}>{stat?.goals.total ?? 0}</span>
          </div>
        );
      })}
    </div>
  );
}
