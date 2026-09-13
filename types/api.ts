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
  // null for non-team events (races, fight cards).
  teams?: {
    home?: { name?: string; badge?: string } | null;
    away?: { name?: string; badge?: string } | null;
  } | null;
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
  slug?: string;
}

// Flashscore live score entry (one row from #score-data)
export interface FlashscoreEntry {
  flashscoreId: string;
  league: string;
  team1: string;
  team2: string;
  score: string | null;  // e.g. "2:1", null if match not started ("-:-")
  status: 'live' | 'fin' | 'sched';
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
  status: 'live' | 'fin' | 'sched';
  minute: string;
  periods: string;  // e.g. "(1:0, 1:1)"
  events: FlashscoreEvent[];
  stats: FlashscoreStat[];
  lineups: FlashscoreLineups | null;
}

// ─── Broadcast (Promiedos → local channel catalog) ───────────────────────────

// A fixture as published by promiedos.com.ar, reduced to what we need to match
// it against a Streamed match and resolve its broadcaster.
export interface PromiedosGame {
  id: string;
  league: string;
  leagueId: string;
  countryId: string;
  homeTeam: string;
  awayTeam: string;
  // Kickoff in epoch ms against a nominal UTC-3. Promiedos localises times to
  // the requesting IP, so any constant error here is corrected by
  // estimateFeedOffsetMs rather than assumed away.
  startTimeMs: number;
  networks: string[];
}

// A channel from public/channels.json that is carrying a given match.
export interface BroadcastChannel {
  // Display name of the broadcaster as Promiedos names it.
  network: string;
  // Name of the matching entry in the local channel catalog.
  channel: string;
  logo: string;
  options: Array<{ name: string; iframe: string }>;
}

// A listable match together with everything needed to watch it. Built by
// lib/catalog.ts; kept here so client components can type it without importing
// server-only modules.
export interface CatalogMatch extends Match {
  streams: Stream[];
  broadcasts: BroadcastChannel[];
  // Whether the upstream live feed listed this match when the catalog was built.
  liveHint: boolean;
}

// ─── angulismotv feed ────────────────────────────────────────────────────────

// A fixture from the angulismo feed, already paired with the channels carrying
// it and the iframe URLs that play them.
export interface AngulismoEvent {
  id: string;
  title: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  // Kickoff in epoch ms. The feed is a static file, so its Argentina-local
  // times mean the same thing to every caller.
  startTimeMs: number;
  channels: import('./channels').Channel[];
}

export interface AngulismoSnapshot {
  events: AngulismoEvent[];
  channels: import('./channels').Channel[];
  /** Whether the lookup succeeded; false means "unknown", not "nothing there". */
  ok: boolean;
  /** True when the data came from the last good lookup rather than this one. */
  stale: boolean;
}
