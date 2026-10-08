import { useEffect, useRef } from 'react';

/**
 * Latest `onPlaying`/`onError` handlers as refs, so a long-lived player
 * instance (created in an effect keyed on the stream) never calls stale ones
 * and never has to be rebuilt when the parent re-renders.
 */
export function usePlayerCallbacks(onPlaying: () => void, onError: () => void) {
  const onPlayingRef = useRef(onPlaying);
  const onErrorRef = useRef(onError);

  useEffect(() => { onPlayingRef.current = onPlaying; }, [onPlaying]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  return { onPlayingRef, onErrorRef };
}
