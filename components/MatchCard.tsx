'use client';

import { memo } from 'react';
import type { Match } from '@/types/api';
import { useLocalTime } from '@/lib/dateUtils';

interface MatchCardProps {
  match: Match;
  score?: string | null;
  scoreMinute?: string;
}

function MatchCard({ match, score, scoreMinute }: MatchCardProps) {
  const isLive = match.isLive;
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const localTime = useLocalTime(startTime);
  const displayScore = isLive && score ? score : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Top: league + live badge */}
      <div style={{
        padding: '0.75rem 0.875rem 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--subtle)', fontFamily: 'var(--font-body)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem',
        }}>
          {match.league || match.sport}
        </span>
        {isLive && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            background: 'var(--red)', color: '#fff',
            fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em',
            padding: '0.18rem 0.45rem', borderRadius: '2px', flexShrink: 0,
          }}>
            <span
              className="live-dot"
              style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', display: 'inline-block' }}
            />
            LIVE
          </span>
        )}
      </div>

      {/* Teams + score/vs */}
      <div style={{
        padding: '0.875rem 0.875rem 0.75rem',
        display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1,
      }}>
        <span style={{
          flex: 1, fontFamily: 'var(--font-display)', fontSize: '1.25rem',
          letterSpacing: '0.02em', color: 'var(--text)', lineHeight: 1.1,
          textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {match.team1}
        </span>

        {displayScore ? (
          <div style={{
            flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0.2rem 0.625rem', background: 'var(--bg-3)',
            border: '1px solid var(--line)', borderRadius: '3px',
            minWidth: '4.25rem', textAlign: 'center',
          }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: '1.2rem',
              color: 'var(--accent)', letterSpacing: '0.04em', lineHeight: 1,
            }}>
              {displayScore}
            </span>
            {scoreMinute && (
              <span style={{
                fontSize: '0.5rem', color: 'var(--red)',
                fontWeight: 600, letterSpacing: '0.06em', marginTop: '2px',
              }}>
                {scoreMinute}
              </span>
            )}
          </div>
        ) : (
          <span style={{
            flexShrink: 0, fontSize: '0.58rem', fontWeight: 700,
            letterSpacing: '0.12em', color: 'var(--muted)',
            padding: '0.15rem 0.45rem', border: '1px solid var(--line)', borderRadius: '2px',
          }}>
            VS
          </span>
        )}

        {match.team2 ? (
          <span style={{
            flex: 1, fontFamily: 'var(--font-display)', fontSize: '1.25rem',
            letterSpacing: '0.02em', color: 'var(--text)', lineHeight: 1.1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {match.team2}
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
      </div>

      {/* Footer: sport + time/watch */}
      <div style={{
        padding: '0.5rem 0.875rem', borderTop: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: '0.6rem', color: 'var(--muted)',
          fontFamily: 'var(--font-body)', fontWeight: 500,
        }}>
          {match.sport}
        </span>
        {isLive ? (
          <span style={{
            fontSize: '0.6rem', color: 'var(--accent)',
            fontFamily: 'var(--font-body)', fontWeight: 600, letterSpacing: '0.08em',
          }}>
            WATCH →
          </span>
        ) : localTime ? (
          <span suppressHydrationWarning style={{
            fontSize: '0.6rem', color: 'var(--subtle)', fontFamily: 'var(--font-body)',
          }}>
            {localTime}
          </span>
        ) : null}
      </div>

    </div>
  );
}

export default memo(MatchCard);
