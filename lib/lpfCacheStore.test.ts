import { Headers } from 'undici';
import { BlobError, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';
import type * as BlobSdk from '@vercel/blob';
import type { GetBlobResult, HeadBlobResult, PutBlobResult } from '@vercel/blob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LpfActiveCacheRecord, LpfCacheRecord, LpfCacheSnapshot, LpfCacheUpdate } from './lpfCacheTypes';

const sdk = vi.hoisted(() => ({ get: vi.fn(), head: vi.fn(), put: vi.fn() }));
vi.mock('@vercel/blob', async importOriginal => ({
  ...await importOriginal<typeof BlobSdk>(), get: sdk.get, head: sdk.head, put: sdk.put,
}));

// Dynamic imports deliberately exercise restart boundaries and isolate mocked SDK module instances.

const oldUrl = 'https://liveassets-a.encoders.immergo.tv/old/stream.m3u8';
const newUrl = 'https://liveassets-b.encoders.immergo.tv/new/stream.m3u8';
const secret = 'private-test-credential';
const unavailable = 'LPF saved-link storage is unavailable.';
const persisted = new Map<string, { body: string; etag: string }>();
let revision = 0;

function active(observedAt = 100, url = oldUrl, verifiedAt = 200): LpfActiveCacheRecord {
  return { kind: 'active', url, observedAt, resolvedAt: observedAt, verifiedAt };
}

function snapshot(options: Record<string, LpfCacheRecord> = {}): LpfCacheSnapshot {
  return { version: 1, options };
}

function blobResult(body: string, etag = '"first"', size = Buffer.byteLength(body)): GetBlobResult {
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); },
    }),
    headers: new Headers(),
    blob: {
      url: 'https://test.private.blob.vercel-storage.com/snapshot.json',
      downloadUrl: 'https://test.private.blob.vercel-storage.com/snapshot.json?download=1',
      pathname: 'snapshot.json', contentDisposition: '', cacheControl: '',
      uploadedAt: new Date(100), contentType: 'application/json', size, etag,
    },
  };
}

function metadataResult(body: string, etag: string): HeadBlobResult {
  return {
    url: 'https://test.private.blob.vercel-storage.com/snapshot.json',
    downloadUrl: 'https://test.private.blob.vercel-storage.com/snapshot.json?download=1',
    pathname: 'snapshot.json', contentDisposition: '', cacheControl: '',
    uploadedAt: new Date(100), contentType: 'application/json', size: Buffer.byteLength(body), etag,
  };
}

beforeEach(() => {
  vi.resetModules();
  sdk.get.mockReset();
  sdk.head.mockReset();
  sdk.put.mockReset();
  persisted.clear();
  revision = 0;
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', secret);
  vi.stubEnv('BLOB_STORE_ID', '');
  vi.stubEnv('VERCEL_ENV', 'development');
  vi.stubEnv('LPF_CACHE_NAMESPACE', undefined);
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', undefined);
  sdk.get.mockImplementation(async (path: string, options: { useCache: boolean; access: string }) => {
    if (options.access !== 'private' || options.useCache !== false) throw new Error('Unsafe read');
    const stored = persisted.get(path);
    return stored ? blobResult(stored.body, `W/${stored.etag}`, 0) : null;
  });
  sdk.head.mockImplementation(async (path: string): Promise<HeadBlobResult> => {
    const stored = persisted.get(path);
    if (!stored) throw new BlobNotFoundError();
    return metadataResult(stored.body, stored.etag);
  });
  sdk.put.mockImplementation(async (path: string, body: string, options: {
    allowOverwrite: boolean; ifMatch?: string; access: string; addRandomSuffix: boolean;
  }): Promise<PutBlobResult> => {
    if (options.access !== 'private' || options.addRandomSuffix !== false) throw new Error('Unsafe write');
    const current = persisted.get(path);
    if (current && !options.allowOverwrite) throw new BlobError('This blob already exists.');
    if (options.allowOverwrite && (!current || options.ifMatch !== current.etag)) throw new BlobPreconditionFailedError();
    const etag = `"revision-${++revision}"`;
    persisted.set(path, { body, etag });
    return {
      url: 'https://test.private.blob.vercel-storage.com/snapshot.json',
      downloadUrl: 'https://test.private.blob.vercel-storage.com/snapshot.json?download=1',
      pathname: path, contentType: 'application/json', contentDisposition: '', etag,
    };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('durable LPF Blob persistence', () => {
  it('survives fresh module instances and never serves a stale process-local copy', async () => {
    const first = await import('./lpfCacheStore');
    const saved = await first.updateLpfCache([{ option: 1, record: active() }]);
    expect(saved).toEqual(snapshot({ 1: active() }));
    saved.options['1'] = { kind: 'retired', observedAt: 999, reason: 'ended' };
    vi.resetModules();
    const restarted = await import('./lpfCacheStore');
    expect(await restarted.readLpfCache()).toEqual(snapshot({ 1: active() }));
    await restarted.updateLpfCache([{ option: 2, record: active(300, newUrl, 400) }]);
    expect(await first.readLpfCache()).toEqual(snapshot({ 1: active(), 2: active(300, newUrl, 400) }));
    persisted.clear();
    expect(await first.readLpfCache()).toEqual(snapshot());
  });

  it('merges concurrent creation writers without dropping unrelated slots', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await Promise.all([
      updateLpfCache([{ option: 1, record: active() }]),
      updateLpfCache([{ option: 2, record: active(300, newUrl) }]),
    ]);
    expect(await readLpfCache()).toEqual(snapshot({ 1: active(), 2: active(300, newUrl) }));
    expect(sdk.put).toHaveBeenCalledTimes(3);
  });

  it('rereads on ETag conflicts and returns the newer winning replacement', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    const write = sdk.put.getMockImplementation()!;
    sdk.put.mockImplementationOnce(async (path: string) => {
      persisted.set(path, { body: JSON.stringify(snapshot({ 1: active(500, newUrl, 600), 2: active(450) })), etag: '"concurrent"' });
      throw new BlobPreconditionFailedError();
    });
    const merged = await updateLpfCache([{ option: 1, record: active(200) }, { option: 3, record: active(350) }]);
    expect(merged).toEqual(snapshot({ 1: active(500, newUrl, 600), 2: active(450), 3: active(350) }));
    expect(sdk.put.getMockImplementation()).toBe(write);
  });

  it('does not overwrite newer lookup results or oscillate same-time destinations', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active(300, newUrl, 400) }]);
    sdk.put.mockClear();
    expect(await updateLpfCache([{ option: 1, record: active(200) }])).toEqual(snapshot({ 1: active(300, newUrl, 400) }));
    expect(await updateLpfCache([{ option: 1, record: active(300, oldUrl, 500) }])).toEqual(snapshot({ 1: active(300, newUrl, 400) }));
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it('makes retirement win equal timestamps and requires a newer authoritative lookup to restore it', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    const retired: LpfCacheRecord = { kind: 'retired', observedAt: 100, reason: 'ended' };
    await updateLpfCache([{ option: 1, record: active() }]);
    expect(await updateLpfCache([{ option: 1, record: retired }])).toEqual(snapshot({ 1: retired }));
    sdk.put.mockClear();
    const expected = { observedAt: 100, url: oldUrl };
    for (const update of [
      { option: 1, record: active() },
      { option: 1, record: active(999), expected },
      { option: 1, record: { kind: 'retired', observedAt: 999, reason: 'expired' }, expected },
    ] satisfies LpfCacheUpdate[]) {
      expect(await updateLpfCache([update])).toEqual(snapshot({ 1: retired }));
    }
    expect(sdk.put).not.toHaveBeenCalled();
    expect(await updateLpfCache([{ option: 1, record: active(101, newUrl, 300) }])).toEqual(snapshot({ 1: active(101, newUrl, 300) }));
  });

  it('guards saved verification against replacement URL and same-URL newer authoritative versions', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    const expected = { observedAt: 100, url: oldUrl };
    await updateLpfCache([{ option: 1, record: active(300, newUrl) }, { option: 2, record: active(300) }]);
    sdk.put.mockClear();
    expect(await updateLpfCache([
      { option: 1, record: active(999), expected },
      { option: 2, record: { kind: 'retired', observedAt: 999, reason: 'ended' }, expected },
    ])).toEqual(snapshot({ 1: active(300, newUrl), 2: active(300) }));
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it('preserves authoritative timestamps during saved checks and never decreases same-URL verification', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active(100, oldUrl, 500) }]);
    expect(await updateLpfCache([{ option: 1, record: active(200, oldUrl, 400) }]))
      .toEqual(snapshot({ 1: active(200, oldUrl, 500) }));
    const expected = { observedAt: 200, url: oldUrl };
    expect(await updateLpfCache([{ option: 1, record: active(999, oldUrl, 600), expected }]))
      .toEqual(snapshot({ 1: { ...active(200, oldUrl, 600), resolvedAt: 200 } }));
    expect(await updateLpfCache([{ option: 1, record: { kind: 'retired', observedAt: 200, reason: 'expired' }, expected }]))
      .toEqual(snapshot({ 1: { kind: 'retired', observedAt: 200, reason: 'expired' } }));
  });

  it('preserves a newer authoritative conditional replacement retirement', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    const retired: LpfCacheRecord = { kind: 'retired', observedAt: 500, reason: 'replaced' };
    const expected = { observedAt: 100, url: oldUrl };
    expect(await updateLpfCache([{ option: 1, record: retired, expected }])).toEqual(snapshot({ 1: retired }));
    sdk.put.mockClear();
    expect(await updateLpfCache([{ option: 1, record: active(300, newUrl) }])).toEqual(snapshot({ 1: retired }));
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it('rejects a saved-check retirement when a concurrent authoritative replacement wins its CAS', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    sdk.put.mockClear();
    sdk.put.mockImplementationOnce(async (path: string) => {
      persisted.set(path, { body: JSON.stringify(snapshot({ 1: active(500, newUrl) })), etag: '"replacement"' });
      throw new BlobPreconditionFailedError();
    });
    expect(await updateLpfCache([{
      option: 1, record: { kind: 'retired', observedAt: 100, reason: 'ended' },
      expected: { observedAt: 100, url: oldUrl },
    }])).toEqual(snapshot({ 1: active(500, newUrl) }));
    expect(sdk.put).toHaveBeenCalledTimes(1);
  });

  it('retains partial updates, avoids empty or equivalent writes, and records empty-slot tombstones', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    expect(await updateLpfCache([])).toEqual(snapshot());
    expect(sdk.put).not.toHaveBeenCalled();
    const retired: LpfCacheRecord = { kind: 'retired', observedAt: 100, reason: 'empty' };
    await updateLpfCache([{ option: 1, record: active() }, { option: 18, record: retired }]);
    sdk.put.mockClear();
    expect(await updateLpfCache([{ option: 1, record: active() }])).toEqual(snapshot({ 1: active(), 18: retired }));
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it('caps compare-and-swap at three attempts and does not retry unrelated SDK failures', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    sdk.put.mockRejectedValue(new BlobPreconditionFailedError());
    await expect(updateLpfCache([{ option: 1, record: active() }])).rejects.toThrow(unavailable);
    expect(sdk.head).toHaveBeenCalledTimes(3);
    expect(sdk.put).toHaveBeenCalledTimes(3);
    sdk.put.mockClear();
    sdk.get.mockClear();
    sdk.head.mockClear();
    sdk.put.mockRejectedValue(new BlobError(`Forbidden ${secret} https://private.blob.vercel-storage.com`));
    await expect(updateLpfCache([{ option: 1, record: active() }])).rejects.toThrow(unavailable);
    expect(sdk.head).toHaveBeenCalledTimes(1);
    expect(sdk.put).toHaveBeenCalledTimes(1);
  });

  it('reconciles a creation precondition conflict against the actual newly created snapshot', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    sdk.put.mockImplementationOnce(async (path: string) => {
      persisted.set(path, { body: JSON.stringify(snapshot({ 1: active(500, newUrl) })), etag: '"created"' });
      throw new BlobPreconditionFailedError();
    });
    expect(await updateLpfCache([{ option: 1, record: active(100) }])).toEqual(snapshot({ 1: active(500, newUrl) }));
    expect(sdk.put).toHaveBeenCalledTimes(1);
  });

  it('pairs weak zero-size downloads with authoritative metadata instead of stripping transport validators', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    sdk.get.mockImplementation(async (path: string) => {
      const stored = persisted.get(path);
      return stored ? blobResult(stored.body, 'W/"4352615a4a9bc5ddac5b30a35e764153"', 0) : null;
    });
    expect(await updateLpfCache([{ option: 2, record: active(300, newUrl) }]))
      .toEqual(snapshot({ 1: active(), 2: active(300, newUrl) }));
    expect(await readLpfCache()).toEqual(snapshot({ 1: active(), 2: active(300, newUrl) }));
  });

  it('discards a body when authoritative metadata changes during its read and merges the replacement on retry', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    sdk.put.mockClear();
    const metadata = sdk.head.getMockImplementation()!;
    sdk.head.mockImplementationOnce(metadata).mockImplementationOnce(async (path: string) => {
      const body = JSON.stringify(snapshot({ 1: active(500, newUrl), 2: active(400) }));
      persisted.set(path, { body, etag: '"changed-during-read"' });
      return metadataResult(body, '"changed-during-read"');
    });
    expect(await updateLpfCache([{ option: 1, record: active(200) }, { option: 3, record: active(300) }]))
      .toEqual(snapshot({ 1: active(500, newUrl), 2: active(400), 3: active(300) }));
    expect(sdk.put).toHaveBeenCalledTimes(1);
  });

  it('retries metadata deletion during a read and safely recreates only after a typed missing head', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    sdk.put.mockClear();
    const metadata = sdk.head.getMockImplementation()!;
    sdk.head.mockImplementationOnce(metadata).mockImplementationOnce(async (path: string) => {
      persisted.delete(path);
      throw new BlobNotFoundError();
    });
    expect(await updateLpfCache([{ option: 2, record: active(300, newUrl) }]))
      .toEqual(snapshot({ 2: active(300, newUrl) }));
    expect(sdk.put).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized authoritative metadata before downloading the body', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    sdk.head.mockResolvedValue({ ...metadataResult('{}', '"large"'), size: 65_537 });
    await expect(updateLpfCache([{ option: 1, record: active() }])).rejects.toThrow(unavailable);
    expect(sdk.get).not.toHaveBeenCalled();
    expect(sdk.put).not.toHaveBeenCalled();
  });
});

describe('untrusted data and operation bounds', () => {
  it('rejects far-future active and retired records without rejecting history or small logical-clock skew', async () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-11-02T12:00:00Z');
    vi.setSystemTime(now);
    const { readLpfCache } = await import('./lpfCacheStore');
    for (const record of [
      { ...active(), observedAt: now + 120_001 },
      { ...active(), resolvedAt: now + 120_001 },
      { ...active(), verifiedAt: now + 120_001 },
      { kind: 'retired', observedAt: now + 120_001, reason: 'ended' },
    ] satisfies LpfCacheRecord[]) {
      sdk.get.mockResolvedValueOnce(blobResult(JSON.stringify(snapshot({ 1: record }))));
      await expect(readLpfCache()).rejects.toThrow(unavailable);
    }
    const valid = snapshot({
      1: active(),
      2: { ...active(now + 1, newUrl, now), resolvedAt: now },
      3: { kind: 'retired', observedAt: now + 120_000, reason: 'empty' },
    });
    sdk.get.mockResolvedValueOnce(blobResult(JSON.stringify(valid)));
    expect(await readLpfCache()).toEqual(valid);
  });

  it.each([
    null, [], { version: 2, options: {} }, { version: 1, options: [] },
    { version: 1, options: {}, secret },
    { version: 1, options: { '01': active() } },
    { version: 1, options: { '0': active() } },
    { version: 1, options: { '19': active() } },
    { version: 1, options: Object.fromEntries([['__proto__', active()]]) },
    snapshot({ 1: { ...active(), url: 'https://evil.example/stream.m3u8' } }),
    snapshot({ 1: { ...active(), url: `https://a.encoders.immergo.tv/${'x'.repeat(2048)}.m3u8` } }),
    snapshot({ 1: { ...active(), observedAt: 0 } }),
    snapshot({ 1: { ...active(), observedAt: 1.5 } }),
    snapshot({ 1: { ...active(), verifiedAt: Number.MAX_SAFE_INTEGER + 1 } }),
    { version: 1, options: { 1: { kind: 'active', observedAt: 1, url: oldUrl } } },
    { version: 1, options: { 1: { kind: 'retired', observedAt: 1, reason: 'failed' } } },
  ])('rejects corrupt snapshots rather than returning an empty cache (%#)', async value => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    sdk.get.mockImplementation(async () => blobResult(JSON.stringify(value)));
    sdk.head.mockImplementation(async () => metadataResult(JSON.stringify(value), '"corrupt"'));
    await expect(readLpfCache()).rejects.toThrow(unavailable);
    await expect(updateLpfCache([{ option: 2, record: active() }])).rejects.toThrow(unavailable);
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it.each(['{', 'undefined', '{"version":1,"options":{"__proto__":{"kind":"retired","observedAt":1,"reason":"empty"}}}'])
  ('rejects malformed JSON or prototype option keys (%#)', async body => {
    const { readLpfCache } = await import('./lpfCacheStore');
    sdk.get.mockResolvedValue(blobResult(body));
    await expect(readLpfCache()).rejects.toThrow(unavailable);
  });

  it('bounds actual streamed bytes even when size metadata understates them and cancels the stream', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    const cancel = vi.fn();
    const result = blobResult('', '"large"', 0);
    result.stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel,
    });
    sdk.get.mockResolvedValue(result);
    await expect(readLpfCache()).rejects.toThrow(unavailable);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized declared bodies, missing ETags, unexpected 304 responses and invalid UTF-8', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    for (const result of [blobResult('{}', '"large"', 65_537), blobResult('{}', '')]) {
      sdk.get.mockResolvedValueOnce(result);
      await expect(readLpfCache()).rejects.toThrow(unavailable);
    }
    sdk.get.mockResolvedValueOnce({ statusCode: 304, stream: null });
    await expect(readLpfCache()).rejects.toThrow(unavailable);
    const result = blobResult('');
    result.stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); },
    });
    sdk.get.mockResolvedValueOnce(result);
    await expect(readLpfCache()).rejects.toThrow(unavailable);
  });

  it.each([
    { option: 0, record: active() }, { option: 19, record: active() }, { option: 1.1, record: active() },
    { option: 1, record: { ...active(), resolvedAt: Infinity } },
    { option: 1, record: active(), expected: { observedAt: 0, url: oldUrl } },
    { option: 1, record: active(100, newUrl), expected: { observedAt: 100, url: oldUrl } },
  ] satisfies LpfCacheUpdate[])('rejects invalid update input without touching Blob (%#)', async update => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await expect(updateLpfCache([update])).rejects.toThrow('LPF saved-link storage contains invalid data.');
    expect(sdk.get).not.toHaveBeenCalled();
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it('fails explicitly without configuration, without any process-local fallback', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    await expect(readLpfCache()).rejects.toThrow('LPF saved-link storage is not configured.');
    await expect(updateLpfCache([{ option: 1, record: active() }])).rejects.toThrow('LPF saved-link storage is not configured.');
    expect(sdk.get).not.toHaveBeenCalled();
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it('redacts SDK errors and caller abort reasons, including when the SDK ignores cancellation', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    sdk.get.mockRejectedValueOnce(new Error(`${secret} https://private.blob.vercel-storage.com`));
    const error = await readLpfCache().catch(value => value as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(unavailable);
    expect((error as Error).cause).toBeUndefined();
    const controller = new AbortController();
    sdk.get.mockReturnValue(Promise.withResolvers().promise);
    const pending = readLpfCache(controller.signal);
    const rejected = expect(pending).rejects.toThrow(unavailable);
    controller.abort(`${secret} private abort reason`);
    await rejected;
  });

  it('honors already-aborted callers without issuing network work', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    const controller = new AbortController();
    controller.abort(secret);
    await expect(readLpfCache(controller.signal)).rejects.toThrow(unavailable);
    expect(sdk.get).not.toHaveBeenCalled();
  });

  it('bounds the full operation to six seconds, even while a private stream stalls', async () => {
    vi.useFakeTimers();
    const { readLpfCache } = await import('./lpfCacheStore');
    const cancel = vi.fn();
    const result = blobResult('');
    result.stream = new ReadableStream<Uint8Array>({ cancel });
    sdk.get.mockResolvedValue(result);
    const pending = readLpfCache();
    const rejected = expect(pending).rejects.toThrow(unavailable);
    await vi.advanceTimersByTimeAsync(6_000);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(sdk.get.mock.calls[0][1].abortSignal.aborted).toBe(true);
  });

  it('shares one six-second deadline across compare-and-swap retries', async () => {
    vi.useFakeTimers();
    const { updateLpfCache } = await import('./lpfCacheStore');
    const first = Promise.withResolvers<PutBlobResult>();
    const second = Promise.withResolvers<PutBlobResult>();
    sdk.put.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const pending = updateLpfCache([{ option: 1, record: active() }]);
    const rejected = expect(pending).rejects.toThrow(unavailable);
    await vi.advanceTimersByTimeAsync(4_000);
    first.reject(new BlobPreconditionFailedError());
    await vi.advanceTimersByTimeAsync(2_000);
    await rejected;
    expect(sdk.put).toHaveBeenCalledTimes(2);
    expect(sdk.put.mock.calls[0][2].abortSignal).toBe(sdk.put.mock.calls[1][2].abortSignal);
    expect(sdk.put.mock.calls[1][2].abortSignal.aborted).toBe(true);
  });
});

describe('namespace isolation', () => {
  it('keeps local production-mode servers in development unless VERCEL_ENV explicitly selects production', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    await updateLpfCache([{ option: 1, record: active() }]);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await readLpfCache()).toEqual(snapshot());
    await updateLpfCache([{ option: 2, record: active(200, newUrl) }]);
    vi.stubEnv('VERCEL_ENV', undefined);
    expect(await readLpfCache()).toEqual(snapshot({ 1: active() }));
  });

  it('isolates development, production and stable preview branches even with the same override', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('LPF_CACHE_NAMESPACE', 'shared-test');
    await updateLpfCache([{ option: 1, record: active() }]);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await readLpfCache()).toEqual(snapshot());
    await updateLpfCache([{ option: 1, record: active(200, newUrl) }]);
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'feature/a/path');
    expect(await readLpfCache()).toEqual(snapshot());
    await updateLpfCache([{ option: 2, record: active(300) }]);
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'feature-a-path');
    expect(await readLpfCache()).toEqual(snapshot());
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'feature/a/path');
    vi.resetModules();
    expect(await (await import('./lpfCacheStore')).readLpfCache()).toEqual(snapshot({ 2: active(300) }));
    vi.stubEnv('VERCEL_ENV', 'development');
    expect(await readLpfCache()).toEqual(snapshot({ 1: active() }));
  });

  it.each(['', '../production', 'x/y', 'x.y', 'a'.repeat(65), 'x?secret=credential', ' x'])
  ('rejects unsafe namespace overrides (%#)', async namespace => {
    const { readLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('LPF_CACHE_NAMESPACE', namespace);
    await expect(readLpfCache()).rejects.toThrow('LPF saved-link storage namespace is invalid.');
    expect(sdk.get).not.toHaveBeenCalled();
  });

  it('fails closed for preview deployments without a stable branch identity', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('VERCEL_ENV', 'preview');
    await expect(readLpfCache()).rejects.toThrow('LPF saved-link storage namespace is invalid.');
    expect(sdk.get).not.toHaveBeenCalled();
  });
});
