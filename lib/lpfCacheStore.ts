import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import type { Store } from '@netlify/blobs';
import type { LpfCacheRecord, LpfCacheSnapshot, LpfCacheUpdate } from './lpfCacheTypes';
import { isLpfCdnUrl, LPF_OPTION_COUNT } from './lpfUrls';

const MAX_BYTES = 64 * 1024;
const OPERATION_TIMEOUT_MS = 6_000;
const MAX_ATTEMPTS = 3;
const UNAVAILABLE = 'LPF saved-link storage is unavailable.';

interface VersionedCacheSnapshot {
  snapshot: LpfCacheSnapshot;
  etag?: string;
}

function invalid(): never {
  throw new Error('LPF saved-link storage contains invalid data.');
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    && value <= Date.now() + 120_000;
}

function safeUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048 && isLpfCdnUrl(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validateRecord(value: unknown): LpfCacheRecord {
  if (!object(value) || !timestamp(value.observedAt)) invalid();
  if (value.kind === 'active' && exactKeys(value, ['kind', 'url', 'observedAt', 'resolvedAt', 'verifiedAt'])
    && safeUrl(value.url) && timestamp(value.resolvedAt) && timestamp(value.verifiedAt)) {
    return {
      kind: 'active', url: value.url, observedAt: value.observedAt,
      resolvedAt: value.resolvedAt, verifiedAt: value.verifiedAt,
    };
  }
  if (value.kind === 'retired' && exactKeys(value, ['kind', 'observedAt', 'reason'])
    && (value.reason === 'empty' || value.reason === 'ended' || value.reason === 'replaced' || value.reason === 'expired')) {
    return { kind: 'retired', observedAt: value.observedAt, reason: value.reason };
  }
  return invalid();
}

function validateSnapshot(value: unknown): LpfCacheSnapshot {
  if (!object(value) || !exactKeys(value, ['version', 'options']) || value.version !== 1 || !object(value.options)) invalid();
  const options: LpfCacheSnapshot['options'] = {};
  for (const [key, record] of Object.entries(value.options)) {
    const option = Number(key);
    if (!Number.isInteger(option) || option < 1 || option > LPF_OPTION_COUNT || String(option) !== key) invalid();
    options[key] = validateRecord(record);
  }
  return { version: 1, options };
}

function validateUpdates(updates: readonly LpfCacheUpdate[]): LpfCacheUpdate[] {
  if (!Array.isArray(updates)) invalid();
  return updates.map(update => {
    if (!object(update) || typeof update.option !== 'number'
      || !Number.isInteger(update.option) || update.option < 1 || update.option > LPF_OPTION_COUNT) invalid();
    const record = validateRecord(update.record);
    if (update.expected === undefined) return { option: update.option, record };
    if (!object(update.expected) || !exactKeys(update.expected, ['observedAt', 'url'])
      || !timestamp(update.expected.observedAt) || !safeUrl(update.expected.url)) invalid();
    // A saved-link check may verify or retire its record, never author a new lookup or destination.
    if (record.kind === 'active' && record.url !== update.expected.url) invalid();
    return { option: update.option, record, expected: { observedAt: update.expected.observedAt, url: update.expected.url } };
  });
}

function pathname(): string {
  const environment = process.env.LPF_CACHE_CONTEXT || 'dev';
  if (!['production', 'deploy-preview', 'branch-deploy', 'dev'].includes(environment)) {
    throw new Error('LPF saved-link storage namespace is invalid.');
  }
  const override = process.env.LPF_CACHE_NAMESPACE;
  if (override !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(override)) {
    throw new Error('LPF saved-link storage namespace is invalid.');
  }
  let namespace = override ?? 'default';
  if (environment === 'deploy-preview' || environment === 'branch-deploy') {
    const branch = process.env.LPF_CACHE_BRANCH;
    if (!branch || !branch.trim() || branch.length > 1024) throw new Error('LPF saved-link storage namespace is invalid.');
    namespace += `-${createHash('sha256').update(branch).digest('hex')}`;
  }
  return `v1/${environment}/${namespace}/snapshot.json`;
}

async function operation<T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, OPERATION_TIMEOUT_MS);
  let onAbort!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error(UNAVAILABLE));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  try {
    if (controller.signal.aborted) return await interrupted;
    return await Promise.race([work(controller.signal), interrupted]);
  } catch {
    // No SDK messages, credentials, storage URLs, abort reasons, or raw causes cross this boundary.
    throw new Error(UNAVAILABLE);
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

function operationStore(signal: AbortSignal): Store {
  // The runtime supplies site-scoped credentials. Bind every SDK request (including retries
  // and signed-URL acquisition) to this operation; the SDK has no per-method signal option.
  return getStore({
    name: 'lpf-cache',
    consistency: 'strong',
    fetch: async (input, init) => {
      signal.throwIfAborted();
      const response = await globalThis.fetch(input, { ...init, signal });
      if (signal.aborted) {
        void response.body?.cancel().catch(() => {});
        signal.throwIfAborted();
      }
      return response;
    },
  });
}

async function readLatest(store: Store, path: string, signal: AbortSignal): Promise<VersionedCacheSnapshot> {
  signal.throwIfAborted();
  // The body and ETag come from one strong response, never independently read metadata.
  const result = await store.getWithMetadata(path, { type: 'stream' });
  signal.throwIfAborted();
  if (result === null) return { snapshot: { version: 1, options: {} } };
  if (!result.data) invalid();
  const reader = result.data.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (!result.etag || /^W\//i.test(result.etag) || result.etag.length > 1024 || /[\r\n]/.test(result.etag)) invalid();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) invalid();
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { snapshot: validateSnapshot(JSON.parse(text)), etag: result.etag };
  } finally {
    signal.removeEventListener('abort', cancel);
    // Cancellation is deliberately not awaited: a hostile stream must not extend the deadline.
    cancel();
    reader.releaseLock();
  }
}

function mergeRecord(current: LpfCacheRecord | undefined, update: LpfCacheUpdate): LpfCacheRecord | undefined {
  const proposed = update.record;
  if (update.expected && (current?.kind !== 'active'
    || current.url !== update.expected.url || current.observedAt !== update.expected.observedAt)) return current;
  const next = update.expected && current && proposed.kind === 'active'
    ? { ...proposed, observedAt: current.observedAt } : proposed;
  if (!current) return next;
  if (next.observedAt < current.observedAt) return current;
  if (current.kind === 'retired' && next.observedAt === current.observedAt) return current;
  if (next.kind === 'retired') return next;
  if (current.kind === 'active') {
    if (next.observedAt === current.observedAt && next.url !== current.url) return current;
    if (next.url === current.url) {
      return {
        ...next,
        resolvedAt: update.expected ? current.resolvedAt : Math.max(current.resolvedAt, next.resolvedAt),
        verifiedAt: Math.max(current.verifiedAt, next.verifiedAt),
      };
    }
  }
  return next;
}

function sameRecord(left: LpfCacheRecord | undefined, right: LpfCacheRecord | undefined): boolean {
  if (!left || !right) return left === right;
  if (left.kind === 'retired') return right.kind === 'retired' && left.observedAt === right.observedAt && left.reason === right.reason;
  return right.kind === 'active' && left.url === right.url && left.observedAt === right.observedAt
    && left.resolvedAt === right.resolvedAt && left.verifiedAt === right.verifiedAt;
}

export async function readLpfCache(signal?: AbortSignal): Promise<LpfCacheSnapshot> {
  const path = pathname();
  return operation(signal, async deadline => (await readLatest(operationStore(deadline), path, deadline)).snapshot);
}

export async function updateLpfCache(updates: readonly LpfCacheUpdate[], signal?: AbortSignal): Promise<LpfCacheSnapshot> {
  const path = pathname();
  const validated = validateUpdates(updates);
  return operation(signal, async deadline => {
    const store = operationStore(deadline);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const latest = await readLatest(store, path, deadline);
      const { snapshot, etag } = latest;
      const options = { ...snapshot.options };
      for (const update of validated) {
        const key = String(update.option);
        const merged = mergeRecord(options[key], update);
        if (merged) options[key] = merged;
      }
      if (Object.keys(options).every(key => sameRecord(options[key], snapshot.options[key]))) return snapshot;
      const merged: LpfCacheSnapshot = { version: 1, options };
      const body = JSON.stringify(merged);
      if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) invalid();
      deadline.throwIfAborted();
      const result = await store.set(path, body, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      deadline.throwIfAborted();
      if (result.modified) return merged;
    }
    throw new Error(UNAVAILABLE);
  });
}
