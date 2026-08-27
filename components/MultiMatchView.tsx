'use client';

import { useState, useEffect, useRef } from 'react';
import type { Match, Stream } from '@/types/api';
import StreamPlayer from './StreamPlayer';
import { fetchMatches, fetchStreams } from '@/lib/api';
import { selectBestStream } from '@/lib/streamSelector';
import { tabButtonStyle } from '@/lib/styles';

interface MultiMatchViewProps {
  currentMatch: Match;
  maxMatches?: number;
}

// Defined outside the component — only depends on module-level imports (fetchStreams,
// selectBestStream), so it never needs to be in a useEffect dependency array.
async function initializeMatch(match: Match, shouldMute = false): Promise<ActiveMatch | null> {
  try {
    let streams: Stream[] = [];
    if (match.sources?.length) {
      const streamArrays = await Promise.all(
        match.sources.map((s) => fetchStreams(s.source, s.id).catch(() => []))
      );
      streams = streamArrays.flat();
    }
    const bestStream = selectBestStream(streams);
    return { match, streams, selectedStream: bestStream, muted: shouldMute };
  } catch (error) {
    console.error('Error initializing match:', error);
    return null;
  }
}

interface ActiveMatch {
  match: Match;
  streams: Stream[];
  selectedStream: Stream | null;
  muted: boolean;
}

type MatchLayout = 'grid' | 'side-by-side';

// Matches the inline stroke-icon idiom used in MatchListWithSearch / MoviesPageClient.
function IconSpeaker({ muted }: { muted: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

function IconClose({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  background: 'var(--bg-2)',
  color: 'var(--text)',
  border: '1px solid var(--line)',
  borderRadius: '3px',
  fontSize: '0.65rem',
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--subtle)',
  fontFamily: 'var(--font-body)',
};

export default function MultiMatchView({
  currentMatch,
  maxMatches = 4,
}: MultiMatchViewProps) {
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
  const [availableMatches, setAvailableMatches] = useState<Match[]>([]);
  const [layout, setLayout] = useState<MatchLayout>('grid');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showMatchSelector, setShowMatchSelector] = useState(false);

  // Use refs so the loadMatches effect can read current state without
  // needing to list mutable state values as dependencies.
  const activeMatchesRef = useRef(activeMatches);
  activeMatchesRef.current = activeMatches;
  const currentMatchRef = useRef(currentMatch);
  currentMatchRef.current = currentMatch;

  useEffect(() => {
    async function loadMatches() {
      try {
        const match = currentMatchRef.current;
        const matches = await fetchMatches();
        const otherMatches = matches.filter((m) => m.id !== match.id);
        setAvailableMatches(otherMatches);

        if (activeMatchesRef.current.length === 0) {
          const initialMatch = await initializeMatch(match);
          if (initialMatch) setActiveMatches([initialMatch]);
        }
      } catch (error) {
        console.error('Error loading matches:', error);
        setLoadError('Failed to load matches. Please refresh to try again.');
      } finally {
        setLoading(false);
      }
    }
    loadMatches();
  }, [currentMatch.id]);

  // Close the picker on Escape, matching normal dialog behaviour. Focus has to
  // move into the dialog first: the players are cross-origin iframes, and while
  // one holds focus no key event ever reaches this window.
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMatchSelector) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMatchSelector(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMatchSelector]);

  const addMatch = async (match: Match) => {
    if (activeMatches.length >= maxMatches) return;
    if (activeMatches.some((m) => m.match.id === match.id)) return;
    const matchData = await initializeMatch(match, activeMatches.length > 0);
    if (matchData) {
      setActiveMatches((prev) => [...prev, matchData]);
      setShowMatchSelector(false);
    }
  };

  const removeMatch = (matchId: string) => {
    setActiveMatches((prev) => prev.filter((m) => m.match.id !== matchId));
  };

  const toggleMute = (matchId: string) => {
    setActiveMatches((prev) =>
      prev.map((m) =>
        m.match.id === matchId ? { ...m, muted: !m.muted } : m
      )
    );
  };

  const changeStream = (matchId: string, stream: Stream) => {
    setActiveMatches((prev) =>
      prev.map((m) =>
        m.match.id === matchId ? { ...m, selectedStream: stream } : m
      )
    );
  };

  const getLayoutClasses = () => {
    const count = activeMatches.length;
    if (layout === 'side-by-side' && count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 0', ...metaLabelStyle,
      }}>
        Loading matches
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '0.875rem', padding: '3rem 0',
      }}>
        <p style={{ color: 'var(--red)', fontSize: '0.75rem', fontFamily: 'var(--font-body)', margin: 0 }}>
          {loadError}
        </p>
        <button type="button" onClick={() => window.location.reload()} style={tabButtonStyle(false)}>
          Refresh
        </button>
      </div>
    );
  }

  if (activeMatches.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '0.875rem', padding: '3rem 0',
      }}>
        <p style={{ ...metaLabelStyle, margin: 0 }}>No matches loaded</p>
        <button type="button" onClick={() => setShowMatchSelector(true)} style={tabButtonStyle(true)}>
          Add matches
        </button>
      </div>
    );
  }

  const toAdd = availableMatches.filter((m) => !activeMatches.some((am) => am.match.id === m.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Controls */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem',
        paddingBottom: '0.75rem', borderBottom: '1px solid var(--line)',
      }}>
        <label style={metaLabelStyle} htmlFor="multi-layout">Layout</label>
        <select
          id="multi-layout"
          value={layout}
          onChange={(e) => setLayout(e.target.value as MatchLayout)}
          style={selectStyle}
        >
          <option value="grid">Grid</option>
          <option value="side-by-side">Side by side</option>
        </select>

        <span style={{ ...metaLabelStyle, marginLeft: 'auto' }}>
          {activeMatches.length} / {maxMatches}
        </span>

        <button
          type="button"
          onClick={() => setShowMatchSelector(true)}
          disabled={activeMatches.length >= maxMatches}
          style={{
            ...tabButtonStyle(activeMatches.length < maxMatches),
            cursor: activeMatches.length >= maxMatches ? 'not-allowed' : 'pointer',
            opacity: activeMatches.length >= maxMatches ? 0.4 : 1,
          }}
        >
          + Add match
        </button>

        {activeMatches.length > 1 && (
          <button
            type="button"
            onClick={() => setActiveMatches((prev) => [prev[0]])}
            style={{
              ...tabButtonStyle(false),
              color: 'var(--red)',
              borderColor: 'var(--red-dim)',
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Player grid */}
      <div className={`grid gap-3 ${getLayoutClasses()}`}>
        {activeMatches.map((activeMatch) => (
          <div
            key={activeMatch.match.id}
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            {/* Card header */}
            <div style={{
              padding: '0.5rem 0.625rem',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: '0.5rem', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)',
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{
                  margin: 0, fontFamily: 'var(--font-display)', fontSize: '1rem',
                  letterSpacing: '0.02em', lineHeight: 1.15, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {activeMatch.match.team1}
                  {activeMatch.match.team2 ? ` vs ${activeMatch.match.team2}` : ''}
                </p>
                <p style={{
                  margin: '0.15rem 0 0', fontSize: '0.58rem', color: 'var(--subtle)',
                  fontFamily: 'var(--font-body)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {activeMatch.match.league || activeMatch.match.sport}
                </p>
                {activeMatch.match.isLive && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    marginTop: '0.3rem', background: 'var(--red)', color: '#fff',
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em',
                    padding: '0.15rem 0.4rem', borderRadius: '2px',
                  }}>
                    <span className="live-dot" style={{
                      width: '4px', height: '4px', borderRadius: '50%',
                      background: '#fff', display: 'inline-block',
                    }} />
                    LIVE
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => toggleMute(activeMatch.match.id)}
                  aria-pressed={activeMatch.muted}
                  aria-label={activeMatch.muted ? 'Unmute this stream' : 'Mute this stream'}
                  title={activeMatch.muted ? 'Unmute' : 'Mute'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '26px', height: '26px', padding: 0,
                    background: activeMatch.muted ? 'var(--bg-3)' : 'var(--accent)',
                    color: activeMatch.muted ? 'var(--text-dim)' : '#000',
                    border: `1px solid ${activeMatch.muted ? 'var(--line)' : 'var(--accent)'}`,
                    borderRadius: '3px', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <IconSpeaker muted={activeMatch.muted} />
                </button>
                <button
                  type="button"
                  onClick={() => removeMatch(activeMatch.match.id)}
                  aria-label="Remove this match"
                  title="Remove match"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '26px', height: '26px', padding: 0,
                    background: 'var(--bg-3)', color: 'var(--text-dim)',
                    border: '1px solid var(--line)', borderRadius: '3px',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <IconClose />
                </button>
              </div>
            </div>

            {/* Player */}
            <div style={{ position: 'relative' }}>
              {activeMatch.selectedStream ? (
                <>
                  <StreamPlayer
                    stream={activeMatch.selectedStream}
                    muted={activeMatch.muted}
                  />
                  {activeMatch.muted && (
                    <div style={{
                      position: 'absolute', top: '0.5rem', left: '0.5rem',
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.2rem 0.4rem', background: 'rgba(7, 8, 12, 0.8)',
                      border: '1px solid var(--line)', borderRadius: '2px',
                      color: 'var(--text-dim)', fontSize: '0.5rem', fontWeight: 700,
                      letterSpacing: '0.1em', fontFamily: 'var(--font-body)',
                    }}>
                      <IconSpeaker muted />
                      MUTED
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  aspectRatio: '16 / 9', background: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...metaLabelStyle,
                }}>
                  No stream available
                </div>
              )}
            </div>

            {/* Stream switcher */}
            {activeMatch.streams.length > 1 && (
              <div style={{ padding: '0.5rem 0.625rem', borderTop: '1px solid var(--line)' }}>
                <select
                  aria-label="Select stream source"
                  style={{ ...selectStyle, width: '100%' }}
                  value={activeMatch.selectedStream?.url ?? ''}
                  onChange={(e) => {
                    const stream = activeMatch.streams.find(
                      (s) => s.url === e.target.value || s.embedUrl === e.target.value
                    );
                    if (stream) changeStream(activeMatch.match.id, stream);
                  }}
                >
                  {activeMatch.streams.map((stream, idx) => (
                    <option key={idx} value={stream.url || stream.embedUrl || ''}>
                      {stream.language || 'Unknown'} · {stream.quality || 'SD'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Match picker */}
      {showMatchSelector && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select match to add"
          onClick={(e) => { if (e.target === e.currentTarget) setShowMatchSelector(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', background: 'rgba(7, 8, 12, 0.85)',
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            style={{
              display: 'flex', flexDirection: 'column',
              width: '100%', maxWidth: '32rem', maxHeight: '80vh',
              background: 'var(--bg-1)', border: '1px solid var(--line)',
              borderRadius: '3px', overflow: 'hidden', outline: 'none',
            }}
          >
            <div style={{
              padding: '0.875rem 1rem', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', borderBottom: '1px solid var(--line)',
            }}>
              <h3 style={{
                margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem',
                letterSpacing: '0.03em', color: 'var(--text)',
              }}>
                Add a match
              </h3>
              <button
                type="button"
                onClick={() => setShowMatchSelector(false)}
                aria-label="Close"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '26px', height: '26px', padding: 0, background: 'transparent',
                  color: 'var(--text-dim)', border: '1px solid var(--line)',
                  borderRadius: '3px', cursor: 'pointer',
                }}
              >
                <IconClose size={14} />
              </button>
            </div>

            <div style={{
              padding: '0.75rem', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: '0.375rem',
            }}>
              {toAdd.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => addMatch(match)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '0.625rem 0.75rem',
                    background: 'var(--bg-2)', border: '1px solid var(--line)',
                    borderRadius: '3px', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <p style={{
                    margin: 0, fontFamily: 'var(--font-display)', fontSize: '1rem',
                    letterSpacing: '0.02em', lineHeight: 1.15, color: 'var(--text)',
                  }}>
                    {match.team1}
                    {match.team2 ? ` vs ${match.team2}` : ''}
                  </p>
                  <p style={{
                    margin: '0.15rem 0 0', fontSize: '0.58rem', color: 'var(--subtle)',
                    fontFamily: 'var(--font-body)',
                  }}>
                    {match.league || match.sport}
                  </p>
                  {match.isLive && (
                    <span style={{
                      display: 'inline-block', marginTop: '0.3rem',
                      background: 'var(--red)', color: '#fff', fontSize: '0.5rem',
                      fontWeight: 700, letterSpacing: '0.12em',
                      padding: '0.15rem 0.4rem', borderRadius: '2px',
                    }}>
                      LIVE
                    </span>
                  )}
                </button>
              ))}
              {toAdd.length === 0 && (
                <p style={{ ...metaLabelStyle, textAlign: 'center', padding: '1.5rem 0', margin: 0 }}>
                  No more matches available
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
