'use client';

import { useState, useEffect } from 'react';

/**
 * Format a date in the user's local timezone and locale.
 * Returns null until mounted on the client to avoid hydration mismatches.
 */
export function useLocalTime(date: Date | null): string | null {
  const [formatted, setFormatted] = useState<string | null>(null);

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
