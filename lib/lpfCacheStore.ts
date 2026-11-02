import { createHash } from 'node:crypto';
import { BlobError, BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from '@vercel/blob';
import type { HeadBlobResult } from '@vercel/blob';
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
  // The SDK resolves and refreshes credentials itself; there is no local persistence fallback.
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    throw new Error('LPF saved-link storage is not configured.');
  }
  const environment = process.env.VERCEL_ENV || 'development';
  if (!['production', 'preview', 'development'].includes(environment)) {
    throw new Error('LPF saved-link storage namespace is invalid.');
  }
  const override = process.env.LPF_CACHE_NAMESPACE;
  if (override !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(override)) {
    throw new Error('LPF saved-link storage namespace is invalid.');
  }
  let namespace = override ?? 'default';
  if (environment === 'preview') {
    const branch = process.env.VERCEL_GIT_COMMIT_REF;
    if (!branch || branch.length > 1024) throw new Error('LPF saved-link storage namespace is invalid.');
    namespace += `-${createHash('sha256').update(branch).digest('hex')}`;
  }
  return `lpf-cache/v1/${environment}/${namespace}/snapshot.json`;
}

async function operation<T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, OPERATION_TIMEOUT_MS);
  let onAbort!: () => void;
  // Node 20 is supported; Promise.withResolvers is not available there.
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error(UNAVAILABLE));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  try {
    return await Promise.race([work(controller.signal), interrupted]);
  } catch {
    // No SDK messages, credentials, Blob URLs, abort reasons, or raw causes cross this boundary.
    throw new Error(UNAVAILABLE);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

async function readLatest(path: string, signal: AbortSignal, forWrite = false): Promise<VersionedCacheSnapshot> {
  signal.throwIfAborted();
  let metadata: HeadBlobResult | undefined;
  if (forWrite) {
    // Download validators can describe a transformed response; only metadata validators authorize writes.
    // Pair the bounded consistent body with identical authoritative versions before and after its read.
    try {
      metadata = await head(path, { abortSignal: signal });
    } catch (error) {
      if (error instanceof BlobNotFoundError) return { snapshot: { version: 1, options: {} } };
      throw error;
    }
    signal.throwIfAborted();
    if (!metadata.etag || /^W\//i.test(metadata.etag) || metadata.etag.length > 1024 || /[\r\n]/.test(metadata.etag)
      || !Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > MAX_BYTES) invalid();
  }
  const result = await get(path, { access: 'private', useCache: false, abortSignal: signal });
  signal.throwIfAborted();
  if (result === null) {
    if (metadata) throw new BlobPreconditionFailedError();
    return { snapshot: { version: 1, options: {} } };
  }
  if (result.statusCode !== 200) invalid();
  const reader = result.stream.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (!result.blob.etag || result.blob.etag.length > 1024 || /[\r\n]/.test(result.blob.etag)
      || !Number.isSafeInteger(result.blob.size) || result.blob.size < 0 || result.blob.size > MAX_BYTES) invalid();
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
    const snapshot = validateSnapshot(JSON.parse(text));
    if (metadata) {
      let after: HeadBlobResult;
      try {
        after = await head(path, { abortSignal: signal });
      } catch (error) {
        if (error instanceof BlobNotFoundError) throw new BlobPreconditionFailedError();
        throw error;
      }
      signal.throwIfAborted();
      if (after.etag !== metadata.etag || after.size !== metadata.size) throw new BlobPreconditionFailedError();
      if (bytes !== metadata.size) invalid();
    }
    return { snapshot, etag: metadata?.etag ?? result.blob.etag };
  } finally {
    signal.removeEventListener('abort', cancel);
    // Also stop oversized or malformed streams; cancellation must not extend the operation deadline.
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
  return operation(signal, async deadline => (await readLatest(path, deadline)).snapshot);
}

export async function updateLpfCache(updates: readonly LpfCacheUpdate[], signal?: AbortSignal): Promise<LpfCacheSnapshot> {
  const path = pathname();
  const validated = validateUpdates(updates);
  return operation(signal, async deadline => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let latest: VersionedCacheSnapshot;
      try {
        latest = await readLatest(path, deadline, true);
      } catch (error) {
        if (!deadline.aborted && error instanceof BlobPreconditionFailedError) continue;
        throw error;
      }
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
      try {
        await put(path, body, {
          access: 'private', addRandomSuffix: false, contentType: 'application/json',
          cacheControlMaxAge: 60, abortSignal: deadline,
          ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
        });
        deadline.throwIfAborted();
        return merged;
      } catch (error) {
        // Existing-file creation has no dedicated SDK error class.
        const conflict = error instanceof BlobPreconditionFailedError || (!etag && error instanceof BlobError
          && error.constructor === BlobError && /\b(?:blob|file) already exists\b/i.test(error.message));
        if (deadline.aborted || !conflict) throw error;
      }
    }
    throw new Error(UNAVAILABLE);
  });
}
