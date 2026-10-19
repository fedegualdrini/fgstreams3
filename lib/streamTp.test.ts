// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStreamTpUrl, streamTpResolvePath, validateStreamTpManifest } from './streamTp';
import { extractStreamTpManifest, resolveStreamTp, STREAM_TP_MAX_DOCUMENT_BYTES } from './streamTpServer';

const transport = vi.hoisted(() => vi.fn());
vi.mock('impit', () => ({ Impit: class { fetch = transport; } }));
import { GET } from '../app/api/streamtp/resolve/route';

const source = 'https://la18hd.su/vivo/canales.php?stream=espnpremium';
const manifest = 'https://a2lja3m.fubo18.com/espnpremium/mono.m3u8?token=test-opaque%2Bsignature';
const documentFor = (config: unknown) => `<!doctype html><script>window.CDNPEER = ${JSON.stringify(config)};</script>`;
const document = documentFor({ stream: 'espnpremium', src: manifest, trackers: ['wss://unused.example'] });
const signal = () => new AbortController().signal;

function htmlResponse(text = document, init: ResponseInit = {}, url = source): Response {
  const response = new Response(text, init);
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

beforeEach(() => transport.mockReset());

describe('StreamTP source boundary', () => {
  it.each([
    'http://la18hd.su/vivo/canales.php?stream=espnpremium',
    'https://la18hd.su.evil.example/vivo/canales.php?stream=espnpremium',
    'https://user:pass@la18hd.su/vivo/canales.php?stream=espnpremium',
    'https://la18hd.su:444/vivo/canales.php?stream=espnpremium',
    `${source}#fragment`, `${source}&stream=espnpremium`, `${source}&redirect=https://127.0.0.1`,
    source.replace('espnpremium', 'espn'), source.replace('/vivo/canales.php', '/global1.php'),
    'https://streamtp99a.sbs/global1.php?stream=espnpremium',
    'https://127.0.0.1/vivo/canales.php?stream=espnpremium',
    'https://constructor/vivo/canales.php?stream=espnpremium',
    `${source}${'x'.repeat(8192)}`, ` ${source}`, source.replace('la18hd.su/', 'la18hd.su\\'),
  ])('rejects unsupported input before transport: %s', async input => {
    expect(isStreamTpUrl(input)).toBe(false);
    await expect(resolveStreamTp(input, signal(), transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('StreamTP direct CDN boundary', () => {
  it('accepts a signed provider URL with the default HTTPS port without rewriting its token', () => {
    const explicitPort = manifest.replace('fubo18.com/', 'fubo18.com:443/').replace('%2B', '+');
    expect(validateStreamTpManifest(explicitPort)).toBe(manifest.replace('%2B', '+'));
  });

  it.each([
    undefined, null, {}, 123,
    manifest.replace('https:', 'http:'), manifest.replace('a2lja3m.fubo18.com', '127.0.0.1'),
    manifest.replace('fubo18.com', 'fubo18.com.evil.example'),
    manifest.replace('a2lja3m.fubo18.com', 'fubo18.com'),
    manifest.replace('a2lja3m.fubo18.com', 'nested.a2lja3m.fubo18.com'),
    manifest.replace('a2lja3m.fubo18.com', 'user@a2lja3m.fubo18.com'),
    manifest.replace('fubo18.com/', 'fubo18.com:444/'),
    manifest.replace('/espnpremium/', '/espn/'), manifest.replace('.m3u8', '.ts'),
    manifest.replace('mono.m3u8', '%2fmono.m3u8'), `${manifest}#fragment`,
    manifest.split('?')[0], `${manifest}&token=other`, `${manifest.split('?')[0]}?token=`,
    `${manifest.split('?')[0]}?token=${'x'.repeat(4097)}`,
    `${manifest.split('?')[0]}?token=%00`,
    '/api/hls-proxy?url=https://a2lja3m.fubo18.com/espnpremium/mono.m3u8',
  ])('rejects an unsafe or unsupported manifest', value => {
    expect(() => validateStreamTpManifest(value)).toThrow();
  });
});

describe('literal provider configuration extraction', () => {
  it('reads JSON with escaped characters and nested ignored fields without running scripts', () => {
    const html = documentFor({
      src: manifest, stream: 'espnpremium', swarm: 'la18hd-espnpremium',
      ignored: { text: 'a closing brace } and a quote "', array: [1, 2] },
    });
    expect(extractStreamTpManifest(`${html}<script>throw new Error('must never execute');</script>`)).toBe(manifest);
  });

  it.each([
    documentFor({ src: manifest }), documentFor({ src: manifest, stream: 'espn' }),
    documentFor({ src: 'https://127.0.0.1/private.m3u8?token=x', stream: 'espnpremium' }),
    '<script>window.CDNPEER = {src: "not JSON"};</script>',
    `<script>window.CDNPEER = (() => (${JSON.stringify({ src: manifest, stream: 'espnpremium' })}))();</script>`,
    `<script>window.CDNPEER = ${JSON.stringify({ src: manifest, stream: 'espnpremium' })}; malicious();</script>`,
    `<!-- ${document} -->`, `<div>${document.replaceAll('<script>', '').replaceAll('</script>', '')}</div>`,
    `<script>// window.CDNPEER = ${JSON.stringify({ src: manifest, stream: 'espnpremium' })};</script>`,
    `<script src="https://unused.example/">window.CDNPEER = ${JSON.stringify({ src: manifest, stream: 'espnpremium' })};</script>`,
    `${document}${document}`, '<html>No configuration</html>',
  ])('rejects missing, executable, ambiguous or wrong-channel config', html => {
    expect(() => extractStreamTpManifest(html)).toThrow();
  });

  it('applies a byte limit, not a character limit', () => {
    expect(() => extractStreamTpManifest(`${document}${'é'.repeat(STREAM_TP_MAX_DOCUMENT_BYTES / 2)}`)).toThrow();
  });
});

describe('bounded metadata transport', () => {
  it.each([
    () => htmlResponse(document, { status: 302, headers: { location: 'https://127.0.0.1/' } }),
    () => htmlResponse(document, { status: 403 }),
    () => htmlResponse(document, {}, 'https://unverified.example/'),
    () => htmlResponse(document, { headers: { 'content-length': String(STREAM_TP_MAX_DOCUMENT_BYTES + 1) } }),
    () => htmlResponse('x'.repeat(STREAM_TP_MAX_DOCUMENT_BYTES + 1), { headers: { 'content-length': '1' } }),
  ])('rejects redirects, failed responses and oversized bodies', async response => {
    transport.mockResolvedValueOnce(response());
    await expect(resolveStreamTp(source, signal(), transport)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('stops reading and cancels the response once the streamed byte limit is crossed', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(STREAM_TP_MAX_DOCUMENT_BYTES / 2 + 1));
      },
      cancel,
    }, { highWaterMark: 0 });
    transport.mockResolvedValueOnce({ status: 200, headers: new Headers(), url: source, body });
    await expect(resolveStreamTp(source, signal(), transport)).rejects.toThrow();
    expect(pulls).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('honors request abort before issuing a request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(resolveStreamTp(source, controller.signal, transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it('cancels a stalled body when the request aborts', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    transport.mockResolvedValueOnce({
      status: 200, headers: new Headers(), url: source,
      body: new ReadableStream<Uint8Array>({ pull() { controller.abort(); }, cancel }, { highWaterMark: 0 }),
    });
    await expect(resolveStreamTp(source, controller.signal, transport)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('metadata endpoint', () => {
  it.each(['', '?source=https://127.0.0.1/', `?source=${encodeURIComponent(source)}&source=${encodeURIComponent(source)}`, `?source=${encodeURIComponent(source)}&url=https://evil.example`])('rejects malformed API input without fetching', async query => {
    const response = await GET(new Request(`https://app.example/api/streamtp/resolve${query}`));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(transport).not.toHaveBeenCalled();
  });

  it('hides upstream exception details and returns an uncached 502', async () => {
    transport.mockRejectedValueOnce(new Error(`private ${manifest}`));
    const response = await GET(new Request(`https://app.example${streamTpResolvePath(source)}`));
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(body).not.toContain(manifest);
    expect(JSON.parse(body)).toEqual({ error: expect.any(String) });
  });
});
