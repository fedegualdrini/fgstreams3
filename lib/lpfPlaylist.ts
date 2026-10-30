import type { ChannelOptionStatus } from '../types/channels';
import { isLpfCdnUrl } from './lpfUrls';

const MAX_PLAYLIST_BYTES = 256 * 1024;
const MAX_PLAYLIST_REQUESTS = 4;
const MAX_PLAYLIST_LINES = 8192;

async function readPlaylist(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_PLAYLIST_BYTES) {
        await reader.cancel();
        throw new Error('LPF playlist exceeds the size limit.');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/** Classify the HLS media timeline, not whether the video contains an ongoing game. */
export async function inspectLpfPlaylist(
  url: string,
  fetchPlaylist: (url: string) => Promise<Response>,
  now = Date.now(),
): Promise<ChannelOptionStatus> {
  const visited = new Set<string>();
  try {
    for (let request = 0; request < MAX_PLAYLIST_REQUESTS; request++) {
      if (!isLpfCdnUrl(url)) return 'unavailable';
      const destination = new URL(url);
      destination.hash = '';
      url = destination.href;
      if (visited.has(url)) return 'unavailable';
      visited.add(url);

      const response = await fetchPlaylist(url);
      if (!response.ok) {
        await response.body?.cancel();
        return 'unavailable';
      }
      // The injected transport validates redirects before following them. Use the
      // final URL as the base for relative variants, and reject redirect cycles.
      const base = new URL(response.url || url);
      base.hash = '';
      if (!isLpfCdnUrl(base.href) || (base.href !== url && visited.has(base.href))) {
        await response.body?.cancel();
        return 'unavailable';
      }
      visited.add(base.href);
      const text = await readPlaylist(response);
      const lines = text.trim().split(/\r?\n/);
      if (lines.length > MAX_PLAYLIST_LINES || lines[0] !== '#EXTM3U') return 'unavailable';

      let variant: string | undefined;
      let awaitingVariant = false;
      let duration: number | undefined;
      let targetDuration: number | undefined;
      let timeline: number | undefined;
      let lastMediaEnd: number | undefined;
      let invalidTimestamp = false;
      let latestTimestamp = -Infinity;
      let segments = 0;
      let ended = false;

      for (let index = 1; index < lines.length; index++) {
        const line = lines[index].trim();
        if (!line) continue;
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          if (awaitingVariant || duration !== undefined || !line.slice(18).trim()) return 'unavailable';
          awaitingVariant = true;
        } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
          const value = line.slice(22);
          if (!/^\d+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) return 'unavailable';
          targetDuration = Number(value);
        } else if (line.startsWith('#EXTINF:')) {
          const value = line.slice(8).split(',')[0];
          if (duration !== undefined || awaitingVariant || !/^\d+(?:\.\d+)?$/.test(value)) return 'unavailable';
          duration = Number(value);
          if (!Number.isFinite(duration) || duration <= 0) return 'unavailable';
        } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
          const value = line.slice(25);
          // A timezone is mandatory; +0000 is used by the provider in addition to Z.
          const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
            ? Date.parse(value) : NaN;
          if (Number.isFinite(timestamp)) {
            timeline = timestamp;
          } else {
            timeline = undefined;
            invalidTimestamp = true;
          }
        } else if (line === '#EXT-X-DISCONTINUITY') {
          // Do not extrapolate a clock through a discontinuity without a new anchor.
          timeline = undefined;
        } else if (line === '#EXT-X-ENDLIST') {
          ended = true;
        } else if (!line.startsWith('#')) {
          if (awaitingVariant) {
            const resolved = new URL(line, base).href;
            if (!isLpfCdnUrl(resolved)) return 'unavailable';
            variant ??= resolved;
            awaitingVariant = false;
          } else {
            if (duration === undefined) return 'unavailable';
            // Segment URIs are syntax-checked only, never requested.
            const segmentUrl = new URL(line, base);
            if (segmentUrl.protocol !== 'https:' && segmentUrl.protocol !== 'http:') return 'unavailable';
            if (timeline !== undefined) {
              latestTimestamp = Math.max(latestTimestamp, timeline);
              timeline += duration * 1000;
            }
            lastMediaEnd = timeline;
            duration = undefined;
            segments++;
          }
        }
      }

      if (awaitingVariant || duration !== undefined) return 'unavailable';
      if (variant) {
        if (segments || targetDuration !== undefined || ended) return 'unavailable';
        url = variant;
        continue;
      }
      if (!segments || targetDuration === undefined) return 'unavailable';
      if (ended) return 'ended';
      if (invalidTimestamp || lastMediaEnd === undefined || !Number.isFinite(lastMediaEnd) || !Number.isFinite(now)) return 'unknown';
      const staleAfter = Math.max(120_000, 3 * targetDuration * 1000);
      if (latestTimestamp > now + 120_000 || lastMediaEnd > now + staleAfter) return 'unknown';
      return now - lastMediaEnd > staleAfter ? 'ended' : 'live';
    }
  } catch {
    return 'unavailable';
  }
  return 'unavailable';
}
