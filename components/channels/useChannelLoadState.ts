import { useCallback, useEffect, useRef, useState } from 'react';
import { CHANNEL_LOAD_TIMEOUT_MS } from '@/lib/constants';

const TICK_MS = 1000;

/**
 * Connection state of the currently selected stream: loading (with an elapsed
 * seconds counter), playing, or failed (explicit error or load timeout).
 *
 * The state restarts whenever `resetKey` changes (option switched) or `reload`
 * is called; `reloadKey` is what the caller folds into the player's React key
 * to force a fresh mount.
 */
export function useChannelLoadState(resetKey: number) {
  const [isLoading, setIsLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const timeoutRef = useRef<number>();

  useEffect(() => {
    setIsLoading(true);
    setTimedOut(false);
    setLoadingSeconds(0);
    const ticker = window.setInterval(() => setLoadingSeconds(s => s + 1), TICK_MS);
    timeoutRef.current = window.setTimeout(() => {
      clearInterval(ticker);
      setTimedOut(true);
      setIsLoading(false);
    }, CHANNEL_LOAD_TIMEOUT_MS);
    return () => {
      clearInterval(ticker);
      clearTimeout(timeoutRef.current);
    };
  }, [resetKey, reloadKey]);

  const settle = useCallback((failed: boolean) => {
    clearTimeout(timeoutRef.current);
    setIsLoading(false);
    setTimedOut(failed);
  }, []);

  const markPlaying = useCallback(() => settle(false), [settle]);
  const markFailed = useCallback(() => settle(true), [settle]);
  const reload = useCallback(() => setReloadKey(key => key + 1), []);

  return { isLoading, timedOut, loadingSeconds, reloadKey, markPlaying, markFailed, reload };
}
