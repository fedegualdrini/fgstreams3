import type { Stream, StreamStatus } from '@/types/api';
import { streamHealthMonitor, streamKeyFor } from './streamHealth';

const STATUS_PRIORITY: Record<StreamStatus, number> = {
  working: 0,
  unstable: 1,
  unknown: 2,
  offline: 3,
};

const QUALITY_ORDER = ['hd', '720p', '1080p', 'sd', '480p', '360p'];

/** Resolves a stream's observed health. Injectable so ranking stays unit-testable. */
export type StatusResolver = (stream: Stream) => StreamStatus;

const defaultResolver: StatusResolver = (stream) =>
  streamHealthMonitor.getStatus(streamKeyFor(stream)).status;

/**
 * Rank streams by observed health, then English language, then quality, and
 * return the best one. Streams are keyed by URL (see `streamKeyFor`), so the
 * same embed is scored identically wherever it appears.
 */
export function selectBestStream(
  streams: Stream[],
  getStatus: StatusResolver = defaultResolver
): Stream | null {
  if (!streams || streams.length === 0) return null;

  const ranked = streams
    .map((stream, index) => ({ stream, index, status: getStatus(stream) }))
    .sort((a, b) => {
      const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (statusDiff !== 0) return statusDiff;

      const aLang = (a.stream.language ?? '').toLowerCase();
      const bLang = (b.stream.language ?? '').toLowerCase();
      if (aLang === 'en' && bLang !== 'en') return -1;
      if (bLang === 'en' && aLang !== 'en') return 1;

      const aQuality = QUALITY_ORDER.findIndex(q => (a.stream.quality ?? '').toLowerCase().includes(q));
      const bQuality = QUALITY_ORDER.findIndex(q => (b.stream.quality ?? '').toLowerCase().includes(q));
      if (aQuality !== -1 && bQuality !== -1 && aQuality !== bQuality) return aQuality - bQuality;
      if (aQuality !== -1 && bQuality === -1) return -1;
      if (bQuality !== -1 && aQuality === -1) return 1;

      // Stable order for otherwise-equal streams.
      return a.index - b.index;
    });

  // Returns the original object, so callers can match by identity.
  return ranked[0]?.stream ?? streams[0];
}
