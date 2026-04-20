'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Match, Stream } from '@/types/api';
import StreamPlayer from './StreamPlayer';
import StreamList from './StreamList';
import MultiMatchView from './MultiMatchView';
import { selectBestStream } from '@/lib/streamSelector';
import { streamHealthMonitor } from '@/lib/streamHealth';
import { getImageUrl } from '@/lib/api';
import { useLocalTime } from '@/lib/dateUtils';
import { HEALTH_RECOVERY_INTERVAL_MS } from '@/lib/constants';
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
  const [multiStreamMode, setMultiStreamMode]   = useState(false);
  const [sidebarTab, setSidebarTab]             = useState<SidebarTab>('streams');
  const { showToast, ToastComponent } = useToast();

  const currentStreamId = currentStream
    ? `${currentStream.source || 'unknown'}-${currentStreamIndex}`
    : null;

  const matchRef   = useRef(match);
  matchRef.current = match;
  const sourcesKey = match.sources?.map(s => `${s.source}:${s.id}`).join(',') ?? '';

  const handleStreamError = useCallback(() => {
    setStreamErrorCount((prev) => prev + 1);
    const remainingStreams = streams.filter((_, index) => index !== currentStreamIndex);
    const nextStream = selectBestStream(remainingStreams);
    if (nextStream) {
      const nextIndex = streams.findIndex((s) => s.url === nextStream.url);
      setCurrentStream(nextStream);
      setCurrentStreamIndex(nextIndex);
      setStreamErrorCount(0);
      showToast('Switched to next available stream', 'info');
    }
  }, [streams, currentStreamIndex, showToast]);

  useEffect(() => {
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
  }, [sourcesKey]);

  useEffect(() => {
    if (streams.length === 0) return;
    const streamIds = streams.map((s, i) => ({
      id: `${s.source || 'unknown'}-${i}`,
      url: s.url || s.embedUrl || '',
    }));
    const recoveryInterval = setInterval(() => {
      streamIds.forEach(async ({ id, url }) => {
        const health = streamHealthMonitor.getStatus(id);
        if (health.status === 'offline') {
          await streamHealthMonitor.checkStreamRecovery(url, id);
        }
      });
    }, HEALTH_RECOVERY_INTERVAL_MS);
    return () => {
      clearInterval(recoveryInterval);
      streamIds.forEach(({ id }) => streamHealthMonitor.clearHealthEntry(id));
    };
  }, [streams]);

  const handleSelectStream = (stream: Stream, index: number) => {
    setCurrentStream(stream);
    setCurrentStreamIndex(index);
    setStreamErrorCount(0);
  };

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

            {/* Multi-stream toggle */}
            <button
              type="button"
              aria-pressed={multiStreamMode}
              onClick={() => setMultiStreamMode(!multiStreamMode)}
              style={{
                marginLeft: 'auto',
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
              flex: 1,
              height: 'calc(100vh - var(--header-h) - 52px)',
              minHeight: '420px',
            }}
          >
            {/* Player */}
            <section
              className="detail-player"
              style={{ flex: 1, background: '#000', position: 'relative', minWidth: 0 }}
            >
              <StreamPlayer
                stream={currentStream}
                streamId={currentStreamId ?? 'none'}
                onError={handleStreamError}
                fillParent
              />
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
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
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
      {ToastComponent}
    </>
  );
}
