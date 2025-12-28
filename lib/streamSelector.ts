import { Stream } from '@/types/api';
import { streamHealthMonitor } from './streamHealth';
import { StreamStatus } from '@/types/api';

interface StreamWithHealth extends Stream {
  id: string;
  healthStatus: StreamStatus;
}

export function selectBestStream(streams: Stream[]): Stream | null {
  if (!streams || streams.length === 0) return null;

  // Map streams with health status
  const streamsWithHealth: StreamWithHealth[] = streams.map((stream, index) => ({
    ...stream,
    id: `${stream.source || 'unknown'}-${index}`,
    healthStatus: streamHealthMonitor.getStatus(`${stream.source || 'unknown'}-${index}`).status,
  }));

  // Sort by priority:
  // 1. Working streams first
  // 2. Then by preferred language (English > others)
  // 3. Then by quality (HD > SD > others)
  // 4. Finally by source reliability

  const statusPriority: Record<StreamStatus, number> = {
    working: 0,
    unstable: 1,
    unknown: 2,
    offline: 3,
  };

  streamsWithHealth.sort((a, b) => {
    // First sort by health status
    const statusDiff = statusPriority[a.healthStatus] - statusPriority[b.healthStatus];
    if (statusDiff !== 0) return statusDiff;

    // Then by language (prefer English)
    const aLang = a.language?.toLowerCase() || '';
    const bLang = b.language?.toLowerCase() || '';
    if (aLang === 'en' && bLang !== 'en') return -1;
    if (bLang === 'en' && aLang !== 'en') return 1;

    // Then by quality
    const aQuality = a.quality?.toLowerCase() || '';
    const bQuality = b.quality?.toLowerCase() || '';
    const qualityOrder = ['hd', '720p', '1080p', 'sd', '480p', '360p'];
    const aQualityIndex = qualityOrder.findIndex(q => aQuality.includes(q));
    const bQualityIndex = qualityOrder.findIndex(q => bQuality.includes(q));
    if (aQualityIndex !== -1 && bQualityIndex !== -1) {
      return aQualityIndex - bQualityIndex;
    }
    if (aQualityIndex !== -1) return -1;
    if (bQualityIndex !== -1) return 1;

    return 0;
  });

  return streamsWithHealth[0] || streams[0];
}
