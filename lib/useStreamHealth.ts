'use client';

import { useSyncExternalStore } from 'react';
import type { StreamHealth } from '@/types/api';
import { streamHealthMonitor, type HealthSnapshot } from './streamHealth';

/**
 * Subscribe to the whole health map. Use when rendering a list of streams —
 * one subscription covers every row.
 */
export function useStreamHealthMap(): HealthSnapshot {
  return useSyncExternalStore(
    streamHealthMonitor.subscribe,
    streamHealthMonitor.getSnapshot,
    streamHealthMonitor.getServerSnapshot
  );
}

/** Subscribe to a single stream's health by its URL-derived key. */
export function useStreamHealth(streamId: string): StreamHealth {
  const snapshot = useStreamHealthMap();
  return snapshot[streamId] ?? {
    streamId,
    status: 'unknown',
    lastChecked: 0,
    firstSeen: 0,
    sustained: false,
    errorCount: 0,
  };
}
