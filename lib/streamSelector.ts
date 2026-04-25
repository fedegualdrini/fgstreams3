import type { Stream, StreamStatus } from '@/types/api';
import { streamHealthMonitor } from './streamHealth';

interface StreamWithHealth extends Stream {
  id: string;
  healthStatus: StreamStatus;
}

export function selectBestStream(streams: Stream[]): Stream | null {
  if (!streams || streams.length === 0) return null;

  const streamsWithHealth: StreamWithHealth[] = streams.map((stream, index) => {
    // Use hostname as a fallback key to reduce ID collisions when source is absent.
    const urlKey = stream.url || stream.embedUrl || '';
    let sourceKey = stream.source;
    if (!sourceKey && urlKey) {
      try { sourceKey = new URL(urlKey).hostname; } catch { /* invalid URL */ }
    }
    const id = `${sourceKey || 'unknown'}-${index}`;
    return {
      ...stream,
      id,
      healthStatus: streamHealthMonitor.getStatus(id).status,
    };
  });

  const statusPriority: Record<StreamStatus, number> = {
    working: 0,
    unstable: 1,
    unknown: 2,
    offline: 3,
  };

  streamsWithHealth.sort((a, b) => {
    const statusDiff = statusPriority[a.healthStatus] - statusPriority[b.healthStatus];
    if (statusDiff !== 0) return statusDiff;

    const aLang = (a.language ?? '').toLowerCase();
    const bLang = (b.language ?? '').toLowerCase();
    if (aLang === 'en' && bLang !== 'en') return -1;
    if (bLang === 'en' && aLang !== 'en') return 1;

    const aQuality = (a.quality ?? '').toLowerCase();
    const bQuality = (b.quality ?? '').toLowerCase();
    const qualityOrder = ['hd', '720p', '1080p', 'sd', '480p', '360p'];
    const aQualityIndex = qualityOrder.findIndex(q => aQuality.includes(q));
    const bQualityIndex = qualityOrder.findIndex(q => bQuality.includes(q));
    if (aQualityIndex !== -1 && bQualityIndex !== -1) return aQualityIndex - bQualityIndex;
    if (aQualityIndex !== -1) return -1;
    if (bQualityIndex !== -1) return 1;
    return 0;
  });

  return streamsWithHealth[0] ?? streams[0];
}
