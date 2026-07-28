'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { Match } from '@/types/api';
import MatchCard from '@/components/MatchCard';
import { useLiveScores } from '@/lib/useLiveScores';
import { useLocalTime } from '@/lib/dateUtils';
import { addToHistory, getHistory, type HistoryEntry } from '@/lib/watchHistory';
import { getPosterUrl } from '@/lib/api';
import { ALL_SPORT_FILTER, getAvailableSportFilters, matchesFilters } from '@/lib/matchFilters';

function getRelativeTime(date: Date): string {
  const diff = date.getTime() - Date.now();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m > 0 ? `${m}m` : ''}`.trim();
  if (m > 0) return `${m}m`;
  return 'Soon';
}

const SPORT_ICON_OPTIONS: { label: string; icon: string }[] = [
  { label: 'All',        icon: '🏆' },
  { label: 'Football',   icon: '⚽' },
  { label: 'Basketball', icon: '🏀' },
  { label: 'Tennis',     icon: '🎾' },
  { label: 'MMA',        icon: '🥊' },
  { label: 'Formula 1',  icon: '🏎️' },
];

const SPORT_ICONS = new Map(
  SPORT_ICON_OPTIONS.map(({ label, icon }) => [label.toLowerCase(), icon])
);

interface MatchListWithSearchProps {
  liveMatches: Match[];
  upcomingMatches: Match[];
}

export default function MatchListWithSearch({ liveMatches, upcomingMatches }: MatchListWithSearchProps) {
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState(ALL_SPORT_FILTER);
  const scoreMap = useLiveScores(liveMatches);
  const sports = getAvailableSportFilters([...liveMatches, ...upcomingMatches]);

  // Watch history
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => { setHistory(getHistory()); }, []);

  const saveToHistory = useCallback((match: Match) => {
    const entry: HistoryEntry = {
      id: match.id,
      team1: match.team1,
      team2: match.team2 ?? null,
      league: match.league ?? null,
      sport: match.sport,
      poster: match.poster ?? '',
    };
    addToHistory(entry);
    setHistory(getHistory());
  }, []);

  // Mobile touch detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  const filteredLive     = liveMatches.filter((match) => matchesFilters(match, query, sport));
  const filteredUpcoming = upcomingMatches.filter((match) => matchesFilters(match, query, sport));
  const noResults = query.trim().length > 0 && filteredLive.length === 0 && filteredUpcoming.length === 0;

  // Live-section horizontal scroll arrows
  const liveScrollRef = useRef<HTMLDivElement>(null);
  const [liveHovered, setLiveHovered]       = useState(false);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = liveScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = liveScrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, filteredLive.length]);

  const scrollLive = useCallback((delta: number) => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    liveScrollRef.current?.scrollBy({ left: delta, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  return (
    <>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', maxWidth: '340px', flex: 1, minWidth: '160px' }}>
          <span style={{
            position: 'absolute', left: '0.875rem', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--muted)',
            fontSize: '0.9rem', pointerEvents: 'none',
          }}>⌕</span>
          <input
            id="match-search"
            type="text"
            placeholder="Search teams, leagues…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 1rem 0.6rem 2.25rem',
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
            onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--line)'; }}
          />
        </div>

        {/* Sport filter */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {sports.map((sportLabel) => {
            const icon = SPORT_ICONS.get(sportLabel.toLowerCase());
            return (
              <button
                key={sportLabel}
                type="button"
                onClick={() => setSport(sportLabel)}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: sport === sportLabel ? 'var(--accent)' : 'var(--bg-2)',
                  color:      sport === sportLabel ? '#000' : 'var(--text-dim)',
                  border:    `1px solid ${sport === sportLabel ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: '3px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em',
                  cursor: 'pointer', transition: 'all 0.12s',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                }}
              >
                {icon && <span>{icon}</span>}
                <span>{sportLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Recently Watched ── */}
      {history.length > 0 && !query.trim() && sport === ALL_SPORT_FILTER && (
        <section style={{ marginBottom: '2.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>
              Recently Watched
            </h2>
            <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
            {history.map((entry) => (
              <Link
                key={entry.id}
                href={`/match/${entry.id}`}
                onClick={() => { addToHistory(entry); setHistory(getHistory()); }}
                style={{
                  display: 'flex', flexDirection: 'column', flexShrink: 0,
                  width: '160px', background: 'var(--bg-2)', border: '1px solid var(--line)',
                  borderRadius: '6px', overflow: 'hidden', textDecoration: 'none', color: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
              >
                {entry.poster && (
                  <div style={{ width: '100%', height: '90px', background: 'var(--bg-3)', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={getPosterUrl(entry.poster)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <div style={{ padding: '0.5rem 0.625rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.team1}{entry.team2 ? ` vs ${entry.team2}` : ''}
                  </div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--subtle)', marginTop: '3px', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.league || entry.sport}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Live section — horizontal scroll ── */}
      {filteredLive.length > 0 && (
        <section style={{ marginBottom: '2.75rem' }}>
          <SectionHeader live count={filteredLive.length}>Live Now</SectionHeader>

          {/* Wrapper tracks hover so arrows can appear/disappear */}
          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setLiveHovered(true)}
            onMouseLeave={() => setLiveHovered(false)}
          >
            {/* ← Left arrow */}
            <button
              aria-label="Scroll left"
              onClick={() => scrollLive(-302)}
              onFocus={(e) => { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={(e)  => { e.currentTarget.style.outline = 'none'; }}
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 8,
                zIndex: 2, border: 'none', cursor: 'pointer',
                width: '52px',
                background: 'linear-gradient(to right, var(--bg-0) 30%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                paddingLeft: '6px',
                opacity: (isMobile ? canScrollLeft : liveHovered && canScrollLeft) ? 1 : 0,
                pointerEvents: (isMobile ? canScrollLeft : liveHovered && canScrollLeft) ? 'auto' : 'none',
                transition: 'opacity 0.18s',
              }}
            >
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--bg-2)', border: '1px solid var(--line)',
                color: 'var(--text)', lineHeight: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15,18 9,12 15,6" />
                </svg>
              </span>
            </button>

            {/* Scroll track */}
            <div
              ref={liveScrollRef}
              style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}
            >
              {filteredLive.map((match) => {
                const entry = scoreMap.get(match.id);
                return (
                  <Link
                    key={match.id}
                    href={`/match/${match.id}`}
                    onClick={() => saveToHistory(match)}
                    style={{
                      display: 'block', textDecoration: 'none', color: 'inherit',
                      width: '290px', flexShrink: 0,
                      background: 'var(--bg-2)',
                      border: '1px solid var(--line)',
                      borderRadius: '6px', overflow: 'hidden',
                      transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.transform   = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow   = '0 12px 32px rgba(0,0,0,0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--line)';
                      e.currentTarget.style.transform   = 'none';
                      e.currentTarget.style.boxShadow   = 'none';
                    }}
                  >
                    <MatchCard match={match} score={entry?.score} scoreMinute={entry?.minute} />
                  </Link>
                );
              })}
            </div>

            {/* → Right arrow */}
            <button
              aria-label="Scroll right"
              onClick={() => scrollLive(302)}
              onFocus={(e) => { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={(e)  => { e.currentTarget.style.outline = 'none'; }}
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 8,
                zIndex: 2, border: 'none', cursor: 'pointer',
                width: '52px',
                background: 'linear-gradient(to left, var(--bg-0) 30%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                paddingRight: '6px',
                opacity: (isMobile ? canScrollRight : liveHovered && canScrollRight) ? 1 : 0,
                pointerEvents: (isMobile ? canScrollRight : liveHovered && canScrollRight) ? 'auto' : 'none',
                transition: 'opacity 0.18s',
              }}
            >
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--bg-2)', border: '1px solid var(--line)',
                color: 'var(--text)', lineHeight: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </span>
            </button>
          </div>
        </section>
      )}

      {/* ── Upcoming section — card grid ── */}
      {filteredUpcoming.length > 0 && (
        <section>
          <SectionHeader count={filteredUpcoming.length}>
            {filteredLive.length > 0 ? 'Upcoming' : 'All Matches'}
          </SectionHeader>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '12px',
          }}>
            {filteredUpcoming.map((match) => (
              <Link
                key={match.id}
                href={`/match/${match.id}`}
                onClick={() => saveToHistory(match)}
                style={{
                  display: 'block', textDecoration: 'none', color: 'inherit',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px', overflow: 'hidden',
                  transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.transform   = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow   = '0 12px 32px rgba(0,0,0,0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--line)';
                  e.currentTarget.style.transform   = 'none';
                  e.currentTarget.style.boxShadow   = 'none';
                }}
              >
                <MatchCard match={match} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── No matches ── */}
      {liveMatches.length === 0 && upcomingMatches.length === 0 && (
        <EmptyState icon="📺" hint="Streams typically go live 30 minutes before kickoff.">
          No matches available right now
        </EmptyState>
      )}
      {noResults && (
        <EmptyState icon="🔍" hint="Try searching for a team name, league, or sport.">
          No matches for &ldquo;{query}&rdquo;
        </EmptyState>
      )}
    </>
  );
}

// ─── Upcoming Row ─────────────────────────────────────────────────────────────

function UpcomingRow({ match }: { match: Match }) {
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const localTime = useLocalTime(startTime);
  const relTime   = startTime ? getRelativeTime(startTime) : '';

  return (
    <Link
      href={`/match/${match.id}`}
      style={{
        display: 'flex', alignItems: 'center', width: '100%',
        padding: '0.75rem 1rem', textDecoration: 'none', color: 'inherit',
        background: 'var(--bg-1)', borderBottom: '1px solid var(--line)',
        transition: 'background 0.12s', gap: '1rem',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-1)'; }}
    >
      {/* Time */}
      <div style={{ width: '56px', flexShrink: 0, textAlign: 'center' }}>
        <div suppressHydrationWarning style={{
          fontFamily: 'var(--font-body)', fontSize: '0.8rem',
          fontWeight: 600, color: 'var(--text)', lineHeight: 1.2,
        }}>
          {localTime}
        </div>
        <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginTop: '2px' }}>{relTime}</div>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '32px', background: 'var(--line)', flexShrink: 0 }} />

      {/* Match info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--subtle)', marginBottom: '0.3rem',
        }}>
          {match.league || match.sport}
        </div>
        {match.team2 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--text)', letterSpacing: '0.02em', lineHeight: 1 }}>
              {match.team1}
            </span>
            <span style={{
              fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)',
              letterSpacing: '0.1em', padding: '0.1rem 0.35rem',
              border: '1px solid var(--line)', borderRadius: '2px', flexShrink: 0,
            }}>VS</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--text)', letterSpacing: '0.02em', lineHeight: 1 }}>
              {match.team2}
            </span>
          </div>
        ) : (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--text)', letterSpacing: '0.02em' }}>
            {match.team1}
          </span>
        )}
      </div>

      {/* Sport pill */}
      <span style={{
        flexShrink: 0, fontSize: '0.58rem', fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--subtle)',
        padding: '0.2rem 0.5rem', border: '1px solid var(--line)', borderRadius: '2px',
      }}>
        {match.sport}
      </span>
    </Link>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({
  children, count, live,
}: {
  children: React.ReactNode; count?: number; live?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
      {live && (
        <span className="live-dot" style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: 'var(--red)', display: 'inline-block', flexShrink: 0,
        }} />
      )}
      <h2 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.4rem',
        letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1,
      }}>
        {children}
        {count !== undefined && count > 0 && (
          <span style={{ marginLeft: '0.5rem', fontSize: '1rem', color: 'var(--subtle)' }}>
            {count}
          </span>
        )}
      </h2>
      <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
    </div>
  );
}

function EmptyState({ children, icon, hint }: { children: React.ReactNode; icon?: string; hint?: string }) {
  return (
    <div style={{ padding: '4rem 1rem', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
      {icon && <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{icon}</div>}
      <div style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginBottom: hint ? '0.375rem' : 0 }}>
        {children}
      </div>
      {hint && <div style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>{hint}</div>}
    </div>
  );
}
