'use client';

import { Stream, StreamStatus } from '@/types/api';
import { streamHealthMonitor } from '@/lib/streamHealth';

interface StreamListProps {
  streams: Stream[];
  currentStreamId: string | null;
  onSelectStream: (stream: Stream, index: number) => void;
}

const statusColors: Record<StreamStatus, string> = {
  working: 'bg-green-500',
  unstable: 'bg-yellow-500',
  offline: 'bg-red-500',
  unknown: 'bg-gray-500',
};

const statusLabels: Record<StreamStatus, string> = {
  working: '🟢 Working',
  unstable: '🟡 Unstable',
  offline: '🔴 Offline',
  unknown: '⚪ Unknown',
};

export default function StreamList({ 
  streams, 
  currentStreamId, 
  onSelectStream 
}: StreamListProps) {
  if (!streams || streams.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No streams available for this match
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold mb-4 text-white">Available Streams</h3>
      {streams.map((stream, index) => {
        const streamId = `${stream.source || 'unknown'}-${index}`;
        const isActive = currentStreamId === streamId;
        const health = streamHealthMonitor.getStatus(streamId);
        const statusColor = statusColors[health.status];
        const statusLabel = statusLabels[health.status];

        return (
          <button
            key={index}
            onClick={() => onSelectStream(stream, index)}
            className={`w-full text-left p-3 md:p-4 rounded-lg border transition-colors touch-manipulation ${
              isActive
                ? 'bg-blue-900 border-blue-600'
                : 'bg-gray-900 border-gray-800 hover:bg-gray-800 active:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`w-3 h-3 rounded-full ${statusColor}`}></span>
                  <span className="text-sm text-gray-300">{statusLabel}</span>
                </div>
                <div className="flex gap-4 text-sm text-gray-400">
                  {stream.language && (
                    <span>Language: {stream.language}</span>
                  )}
                  {stream.quality && (
                    <span>Quality: {stream.quality}</span>
                  )}
                  {stream.source && (
                    <span>Source: {stream.source}</span>
                  )}
                </div>
              </div>
              {isActive && (
                <span className="text-blue-400 text-sm font-medium">Playing</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
