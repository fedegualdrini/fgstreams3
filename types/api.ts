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

// Flashscore live score entry (one row from #score-data)
export interface FlashscoreEntry {
  flashscoreId: string;
  league: string;
  team1: string;
  team2: string;
  score: string | null;  // e.g. "2:1", null if match not started ("-:-")
  status: string;        // "live" | "fin" | "sched"
  minute: string;        // "25'" | "4th Quarter" | "FT" | ""
}

// Individual match event (goal, card, substitution)
export interface FlashscoreEvent {
  minute: string;
  type: 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'other';
  team: 'home' | 'away' | 'unknown';
  player: string;
}

// One row in the match statistics table (e.g. Ball Possession, Shots on Goal)
export interface FlashscoreStat {
  label: string;
  home: string;    // display value, e.g. "58%"
  away: string;
  homePct: number; // 0–100 for the bar width
  awayPct: number;
}

// A single player in a lineup (starters or substitutes)
export interface FlashscorePlayer {
  number: string;
  name: string;
}

// Lineups for both teams
export interface FlashscoreLineups {
  homeTeam: string;
  awayTeam: string;
  homePlayers: FlashscorePlayer[];
  awayPlayers: FlashscorePlayer[];
  homeSubs: FlashscorePlayer[];
  awaySubs: FlashscorePlayer[];
}

// Full match detail from the match detail page
export interface FlashscoreDetail {
  flashscoreId: string;
  score: string | null;
  status: string;   // "live" | "fin" | "sched"
  minute: string;
  periods: string;  // e.g. "(1:0, 1:1)"
  events: FlashscoreEvent[];
  stats: FlashscoreStat[];
  lineups: FlashscoreLineups | null;
}

export interface StreamHealth {
  streamId: string;
  status: StreamStatus;
  lastChecked: number;
  lastWorkingTime?: number;
  errorCount: number;
}
