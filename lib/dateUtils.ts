'use client';

import { useState, useEffect } from 'react';

/**
 * Format a date in the user's local timezone and locale.
 * Returns an empty string until mounted to avoid SSR/client hydration mismatches.
 * Consumers should add suppressHydrationWarning to the element that renders this value.
 */
export function useLocalTime(date: Date | null): string {
  const [formatted, setFormatted] = useState('');

  useEffect(() => {
    if (!date) return;
    setFormatted(
      date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    );
  }, [date]);

  return formatted;
}
