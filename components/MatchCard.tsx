'use client';

import type { Match } from '@/types/api';
import { getPosterUrl } from '@/lib/api';
import { formatMatchDate } from '@/lib/dateUtils';

interface MatchCardProps {
  match: Match;
}

export default function MatchCard({ match }: MatchCardProps) {
  const isLive = match.isLive;
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const posterUrl = getPosterUrl(match.poster);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Poster */}
      <div style={{ position: 'relative', width: '100%', height: '160px', background: 'var(--bg-2)', overflow: 'hidden', flexShrink: 0 }}>
        {posterUrl && (
          <img
            src={posterUrl}
            alt={`${match.team1} vs ${match.team2}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(8,8,8,0.95) 0%, rgba(8,8,8,0.2) 60%, transparent 100%)',
        }} />
        {/* LIVE badge */}
        {isLive && (
          <div style={{
            position: 'absolute',
            top: '0.625rem',
            left: '0.625rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'var(--red)',
            color: '#fff',
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '0.2rem 0.5rem',
            borderRadius: '2px',
          }}>
            <span className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
            LIVE
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '0.875rem 1rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* League */}
        <span className="label" style={{ fontSize: '0.6rem' }}>{match.league || match.sport}</span>

        {/* Teams */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            letterSpacing: '0.03em',
            color: 'var(--text)',
            lineHeight: 1.1,
            textAlign: 'right',
          }}>
            {match.team1}
          </span>
          <span style={{
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'var(--muted)',
            flexShrink: 0,
            padding: '0.15rem 0.4rem',
            border: '1px solid var(--line)',
            borderRadius: '2px',
          }}>
            VS
          </span>
          <span style={{
            flex: 1,
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            letterSpacing: '0.03em',
            color: 'var(--text)',
            lineHeight: 1.1,
          }}>
            {match.team2}
          </span>
        </div>

        {/* Time */}
        {startTime && !isLive && (
          <span style={{ fontSize: '0.7rem', color: 'var(--subtle)', marginTop: 'auto' }}>
            {formatMatchDate(startTime)}
          </span>
        )}
      </div>
    </div>
  );
}
