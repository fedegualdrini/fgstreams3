'use client';

import ErrorPanel from '@/components/ErrorPanel';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorPanel
      title="Something went wrong"
      fallbackMessage="An unexpected error occurred. Please try again."
      error={error}
      onRetry={reset}
    />
  );
}
