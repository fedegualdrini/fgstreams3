'use client';

import type { BroadcastChannel, Stream } from '@/types/api';

const SKELETON_ROWS = [0, 1, 2];

interface StreamListProps {
  streams: Stream[];
  currentStreamIndex: number | null;
  onSelectStream: (index: number) => void;
  /** Channels from the local catalog that are broadcasting this match. */
  broadcasts?: BroadcastChannel[];
  selectedChannel?: string | null;
  onSelectChannel?: (channel: BroadcastChannel) => void;
  /** True while sources are still being fetched — distinct from "none exist". */
  isLoading?: boolean;
}

export default function StreamList({
  streams,
  currentStreamIndex,
  onSelectStream,
  broadcasts = [],
  selectedChannel = null,
  onSelectChannel,
  isLoading = false,
}: StreamListProps) {
  const hasStreams = streams.length > 0;
  const hasBroadcasts = broadcasts.length > 0;

  return (
    <div className="source-list">
      {hasBroadcasts && (
        <section>
          <span className="label source-list__heading">On TV</span>
          <div className="source-list__rows">
            {broadcasts.map((broadcast) => (
              <BroadcastRow
                key={broadcast.channel}
                broadcast={broadcast}
                isActive={selectedChannel === broadcast.channel}
                onSelect={() => onSelectChannel?.(broadcast)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <span className="label source-list__heading">Available Streams</span>

        {hasStreams ? (
          <div className="source-list__rows">
            {streams.map((stream, index) => (
              <StreamRow
                key={`${stream.embedUrl || stream.url}-${index}`}
                stream={stream}
                index={index}
                isActive={currentStreamIndex === index && !selectedChannel}
                onSelect={() => onSelectStream(index)}
              />
            ))}
          </div>
        ) : (
          <NoStreams isLoading={isLoading} hasBroadcasts={hasBroadcasts} />
        )}
      </section>
    </div>
  );
}

function NoStreams({ isLoading, hasBroadcasts }: { isLoading: boolean; hasBroadcasts: boolean }) {
  if (isLoading) return <LoadingRows />;
  return (
    <div className="source-list__empty">
      {hasBroadcasts
        ? 'No direct streams — use a TV channel above.'
        : 'No streams available for this match'}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="source-list__rows">
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="source-skeleton" aria-hidden="true" />
      ))}
      <span className="source-list__hint">Finding sources…</span>
    </div>
  );
}

interface RowProps {
  isActive: boolean;
  onSelect: () => void;
}

function BroadcastRow({ broadcast, isActive, onSelect }: RowProps & { broadcast: BroadcastChannel }) {
  return (
    <button
      type="button"
      className="source-row"
      onClick={onSelect}
      aria-label={`Watch on ${broadcast.channel}`}
      aria-pressed={isActive}
    >
      {broadcast.logo && (
        // Channel logos come from many third-party hosts, so next/image's
        // remotePatterns allow-list cannot cover them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={broadcast.logo}
          alt=""
          width={20}
          height={20}
          className="source-row__logo"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <span className="source-row__body source-row__body--stacked">
        <span className="source-row__name">{broadcast.channel}</span>
        {broadcast.network !== broadcast.channel && (
          <span className="source-row__network">{broadcast.network}</span>
        )}
      </span>
      <span className="source-row__badge">{broadcast.options.length} opt</span>
      {isActive && <span className="source-row__playing">▶</span>}
    </button>
  );
}

function StreamRow({ stream, index, isActive, onSelect }: RowProps & { stream: Stream; index: number }) {
  return (
    <button
      type="button"
      className="source-row"
      onClick={onSelect}
      aria-label={`Select ${stream.language || 'stream'} ${stream.quality || ''} from ${stream.source || 'source'}`}
      aria-pressed={isActive}
    >
      <span className="source-row__body">
        <span className="source-row__name">{stream.source || `Stream ${index + 1}`}</span>
        {stream.quality && <span className="source-row__badge">{stream.quality}</span>}
        {stream.language && <span className="source-row__lang">{stream.language}</span>}
      </span>
      {isActive && <span className="source-row__playing">▶ Playing</span>}
    </button>
  );
}
