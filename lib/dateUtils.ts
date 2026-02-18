/**
 * Format a date for match display in the user's local timezone.
 * Only call this from client components to avoid SSR/hydration mismatches.
 */
export function formatMatchDate(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
