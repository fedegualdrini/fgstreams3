'use client';

import { useState, useEffect } from 'react';
import { Match, Stream } from '@/types/api';
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
  maxMatches = 4 
}: MultiMatchViewProps) {
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
  const [availableMatches, setAvailableMatches] = useState<Match[]>([]);
  const [layout, setLayout] = useState<MatchLayout>('grid');
  const [loading, setLoading] = useState(true);
  const [showMatchSelector, setShowMatchSelector] = useState(false);

  // Load available matches and initialize current match
  useEffect(() => {
    async function loadMatches() {
      try {
        const matches = await fetchMatches();
        // Filter out current match
        const otherMatches = matches.filter(m => m.id !== currentMatch.id);
        setAvailableMatches(otherMatches);
        
        // Initialize with current match if not already initialized
        if (activeMatches.length === 0) {
          const initialMatch = await initializeMatch(currentMatch);
          if (initialMatch) {
            setActiveMatches([initialMatch]);
          }
        }
      } catch (error) {
        console.error('Error loading matches:', error);
      } finally {
        setLoading(false);
      }
    }
    loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatch.id]);

  const initializeMatch = async (match: Match, shouldMute: boolean = false): Promise<ActiveMatch | null> => {
    try {
      let streams: Stream[] = [];
      if (match.sources && match.sources.length > 0) {
        const streamPromises = match.sources.map(source => 
          fetchStreams(source.source, source.id).catch(() => [])
        );
        const streamArrays = await Promise.all(streamPromises);
        streams = streamArrays.flat();
      }
      
      const bestStream = selectBestStream(streams);
      const streamId = bestStream 
        ? `${bestStream.source || 'unknown'}-${match.id}`
        : `no-stream-${match.id}`;

      return {
        match,
        streams,
        selectedStream: bestStream,
        streamId,
        muted: shouldMute,
      };
    } catch (error) {
      console.error('Error initializing match:', error);
      return null;
    }
  };

  const addMatch = async (match: Match) => {
    if (activeMatches.length >= maxMatches) {
      return;
    }
    
    // Check if match is already added
    if (activeMatches.some(m => m.match.id === match.id)) {
      return;
    }

    const matchData = await initializeMatch(match, activeMatches.length > 0);
    if (matchData) {
      setActiveMatches(prev => [...prev, matchData]);
      setShowMatchSelector(false);
    }
  };

  const removeMatch = (matchId: string) => {
    setActiveMatches(prev => prev.filter(m => m.match.id !== matchId));
  };

  const toggleMute = (matchId: string) => {
    setActiveMatches(prev =>
      prev.map(m =>
        m.match.id === matchId ? { ...m, muted: !m.muted } : m
      )
    );
  };

  const changeStream = async (matchId: string, stream: Stream) => {
    setActiveMatches(prev =>
      prev.map(m => {
        if (m.match.id === matchId) {
          const streamId = `${stream.source || 'unknown'}-${matchId}`;
          return {
            ...m,
            selectedStream: stream,
            streamId,
          };
        }
        return m;
      })
    );
  };

  const getLayoutClasses = () => {
    const count = activeMatches.length;
    if (layout === 'side-by-side' && count === 2) {
      return 'grid-cols-1 md:grid-cols-2';
    }
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
  };

  if (loading) {
    return (
      <div className="text-center text-gray-400 py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading matches...</p>
      </div>
    );
  }

  if (activeMatches.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p>No matches loaded</p>
        <button
          onClick={() => setShowMatchSelector(true)}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Matches
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-300">Layout:</label>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as MatchLayout)}
            className="px-3 py-1.5 bg-gray-800 text-white rounded border border-gray-700 text-sm"
          >
            <option value="grid">Grid</option>
            <option value="side-by-side" disabled={activeMatches.length !== 2}>
              Side by Side
            </option>
          </select>
        </div>
        <div className="text-sm text-gray-400">
          {activeMatches.length} / {maxMatches} matches
        </div>
        <button
          onClick={() => setShowMatchSelector(true)}
          disabled={activeMatches.length >= maxMatches}
          className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-sm"
        >
          + Add Match
        </button>
        {activeMatches.length > 1 && (
          <button
            onClick={() => {
              // Keep only first match
              setActiveMatches(prev => [prev[0]]);
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Match Grid */}
      <div className={`grid ${getLayoutClasses()} gap-4`}>
        {activeMatches.map((activeMatch) => (
          <div
            key={activeMatch.match.id}
            className="relative bg-gray-900 rounded-lg overflow-hidden border border-gray-800"
          >
            {/* Match Header */}
            <div className="bg-gray-800 px-3 py-2 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {activeMatch.match.team1} vs {activeMatch.match.team2}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {activeMatch.match.league}
                </div>
              </div>
              {activeMatch.match.isLive && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
                  <span className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-pulse"></span>
                  LIVE
                </span>
              )}
            </div>

            {/* Stream Controls Overlay */}
            <div className="absolute top-12 right-2 z-20 flex gap-2">
              <button
                onClick={() => toggleMute(activeMatch.match.id)}
                className={`p-2 rounded ${
                  activeMatch.muted
                    ? 'bg-red-600 text-white'
                    : 'bg-green-600 text-white'
                } hover:opacity-80 text-xs font-medium`}
                title={activeMatch.muted ? 'Unmute' : 'Mute'}
              >
                {activeMatch.muted ? '🔇' : '🔊'}
              </button>
              <button
                onClick={() => removeMatch(activeMatch.match.id)}
                className="p-2 rounded bg-red-600 text-white hover:opacity-80 text-xs font-medium"
                title="Remove match"
              >
                ✕
              </button>
            </div>

            {/* Video Player */}
            <div className="aspect-video bg-black relative">
              {activeMatch.selectedStream ? (
                <>
                  <StreamPlayer
                    stream={activeMatch.selectedStream}
                    streamId={activeMatch.streamId}
                    autoPlay={true}
                    muted={activeMatch.muted}
                  />
                  {activeMatch.muted && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/30 z-10">
                      <div className="bg-black/80 text-white px-4 py-2 rounded-lg border border-white/20">
                        <span className="text-lg">🔇</span> Muted
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  No stream available
                </div>
              )}
            </div>

            {/* Stream Selector */}
            {activeMatch.streams.length > 1 && (
              <div className="p-2 bg-gray-800">
                <select
                  value={activeMatch.selectedStream?.url || ''}
                  onChange={(e) => {
                    const stream = activeMatch.streams.find(s => s.url === e.target.value || s.embedUrl === e.target.value);
                    if (stream) {
                      changeStream(activeMatch.match.id, stream);
                    }
                  }}
                  className="w-full px-2 py-1 bg-gray-900 text-white text-xs rounded border border-gray-700"
                >
                  {activeMatch.streams.map((stream, idx) => (
                    <option
                      key={idx}
                      value={stream.url || stream.embedUrl || ''}
                    >
                      {stream.language || 'Unknown'} | {stream.quality || 'SD'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Match Selector Modal */}
      {showMatchSelector && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg border border-gray-800 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Select Match to Add</h3>
              <button
                onClick={() => setShowMatchSelector(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableMatches
                  .filter(m => !activeMatches.some(am => am.match.id === m.id))
                  .map((match) => (
                    <button
                      key={match.id}
                      onClick={() => addMatch(match)}
                      className="text-left p-3 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
                    >
                      <div className="font-medium text-white text-sm">
                        {match.team1} vs {match.team2}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{match.league}</div>
                      {match.isLive && (
                        <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
                          LIVE
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              {availableMatches.filter(m => !activeMatches.some(am => am.match.id === m.id)).length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  No more matches available to add
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

