import type { StreamStatus, StreamHealth } from '@/types/api';
import {
  HEALTH_OFFLINE_ERROR_THRESHOLD,
  HEALTH_ENTRY_TTL_MS,
  HEALTH_MAX_ENTRIES,
} from './constants';

const STORAGE_KEY = 'fg-stream-health-v1';
const WRITE_DEBOUNCE_MS = 500;

export type HealthSnapshot = Readonly<Record<string, StreamHealth>>;

/** Reason a stream was reported as failed. Recorded for debugging, not for ranking. */
export type FailureReason = 'timeout' | 'error' | 'fatal' | 'skipped' | 'no-url';

const EMPTY_SNAPSHOT: HealthSnapshot = Object.freeze({});

/**
 * Derive a stable key from a stream URL.
 *
 * Uses `origin + pathname` so that URLs which only differ by rotating auth tokens
 * (`?ip=…&token=…`) collapse onto one entry. Falls back to the trimmed raw string
 * for values that are not parseable URLs.
 */
export function healthKey(url: string | undefined | null): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    return raw.toLowerCase();
  }
}

/** Key for a stream object, preferring the URL actually handed to the player. */
export function streamKeyFor(
  stream: { url?: string; embedUrl?: string } | null | undefined
): string {
  if (!stream) return '';
  return healthKey(stream.embedUrl || stream.url);
}

function blankEntry(streamId: string, now: number): StreamHealth {
  return {
    streamId,
    status: 'unknown',
    lastChecked: now,
    firstSeen: now,
    sustained: false,
    errorCount: 0,
  };
}

class StreamHealthStore {
  private entries = new Map<string, StreamHealth>();
  private listeners = new Set<() => void>();
  private snapshot: HealthSnapshot = EMPTY_SNAPSHOT;
  private snapshotStale = false;
  private hydrated = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  // ── persistence ────────────────────────────────────────────────────────────

  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const now = Date.now();
      for (const item of parsed) {
        const entry = item as Partial<StreamHealth>;
        if (typeof entry?.streamId !== 'string' || !entry.streamId) continue;
        if (typeof entry.lastChecked !== 'number') continue;
        if (now - entry.lastChecked > HEALTH_ENTRY_TTL_MS) continue;
        this.entries.set(entry.streamId, {
          streamId: entry.streamId,
          status: (entry.status ?? 'unknown') as StreamStatus,
          lastChecked: entry.lastChecked,
          firstSeen: typeof entry.firstSeen === 'number' ? entry.firstSeen : entry.lastChecked,
          lastWorkingTime: typeof entry.lastWorkingTime === 'number' ? entry.lastWorkingTime : undefined,
          sustained: entry.sustained === true,
          errorCount: typeof entry.errorCount === 'number' ? entry.errorCount : 0,
        });
      }
      this.snapshotStale = true;
    } catch {
      /* corrupt or unavailable storage — continue in memory only */
    }
  }

  private schedulePersist(): void {
    if (typeof window === 'undefined') return;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...this.entries.values()]));
      } catch {
        /* quota exceeded or private mode — in-memory state still works */
      }
    }, WRITE_DEBOUNCE_MS);
  }

  /** Drop expired entries, then evict oldest until under the size cap. */
  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastChecked > HEALTH_ENTRY_TTL_MS) this.entries.delete(key);
    }
    if (this.entries.size <= HEALTH_MAX_ENTRIES) return;
    const byAge = [...this.entries.values()].sort((a, b) => a.lastChecked - b.lastChecked);
    const excess = this.entries.size - HEALTH_MAX_ENTRIES;
    for (let i = 0; i < excess; i++) this.entries.delete(byAge[i].streamId);
  }

  // ── subscription ───────────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /**
   * Returns a cached, frozen snapshot. The reference is stable between mutations,
   * which `useSyncExternalStore` requires to avoid an infinite render loop.
   */
  getSnapshot = (): HealthSnapshot => {
    this.hydrate();
    if (this.snapshotStale || this.snapshot === EMPTY_SNAPSHOT) {
      const now = Date.now();
      const next: Record<string, StreamHealth> = {};
      for (const [key, entry] of this.entries) {
        if (now - entry.lastChecked > HEALTH_ENTRY_TTL_MS) continue;
        next[key] = entry;
      }
      this.snapshot = Object.freeze(next);
      this.snapshotStale = false;
    }
    return this.snapshot;
  };

  /** Server render has no observed health — always the same frozen empty object. */
  getServerSnapshot = (): HealthSnapshot => EMPTY_SNAPSHOT;

  private commit(entry: StreamHealth): void {
    this.entries.set(entry.streamId, entry);
    this.prune(entry.lastChecked);
    this.snapshotStale = true;
    this.schedulePersist();
    for (const listener of this.listeners) listener();
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  getStatus(streamId: string): StreamHealth {
    this.hydrate();
    const now = Date.now();
    const existing = streamId ? this.entries.get(streamId) : undefined;
    if (!existing || now - existing.lastChecked > HEALTH_ENTRY_TTL_MS) {
      return blankEntry(streamId, now);
    }
    return existing;
  }

  // ── observed-playback events ───────────────────────────────────────────────

  /**
   * The embed document or HLS manifest loaded. That proves reachability, not
   * playback, so it only reaches `unstable` — `reportSustained` promotes it.
   */
  reportLoaded(streamId: string): void {
    if (!streamId) return;
    const now = Date.now();
    const existing = this.getStatus(streamId);
    this.commit({
      ...existing,
      status: existing.status === 'working' ? 'working' : 'unstable',
      lastChecked: now,
    });
  }

  /** Playback held past the dwell threshold — the only path to `working`. */
  reportSustained(streamId: string): void {
    if (!streamId) return;
    const now = Date.now();
    const existing = this.getStatus(streamId);
    this.commit({
      ...existing,
      status: 'working',
      lastChecked: now,
      lastWorkingTime: now,
      sustained: true,
      errorCount: 0,
    });
  }

  /** Recovered from a non-fatal player error — playing, but not cleanly. */
  reportDegraded(streamId: string): void {
    if (!streamId) return;
    const now = Date.now();
    const existing = this.getStatus(streamId);
    this.commit({ ...existing, status: 'unstable', lastChecked: now });
  }

  /**
   * Load timeout, player error, fatal HLS error, or the user skipping away.
   * One failure is `unstable`; `HEALTH_OFFLINE_ERROR_THRESHOLD` makes it `offline`.
   */
  reportFailed(streamId: string, _reason: FailureReason = 'error'): void {
    if (!streamId) return;
    const now = Date.now();
    const existing = this.getStatus(streamId);
    const errorCount = existing.errorCount + 1;
    this.commit({
      ...existing,
      status: errorCount >= HEALTH_OFFLINE_ERROR_THRESHOLD ? 'offline' : 'unstable',
      lastChecked: now,
      errorCount,
    });
  }

  clearAllEntries(): void {
    this.entries.clear();
    this.snapshot = EMPTY_SNAPSHOT;
    this.snapshotStale = false;
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    for (const listener of this.listeners) listener();
  }
}

export const streamHealthMonitor = new StreamHealthStore();
