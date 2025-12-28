'use client';

import { useState, useEffect } from 'react';
import { Stream } from '@/types/api';
import StreamPlayer from './StreamPlayer';
import { streamHealthMonitor } from '@/lib/streamHealth';

interface MultiStreamViewProps {
  streams: Stream[];
  maxStreams?: number;
}

type StreamLayout = 'grid' | 'focus' | 'side-by-side';

interface ActiveStream {
  stream: Stream;
  index: number;
  streamId: string;
  muted: boolean;
  focused: boolean;
}

export default function MultiStreamView({ 
  streams, 
  maxStreams = 4 
}: MultiStreamViewProps) {
  const [activeStreams, setActiveStreams] = useState<ActiveStream[]>([]);
  const [layout, setLayout] = useState<StreamLayout>('grid');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Initialize with first available streams
  useEffect(() => {
    if (streams.length > 0 && activeStreams.length === 0) {
      const initialStreams: ActiveStream[] = streams
        .slice(0, Math.min(maxStreams, streams.length))
        .map((stream, index) => ({
          stream,
          index,
          streamId: `${stream.source || 'unknown'}-${index}`,
          muted: index > 0, // Mute all except first
          focused: index === 0,
        }));
      setActiveStreams(initialStreams);
      setFocusedIndex(0);
    }
  }, [streams, maxStreams, activeStreams.length]);

  const toggleMute = (streamId: string) => {
    setActiveStreams(prev =>
      prev.map(s =>
        s.streamId === streamId ? { ...s, muted: !s.muted } : s
      )
    );
  };

  const removeStream = (streamId: string) => {
    setActiveStreams(prev => {
      const filtered = prev.filter(s => s.streamId !== streamId);
      // If removed stream was focused, focus the first remaining
      if (focusedIndex !== null && prev[focusedIndex]?.streamId === streamId) {
        setFocusedIndex(filtered.length > 0 ? 0 : null);
      }
      return filtered;
    });
  };

  const addStream = (stream: Stream, index: number) => {
    if (activeStreams.length >= maxStreams) {
      return;
    }
    const streamId = `${stream.source || 'unknown'}-${index}`;
    // Check if stream is already active
    if (activeStreams.some(s => s.streamId === streamId)) {
      return;
    }
    setActiveStreams(prev => [
      ...prev,
      {
        stream,
        index,
        streamId,
        muted: prev.length > 0,
        focused: false,
      },
    ]);
  };

  const focusStream = (streamId: string) => {
    setActiveStreams(prev =>
      prev.map(s => ({
        ...s,
        focused: s.streamId === streamId,
      }))
    );
    const index = activeStreams.findIndex(s => s.streamId === streamId);
    setFocusedIndex(index >= 0 ? index : null);
  };

  const getLayoutClasses = () => {
    const count = activeStreams.length;
    if (layout === 'focus' && focusedIndex !== null) {
      return 'grid-cols-1';
    }
    if (layout === 'side-by-side' && count === 2) {
      return 'grid-cols-2';
    }
    // Grid layout
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
  };

  if (activeStreams.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p>No streams available for multi-view</p>
        <p className="text-sm mt-2">Select streams to add them to the view</p>
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
            onChange={(e) => setLayout(e.target.value as StreamLayout)}
            className="px-3 py-1.5 bg-gray-800 text-white rounded border border-gray-700 text-sm"
          >
            <option value="grid">Grid</option>
            <option value="side-by-side">Side by Side</option>
            <option value="focus" disabled={focusedIndex === null}>
              Focus Mode
            </option>
          </select>
        </div>
        <div className="text-sm text-gray-400">
          {activeStreams.length} / {maxStreams} streams
        </div>
        {activeStreams.length > 0 && (
          <button
            onClick={() => {
              setActiveStreams([]);
              setFocusedIndex(null);
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Stream Grid */}
      <div className={`grid ${getLayoutClasses()} gap-4`}>
        {activeStreams.map((activeStream, idx) => {
          const isFocused = layout === 'focus' && focusedIndex === idx;
          const isHidden = layout === 'focus' && focusedIndex !== idx && focusedIndex !== null;

          if (isHidden) return null;

          return (
            <div
              key={activeStream.streamId}
              className={`relative bg-black rounded-lg overflow-hidden border-2 ${
                activeStream.focused || isFocused
                  ? 'border-blue-500'
                  : 'border-gray-800'
              }`}
            >
              {/* Stream Controls Overlay */}
              <div className="absolute top-2 right-2 z-20 flex gap-2">
                <button
                  onClick={() => toggleMute(activeStream.streamId)}
                  className={`p-2 rounded ${
                    activeStream.muted
                      ? 'bg-red-600 text-white'
                      : 'bg-green-600 text-white'
                  } hover:opacity-80 text-xs font-medium`}
                  title={activeStream.muted ? 'Unmute' : 'Mute'}
                >
                  {activeStream.muted ? '🔇' : '🔊'}
                </button>
                <button
                  onClick={() => focusStream(activeStream.streamId)}
                  className="p-2 rounded bg-blue-600 text-white hover:opacity-80 text-xs font-medium"
                  title="Focus this stream"
                >
                  ⚡
                </button>
                <button
                  onClick={() => removeStream(activeStream.streamId)}
                  className="p-2 rounded bg-red-600 text-white hover:opacity-80 text-xs font-medium"
                  title="Remove stream"
                >
                  ✕
                </button>
              </div>

              {/* Stream Info */}
              <div className="absolute top-2 left-2 z-20 bg-black/70 text-white px-2 py-1 rounded text-xs">
                {activeStream.stream.language || 'Unknown'} |{' '}
                {activeStream.stream.quality || 'SD'}
                {activeStream.muted && ' (Muted)'}
              </div>

              {/* Video Player */}
              <div className={isFocused ? '' : 'aspect-video'}>
                <StreamPlayer
                  stream={activeStream.stream}
                  streamId={activeStream.streamId}
                  autoPlay={true}
                  muted={activeStream.muted}
                />
                {activeStream.muted && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/30 z-10">
                    <div className="bg-black/80 text-white px-4 py-2 rounded-lg border border-white/20">
                      <span className="text-lg">🔇</span> Muted
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Available Streams to Add */}
      {activeStreams.length < maxStreams && (
        <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <h4 className="text-sm font-semibold text-white mb-3">
            Add More Streams ({activeStreams.length}/{maxStreams}):
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {streams
              .filter((stream, index) => {
                const streamId = `${stream.source || 'unknown'}-${index}`;
                return !activeStreams.some(s => s.streamId === streamId);
              })
              .slice(0, maxStreams - activeStreams.length)
              .map((stream, index) => {
                const originalIndex = streams.indexOf(stream);
                return (
                  <button
                    key={`${stream.source || 'unknown'}-${originalIndex}`}
                    onClick={() => addStream(stream, originalIndex)}
                    className="p-2 bg-gray-800 hover:bg-gray-700 rounded text-left text-xs text-gray-300 border border-gray-700"
                  >
                    {stream.language || 'Unknown'} | {stream.quality || 'SD'}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

