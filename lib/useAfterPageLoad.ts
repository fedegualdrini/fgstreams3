import { useEffect, useState } from 'react';

/** Longest wait for the window `load` event before gated content mounts anyway. */
const FALLBACK_DELAY_MS = 3000;

/**
 * True once the page's own resources have finished loading.
 *
 * Third-party embeds (stream iframes pull in ads, trackers and a video stack of
 * their own) compete with the page for bandwidth and the main thread. Gating
 * them on this keeps them from delaying first paint and LCP; a soft navigation
 * inside the app, where the document is already loaded, mounts them at once.
 */
export function useAfterPageLoad(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (document.readyState === 'complete') {
      setReady(true);
      return;
    }

    const markReady = () => setReady(true);
    window.addEventListener('load', markReady, { once: true });
    const fallback = window.setTimeout(markReady, FALLBACK_DELAY_MS);

    return () => {
      window.removeEventListener('load', markReady);
      window.clearTimeout(fallback);
    };
  }, []);

  return ready;
}
