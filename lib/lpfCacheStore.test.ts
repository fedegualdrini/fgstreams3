// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LpfActiveCacheRecord, LpfCacheRecord, LpfCacheSnapshot, LpfCacheUpdate } from './lpfCacheTypes';

// Exercise the real SDK against a durable, atomic HTTP storage boundary. Only network I/O is mocked.
// Dynamic imports intentionally exercise fresh module-loading/restart boundaries after environment setup.
const transport = vi.fn<typeof fetch>();
const oldUrl = 'https://liveassets-a.encoders.immergo.tv/old/stream.m3u8';
const newUrl = 'https://liveassets-b.encoders.immergo.tv/new/stream.m3u8';
const secret = 'private-test-credential';
const unavailable = 'LPF saved-link storage is unavailable.';
const persisted = new Map<string, { body: string; etag: string }>();
let revision = 0;
let onWrite: ((key: string, body: string) => Response | Promise<Response> | undefined) | undefined;

function active(observedAt = 100, url = oldUrl, verifiedAt = 200): LpfActiveCacheRecord {
  return { kind: 'active', url, observedAt, resolvedAt: observedAt, verifiedAt };
}

function snapshot(options: Record<string, LpfCacheRecord> = {}): LpfCacheSnapshot {
  return { version: 1, options };
}

function storedResponse(body: string | ReadableStream<Uint8Array>, etag = '"first"'): Response {
  return new Response(body, { headers: { etag } });
}

async function storageFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const key = decodeURIComponent(url.pathname);
  const method = init?.method?.toUpperCase() ?? 'GET';
  // The eventual edge intentionally has no current data. Reads must use the strong endpoint.
  if (url.hostname === 'eventual.storage.invalid') return new Response(null, { status: 404 });
  if (url.hostname !== 'strong.storage.invalid') throw new Error('Unexpected storage endpoint');
  if (method === 'GET') {
    const stored = persisted.get(key);
    return stored ? storedResponse(stored.body, stored.etag) : new Response(null, { status: 404 });
  }
  if (method !== 'PUT' || typeof init?.body !== 'string') throw new Error('Unexpected storage operation');
  const intercepted = await onWrite?.(key, init.body);
  if (intercepted) return intercepted;
  const headers = new Headers(init.headers);
  const current = persisted.get(key);
  if (headers.get('if-none-match') === '*') {
    if (current) return new Response(null, { status: 412 });
  } else if (headers.has('if-match')) {
    if (!current || headers.get('if-match') !== current.etag) return new Response(null, { status: 412 });
  } else {
    throw new Error('Unconditional writes would lose concurrent updates');
  }
  const etag = `"revision-${++revision}"`;
  persisted.set(key, { body: init.body, etag });
  return new Response(null, { headers: { etag } });
}

beforeEach(() => {
  vi.resetModules();
  transport.mockReset();
  transport.mockImplementation(storageFetch);
  persisted.clear();
  revision = 0;
  onWrite = undefined;
  vi.stubGlobal('fetch', transport);
  vi.stubGlobal('netlifyBlobsContext', undefined);
  vi.stubEnv('NETLIFY_BLOBS_CONTEXT', Buffer.from(JSON.stringify({
    siteID: 'test-site', token: secret,
    edgeURL: 'https://eventual.storage.invalid', uncachedEdgeURL: 'https://strong.storage.invalid',
  })).toString('base64'));
  vi.stubEnv('LPF_CACHE_CONTEXT', 'dev');
  vi.stubEnv('LPF_CACHE_BRANCH', undefined);
  vi.stubEnv('LPF_CACHE_NAMESPACE', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('durable LPF saved-link persistence', () => {
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
  });

  it('merges concurrent updates to an existing snapshot without dropping unrelated slots', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    await Promise.all([
      updateLpfCache([{ option: 2, record: active(300, newUrl) }]),
      updateLpfCache([{ option: 3, record: active(400) }]),
    ]);
    expect(await readLpfCache()).toEqual(snapshot({ 1: active(), 2: active(300, newUrl), 3: active(400) }));
  });

  it('rereads on ETag conflicts and preserves a newer winning replacement', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    onWrite = key => {
      onWrite = undefined;
      persisted.set(key, { body: JSON.stringify(snapshot({ 1: active(500, newUrl, 600), 2: active(450) })), etag: '"concurrent"' });
      return new Response(null, { status: 412 });
    };
    const expected = snapshot({ 1: active(500, newUrl, 600), 2: active(450), 3: active(350) });
    expect(await updateLpfCache([{ option: 1, record: active(200) }, { option: 3, record: active(350) }])).toEqual(expected);
    expect(await readLpfCache()).toEqual(expected);
  });

  it('uses the ETag paired with its body when a replacement occurs during streaming', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    const [key, original] = [...persisted.entries()][0];
    transport.mockImplementationOnce(async () => storedResponse(new ReadableStream<Uint8Array>({
      start(controller) {
        persisted.set(key, { body: JSON.stringify(snapshot({ 1: active(500, newUrl), 2: active(400) })), etag: '"new-version"' });
        controller.enqueue(new TextEncoder().encode(original.body));
        controller.close();
      },
    }), original.etag));
    const expected = snapshot({ 1: active(500, newUrl), 2: active(400), 3: active(300) });
    expect(await updateLpfCache([{ option: 1, record: active(200) }, { option: 3, record: active(300) }])).toEqual(expected);
    expect(await readLpfCache()).toEqual(expected);
  });

  it('does not overwrite newer lookup results or oscillate same-time destinations', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    const expected = snapshot({ 1: active(300, newUrl, 400) });
    await updateLpfCache([{ option: 1, record: active(300, newUrl, 400) }]);
    expect(await updateLpfCache([{ option: 1, record: active(200) }])).toEqual(expected);
    expect(await updateLpfCache([{ option: 1, record: active(300, oldUrl, 500) }])).toEqual(expected);
    expect(await readLpfCache()).toEqual(expected);
  });

  it('makes retirement win equal timestamps and requires a newer authoritative lookup to restore it', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    const retired: LpfCacheRecord = { kind: 'retired', observedAt: 100, reason: 'ended' };
    await updateLpfCache([{ option: 1, record: active() }]);
    expect(await updateLpfCache([{ option: 1, record: retired }])).toEqual(snapshot({ 1: retired }));
    const expected = { observedAt: 100, url: oldUrl };
    for (const update of [
      { option: 1, record: active() },
      { option: 1, record: active(999), expected },
      { option: 1, record: { kind: 'retired', observedAt: 999, reason: 'expired' }, expected },
    ] satisfies LpfCacheUpdate[]) {
      expect(await updateLpfCache([update])).toEqual(snapshot({ 1: retired }));
    }
    expect(await updateLpfCache([{ option: 1, record: active(101, newUrl, 300) }])).toEqual(snapshot({ 1: active(101, newUrl, 300) }));
  });

  it('guards saved verification against replacement URL and same-URL newer authoritative versions', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    const expected = { observedAt: 100, url: oldUrl };
    await updateLpfCache([{ option: 1, record: active(300, newUrl) }, { option: 2, record: active(300) }]);
    expect(await updateLpfCache([
      { option: 1, record: active(999), expected },
      { option: 2, record: { kind: 'retired', observedAt: 999, reason: 'ended' }, expected },
    ])).toEqual(snapshot({ 1: active(300, newUrl), 2: active(300) }));
  });

  it('preserves authoritative timestamps during saved checks and never decreases same-URL verification', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active(100, oldUrl, 500) }]);
    expect(await updateLpfCache([{ option: 1, record: active(200, oldUrl, 400) }]))
      .toEqual(snapshot({ 1: active(200, oldUrl, 500) }));
    const expected = { observedAt: 200, url: oldUrl };
    expect(await updateLpfCache([{ option: 1, record: active(999, oldUrl, 600), expected }]))
      .toEqual(snapshot({ 1: active(200, oldUrl, 600) }));
    expect(await updateLpfCache([{ option: 1, record: { kind: 'retired', observedAt: 200, reason: 'expired' }, expected }]))
      .toEqual(snapshot({ 1: { kind: 'retired', observedAt: 200, reason: 'expired' } }));
  });

  it('preserves a newer authoritative conditional replacement retirement', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    const retired: LpfCacheRecord = { kind: 'retired', observedAt: 500, reason: 'replaced' };
    const expected = { observedAt: 100, url: oldUrl };
    expect(await updateLpfCache([{ option: 1, record: retired, expected }])).toEqual(snapshot({ 1: retired }));
    expect(await updateLpfCache([{ option: 1, record: active(300, newUrl) }])).toEqual(snapshot({ 1: retired }));
  });

  it('rejects a saved-check retirement when a concurrent authoritative replacement wins its CAS', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    onWrite = key => {
      onWrite = undefined;
      persisted.set(key, { body: JSON.stringify(snapshot({ 1: active(500, newUrl) })), etag: '"replacement"' });
      return new Response(null, { status: 412 });
    };
    expect(await updateLpfCache([{
      option: 1, record: { kind: 'retired', observedAt: 100, reason: 'ended' },
      expected: { observedAt: 100, url: oldUrl },
    }])).toEqual(snapshot({ 1: active(500, newUrl) }));
    expect(await readLpfCache()).toEqual(snapshot({ 1: active(500, newUrl) }));
  });

  it('does not resurrect a retired observation after a concurrent retirement wins its CAS', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    const retired: LpfCacheRecord = { kind: 'retired', observedAt: 300, reason: 'ended' };
    onWrite = key => {
      onWrite = undefined;
      persisted.set(key, { body: JSON.stringify(snapshot({ 1: retired })), etag: '"retired"' });
      return new Response(null, { status: 412 });
    };
    expect(await updateLpfCache([{
      option: 1, record: active(999, oldUrl, 600), expected: { observedAt: 100, url: oldUrl },
    }])).toEqual(snapshot({ 1: retired }));
    expect(await readLpfCache()).toEqual(snapshot({ 1: retired }));
  });

  it('retains partial updates, handles empty updates and records empty-slot tombstones', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    expect(await updateLpfCache([])).toEqual(snapshot());
    const retired: LpfCacheRecord = { kind: 'retired', observedAt: 100, reason: 'empty' };
    await updateLpfCache([{ option: 1, record: active() }, { option: 18, record: retired }]);
    expect(await updateLpfCache([{ option: 1, record: active() }])).toEqual(snapshot({ 1: active(), 18: retired }));
    expect(await readLpfCache()).toEqual(snapshot({ 1: active(), 18: retired }));
  });

  it('bounds persistent compare-and-swap conflicts without claiming to save data', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    onWrite = () => new Response(null, { status: 412 });
    await expect(updateLpfCache([{ option: 1, record: active() }])).rejects.toThrow(unavailable);
    expect(await readLpfCache()).toEqual(snapshot());
  });

  it('reconciles a creation conflict against the newly created snapshot', async () => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    onWrite = key => {
      onWrite = undefined;
      persisted.set(key, { body: JSON.stringify(snapshot({ 1: active(500, newUrl) })), etag: '"created"' });
      return new Response(null, { status: 409 });
    };
    expect(await updateLpfCache([{ option: 1, record: active() }])).toEqual(snapshot({ 1: active(500, newUrl) }));
  });

  it('recreates a deleted snapshot only through a conditional create after rereading', async () => {
    const { updateLpfCache, readLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    onWrite = key => {
      onWrite = undefined;
      persisted.delete(key);
      return new Response(null, { status: 412 });
    };
    expect(await updateLpfCache([{ option: 2, record: active(300, newUrl) }]))
      .toEqual(snapshot({ 2: active(300, newUrl) }));
    expect(await readLpfCache()).toEqual(snapshot({ 2: active(300, newUrl) }));
  });
});

describe('untrusted data and operation bounds', () => {
  it('rejects far-future records without rejecting history or bounded logical-clock skew', async () => {
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
      transport.mockResolvedValueOnce(storedResponse(JSON.stringify(snapshot({ 1: record }))));
      await expect(readLpfCache()).rejects.toThrow(unavailable);
    }
    const valid = snapshot({
      1: active(),
      2: { ...active(now + 1, newUrl, now), resolvedAt: now },
      3: { kind: 'retired', observedAt: now + 120_000, reason: 'empty' },
    });
    transport.mockResolvedValueOnce(storedResponse(JSON.stringify(valid)));
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
  ])('rejects corrupt snapshots instead of silently overwriting them (%#)', async value => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    await updateLpfCache([{ option: 1, record: active() }]);
    const [key] = persisted.keys();
    const corrupt = { body: JSON.stringify(value), etag: '"corrupt"' };
    persisted.set(key, corrupt);
    await expect(readLpfCache()).rejects.toThrow(unavailable);
    await expect(updateLpfCache([{ option: 2, record: active() }])).rejects.toThrow(unavailable);
    expect(persisted.get(key)).toEqual(corrupt);
  });

  it.each(['{', 'undefined', '{"version":1,"options":{"__proto__":{"kind":"retired","observedAt":1,"reason":"empty"}}}'])
  ('rejects malformed JSON or prototype option keys (%#)', async body => {
    const { readLpfCache } = await import('./lpfCacheStore');
    transport.mockResolvedValueOnce(storedResponse(body));
    await expect(readLpfCache()).rejects.toThrow(unavailable);
  });

  it.each(['', 'W/"weak"', 'x'.repeat(1025)])('rejects missing or unsafe conditional-write validators (%#)', async etag => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    transport.mockImplementation(async () => storedResponse(JSON.stringify(snapshot()), etag));
    await expect(readLpfCache()).rejects.toThrow(unavailable);
    await expect(updateLpfCache([{ option: 1, record: active() }])).rejects.toThrow(unavailable);
    expect(persisted.size).toBe(0);
  });

  it('bounds streamed bytes across chunks regardless of declared size and cancels rejected streams', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    for (const read of [() => readLpfCache(), () => updateLpfCache([{ option: 1, record: active() }])]) {
      let cancelled = false;
      const response = storedResponse(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(32_768));
          controller.enqueue(new Uint8Array(32_769));
        },
        cancel() { cancelled = true; },
      }));
      response.headers.set('content-length', '0');
      transport.mockResolvedValueOnce(response);
      await expect(read()).rejects.toThrow(unavailable);
      expect(cancelled).toBe(true);
    }
  });

  it('accepts exactly 64 KiB of valid JSON but rejects the next byte', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    const body = JSON.stringify(snapshot());
    transport.mockResolvedValueOnce(storedResponse(body.padEnd(65_536, ' ')));
    expect(await readLpfCache()).toEqual(snapshot());
    transport.mockResolvedValueOnce(storedResponse(body.padEnd(65_537, ' ')));
    await expect(readLpfCache()).rejects.toThrow(unavailable);
  });

  it('rejects invalid UTF-8 and an unexpected response with no body', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    transport.mockResolvedValueOnce(storedResponse(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); },
    })));
    await expect(readLpfCache()).rejects.toThrow(unavailable);
    transport.mockResolvedValueOnce(new Response(null, { status: 304, headers: { etag: '"cached"' } }));
    await expect(readLpfCache()).rejects.toThrow(unavailable);
  });

  it.each([
    { option: 0, record: active() }, { option: 19, record: active() }, { option: 1.1, record: active() },
    { option: 1, record: { ...active(), resolvedAt: Infinity } },
    { option: 1, record: active(), expected: { observedAt: 0, url: oldUrl } },
    { option: 1, record: active(100, newUrl), expected: { observedAt: 100, url: oldUrl } },
  ] satisfies LpfCacheUpdate[])('rejects invalid updates before network I/O (%#)', async update => {
    const { updateLpfCache } = await import('./lpfCacheStore');
    await expect(updateLpfCache([update])).rejects.toThrow('LPF saved-link storage contains invalid data.');
    expect(transport).not.toHaveBeenCalled();
  });

  it('fails safely without runtime credentials rather than using process-local persistence', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('NETLIFY_BLOBS_CONTEXT', undefined);
    await expect(readLpfCache()).rejects.toThrow(unavailable);
    await expect(updateLpfCache([{ option: 1, record: active() }])).rejects.toThrow(unavailable);
    expect(transport).not.toHaveBeenCalled();
  });

  it('redacts SDK errors, storage addresses and credentials on both reads and writes', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    const denied = () => new Response(secret, {
      status: 403, headers: { 'x-nf-error': `${secret} https://private.storage.invalid/snapshot.json` },
    });
    transport.mockResolvedValueOnce(denied());
    onWrite = denied;
    for (const run of [() => readLpfCache(), () => updateLpfCache([{ option: 1, record: active() }])]) {
      const error = await run().catch(value => value as Error);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(unavailable);
      expect((error as Error).cause).toBeUndefined();
      expect(String((error as Error).stack)).not.toContain(secret);
    }
  });

  it('returns promptly on caller abort even when the transport ignores cancellation, and cancels a late body', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    const response = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    transport.mockImplementationOnce(async () => {
      started.resolve();
      return response.promise;
    });
    const controller = new AbortController();
    const pending = readLpfCache(controller.signal);
    const rejected = expect(pending).rejects.toThrow(unavailable);
    await started.promise;
    const networkSignal = transport.mock.calls[0][1]?.signal;
    controller.abort(`${secret} private abort reason`);
    await rejected;
    expect(networkSignal?.aborted).toBe(true);
    const cancellation = Promise.withResolvers<void>();
    response.resolve(storedResponse(new ReadableStream<Uint8Array>({ cancel() { cancellation.resolve(); } })));
    await cancellation.promise;
  });

  it('honors already-aborted callers without issuing network work', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    const controller = new AbortController();
    controller.abort(secret);
    await expect(readLpfCache(controller.signal)).rejects.toThrow(unavailable);
    expect(transport).not.toHaveBeenCalled();
  });

  it('cancels a stalled body on caller abort without waiting for its cancellation promise', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    const started = Promise.withResolvers<void>();
    let cancelled = false;
    transport.mockResolvedValueOnce(storedResponse(new ReadableStream<Uint8Array>({
      pull() { started.resolve(); },
      cancel() { cancelled = true; return new Promise<void>(() => {}); },
    }, { highWaterMark: 0 })));
    const controller = new AbortController();
    const pending = readLpfCache(controller.signal);
    const rejected = expect(pending).rejects.toThrow(unavailable);
    await started.promise;
    controller.abort(secret);
    await rejected;
    expect(cancelled).toBe(true);
  });

  it('bounds the full operation to six seconds even while a body stalls', async () => {
    vi.useFakeTimers();
    const { readLpfCache } = await import('./lpfCacheStore');
    let cancelled = false;
    transport.mockResolvedValueOnce(storedResponse(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    })));
    const pending = readLpfCache();
    const rejected = expect(pending).rejects.toThrow(unavailable);
    await vi.advanceTimersByTimeAsync(6_000);
    await rejected;
    expect(cancelled).toBe(true);
    expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('shares one six-second deadline across compare-and-swap retries and cancels writes', async () => {
    vi.useFakeTimers();
    const { updateLpfCache } = await import('./lpfCacheStore');
    const conflict = Promise.withResolvers<Response>();
    const secondWrite = Promise.withResolvers<void>();
    onWrite = () => {
      onWrite = () => { secondWrite.resolve(); return new Promise<Response>(() => {}); };
      return conflict.promise;
    };
    const pending = updateLpfCache([{ option: 1, record: active() }]);
    const rejected = expect(pending).rejects.toThrow(unavailable);
    await vi.advanceTimersByTimeAsync(4_000);
    conflict.resolve(new Response(null, { status: 412 }));
    await secondWrite.promise;
    await vi.advanceTimersByTimeAsync(2_000);
    await rejected;
    const writes = transport.mock.calls.filter(([, init]) => init?.method?.toUpperCase() === 'PUT');
    expect(writes.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(persisted.size).toBe(0);
  });
});

describe('namespace isolation', () => {
  it('keeps local production-mode servers in dev unless Netlify context explicitly selects production', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('LPF_CACHE_CONTEXT', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    await updateLpfCache([{ option: 1, record: active() }]);
    vi.stubEnv('LPF_CACHE_CONTEXT', 'production');
    expect(await readLpfCache()).toEqual(snapshot());
    await updateLpfCache([{ option: 2, record: active(200, newUrl) }]);
    vi.stubEnv('LPF_CACHE_CONTEXT', undefined);
    expect(await readLpfCache()).toEqual(snapshot({ 1: active() }));
  });

  it('isolates all deployment contexts, branch hashes and overrides across restarts', async () => {
    const { readLpfCache, updateLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('LPF_CACHE_NAMESPACE', 'shared-test');
    await updateLpfCache([{ option: 1, record: active() }]);
    vi.stubEnv('LPF_CACHE_CONTEXT', 'production');
    expect(await readLpfCache()).toEqual(snapshot());
    await updateLpfCache([{ option: 1, record: active(200, newUrl) }]);
    for (const context of ['deploy-preview', 'branch-deploy']) {
      vi.stubEnv('LPF_CACHE_CONTEXT', context);
      vi.stubEnv('LPF_CACHE_BRANCH', 'feature/a/path');
      expect(await readLpfCache()).toEqual(snapshot());
      const record = active(context === 'deploy-preview' ? 300 : 400);
      await updateLpfCache([{ option: 2, record }]);
      vi.stubEnv('LPF_CACHE_BRANCH', 'feature-a-path');
      expect(await readLpfCache()).toEqual(snapshot());
      vi.stubEnv('LPF_CACHE_BRANCH', 'feature/a/path');
      vi.stubEnv('LPF_CACHE_NAMESPACE', 'other-test');
      expect(await readLpfCache()).toEqual(snapshot());
      vi.stubEnv('LPF_CACHE_NAMESPACE', 'shared-test');
      vi.resetModules();
      expect(await (await import('./lpfCacheStore')).readLpfCache()).toEqual(snapshot({ 2: record }));
    }
    vi.stubEnv('LPF_CACHE_CONTEXT', 'dev');
    expect(await readLpfCache()).toEqual(snapshot({ 1: active() }));
    vi.stubEnv('LPF_CACHE_CONTEXT', 'production');
    expect(await readLpfCache()).toEqual(snapshot({ 1: active(200, newUrl) }));
  });

  it.each(['', '../production', 'x/y', 'x.y', 'a'.repeat(65), 'x?secret=credential', ' x'])
  ('rejects unsafe namespace overrides before network I/O (%#)', async namespace => {
    const { readLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('LPF_CACHE_NAMESPACE', namespace);
    await expect(readLpfCache()).rejects.toThrow('LPF saved-link storage namespace is invalid.');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(['deploy-preview', 'branch-deploy'])('fails closed for %s without a bounded nonempty branch', async context => {
    const { readLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('LPF_CACHE_CONTEXT', context);
    for (const branch of [undefined, '', '   ', 'x'.repeat(1025)]) {
      vi.stubEnv('LPF_CACHE_BRANCH', branch);
      await expect(readLpfCache()).rejects.toThrow('LPF saved-link storage namespace is invalid.');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects unknown deployment contexts before network I/O', async () => {
    const { readLpfCache } = await import('./lpfCacheStore');
    vi.stubEnv('LPF_CACHE_CONTEXT', `unknown-${secret}`);
    await expect(readLpfCache()).rejects.toThrow('LPF saved-link storage namespace is invalid.');
    expect(transport).not.toHaveBeenCalled();
  });
});
