export const LPF_SAVED_LINK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface LpfActiveCacheRecord {
  kind: 'active';
  url: string;
  /** Start of the authoritative lookup, used to reject older writers. */
  observedAt: number;
  resolvedAt: number;
  verifiedAt: number;
}

export interface LpfRetiredCacheRecord {
  kind: 'retired';
  observedAt: number;
  reason: 'empty' | 'ended' | 'replaced' | 'expired';
}

export type LpfCacheRecord = LpfActiveCacheRecord | LpfRetiredCacheRecord;

export interface LpfCacheSnapshot {
  version: 1;
  /** Canonical option numbers 1–18; never arbitrary URLs as object keys. */
  options: Record<string, LpfCacheRecord>;
}

export interface LpfCacheUpdate {
  option: number;
  record: LpfCacheRecord;
  /** Saved-link checks may update only the exact record they inspected. */
  expected?: { observedAt: number; url: string };
}
