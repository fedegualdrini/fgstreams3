import Hls from 'hls.js';
import type { Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmbedStLoader, EmbedStPlaylistRewriter } from './embedStHls';

const root = 'https://fgstreams3.vercel.app/api/embed-st/manifest?embed=https%3A%2F%2Fembed.st%2Fembed%2Fadmin%2Fexample%2F1';
const playlistUrl = `${root}&variant=high%2Fmono.m3u8`;
const oldMedia = 'https://p16-common-sign.tiktokcdn.com/old.image?x-signature=old';
const freshMedia = 'https://p19-common-sign.tiktokcdn.com/rotated.image?x-signature=a%2Fb%2Bc%3D';
const master = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\n${playlistUrl}\n`;

function playlist(media: string, time = '2026-10-18T01:25:36.788Z') {
  return `#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-MEDIA-SEQUENCE:42\n#EXT-X-PROGRAM-DATE-TIME:${time}\n#EXTINF:5.005,\n${media}\n#EXTINF:5.005,\nhttps://p16-common-sign.tiktokcdn.com/next.image\n`;
}

const engines: Hls[] = [];

/** Replay real playlists through the shipped parser/controller, replacing only HTTP transport. */
function replay(before: string, after: string) {
  let requests = 0;
  class CapturedLoader implements Loader<LoaderContext> {
    context: LoaderContext | null = null;
    private timer: number | undefined;
    stats: LoaderStats = {
      aborted: false, loaded: 0, total: 0, retry: 0, chunkCount: 0, bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
    load(context: LoaderContext, _config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      this.context = context;
      const text = new URL(context.url).searchParams.has('variant') ? (requests++ ? after : before) : master;
      this.stats.loading.start = performance.now();
      this.timer = window.setTimeout(() => {
        this.stats.loading.first = this.stats.loading.end = performance.now();
        this.stats.loaded = this.stats.total = text.length;
        callbacks.onSuccess({ url: context.url, data: text, code: 200 }, this.stats, context, null);
      }, 0);
    }
    abort() { window.clearTimeout(this.timer); this.stats.aborted = true; }
    destroy() { this.abort(); }
  }
  const original = Hls.DefaultConfig.loader;
  Hls.DefaultConfig.loader = CapturedLoader;
  const loader = createEmbedStLoader();
  Hls.DefaultConfig.loader = original;
  const hls = new Hls({ enableWorker: false, loader });
  engines.push(hls);
  const accepted: number[] = [];
  const errors: Array<{ type: string; details: string; fatal: boolean }> = [];
  hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
    if (!data.details.playlistParsingError) accepted.push(data.details.endSN);
  });
  hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) errors.push(data); });
  hls.loadSource(`${new URL(root).pathname}${new URL(root).search}`);
  return { accepted, errors };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  for (const hls of engines.splice(0)) hls.destroy();
  vi.useRealTimers();
});

describe('embed.st CDN rotation', () => {
  it('keeps the actual HLS session alive across CDN host/path rotation and timestamp rounding', async () => {
    const result = replay(playlist(oldMedia), playlist(freshMedia, '2026-10-18T01:25:36.789Z'));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(result.accepted).toEqual([43, 43]);
    expect(result.errors).toEqual([]);
  });

  it('still rejects a conflicting timeline for an existing segment instead of hiding playlist corruption', async () => {
    const result = replay(playlist(oldMedia), playlist(freshMedia, '2026-10-18T01:25:46.788Z'));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(result.errors).toEqual([expect.objectContaining({
      type: Hls.ErrorTypes.NETWORK_ERROR, details: Hls.ErrorDetails.LEVEL_PARSING_ERROR, fatal: true,
    })]);
  });

  it('retains strict URL consistency when the playlist provides no program timestamp', async () => {
    const before = playlist(oldMedia).replace(/^#EXT-X-PROGRAM-DATE-TIME:.*\n/m, '');
    const after = playlist(freshMedia).replace(/^#EXT-X-PROGRAM-DATE-TIME:.*\n/m, '');
    const result = replay(before, after);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(result.errors).toEqual([expect.objectContaining({
      details: Hls.ErrorDetails.LEVEL_PARSING_ERROR, fatal: true,
    })]);
  });

  it('does not relax validation for byte-range playlists', async () => {
    const before = playlist(oldMedia).replace('#EXTINF:5.005,', '#EXT-X-BYTERANGE:1000@0\n#EXTINF:5.005,');
    const after = playlist(freshMedia).replace('#EXTINF:5.005,', '#EXT-X-BYTERANGE:1000@0\n#EXTINF:5.005,');
    const result = replay(before, after);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(result.errors).toEqual([expect.objectContaining({
      details: Hls.ErrorDetails.LEVEL_PARSING_ERROR, fatal: true,
    })]);
  });

  it('keeps the latest signed destination intact without retaining the old download URL', () => {
    const rewriter = new EmbedStPlaylistRewriter();
    const first = rewriter.rewrite(playlist(oldMedia), playlistUrl).split('\n').find(line => line.startsWith('https:'))!;
    const second = rewriter.rewrite(playlist(freshMedia), playlistUrl).split('\n').find(line => line.startsWith('https:'))!;
    expect(new URL(second).pathname).toBe(new URL(first).pathname);
    expect(rewriter.resolve(second)).toBe(freshMedia);
    expect(new URL(rewriter.resolve(second)).searchParams.get('x-signature')).toBe('a/b+c=');
  });

  it('isolates matching segment numbers in different playlists', () => {
    const rewriter = new EmbedStPlaylistRewriter();
    const first = rewriter.rewrite(playlist(oldMedia), playlistUrl).split('\n').find(line => line.startsWith('https:'))!;
    const other = rewriter.rewrite(playlist(freshMedia), `${playlistUrl}&audio=other`).split('\n').find(line => line.startsWith('https:'))!;
    expect(new URL(other).pathname).not.toBe(new URL(first).pathname);
    const rotated = rewriter.rewrite(playlist(freshMedia), playlistUrl).split('\n').find(line => line.startsWith('https:'))!;
    expect(new URL(rotated).pathname).toBe(new URL(first).pathname);
  });

  it('blocks an unapproved destination hidden in a private transport identity', () => {
    const rewriter = new EmbedStPlaylistRewriter();
    const identity = `https://embed-st-media.invalid/1?url=${encodeURIComponent('https://evil.example/video.ts')}`;
    expect(() => rewriter.resolve(identity)).toThrow();
  });

  it('blocks credentialed CDN URLs rather than sending credentials through the fragment loader', () => {
    const rewriter = new EmbedStPlaylistRewriter();
    const identity = `https://embed-st-media.invalid/1?url=${encodeURIComponent('https://user:password@p16-common-sign.tiktokcdn.com/video.ts')}`;
    expect(() => rewriter.resolve(identity)).toThrow();
  });
});
