import type { BroadcastChannel, Match, Stream } from '@/types/api';
import type { Channel } from '@/types/channels';
import { selectBestStream } from './streamSelector';

/** Stable empty default so effects depending on `broadcasts` don't re-run each render. */
export const NO_BROADCASTS: BroadcastChannel[] = [];

/** Tag every stream with the source that served it, unless it already names one. */
export function attributeStreamsToSources(
  sources: Match['sources'],
  streamArrays: Stream[][]
): Stream[] {
  return streamArrays.flatMap((sourceStreams, sourceIndex) =>
    sourceStreams.map(stream => ({
      ...stream,
      source: stream.source || sources[sourceIndex]?.source,
    }))
  );
}

/** Identity of a match's source set; changes exactly when the streams must be refetched. */
export function sourcesKey(sources: Match['sources'] | undefined): string {
  return sources?.map(s => `${s.source}:${s.id}`).join(',') ?? '';
}

/** Fetch every source's streams; a failing source contributes none. */
export async function fetchSourceStreams(sources: Match['sources']): Promise<Stream[]> {
  const streamArrays: Stream[][] = await Promise.all(
    sources.map(({ source, id }) =>
      fetch(`/api/streams/${encodeURIComponent(source)}/${encodeURIComponent(id)}`)
        .then(r => (r.ok ? r.json() : []))
        .catch(() => [])
    )
  );
  return attributeStreamsToSources(sources, streamArrays);
}

export interface InitialPlayback {
  streams: Stream[];
  /** Index into `streams` of the stream to play first, or null when there is none. */
  currentIndex: number | null;
  selectedChannel: BroadcastChannel | null;
  /** True only while a fetch is genuinely pending, so the UI never claims "no sources" prematurely. */
  isResolving: boolean;
  /** The server already answered, so the first mount has nothing to fetch. */
  skipInitialFetch: boolean;
}

interface InitialPlaybackInput {
  initialStreams?: Stream[];
  streamsResolved: boolean;
  broadcasts: BroadcastChannel[];
  sources: Match['sources'] | undefined;
}

/**
 * What the player should show on first paint. When the server says there is no
 * direct stream, the TV channel is picked up front so the player renders it
 * immediately instead of flashing an empty state.
 */
export function deriveInitialPlayback({
  initialStreams = [],
  streamsResolved,
  broadcasts,
  sources,
}: InitialPlaybackInput): InitialPlayback {
  const hasStreams = initialStreams.length > 0;
  const best = selectBestStream(initialStreams);

  return {
    streams: initialStreams,
    currentIndex: best ? Math.max(0, initialStreams.indexOf(best)) : null,
    selectedChannel: streamsResolved && !hasStreams ? broadcasts[0] ?? null : null,
    isResolving: !streamsResolved && !hasStreams && (sources?.length ?? 0) > 0,
    skipInitialFetch: streamsResolved || hasStreams,
  };
}

/**
 * Best stream among those not yet tried, with its index in the full list.
 * The index travels with each candidate: picking from a filtered array and then
 * looking the winner up by URL would mis-resolve duplicate URLs.
 */
export function pickNextStream(
  streams: Stream[],
  triedIndexes: ReadonlySet<number>
): { stream: Stream; index: number } | null {
  const remaining = streams
    .map((stream, index) => ({ stream, index }))
    .filter(({ index }) => !triedIndexes.has(index));
  const best = selectBestStream(remaining.map(r => r.stream));
  return remaining.find(r => r.stream === best) ?? null;
}

/** ChannelPlayer takes a catalog Channel; a broadcast is the same data plus the broadcaster. */
export function broadcastToChannel(broadcast: BroadcastChannel): Channel {
  return {
    name: broadcast.channel,
    logo: broadcast.logo,
    options: broadcast.options,
    show: true,
  };
}
