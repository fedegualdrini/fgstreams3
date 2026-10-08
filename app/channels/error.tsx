'use client';

import ErrorPanel from '@/components/ErrorPanel';

export default function ChannelsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorPanel
      title="Failed to load channels"
      fallbackMessage="Could not load the channels list. Please try again."
      error={error}
      onRetry={reset}
    />
  );
}
