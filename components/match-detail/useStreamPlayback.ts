'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastChannel, Match, Stream } from '@/types/api';
import { selectBestStream } from '@/lib/streamSelector';
import {
  NO_BROADCASTS,
  deriveInitialPlayback,
  fetchSourceStreams,
  pickNextStream,
  sourcesKey,
} from '@/lib/matchDetailStreams';

type Notify = (message: string, type?: 'info' | 'success' | 'error') => void;

interface UseStreamPlaybackOptions {
  match: Match;
  /** Streams resolved on the server; the client only refetches on retry. */
  initialStreams?: Stream[];
  /** True when `initialStreams` is the server's final answer, even if empty. */
  streamsResolved: boolean;
  broadcasts?: BroadcastChannel[];
  notify: Notify;
}

/**
 * Owns what is playing for a match: the stream list, the current pick, the TV
 * channel fallback, and rotation to the next stream when one fails.
 */
export function useStreamPlayback({
  match,
  initialStreams,
  streamsResolved,
  broadcasts = NO_BROADCASTS,
  notify,
}: UseStreamPlaybackOptions) {
  const [initial] = useState(() =>
    deriveInitialPlayback({ initialStreams, streamsResolved, broadcasts, sources: match.sources })
  );
  const [streams, setStreams] = useState(initial.streams);
  const [currentIndex, setCurrentIndex] = useState(initial.currentIndex);
  const [selectedChannel, setSelectedChannel] = useState(initial.selectedChannel);
  const [isResolvingStreams, setIsResolvingStreams] = useState(initial.isResolving);
  const [allStreamsFailed, setAllStreamsFailed] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Indexes already tried and failed for the current stream set.
  const triedIndexesRef = useRef<Set<number>>(new Set());
  const skipInitialFetchRef = useRef(initial.skipInitialFetch);
  const sourcesRef = useRef(match.sources);
  sourcesRef.current = match.sources;
  const matchSourcesKey = sourcesKey(match.sources);

  const currentStream = currentIndex === null ? null : streams[currentIndex] ?? null;

  /**
   * Rotate to the next stream. Streams already tried are skipped so rotation
   * cannot ping-pong between two broken sources; `retry` clears the set.
   */
  const rotate = useCallback(() => {
    // Nothing to rotate through, and nothing failed: a match with no direct
    // stream is a normal state when a TV channel is carrying it.
    if (streams.length === 0) return;

    triedIndexesRef.current.add(currentIndex ?? 0);
    const next = pickNextStream(streams, triedIndexesRef.current);

    if (next) {
      setCurrentIndex(next.index);
      notify('Switched to next available stream', 'info');
    } else {
      setAllStreamsFailed(true);
      notify('All streams unavailable', 'error');
    }
  }, [streams, currentIndex, notify]);

  const retry = useCallback(() => {
    setAllStreamsFailed(false);
    triedIndexesRef.current = new Set();
    setCurrentIndex(null);
    setStreams([]);
    setFetchKey(k => k + 1);
  }, []);

  useEffect(() => {
    setAllStreamsFailed(false);
    // Indexes refer to the incoming stream list, so reset them alongside it.
    triedIndexesRef.current = new Set();

    // The server already resolved this match's streams. Later runs (a retry,
    // or a different match) do need to fetch.
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }

    const sources = sourcesRef.current;
    if (!sources?.length) {
      setIsResolvingStreams(false);
      return;
    }

    let cancelled = false;
    setIsResolvingStreams(true);

    fetchSourceStreams(sources).then(all => {
      if (cancelled) return;
      const best = selectBestStream(all);
      setStreams(all);
      setIsResolvingStreams(false);
      setCurrentIndex(best ? Math.max(0, all.indexOf(best)) : null);
    });

    return () => { cancelled = true; };
  }, [matchSourcesKey, fetchKey]);

  // With no direct stream to play, fall back to the first TV channel carrying
  // the match instead of leaving an empty player.
  useEffect(() => {
    if (isResolvingStreams || selectedChannel || currentStream) return;
    if (streams.length > 0 || broadcasts.length === 0) return;
    setSelectedChannel(broadcasts[0]);
  }, [isResolvingStreams, selectedChannel, currentStream, streams.length, broadcasts]);

  const selectStream = useCallback((index: number) => {
    setSelectedChannel(null);
    setCurrentIndex(index);
    // An explicit pick overrides an earlier failure on that stream.
    triedIndexesRef.current.delete(index);
  }, []);

  const selectChannel = useCallback((channel: BroadcastChannel) => {
    setSelectedChannel(prev => (prev?.channel === channel.channel ? null : channel));
    setAllStreamsFailed(false);
  }, []);

  return {
    streams,
    currentStream,
    currentIndex: currentStream ? currentIndex : null,
    selectedChannel,
    isResolvingStreams,
    allStreamsFailed,
    rotate,
    retry,
    selectStream,
    selectChannel,
  };
}
