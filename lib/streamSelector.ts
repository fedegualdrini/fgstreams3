import type { Stream } from '@/types/api';

const QUALITY_ORDER = ['hd', '720p', '1080p', 'sd', '480p', '360p'];

/**
 * Pick the preferred stream: English first, then best quality, then original
 * order. Playback failures are handled by rotating to the next stream in
 * MatchDetailClient rather than by scoring streams up front.
 */
export function selectBestStream(streams: Stream[]): Stream | null {
  if (!streams || streams.length === 0) return null;

  const ranked = streams
    .map((stream, index) => ({ stream, index }))
    .sort((a, b) => {
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
