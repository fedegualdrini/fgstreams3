'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Match, Stream } from '@/types/api';
import StreamPlayer from './StreamPlayer';
import StreamList from './StreamList';
import MultiMatchView from './MultiMatchView';
import { selectBestStream } from '@/lib/streamSelector';
import { streamHealthMonitor } from '@/lib/streamHealth';
import { getImageUrl } from '@/lib/api';
import { formatMatchDate } from '@/lib/dateUtils';
import { useToast } from '@/components/Toast';

interface MatchDetailClientProps {
  match: Match;
  streams: Stream[];
  initialStream: Stream | null;
}

export default function MatchDetailClient({
  match,
  streams,
  initialStream,
}: MatchDetailClientProps) {
  const [currentStream, setCurrentStream] = useState<Stream | null>(initialStream);
  const [currentStreamIndex, setCurrentStreamIndex] = useState(
    initialStream ? streams.findIndex((s) => s.url === initialStream.url) : 0
  );
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

  useEffect(() => {
    if (streams.length === 0) return;

    const streamIds = streams.map((s, i) => ({
      id: `${s.source || 'unknown'}-${i}`,
      url: s.url || s.embedUrl || '',
    }));

    streamHealthMonitor.startPeriodicCheck(streamIds, 30000);

    const recoveryInterval = setInterval(() => {
      streamIds.forEach(async ({ id, url }) => {
        const health = streamHealthMonitor.getStatus(id);
        if (health.status === 'offline') {
          await streamHealthMonitor.checkStreamRecovery(url, id);
        }
      });
    }, 60000);

    return () => {
      streamHealthMonitor.stopPeriodicCheck();
      clearInterval(recoveryInterval);
    };
  }, [streams]);

  const handleSelectStream = (stream: Stream, index: number) => {
    setCurrentStream(stream);
    setCurrentStreamIndex(index);
    setStreamErrorCount(0);
  };

  const isLive = match.isLive;
  const startTime = match.startTime ? new Date(match.startTime) : null;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-6">
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          ← Back to Matches
        </Link>
        <h1 className="text-xl md:text-2xl font-bold">
          {match.team1} vs {match.team2}
        </h1>
        <p className="text-gray-500 text-sm">{match.league}</p>
        <div className="flex gap-2 mt-2">
          {isLive && (
            <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">
              LIVE
            </span>
          )}
          {startTime && !isLive && (
            <span className="text-gray-400 text-sm">Starts: {formatMatchDate(startTime)}</span>
          )}
        </div>
      </header>

      <div className="mb-4">
        <button
          type="button"
          onClick={() => setMultiStreamMode(!multiStreamMode)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            multiStreamMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {multiStreamMode ? '⬇️ Single Match' : '📹 Multi-Match View'}
        </button>
        {multiStreamMode && (
          <p className="text-gray-400 text-sm mt-1">
            Watch up to 4 different matches simultaneously
          </p>
        )}
      </div>

      {multiStreamMode ? (
        <MultiMatchView currentMatch={match} />
      ) : (
        <>
          <section className="mb-6 w-full max-w-4xl">
            <StreamPlayer
              stream={currentStream}
              streamId={currentStreamId ?? 'none'}
              onError={handleStreamError}
            />
          </section>

          <section className="mb-8">
            <StreamList
              streams={streams}
              currentStreamId={currentStreamId}
              onSelectStream={handleSelectStream}
            />
          </section>

          <section className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Team 1</p>
              <div className="flex items-center gap-2">
                {match.image1 && (
                  <img
                    src={getImageUrl(match.image1)}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span>{match.team1}</span>
              </div>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Team 2</p>
              <div className="flex items-center gap-2">
                {match.image2 && (
                  <img
                    src={getImageUrl(match.image2)}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span>{match.team2}</span>
              </div>
            </div>
          </section>
        </>
      )}

      {ToastComponent}
    </main>
  );
}
