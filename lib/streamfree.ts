import type { RawMatch, Stream } from '@/types/api';

export const STREAMFREE_SOURCE = 'strmfree';

/** Keep upstream live order, then append standby variants without duplicates. */
export function toStreamFreeSources(data: Pick<RawMatch, 'sources'>): Stream[] {
  const seen = new Set<string>();
  const streams: Stream[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const isLive = pass === 0;
    for (const source of data.sources) {
      if (source.live !== isLive || seen.has(source.url)) continue;
      seen.add(source.url);
      const quality = (source.url.match(/(\d{3,4}p)\d*(?:[?#].*)?$/i)?.[1] ?? source.quality).toLowerCase();
      streams.push({
        url: source.url,
        embedUrl: source.url,
        source: STREAMFREE_SOURCE,
        isLive,
        ...(quality ? { quality } : {}),
      });
    }
  }
  return streams;
}
