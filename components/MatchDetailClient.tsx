'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Match, Stream } from '@/types/api';
import StreamPlayer from './StreamPlayer';
import StreamList from './StreamList';
import MultiMatchView from './MultiMatchView';
import { selectBestStream } from '@/lib/streamSelector';
import { streamHealthMonitor, streamKeyFor } from '@/lib/streamHealth';
import { getImageUrl } from '@/lib/api';
import { useLocalTime } from '@/lib/dateUtils';
import { useToast } from '@/components/Toast';
import SiteHeader from './SiteHeader';
import MatchJsonLd from './MatchJsonLd';
import MatchStatsPanel from './MatchStatsPanel';
import { useMatchStats } from '@/lib/useMatchStats';

interface MatchDetailClientProps {
  match: Match;
}

type SidebarTab = 'streams' | 'stats';

export default function MatchDetailClient({ match }: MatchDetailClientProps) {
  const [streams, setStreams]                   = useState<Stream[]>([]);
  const [currentStream, setCurrentStream]       = useState<Stream | null>(null);
  const [currentStreamIndex, setCurrentStreamIndex] = useState(0);
  const [streamErrorCount, setStreamErrorCount] = useState(0);
  const [allStreamsFailed, setAllStreamsFailed] = useState(false);
  const [streamsFetchKey, setStreamsFetchKey]   = useState(0);
  const [multiStreamMode, setMultiStreamMode]   = useState(false);
  const [sidebarTab, setSidebarTab]             = useState<SidebarTab>('streams');
  const [shareCopied, setShareCopied]           = useState(false);
  const [showShortcuts, setShowShortcuts]       = useState(false);
  const { showToast, ToastComponent } = useToast();

  const currentStreamId = currentStream ? streamKeyFor(currentStream) : null;

  const matchRef   = useRef(match);
  matchRef.current = match;
  const sourcesKey = match.sources?.map(s => `${s.source}:${s.id}`).join(',') ?? '';

  // Rotate to the next-best stream. The player reports its own load failures to
  // the health store, so this does not record one — see `skipCurrentStream` for
  // the user-initiated case.
  const handleStreamError = useCallback(() => {
    setStreamErrorCount((prev) => prev + 1);

    // Carry the original index alongside each stream: selecting from a filtered
    // array and then looking the winner up by URL mis-resolves duplicate URLs.
    const remaining = streams
      .map((stream, index) => ({ stream, index }))
      .filter(({ index }) => index !== currentStreamIndex);
    const nextStream = selectBestStream(remaining.map(r => r.stream));
    const next = remaining.find(r => r.stream === nextStream);

    if (next) {
      setCurrentStream(next.stream);
      setCurrentStreamIndex(next.index);
      setStreamErrorCount(0);
      showToast('Switched to next available stream', 'info');
    } else {
      setAllStreamsFailed(true);
      showToast('All streams unavailable', 'error');
    }
  }, [streams, currentStreamIndex, showToast]);

  /** User skipped away from the current stream — that is itself a health signal. */
  const skipCurrentStream = useCallback(() => {
    const skipped = streams[currentStreamIndex];
    if (skipped) streamHealthMonitor.reportFailed(streamKeyFor(skipped), 'skipped');
    handleStreamError();
  }, [streams, currentStreamIndex, handleStreamError]);

  const refetchStreams = useCallback(() => {
    setAllStreamsFailed(false);
    setStreamErrorCount(0);
    setCurrentStream(null);
    setStreams([]);
    setStreamsFetchKey(k => k + 1);
  }, []);

  useEffect(() => {
    setAllStreamsFailed(false);
    const { sources } = matchRef.current;
    if (!sources?.length) return;
    Promise.all(
      sources.map(({ source, id }) =>
        fetch(`/api/streams/${encodeURIComponent(source)}/${encodeURIComponent(id)}`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    ).then((arrays: Stream[][]) => {
      const all: Stream[] = arrays.flat().map((s, i) => ({
        ...s,
        source: s.source || sources[i]?.source,
      }));
      setStreams(all);
      const best = selectBestStream(all);
      if (best) {
        setCurrentStream(best);
        setCurrentStreamIndex(Math.max(0, all.findIndex(s => s.url === best.url)));
      }
    });
  }, [sourcesKey, streamsFetchKey]);

  const handleSelectStream = (stream: Stream, index: number) => {
    setCurrentStream(stream);
    setCurrentStreamIndex(index);
    setStreamErrorCount(0);
  };

  const handleShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = `${match.team1} vs ${match.team2} - Live Stream`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
        showToast('Link copied to clipboard', 'success');
      }
    } catch { /* user cancelled or not supported */ }
  }, [match, showToast]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'n' || e.key === 'N') {
        if (!multiStreamMode && streams.length > 0 && !allStreamsFailed) {
          skipCurrentStream();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        const playerSection = document.querySelector('.detail-player') as HTMLElement | null;
        if (playerSection) {
          if (!document.fullscreenElement) {
            playerSection.requestFullscreen?.();
          } else {
            document.exitFullscreen?.();
          }
        }
      } else if (e.key === '?') {
        setShowShortcuts(s => !s);
      } else if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [multiStreamMode, streams, allStreamsFailed, skipCurrentStream]);

  const isLive    = match.isLive;
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const localTime = useLocalTime(startTime);
  const matchStats = useMatchStats(match);

  return (
    <>
      <MatchJsonLd match={match} />
      <SiteHeader activeSection="matches" />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ── Match sub-header ── */}
        <div style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div className="page-content" style={{
            height: '52px', display: 'flex', alignItems: 'center',
            gap: '0.875rem', overflow: 'hidden',
          }}>
            {/* Back */}
            <Link
              href="/"
              style={{
                fontSize: '1.1rem', color: 'var(--muted)', textDecoration: 'none',
                transition: 'color 0.15s', flexShrink: 0, lineHeight: 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
            >←</Link>

            <span style={{ color: 'var(--line)', flexShrink: 0 }}>|</span>

            {/* Team 1 logo + name */}
            {match.image1 && (
              <Image
                src={getImageUrl(match.image1)} alt={match.team1}
                width={24} height={24}
                style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }}
              />
            )}
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.03em', color: 'var(--text)', lineHeight: 1, whiteSpace: 'nowrap' }}>
              {match.team1}
            </span>

            {/* Score or VS */}
            {matchStats?.score ? (
              <div style={{
                flexShrink: 0, padding: '0.15rem 0.5rem',
                border: '1px solid var(--line)', borderRadius: '2px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--accent)', lineHeight: 1 }}>
                  {matchStats.score}
                </div>
                {matchStats.minute && (
                  <div style={{ fontSize: '0.5rem', color: 'var(--red)', fontWeight: 600 }}>
                    {matchStats.minute}
                  </div>
                )}
              </div>
            ) : (
              <span style={{
                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--muted)',
                padding: '0.15rem 0.45rem', border: '1px solid var(--line)', borderRadius: '2px', flexShrink: 0,
              }}>VS</span>
            )}

            {/* Team 2 name + logo */}
            {match.team2 && (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.03em', color: 'var(--text)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                {match.team2}
              </span>
            )}
            {match.image2 && (
              <Image
                src={getImageUrl(match.image2)} alt={match.team2 ?? ''}
                width={24} height={24}
                style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }}
              />
            )}

            {/* League */}
            <span className="label" style={{ fontSize: '0.55rem', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.league || match.sport}
            </span>

            {/* Live badge */}
            {isLive && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                background: 'var(--red)', color: '#fff',
                fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em',
                padding: '0.18rem 0.45rem', borderRadius: '2px', flexShrink: 0,
              }}>
                <span className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                LIVE
              </span>
            )}

            {localTime && !isLive && (
              <span suppressHydrationWarning style={{ fontSize: '0.65rem', color: 'var(--subtle)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                {localTime}
              </span>
            )}

            {/* Share */}
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share match"
              style={{
                marginLeft: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.3rem 0.75rem',
                background: 'var(--bg-2)',
                color: shareCopied ? 'var(--accent)' : 'var(--text-dim)',
                border: `1px solid ${shareCopied ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontFamily: 'var(--font-body)', cursor: 'pointer',
                transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              {shareCopied ? '✓ Copied' : '⎋ Share'}
            </button>

            {/* Shortcuts help */}
            <button
              type="button"
              onClick={() => setShowShortcuts(s => !s)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px',
                background: showShortcuts ? 'var(--bg-3)' : 'var(--bg-2)',
                color: 'var(--muted)', border: '1px solid var(--line)',
                borderRadius: '3px', fontSize: '0.75rem', cursor: 'pointer',
                transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              ?
            </button>

            {/* Multi-stream toggle */}
            <button
              type="button"
              aria-pressed={multiStreamMode}
              onClick={() => setMultiStreamMode(!multiStreamMode)}
              style={{
                marginLeft: '0',
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.3rem 0.75rem',
                background: multiStreamMode ? 'var(--accent)' : 'var(--bg-2)',
                color:      multiStreamMode ? '#000' : 'var(--text-dim)',
                border:    `1px solid ${multiStreamMode ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontFamily: 'var(--font-body)', cursor: 'pointer',
                transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              {multiStreamMode ? '▣ Single' : '▤ Multi'}
            </button>
          </div>

          {multiStreamMode && (
            <div className="page-content" style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
              <MultiMatchView currentMatch={match} />
            </div>
          )}
        </div>

        {/* ── Split layout: player + sidebar ── */}
        {!multiStreamMode && (
          <div
            className="detail-layout"
            style={{
              display: 'flex', flexDirection: 'row',
              height: 'calc(100vh - var(--header-h) - 52px)',
              minHeight: '420px',
              overflow: 'hidden',
            }}
          >
            {/* Player */}
            <section
              className="detail-player"
              style={{ flex: 1, background: '#000', position: 'relative', minWidth: 0 }}
            >
              {allStreamsFailed ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'var(--bg)', padding: '1rem' }}>
                  <div style={{ fontSize: '2rem' }}>📡</div>
                  <p style={{ color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600, textAlign: 'center' }}>
                    No streams available right now
                  </p>
                  <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: '0.75rem', textAlign: 'center', maxWidth: '240px' }}>
                    All stream sources failed. Try again in a few minutes.
                  </p>
                  <button
                    type="button"
                    onClick={refetchStreams}
                    style={{ padding: '0.5rem 1.5rem', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', cursor: 'pointer' }}
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <StreamPlayer
                  stream={currentStream}
                  onError={handleStreamError}
                  fillParent
                />
              )}
            </section>

            {/* Sidebar */}
            <div
              className="detail-sidebar"
              style={{
                width: '340px', flexShrink: 0,
                borderLeft: '1px solid var(--line)',
                display: 'flex', flexDirection: 'column',
                background: 'var(--bg-1)', overflow: 'hidden',
              }}
            >
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                {(['streams', 'stats'] as SidebarTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSidebarTab(tab)}
                    style={{
                      flex: 1, padding: '0.75rem 0',
                      background: 'none', border: 'none',
                      borderBottom: `2px solid ${sidebarTab === tab ? 'var(--accent)' : 'transparent'}`,
                      color: sidebarTab === tab ? 'var(--text)' : 'var(--text-dim)',
                      fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 600,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      cursor: 'pointer', transition: 'all 0.15s', marginBottom: '-1px',
                    }}
                  >
                    {tab === 'streams' ? 'Streams' : 'Stats'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem' }}>
                {sidebarTab === 'streams' && (
                  <StreamList
                    streams={streams}
                    currentStreamId={currentStreamId}
                    onSelectStream={handleSelectStream}
                  />
                )}
                {sidebarTab === 'stats' && matchStats && (
                  <MatchStatsPanel detail={matchStats} />
                )}
                {sidebarTab === 'stats' && !matchStats && (
                  <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.8rem', fontFamily: 'var(--font-body)' }}>
                    Stats unavailable
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      {showShortcuts && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(7,8,12,0.85)', backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            style={{
              background: 'var(--bg-2)', border: '1px solid var(--line)',
              borderRadius: '6px', padding: '1.5rem', minWidth: '280px', maxWidth: '320px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--text)', marginBottom: '1rem', letterSpacing: '0.04em' }}>
              Keyboard Shortcuts
            </div>
            {[
              ['N', 'Next stream'],
              ['F', 'Toggle fullscreen'],
              ['?', 'Show/hide shortcuts'],
              ['Esc', 'Close this panel'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.625rem' }}>
                <kbd style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: '36px', padding: '0.2rem 0.5rem',
                  background: 'var(--bg-3)', border: '1px solid var(--line)',
                  borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.75rem',
                  color: 'var(--text)', flexShrink: 0,
                }}>
                  {key}
                </kbd>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {ToastComponent}
    </>
  );
}
