'use client';

import { useState, useEffect } from 'react';
import type { Match, Stream } from '@/types/api';
import StreamPlayer from './StreamPlayer';
import { fetchMatches, fetchStreams } from '@/lib/api';
import { selectBestStream } from '@/lib/streamSelector';

interface MultiMatchViewProps {
  currentMatch: Match;
  maxMatches?: number;
}

interface ActiveMatch {
  match: Match;
  streams: Stream[];
  selectedStream: Stream | null;
  streamId: string;
  muted: boolean;
}

type MatchLayout = 'grid' | 'side-by-side';

export default function MultiMatchView({
  currentMatch,
  maxMatches = 4,
}: MultiMatchViewProps) {
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
  const [availableMatches, setAvailableMatches] = useState<Match[]>([]);
  const [layout, setLayout] = useState<MatchLayout>('grid');
  const [loading, setLoading] = useState(true);
  const [showMatchSelector, setShowMatchSelector] = useState(false);

  useEffect(() => {
    async function loadMatches() {
      try {
        const matches = await fetchMatches();
        const otherMatches = matches.filter((m) => m.id !== currentMatch.id);
        setAvailableMatches(otherMatches);

        if (activeMatches.length === 0) {
          const initialMatch = await initializeMatch(currentMatch);
          if (initialMatch) setActiveMatches([initialMatch]);
        }
      } catch (error) {
        console.error('Error loading matches:', error);
      } finally {
        setLoading(false);
      }
    }
    loadMatches();
  }, [currentMatch.id]);

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
      const streamId = bestStream
        ? `${bestStream.source || 'unknown'}-${match.id}`
        : `no-stream-${match.id}`;
      return { match, streams, selectedStream: bestStream, streamId, muted: shouldMute };
    } catch (error) {
      console.error('Error initializing match:', error);
      return null;
    }
  }

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
      prev.map((m) => {
        if (m.match.id !== matchId) return m;
        const streamId = `${stream.source || 'unknown'}-${matchId}`;
        return { ...m, selectedStream: stream, streamId };
      })
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
      <div className="flex items-center justify-center py-12 text-gray-400">
        Loading matches...
      </div>
    );
  }

  if (activeMatches.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">No matches loaded</p>
        <button
          type="button"
          onClick={() => setShowMatchSelector(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Matches
        </button>
      </div>
    );
  }

  const toAdd = availableMatches.filter((m) => !activeMatches.some((am) => am.match.id === m.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-400">Layout:</span>
        <select
          value={layout}
          onChange={(e) => setLayout(e.target.value as MatchLayout)}
          className="px-3 py-1.5 bg-gray-800 text-white rounded border border-gray-700 text-sm"
        >
          <option value="grid">Grid</option>
          <option value="side-by-side">Side by Side</option>
        </select>
        <span className="text-sm text-gray-400">
          {activeMatches.length} / {maxMatches} matches
        </span>
        <button
          type="button"
          onClick={() => setShowMatchSelector(true)}
          disabled={activeMatches.length >= maxMatches}
          className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-sm"
        >
          + Add Match
        </button>
        {activeMatches.length > 1 && (
          <button
            type="button"
            onClick={() => setActiveMatches((prev) => [prev[0]])}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Clear All
          </button>
        )}
      </div>

      <div className={`grid gap-4 ${getLayoutClasses()}`}>
        {activeMatches.map((activeMatch) => (
          <div
            key={activeMatch.match.id}
            className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden"
          >
            <div className="p-2 flex items-center justify-between bg-gray-800/50">
              <div>
                <p className="font-medium text-sm">
                  {activeMatch.match.team1} vs {activeMatch.match.team2}
                </p>
                <p className="text-xs text-gray-400">{activeMatch.match.league}</p>
                {activeMatch.match.isLive && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded">
                    LIVE
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => toggleMute(activeMatch.match.id)}
                  className={`p-2 rounded text-xs font-medium ${
                    activeMatch.muted ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                  } hover:opacity-80`}
                  title={activeMatch.muted ? 'Unmute' : 'Mute'}
                >
                  {activeMatch.muted ? '🔇' : '🔊'}
                </button>
                <button
                  type="button"
                  onClick={() => removeMatch(activeMatch.match.id)}
                  className="p-2 rounded bg-red-600 text-white hover:opacity-80 text-xs font-medium"
                  title="Remove match"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="relative">
              {activeMatch.selectedStream ? (
                <>
                  <StreamPlayer
                    stream={activeMatch.selectedStream}
                    streamId={activeMatch.streamId}
                    muted={activeMatch.muted}
                  />
                  {activeMatch.muted && (
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded text-xs">
                      🔇 Muted
                    </div>
                  )}
                </>
              ) : (
                <div className="aspect-video bg-gray-950 flex items-center justify-center text-gray-400">
                  No stream available
                </div>
              )}
            </div>

            {activeMatch.streams.length > 1 && (
              <div className="p-2 border-t border-gray-800">
                <select
                  className="w-full px-2 py-1 bg-gray-900 text-white text-xs rounded border border-gray-700"
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
                      {stream.language || 'Unknown'} | {stream.quality || 'SD'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>

      {showMatchSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-gray-900 rounded-lg border border-gray-700 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 flex items-center justify-between border-b border-gray-800">
              <h3 className="font-semibold">Select Match to Add</h3>
              <button
                type="button"
                onClick={() => setShowMatchSelector(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {toAdd.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => addMatch(match)}
                  className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
                >
                  <p className="font-medium">
                    {match.team1} vs {match.team2}
                  </p>
                  <p className="text-sm text-gray-400">{match.league}</p>
                  {match.isLive && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded">
                      LIVE
                    </span>
                  )}
                </button>
              ))}
              {toAdd.length === 0 && (
                <p className="text-gray-400 text-center py-4">No more matches available to add.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
