'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Match, Stream } from '@/types/api';
import StreamPlayer from './StreamPlayer';
import StreamList from './StreamList';
import MultiMatchView from './MultiMatchView';
import { selectBestStream } from '@/lib/streamSelector';
import { streamHealthMonitor } from '@/lib/streamHealth';
import { getImageUrl } from '@/lib/api';
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
  const [currentStreamIndex, setCurrentStreamIndex] = useState<number>(
    initialStream ? streams.findIndex(s => s.url === initialStream.url) : 0
  );
  const [streamErrorCount, setStreamErrorCount] = useState(0);
  const [multiStreamMode, setMultiStreamMode] = useState(false);
  const { showToast, ToastComponent } = useToast();

  // Get current stream ID for tracking
  const currentStreamId = currentStream 
    ? `${currentStream.source || 'unknown'}-${currentStreamIndex}`
    : null;

  // Auto-fallback handler
  const handleStreamError = useCallback(() => {
    setStreamErrorCount(prev => prev + 1);
    
    // Find next best stream
    const remainingStreams = streams.filter((_, index) => index !== currentStreamIndex);
    const nextStream = selectBestStream(remainingStreams);
    
    if (nextStream) {
      const nextIndex = streams.findIndex(s => s.url === nextStream.url);
      setCurrentStream(nextStream);
      setCurrentStreamIndex(nextIndex);
      setStreamErrorCount(0);
      
      // Show brief notification
      showToast('Switched to next available stream', 'info');
    } else {
      console.error('No more streams available');
    }
  }, [streams, currentStreamIndex, showToast]);

  // Periodic stream health checking and recovery
  useEffect(() => {
    if (streams.length === 0) return;

    const streamIds = streams.map((s, i) => ({
      id: `${s.source || 'unknown'}-${i}`,
      url: s.url || s.embedUrl || '',
    }));

    // Start periodic health checks (every 30 seconds)
    streamHealthMonitor.startPeriodicCheck(streamIds, 30000);

    // Separate recovery check for offline streams (every 60 seconds)
    const recoveryInterval = setInterval(() => {
      streamIds.forEach(async ({ id, url }) => {
        const health = streamHealthMonitor.getStatus(id);
        if (health.status === 'offline') {
          const recovered = await streamHealthMonitor.checkStreamRecovery(url, id);
          if (recovered) {
            console.log(`Stream ${id} has recovered`);
            // Force re-render to show updated status
            // This could trigger a UI update if needed
          }
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
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link 
            href="/"
            className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block"
          >
            ← Back to Matches
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">
                {match.team1} vs {match.team2}
              </h1>
              <p className="text-sm text-gray-400 mt-1">{match.league}</p>
            </div>
            {isLive && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-red-600 text-white">
                <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
                LIVE
              </span>
            )}
          </div>
          {startTime && !isLive && (
            <p className="text-sm text-gray-400 mt-2">
              Starts: {startTime.toLocaleString()}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {/* Multi-Stream / Single Stream Toggle */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
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
              <span className="text-sm text-gray-400">
                Watch up to 4 different matches simultaneously
              </span>
            )}
          </div>
        </div>

        {/* Multi-Match View */}
        {multiStreamMode ? (
          <div className="mb-6">
            <MultiMatchView currentMatch={match} maxMatches={4} />
          </div>
        ) : (
          <>
            {/* Single Video Player */}
            <div className="mb-4 md:mb-6 -mx-4 md:mx-0">
              <StreamPlayer
                stream={currentStream}
                streamId={currentStreamId || 'unknown'}
                autoPlay={true}
                onError={handleStreamError}
              />
            </div>

            {/* Stream List */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <StreamList
                streams={streams}
                currentStreamId={currentStreamId}
                onSelectStream={handleSelectStream}
              />
            </div>
          </>
        )}

        {/* Match Info */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h3 className="font-semibold text-white mb-2">Team 1</h3>
            <div className="flex items-center gap-3">
              {match.image1 && (
                <img
                  src={getImageUrl(match.image1)}
                  alt={match.team1}
                  className="w-12 h-12 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span className="text-gray-300">{match.team1}</span>
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h3 className="font-semibold text-white mb-2">Team 2</h3>
            <div className="flex items-center gap-3">
              {match.image2 && (
                <img
                  src={getImageUrl(match.image2)}
                  alt={match.team2}
                  className="w-12 h-12 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span className="text-gray-300">{match.team2}</span>
            </div>
          </div>
        </div>
      </main>
      {ToastComponent}
    </div>
  );
}
