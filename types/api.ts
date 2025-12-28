// API Types based on Streamed API

export interface MatchSource {
  source: string;
  id: string;
}

export interface Match {
  id: string;
  sport: string;
  league: string;
  team1: string;
  team2: string;
  startTime?: string;
  isLive?: boolean;
  sources: MatchSource[];
  image1?: string;
  image2?: string;
  poster?: string;
}

export interface Stream {
  url: string;
  language?: string;
  quality?: string;
  source?: string;
  embedUrl?: string;
}

export interface Sport {
  id: string;
  name: string;
  slug: string;
}

export type StreamStatus = 'working' | 'unstable' | 'offline' | 'unknown';

export interface StreamHealth {
  streamId: string;
  status: StreamStatus;
  lastChecked: number;
  lastWorkingTime?: number;
  errorCount: number;
}
