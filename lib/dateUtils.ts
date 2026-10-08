'use client';

import { useState, useEffect } from 'react';

const LOCAL_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

/**
 * Format a date in the user's local timezone and locale.
 * Returns an empty string until mounted to avoid SSR/client hydration mismatches.
 * Consumers should add suppressHydrationWarning to the element that renders this value.
 */
export function useLocalTime(date: Date | null): string {
  const [formatted, setFormatted] = useState('');
  // Depend on the instant, not the Date object: callers usually build a new
  // Date every render.
  const timestamp = date?.getTime();

  useEffect(() => {
    if (timestamp === undefined) return;
    setFormatted(new Date(timestamp).toLocaleString(undefined, LOCAL_TIME_FORMAT));
  }, [timestamp]);

  return formatted;
}
