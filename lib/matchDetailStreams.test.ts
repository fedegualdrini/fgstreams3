import { describe, it, expect } from 'vitest';
import type { BroadcastChannel, Stream } from '@/types/api';
import {
  attributeStreamsToSources,
  broadcastToChannel,
  deriveInitialPlayback,
  pickNextStream,
  sourcesKey,
} from './matchDetailStreams';

const sources = [
  { source: 'alpha', id: 'a' },
  { source: 'beta', id: 'b' },
];

const hd: Stream = { url: 'https://x/hd', language: 'en', quality: 'HD' };
const sd: Stream = { url: 'https://x/sd', language: 'es', quality: 'SD' };
const tv: BroadcastChannel = {
  network: 'ESPN',
  channel: 'ESPN 1',
  logo: 'espn.png',
  options: [{ name: 'Opción 1', iframe: 'https://x/espn' }],
};

describe('attributeStreamsToSources', () => {
  it('fills a missing source from the response position and keeps an explicit one', () => {
    const result = attributeStreamsToSources(sources, [[{ url: 'u1' }], [{ url: 'u2', source: 'own' }]]);
    expect(result.map(s => s.source)).toEqual(['alpha', 'own']);
  });
});

describe('sourcesKey', () => {
  it('joins source and id, and is empty without sources', () => {
    expect(sourcesKey(sources)).toBe('alpha:a,beta:b');
    expect(sourcesKey(undefined)).toBe('');
  });
});

describe('deriveInitialPlayback', () => {
  const base = { streamsResolved: false, broadcasts: [], sources };

  it('plays the best server-provided stream and skips the first fetch', () => {
    const result = deriveInitialPlayback({ ...base, initialStreams: [sd, hd] });
    expect(result).toMatchObject({ currentIndex: 1, isResolving: false, skipInitialFetch: true });
  });

  it('shows a pending lookup only when nothing was resolved and sources exist', () => {
    expect(deriveInitialPlayback(base)).toMatchObject({ currentIndex: null, isResolving: true, skipInitialFetch: false });
    expect(deriveInitialPlayback({ ...base, sources: [] }).isResolving).toBe(false);
  });

  it('picks the TV channel up front when the server resolved no direct stream', () => {
    const result = deriveInitialPlayback({ ...base, streamsResolved: true, initialStreams: [], broadcasts: [tv] });
    expect(result).toMatchObject({ selectedChannel: tv, isResolving: false, skipInitialFetch: true });
  });

  it('keeps direct streams ahead of the TV channel', () => {
    const result = deriveInitialPlayback({ ...base, streamsResolved: true, initialStreams: [hd], broadcasts: [tv] });
    expect(result.selectedChannel).toBeNull();
  });
});

describe('pickNextStream', () => {
  it('returns the best untried stream with its original index', () => {
    const streams = [sd, hd, { ...sd, url: 'https://x/other' }];
    expect(pickNextStream(streams, new Set([1]))).toEqual({ stream: streams[0], index: 0 });
  });

  it('resolves duplicate URLs by index', () => {
    const streams = [{ ...hd }, { ...hd }];
    expect(pickNextStream(streams, new Set([0]))?.index).toBe(1);
  });

  it('returns null once every stream has been tried', () => {
    expect(pickNextStream([hd, sd], new Set([0, 1]))).toBeNull();
  });
});

describe('broadcastToChannel', () => {
  it('maps a broadcast onto the catalog channel shape', () => {
    expect(broadcastToChannel(tv)).toEqual({
      name: 'ESPN 1',
      logo: 'espn.png',
      options: tv.options,
      show: true,
    });
  });
});
