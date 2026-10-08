'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const COPIED_FEEDBACK_MS = 2000;

/**
 * Shares the current page through the native share sheet, or copies the link
 * when the browser has none. `copied` is true briefly after a copy.
 */
export function useShare(title: string, onCopied: () => void) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimerRef.current), []);

  const share = useCallback(async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      resetTimerRef.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
      onCopied();
    } catch {
      // The user cancelled the share sheet, or the browser blocked clipboard access.
    }
  }, [title, onCopied]);

  return { copied, share };
}
