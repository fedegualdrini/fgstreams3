import type { Stream } from '@/types/api';

const QUALITY_ORDER = ['hd', '720p', '1080p', 'sd', '480p', '360p'];

const isEnglish = (stream: Stream): boolean => (stream.language ?? '').toLowerCase() === 'en';

/** Position in QUALITY_ORDER; unrecognised qualities rank after every known one. */
function qualityRank(stream: Stream): number {
  const quality = (stream.quality ?? '').toLowerCase();
  const index = QUALITY_ORDER.findIndex(known => quality.includes(known));
  return index === -1 ? QUALITY_ORDER.length : index;
}

/**
 * Pick the preferred stream: English first, then best quality, then original
 * order. Playback failures are handled by rotating to the next stream in
 * MatchDetailClient rather than by scoring streams up front.
 */
export function selectBestStream(streams: Stream[]): Stream | null {
  if (!streams || streams.length === 0) return null;

  const ranked = streams
    .map((stream, index) => ({ stream, index }))
    .sort((a, b) =>
      Number(isEnglish(b.stream)) - Number(isEnglish(a.stream)) ||
      qualityRank(a.stream) - qualityRank(b.stream) ||
      // Stable order for otherwise-equal streams.
      a.index - b.index,
    );

  // Returns the original object, so callers can match by identity.
  return ranked[0]?.stream ?? streams[0];
}
