'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LpfChannelSnapshot } from '@/types/channels';
import { LPF_REFRESH_INTERVAL_MS } from '@/lib/lpfUrls';

/** Refresh the numbered LPF sources without changing the user's channel or option. */
export function useLpfChannel(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<LpfChannelSnapshot>();
  const [error, setError] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let inFlight = false;

    async function refreshLinks(force = false) {
      if (controller.signal.aborted || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      setIsRefreshing(true);
      try {
        const response = await fetch('/api/channels/lpf', {
          method: force ? 'POST' : 'GET', signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error('LPF refresh failed');
        const next = await response.json() as LpfChannelSnapshot;
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setError(next.error);
      } catch {
        if (controller.signal.aborted) return;
        setError('Could not refresh LPF links. Please try again.');
        // An old destination may still play, but its previous live status is no longer confirmed.
        setSnapshot(previous => previous && ({
          ...previous,
          channel: {
            ...previous.channel,
            options: previous.channel.options.map(option => option.status === 'live'
              ? { ...option, status: 'unknown' }
              : option),
          },
        }));
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setIsRefreshing(false);
      }
    }

    refreshRef.current = () => { void refreshLinks(true); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshLinks();
    };
    void refreshLinks();
    const interval = window.setInterval(refreshLinks, LPF_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      refreshRef.current = () => {};
    };
  }, [enabled]);

  return { snapshot, error, isRefreshing, refresh };
}
