import { describe, it, expect } from 'vitest';
import { normalizeNetworkName, resolveBroadcastChannels } from './broadcasters';
import type { PromiedosGame } from '@/types/api';
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
