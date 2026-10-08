'use client';

import ErrorPanel from '@/components/ErrorPanel';

export default function MoviesError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorPanel
      title="Failed to load movies"
      fallbackMessage="Something went wrong. Please try again."
      error={error}
      onRetry={reset}
    />
  );
}
