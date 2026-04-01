import type { FlashscoreDetail, FlashscoreEvent, FlashscoreStat, FlashscoreLineups, FlashscorePlayer } from '@/types/api';

interface MatchStatsPanelProps {
  detail: FlashscoreDetail;
}

const EVENT_ICONS: Record<FlashscoreEvent['type'], string> = {
  goal: '⚽',
  yellow_card: '🟨',
  red_card: '🟥',
  substitution: '↕',
  other: '•',
};

export default function MatchStatsPanel({ detail }: MatchStatsPanelProps) {
  const { score, status, minute, periods, events, stats, lineups } = detail;
  if (!score && events.length === 0 && stats.length === 0 && !lineups) return null;

  const statusLabel = status === 'fin'
    ? 'FT'
    : status === 'live' && minute
      ? minute
      : status === 'live'
        ? 'LIVE'
        : '';

  return (
    <div style={{
      marginTop: '2rem',
      borderTop: '1px solid var(--line)',
      paddingTop: '1.5rem',
    }}>
      {/* Section label */}
      <span className="label" style={{ fontSize: '0.6rem', display: 'block', marginBottom: '1rem' }}>
        Match Stats
      </span>

      {/* Score row */}
      {score && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.5rem',
            letterSpacing: '0.06em',
            color: 'var(--accent)',
            lineHeight: 1,
          }}>
            {score}
          </span>
          {statusLabel && (
            <span style={{
              background: status === 'fin' ? 'var(--muted)' : 'var(--red)',
              color: '#fff',
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              padding: '0.2rem 0.45rem',
              borderRadius: '2px',
            }}>
              {statusLabel}
            </span>
          )}
          {periods && (
            <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
              {periods}
            </span>
          )}
        </div>
      )}

      {/* Events timeline */}
      {events.length > 0 && (
        <div style={{
          borderLeft: '2px solid var(--line)',
          paddingLeft: '0.875rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          {events.map((event, i) => (
            <EventRow key={i} event={event} />
          ))}
        </div>
      )}

      {events.length === 0 && score && stats.length === 0 && !lineups && (
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
          No events yet
        </p>
      )}

      {/* Statistics bars */}
      {stats.length > 0 && (
        <div style={{ marginTop: events.length > 0 ? '1.5rem' : 0 }}>
          <span className="label" style={{ fontSize: '0.6rem', display: 'block', marginBottom: '0.75rem' }}>
            Statistics
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stats.map((stat, i) => (
              <StatRow key={i} stat={stat} />
            ))}
          </div>
        </div>
      )}

      {/* Lineups */}
      {lineups && (
        <div style={{ marginTop: '1.5rem' }}>
          <span className="label" style={{ fontSize: '0.6rem', display: 'block', marginBottom: '0.75rem' }}>
            Lineups
          </span>
          <LineupsGrid lineups={lineups} />
        </div>
      )}
    </div>
  );
}

function StatRow({ stat }: { stat: FlashscoreStat }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {/* Values + label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text)', fontFamily: 'var(--font-body)', minWidth: '2.5rem' }}>
          {stat.home}
        </span>
        <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--font-body)', textAlign: 'center', flex: 1 }}>
          {stat.label}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text)', fontFamily: 'var(--font-body)', minWidth: '2.5rem', textAlign: 'right' }}>
          {stat.away}
        </span>
      </div>
      {/* Bar chart */}
      <div style={{ display: 'flex', height: '3px', borderRadius: '2px', overflow: 'hidden', background: 'var(--line)' }}>
        <div style={{ width: `${stat.homePct}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
        <div style={{ width: `${stat.awayPct}%`, background: 'var(--red)', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function PlayerList({ players, align }: { players: FlashscorePlayer[]; align: 'left' | 'right' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {players.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
          {p.number && (
            <span style={{ fontSize: '0.6rem', color: 'var(--muted)', minWidth: '1.25rem', textAlign: align === 'right' ? 'left' : 'right' }}>
              {p.number}
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
            {p.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function LineupsGrid({ lineups }: { lineups: FlashscoreLineups }) {
  const hasSubs = lineups.homeSubs.length > 0 || lineups.awaySubs.length > 0;

  return (
    <div>
      {/* Team name headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
          {lineups.homeTeam}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontFamily: 'var(--font-body)', fontWeight: 600, textAlign: 'right' }}>
          {lineups.awayTeam}
        </span>
      </div>
      {/* Starters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <PlayerList players={lineups.homePlayers} align="left" />
        <PlayerList players={lineups.awayPlayers} align="right" />
      </div>
      {/* Substitutes */}
      {hasSubs && (
        <>
          <div style={{ marginTop: '0.75rem', marginBottom: '0.5rem', borderTop: '1px solid var(--line)', paddingTop: '0.5rem' }}>
            <span style={{ fontSize: '0.55rem', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Substitutes
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <PlayerList players={lineups.homeSubs} align="left" />
            <PlayerList players={lineups.awaySubs} align="right" />
          </div>
        </>
      )}
    </div>
  );
}

function EventRow({ event }: { event: FlashscoreEvent }) {
  const icon = EVENT_ICONS[event.type];
  const isAway = event.team === 'away';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flexDirection: isAway ? 'row-reverse' : 'row',
    }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--muted)', minWidth: '2.5rem', textAlign: isAway ? 'right' : 'left' }}>
        {event.minute}
      </span>
      <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontSize: '0.75rem',
        color: 'var(--text-dim)',
        fontFamily: 'var(--font-body)',
        textAlign: isAway ? 'right' : 'left',
      }}>
        {event.player || event.type.replace('_', ' ')}
      </span>
    </div>
  );
}
