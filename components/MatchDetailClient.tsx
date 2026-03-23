'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { useToast } from '@/components/Toast';
import SiteHeader from './SiteHeader';
import MatchJsonLd from './MatchJsonLd';

interface MatchDetailClientProps {
  match: Match;
}

export default function MatchDetailClient({ match }: MatchDetailClientProps) {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [currentStream, setCurrentStream] = useState<Stream | null>(null);
  const [currentStreamIndex, setCurrentStreamIndex] = useState(0);
  const [streamErrorCount, setStreamErrorCount] = useState(0);
  const [multiStreamMode, setMultiStreamMode] = useState(false);
  const { showToast, ToastComponent } = useToast();

  const currentStreamId = currentStream
    ? `${currentStream.source || 'unknown'}-${currentStreamIndex}`
    : null;

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
    } else {
      console.error('No more streams available');
    }
  }, [streams, currentStreamIndex, showToast]);

  // Fetch streams client-side on mount
  useEffect(() => {
    if (!match.sources?.length) return;
    Promise.all(
      match.sources.map(({ source, id }) =>
        fetch(`/api/streams/${encodeURIComponent(source)}/${encodeURIComponent(id)}`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    ).then((arrays: Stream[][]) => {
      const all: Stream[] = arrays.flat().map((s, i) => ({
        ...s,
        source: s.source || match.sources![i]?.source,
      }));
      setStreams(all);
      const best = selectBestStream(all);
      if (best) {
        setCurrentStream(best);
        setCurrentStreamIndex(Math.max(0, all.findIndex(s => s.url === best.url)));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  useEffect(() => {
    if (streams.length === 0) return;

    const streamIds = streams.map((s, i) => ({
      id: `${s.source || 'unknown'}-${i}`,
      url: s.url || s.embedUrl || '',
    }));

    // Health status is driven by onLoad/onError events from StreamPlayer.
    // The recovery check below handles streams that went offline and may have recovered.
    const recoveryInterval = setInterval(() => {
      streamIds.forEach(async ({ id, url }) => {
        const health = streamHealthMonitor.getStatus(id);
        if (health.status === 'offline') {
          await streamHealthMonitor.checkStreamRecovery(url, id);
        }
      });
    }, 60000);

    return () => clearInterval(recoveryInterval);
  }, [streams]);

  const handleSelectStream = (stream: Stream, index: number) => {
    setCurrentStream(stream);
    setCurrentStreamIndex(index);
    setStreamErrorCount(0);
  };

  const isLive = match.isLive;
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const localTime = useLocalTime(startTime);

  return (
    <>
      <MatchJsonLd match={match} />
      <SiteHeader activeSection="matches" />
      <main style={{ flex: 1 }}>
        {/* Match header — compact single row, same height as channels header */}
        <div className="page-content" style={{ paddingTop: '1.5rem', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>

            {/* Back */}
            <Link
              href="/"
              style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none',
                fontFamily: 'var(--font-body)', transition: 'color 0.15s', flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
            >
              ←
            </Link>

            {/* Divider */}
            <span style={{ color: 'var(--line)', fontSize: '1rem', flexShrink: 0 }}>|</span>

            {/* Team logos + names */}
            {match.image1 && (
              <Image src={getImageUrl(match.image1)} alt={match.team1} width={48} height={48} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }} />
            )}
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>
              {match.team1}
            </span>

            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--muted)', padding: '0.15rem 0.5rem', border: '1px solid var(--line)', borderRadius: '2px', flexShrink: 0 }}>
              VS
            </span>

            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>
              {match.team2}
            </span>
            {match.image2 && (
              <Image src={getImageUrl(match.image2)} alt={match.team2} width={48} height={48} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }} />
            )}

            {/* League */}
            <span className="label" style={{ fontSize: '0.55rem', flexShrink: 0 }}>{match.league || match.sport}</span>

            {/* Live badge */}
            {isLive && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--red)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: '2px', flexShrink: 0 }}>
                <span className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                LIVE
              </span>
            )}

            {localTime && !isLive && (
              <span style={{ fontSize: '0.65rem', color: 'var(--subtle)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>{localTime}</span>
            )}

            {/* Multi-match toggle — pushed to the right */}
            <button
              type="button"
              aria-label={multiStreamMode ? 'Switch to single stream view' : 'Switch to multi stream view'}
              aria-pressed={multiStreamMode}
              onClick={() => setMultiStreamMode(!multiStreamMode)}
              style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.3rem 0.75rem',
                background: multiStreamMode ? 'var(--accent)' : 'var(--bg-2)',
                color: multiStreamMode ? '#000' : 'var(--text-dim)',
                border: `1px solid ${multiStreamMode ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              {multiStreamMode ? '▣ Single' : '▤ Multi'}
            </button>
          </div>

          {multiStreamMode && <div style={{ marginTop: '1rem' }}><MultiMatchView currentMatch={match} /></div>}
        </div>

        {!multiStreamMode && (
          <>
            {/* Player — full width, fixed height to stay in viewport */}
            <section className="player-wrapper" style={{
              width: '100%',
              background: '#000',
              height: 'calc(100vh - var(--header-h) - 9rem)',
              minHeight: '320px',
              maxHeight: '72vh',
              position: 'relative',
              marginBottom: '2rem',
            }}>
              <StreamPlayer
                stream={currentStream}
                streamId={currentStreamId ?? 'none'}
                onError={handleStreamError}
                fillParent
              />
            </section>

            {/* Streams list — centered below */}
            <div className="page-content" style={{ paddingBottom: '3rem' }}>
              <StreamList
                streams={streams}
                currentStreamId={currentStreamId}
                onSelectStream={handleSelectStream}
              />
            </div>
          </>
        )}
      </main>
      {ToastComponent}
    </>
  );
}
