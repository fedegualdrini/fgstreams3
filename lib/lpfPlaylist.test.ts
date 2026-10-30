// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { inspectLpfPlaylist } from './lpfPlaylist';

const root = 'https://edge.encoders.immergo.tv/live/master.m3u8';
const now = Date.parse('2026-10-25T12:00:00Z');

function mediaPlaylist(timestamp?: string, targetDuration = 6, durations = [6, 6]): string {
  const lines = ['#EXTM3U', `#EXT-X-TARGETDURATION:${targetDuration}`, '#EXT-X-MEDIA-SEQUENCE:42'];
  if (timestamp !== undefined) lines.push(`#EXT-X-PROGRAM-DATE-TIME:${timestamp}`);
  for (let index = 0; index < durations.length; index++) {
    lines.push(`#EXTINF:${durations[index]},`, `segment-${index}.ts`);
  }
  return `${lines.join('\n')}\n`;
}

describe('inspectLpfPlaylist', () => {
  it('detects the provider\'s finished October 17 broadcast without ENDLIST on October 25', async () => {
    const fetchPlaylist = vi.fn(async () => new Response(mediaPlaylist('2026-10-17T23:59:48+0000')));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('ended');
    expect(fetchPlaylist).toHaveBeenCalledExactlyOnceWith(root);
  });

  it('marks an explicit ENDLIST ended even if its segments are recent', async () => {
    const text = `${mediaPlaylist('2026-10-25T11:59:48Z')}#EXT-X-ENDLIST\n`;
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('ended');
  });

  it('uses ENDLIST as evidence of completion even without program timestamps', async () => {
    const text = `${mediaPlaylist()}#EXT-X-ENDLIST\n`;
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('ended');
  });

  it('recognizes a recent media timeline with the provider\'s +0000 timezone', async () => {
    const fetchPlaylist = vi.fn(async () => new Response(mediaPlaylist('2026-10-25T11:59:48+0000')));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('live');
    // Inspecting status must never download the segment URIs.
    expect(fetchPlaylist.mock.calls).toEqual([[root]]);
  });

  it('includes every segment duration following a program timestamp', async () => {
    const timestamp = new Date(now - 130_000).toISOString();
    expect(await inspectLpfPlaylist(root, async () => new Response(mediaPlaylist(timestamp)), now)).toBe('live');
  });

  it.each([
    { target: 6, age: 120_000, expected: 'live' },
    { target: 6, age: 120_001, expected: 'ended' },
    { target: 60, age: 180_000, expected: 'live' },
    { target: 60, age: 180_001, expected: 'ended' },
  ])('applies the stale threshold for target $target and final timeline age $age', async ({ target, age, expected }) => {
    const timestamp = new Date(now - age - target * 1000).toISOString();
    const text = mediaPlaylist(timestamp, target, [target]);
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe(expected);
  });

  it('does not let a dangling fresh timestamp revive old segments', async () => {
    const text = `${mediaPlaylist('2026-10-17T23:59:48Z')}#EXT-X-PROGRAM-DATE-TIME:2026-10-25T12:00:00Z\n`;
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('ended');
  });

  it.each([
    undefined,
    'not-a-date',
    '2026-10-25T11:59:48',
    '2026-10-25T13:00:00Z',
  ])('reports unknown rather than inventing status from timestamp %s', async timestamp => {
    const text = mediaPlaylist(timestamp);
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('unknown');
  });

  it('requires a new timestamp after a discontinuity before declaring the final timeline live', async () => {
    const text = `${mediaPlaylist('2026-10-25T11:59:48Z')}#EXT-X-DISCONTINUITY\n#EXTINF:6,\nafter.ts\n`;
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('unknown');
  });

  it('can use a later timestamp to anchor the final segments', async () => {
    const text = `${mediaPlaylist()}#EXT-X-PROGRAM-DATE-TIME:2026-10-25T11:59:54Z\n#EXTINF:6,\nlatest.ts\n`;
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('live');
  });

  it.each([
    '',
    '<html>Bot Verification</html>',
    '#EXTM3U\n',
    '#EXTM3U\n#EXT-X-ENDLIST\n',
    '#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment.ts\n',
    '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n',
    '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:broken,\nsegment.ts\n',
    '#EXTM3U\n#EXT-X-TARGETDURATION:0\n#EXTINF:6,\nsegment.ts\n',
    '#EXTM3U\n#EXTINF:6,\nsegment.ts\n',
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n',
  ])('rejects empty or malformed HLS: %s', async text => {
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('unavailable');
  });

  it('follows a relative master variant and inspects only its playlist', async () => {
    const variant = 'https://edge.encoders.immergo.tv/video/mono.m3u8?token=signed';
    const fetchPlaylist = vi.fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n../video/mono.m3u8?token=signed\n'))
      .mockResolvedValueOnce(new Response(mediaPlaylist('2026-10-25T11:59:48Z')));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('live');
    expect(fetchPlaylist.mock.calls).toEqual([[root], [variant]]);
  });

  it('uses the final validated response URL to resolve relative variants', async () => {
    const response = new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nmono.m3u8\n');
    Object.defineProperty(response, 'url', { value: 'https://other.encoders.immergo.tv/rotated/master.m3u8' });
    const fetchPlaylist = vi.fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response(mediaPlaylist('2026-10-25T11:59:48Z')));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('live');
    expect(fetchPlaylist.mock.calls).toEqual([[root], ['https://other.encoders.immergo.tv/rotated/mono.m3u8']]);
  });

  it.each([
    'http://edge.encoders.immergo.tv/live/mono.m3u8',
    'https://evil.example/mono.m3u8',
    'https://edge.encoders.immergo.tv.evil.example/mono.m3u8',
    'https://user:password@edge.encoders.immergo.tv/live/mono.m3u8',
    'https://edge.encoders.immergo.tv/live/video.ts',
    'javascript:alert(1)',
  ])('rejects disallowed variants before requesting them: %s', async variant => {
    const fetchPlaylist = vi.fn(async () => new Response(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n${variant}\n`));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('unavailable');
    expect(fetchPlaylist).toHaveBeenCalledExactlyOnceWith(root);
  });

  it('rejects a disallowed initial URL without any request', async () => {
    const fetchPlaylist = vi.fn<(url: string) => Promise<Response>>();
    expect(await inspectLpfPlaylist('https://emitiendoenvivo.com/lpf/1.m3u8', fetchPlaylist, now)).toBe('unavailable');
    expect(fetchPlaylist).not.toHaveBeenCalled();
  });

  it('stops master cycles without refetching the same URL', async () => {
    const next = 'https://edge.encoders.immergo.tv/live/other.m3u8';
    const fetchPlaylist = vi.fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nother.m3u8\n'))
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nmaster.m3u8#cycle\n'));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('unavailable');
    expect(fetchPlaylist.mock.calls).toEqual([[root], [next]]);
  });

  it('bounds nested master traversal to four playlist requests', async () => {
    const fetchPlaylist = vi.fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\na.m3u8\n'))
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nb.m3u8\n'))
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nc.m3u8\n'))
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nd.m3u8\n'));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('unavailable');
    expect(fetchPlaylist).toHaveBeenCalledTimes(4);
  });

  it('rejects oversized playlists before parsing them', async () => {
    const text = `#EXTM3U\n#${'x'.repeat(256 * 1024)}\n${mediaPlaylist('2026-10-25T11:59:48Z')}`;
    expect(await inspectLpfPlaylist(root, async () => new Response(text), now)).toBe('unavailable');
  });

  it('reports HTTP errors as unavailable even if the body resembles live HLS', async () => {
    const text = mediaPlaylist('2026-10-25T11:59:48Z');
    expect(await inspectLpfPlaylist(root, async () => new Response(text, { status: 503 }), now)).toBe('unavailable');
  });

  it('reports transport failures as unavailable', async () => {
    const fetchPlaylist = vi.fn<(url: string) => Promise<Response>>().mockRejectedValue(new Error('Deadline exceeded'));
    expect(await inspectLpfPlaylist(root, fetchPlaylist, now)).toBe('unavailable');
  });
});
