'use client';

import type { Stream, StreamStatus } from '@/types/api';
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
  onSelectStream,
}: StreamListProps) {
  if (!streams?.length) {
    return (
      <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 text-gray-400">
        No streams available for this match
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-400">Available Streams</h3>
      <div className="flex flex-col gap-2">
        {streams.map((stream, index) => {
          const streamId = `${stream.source || 'unknown'}-${index}`;
          const isActive = currentStreamId === streamId;
          const health = streamHealthMonitor.getStatus(streamId);
          const statusColor = statusColors[health.status];
          const statusLabel = statusLabels[health.status];

          return (
            <button
              key={streamId}
              type="button"
              onClick={() => onSelectStream(stream, index)}
              className={`w-full text-left p-3 md:p-4 rounded-lg border transition-colors touch-manipulation ${
                isActive
                  ? 'bg-blue-900 border-blue-600'
                  : 'bg-gray-900 border-gray-800 hover:bg-gray-800 active:bg-gray-700'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                <span className="text-sm">{statusLabel}</span>
                {stream.language && (
                  <span className="text-gray-400 text-xs">Language: {stream.language}</span>
                )}
                {stream.quality && (
                  <span className="text-gray-400 text-xs">Quality: {stream.quality}</span>
                )}
                {stream.source && (
                  <span className="text-gray-500 text-xs">Source: {stream.source}</span>
                )}
                {isActive && (
                  <span className="ml-auto text-blue-400 text-xs font-medium">Playing</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
