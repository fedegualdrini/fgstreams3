// Raw shape returned by streamed.pk API — normalized before use
export interface RawStream {
  url?: string;
  embedUrl?: string;
  language?: string;
  hd?: boolean;
  quality?: string;
  source?: string;
}

export interface RawMatch {
  id?: string;
  title?: string;
  category?: string;
  date?: number | string;
  time?: string;
  teams?: { home?: { name?: string; badge?: string }; away?: { name?: string; badge?: string } };
  sources?: Array<{ source: string; id: string }>;
  poster?: string;
  sport?: string;
  league?: string;
  tournament?: string;
  competition?: string;
  team1?: string;
  team2?: string;
  startTime?: string;
  start_time?: string;
  isLive?: boolean;
  is_live?: boolean;
  live?: boolean;
  image1?: string;
  image2?: string;
  homeImage?: string;
  awayImage?: string;
  team1Image?: string;
  team2Image?: string;
  posterImage?: string;
  posterUrl?: string;
}

export interface ApiError {
  status: number;
  message: string;
  url: string;
}

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
