import { describe, it, expect } from 'vitest';
import {
  normalizeNetworkName,
  resolveBroadcastChannels,
  broadcastsFromEvent,
  mergeBroadcasts,
} from './broadcasters';
import type { AngulismoEvent, BroadcastChannel, PromiedosGame } from '@/types/api';
import type { Channel } from '@/types/channels';

const channels: Channel[] = [
  { name: 'TNT Sports', logo: 'tnt.png', show: true, options: [{ name: 'Opción 1', iframe: 'https://a.example/tnt' }] },
  { name: 'ESPN Premium', logo: 'espnp.png', show: true, options: [{ name: 'Opción 1', iframe: 'https://a.example/espnp' }] },
  { name: 'ESPN 1', logo: 'espn1.png', show: true, options: [{ name: 'Opción 1', iframe: 'https://a.example/espn1' }] },
  { name: 'Disney+', logo: 'disney.png', show: true, options: [{ name: 'Opción 1', iframe: 'https://a.example/disney' }] },
  { name: 'Superliga Argentina', logo: 'lpf.png', show: true, options: [{ name: 'Opción 1', iframe: 'https://a.example/lpf' }] },
  { name: 'Copa Libertadores', logo: 'lib.png', show: true, options: [{ name: 'Opción 1', iframe: 'https://a.example/lib' }] },
  // Options that are not real URLs must never be offered.
  { name: 'Telefe', logo: 'telefe.png', show: true, options: [{ name: 'Opción 1', iframe: 'undefined' }] },
];

const game = (overrides: Partial<PromiedosGame> = {}): PromiedosGame => ({
  id: 'g1',
  league: 'Liga Profesional Argentina',
  leagueId: 'hc',
  countryId: 'ba',
  homeTeam: 'Talleres de Córdoba',
  awayTeam: 'Unión de Santa Fe',
  startTimeMs: Date.parse('2026-09-12T23:00:00.000Z'),
  networks: [],
  ...overrides,
});

describe('normalizeNetworkName', () => {
  it('drops the commercial parenthetical and the plus sign', () => {
    expect(normalizeNetworkName('HBO MAX (Suscripción Pack fútbol)')).toBe('hbo max');
    expect(normalizeNetworkName('Disney+ Premium')).toBe('disney premium');
  });
});

describe('resolveBroadcastChannels', () => {
  it('maps the commercial product name to the catalog feed', () => {
    const resolved = resolveBroadcastChannels(game({ networks: ['TNT Sports Premium'] }), channels);
    expect(resolved.map(r => r.channel)).toEqual(['TNT Sports', 'Superliga Argentina']);
    expect(resolved[0].network).toBe('TNT Sports Premium');
    expect(resolved[0].options).toHaveLength(1);
  });

  it('resolves a bare ESPN to the Argentine ESPN 1 feed', () => {
    const resolved = resolveBroadcastChannels(
      game({ leagueId: 'zz', league: 'Unknown', networks: ['ESPN'] }),
      channels,
    );
    expect(resolved.map(r => r.channel)).toEqual(['ESPN 1']);
  });

  it('adds the competition channel when the league is known', () => {
    const resolved = resolveBroadcastChannels(
      game({ leagueId: 'zzz', league: 'CONMEBOL Libertadores', networks: [] }),
      channels,
    );
    expect(resolved.map(r => r.channel)).toEqual(['Copa Libertadores']);
  });

  it('ignores networks with no catalog counterpart', () => {
    const resolved = resolveBroadcastChannels(
      game({ leagueId: 'zz', league: 'Unknown', networks: ['LPF Play', 'HBO MAX (Suscripción Pack fútbol)'] }),
      channels,
    );
    expect(resolved).toEqual([]);
  });

  it('ignores channels whose only option is unplayable', () => {
    const resolved = resolveBroadcastChannels(
      game({ leagueId: 'zz', league: 'Unknown', networks: ['Telefe'] }),
      channels,
    );
    expect(resolved).toEqual([]);
  });

  it('does not list the same channel twice', () => {
    const resolved = resolveBroadcastChannels(
      game({ networks: ['TNT Sports Premium', 'TNT Sports'] }),
      channels,
    );
    expect(resolved.filter(r => r.channel === 'TNT Sports')).toHaveLength(1);
  });

  it('falls back to the longest known prefix for unseen variants', () => {
    const resolved = resolveBroadcastChannels(
      game({ leagueId: 'zz', league: 'Unknown', networks: ['ESPN Premium HD'] }),
      channels,
    );
    expect(resolved.map(r => r.channel)).toEqual(['ESPN Premium']);
  });
});

describe('broadcastsFromEvent', () => {
  const event = (channelName: string, urls: string[]): AngulismoEvent => ({
    id: '58',
    title: 'Liga Profesional: Talleres Córdoba vs. Unión Santa Fe',
    competition: 'Liga Profesional Argentina',
    homeTeam: 'Talleres Córdoba',
    awayTeam: 'Unión Santa Fe',
    startTimeMs: Date.parse('2026-09-12T23:00:00.000Z'),
    channels: [{
      name: channelName,
      logo: 'event.png',
      show: true,
      options: urls.map((iframe, i) => ({ name: `Opción ${i + 1}`, iframe })),
    }],
  });

  it('puts the feed URLs ahead of the ones we already hold', () => {
    const resolved = broadcastsFromEvent(event('ESPN Premium', ['https://fresh.example/a']), channels);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].channel).toBe('ESPN Premium');
    expect(resolved[0].options.map(o => o.iframe)).toEqual([
      'https://fresh.example/a',
      'https://a.example/espnp',
    ]);
  });

  it('offers channels missing from our catalog on their own', () => {
    const resolved = broadcastsFromEvent(event('Win+ Fútbol', ['https://fresh.example/w']), channels);
    expect(resolved[0]).toMatchObject({ channel: 'Win+ Fútbol', logo: 'event.png' });
    expect(resolved[0].options).toHaveLength(1);
  });

  it('skips a channel whose options are all unplayable', () => {
    expect(broadcastsFromEvent(event('Nowhere', ['undefined']), channels)).toEqual([]);
  });

  it('prefers our display name when the channel is one we know', () => {
    const resolved = broadcastsFromEvent(event('espn  premium', ['https://fresh.example/a']), channels);
    expect(resolved[0].channel).toBe('ESPN Premium');
    expect(resolved[0].network).toBe('espn  premium');
  });
});

describe('mergeBroadcasts', () => {
  const b = (channel: string): BroadcastChannel => ({
    network: channel, channel, logo: '', options: [{ name: 'o', iframe: 'https://a.example/x' }],
  });

  it('appends only channels not already present', () => {
    const merged = mergeBroadcasts([b('ESPN Premium')], [b('ESPN Premium'), b('Superliga Argentina')]);
    expect(merged.map(x => x.channel)).toEqual(['ESPN Premium', 'Superliga Argentina']);
  });

  it('compares names loosely', () => {
    const merged = mergeBroadcasts([b('TyC Sports')], [b('TYC  Sports')]);
    expect(merged).toHaveLength(1);
  });
});
