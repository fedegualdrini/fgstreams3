import type { Stream } from '@/types/api';

export const STREAMFREE_SOURCE = 'strmfree';

/** Keep upstream live order, then append standby variants without duplicates. */
export function toStreamFreeSources(data: { sources: string[]; live_sources: string[] }): Stream[] {
  const live = new Set(data.live_sources);
  const urls = new Set([...data.live_sources, ...data.sources]);
  return Array.from(urls, url => {
    const quality = url.match(/(\d{3,4}p)\d*(?:[?#].*)?$/i)?.[1];
    return {
      url,
      embedUrl: url,
      source: STREAMFREE_SOURCE,
      isLive: live.has(url),
      ...(quality ? { quality: quality.toLowerCase() } : {}),
    };
  });
}
