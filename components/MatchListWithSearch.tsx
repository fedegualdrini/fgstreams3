'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Match } from '@/types/api';
import MatchCard from '@/components/MatchCard';

function matchesSearch(match: Match, q: string): boolean {
  const normalized = q.trim().toLowerCase();
  if (!normalized) return true;
  const fields = [match.team1 ?? '', match.team2 ?? '', match.league ?? '', match.sport ?? ''];
  return fields.some((f) => f.toLowerCase().includes(normalized));
}

interface MatchListWithSearchProps {
  liveMatches: Match[];
  upcomingMatches: Match[];
}

export default function MatchListWithSearch({ liveMatches, upcomingMatches }: MatchListWithSearchProps) {
  const [query, setQuery] = useState('');

  const filteredLive = liveMatches.filter((m) => matchesSearch(m, query));
  const filteredUpcoming = upcomingMatches.filter((m) => matchesSearch(m, query));
  const hasQuery = query.trim().length > 0;
  const noMatchesAtAll = liveMatches.length === 0 && upcomingMatches.length === 0;
  const bothFilteredEmpty = hasQuery && filteredLive.length === 0 && filteredUpcoming.length === 0;

  return (
    <>
      {/* Search */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ position: 'relative', maxWidth: '480px' }}>
          <span style={{
            position: 'absolute',
            left: '0.875rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
            fontSize: '0.85rem',
            pointerEvents: 'none',
          }}>
            ⌕
          </span>
          <input
            id="match-search"
            type="text"
            placeholder="Search teams, leagues…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 1rem 0.625rem 2.25rem',
              background: 'var(--bg-2)',
              border: '1px solid var(--line)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
          />
        </div>
      </div>

      {/* Live section */}
      {filteredLive.length > 0 && (
        <section style={{ marginBottom: '3rem' }}>
          <SectionHeader live count={filteredLive.length}>Live Now</SectionHeader>
          <MatchGrid matches={filteredLive} />
        </section>
      )}

      {/* Upcoming / All section */}
      {!bothFilteredEmpty && (
        <section>
          <SectionHeader count={filteredUpcoming.length}>
            {filteredLive.length > 0 ? 'Upcoming' : 'All Matches'}
          </SectionHeader>
          {filteredUpcoming.length > 0 ? (
            <MatchGrid matches={filteredUpcoming} />
          ) : noMatchesAtAll ? (
            <EmptyState>No matches available right now. Check back soon.</EmptyState>
          ) : (
            <EmptyState>No upcoming matches.</EmptyState>
          )}
        </section>
      )}

      {bothFilteredEmpty && (
        <EmptyState>No matches for &ldquo;{query}&rdquo;</EmptyState>
      )}
    </>
  );
}

function SectionHeader({ children, count, live }: { children: React.ReactNode; count?: number; live?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {live && (
        <span className="live-dot" style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: 'var(--red)', display: 'inline-block', flexShrink: 0,
        }} />
      )}
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.4rem',
        letterSpacing: '0.04em',
        color: 'var(--text)',
        lineHeight: 1,
      }}>
        {children}
        {count !== undefined && count > 0 && (
          <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: 'var(--subtle)' }}>
            {count}
          </span>
        )}
      </h2>
      <div className="accent-line" />
    </div>
  );
}

function MatchGrid({ matches }: { matches: Match[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: '1px',
      background: 'var(--line)',
      border: '1px solid var(--line)',
      borderRadius: '6px',
      overflow: 'hidden',
    }}>
      {matches.map((match) => (
        <Link
          key={match.id}
          href={`/match/${match.id}`}
          style={{
            display: 'block',
            background: 'var(--bg-1)',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-1)'; }}
        >
          <MatchCard match={match} />
        </Link>
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '4rem 1rem',
      textAlign: 'center',
      color: 'var(--subtle)',
      fontSize: '0.875rem',
      fontFamily: 'var(--font-body)',
    }}>
      {children}
    </div>
  );
}
