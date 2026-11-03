// @vitest-environment node
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Match, RawMatch } from '@/types/api';
import type * as ApiModule from '@/lib/api';

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/lib/api', async importOriginal => ({
  ...await importOriginal<typeof ApiModule>(),
  fetchAllMatches: async () => matches,
}));
vi.mock('@/lib/promiedos', () => ({
  fetchPromiedosGames: async () => ({ games: [], ok: false, stale: false }),
}));
vi.mock('@/lib/angulismo', () => ({
  fetchAngulismoData: async () => ({ events: [], channels: [], ok: false, stale: false }),
}));
vi.mock('@/lib/channelCatalog', () => ({ getChannelCatalog: async () => [] }));
vi.mock('@/components/MatchDetailClient', () => ({
  default: ({ match }: { match: Match }) => <h1>{match.team1} vs {match.team2}</h1>,
}));

const matches: RawMatch[] = ['bayern-munich-vs-atlético-madrid', 'aston-villa-vs-barcelona', 'literal-%C3%A9'].map(stream_key => ({
  stream_key,
  name: 'Bayern Munich vs Atlético Madrid',
  category: 'soccer',
  sources: [{ quality: 'FHD', url: `https://strmfree.st/embed/soccer/${encodeURIComponent(stream_key)}1080p`, live: true }],
}));

const { default: MatchDetailPage, generateMetadata } = await import('./page');

describe('match route catalog lookup', () => {
  it.each(matches.map(match => match.stream_key))('opens the encoded path for provider key %s without decoding twice', async id => {
    const params = Promise.resolve({ id: encodeURIComponent(id) });
    const page = await MatchDetailPage({ params });
    expect(page.props.match.id).toBe(id);
    expect(renderToStaticMarkup(page)).toContain('Atlético Madrid');
    expect((await generateMetadata({ params })).title).toContain('Atlético Madrid');
  });

  it.each(['missing-match', 'bad-%E0%A4%A', 'bad-%'])('keeps malformed or unknown path %s not found', async id => {
    await expect(MatchDetailPage({ params: Promise.resolve({ id }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
