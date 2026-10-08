import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAngulismoDate, parseEventTitle, parseAngulismoData, fetchAngulismoData } from './angulismo';

describe('parseAngulismoDate', () => {
  it('reads Argentina local time as UTC-3', () => {
    expect(parseAngulismoDate('2026-09-12 20:00:00')).toBe(
      Date.parse('2026-09-12T23:00:00.000Z'),
    );
  });

  it('tolerates a missing seconds field and an ISO separator', () => {
    expect(parseAngulismoDate('2026-09-12T20:00')).toBe(
      Date.parse('2026-09-12T23:00:00.000Z'),
    );
  });

  it('rejects anything else', () => {
    expect(parseAngulismoDate('12-09-2026 20:00')).toBeNaN();
    expect(parseAngulismoDate(undefined)).toBeNaN();
  });
});

describe('parseEventTitle', () => {
  it('drops the competition prefix and splits the teams', () => {
    expect(parseEventTitle('Liga Profesional: Talleres Córdoba vs. Unión Santa Fe')).toEqual({
      home: 'Talleres Córdoba',
      away: 'Unión Santa Fe',
    });
  });

  it('handles "vs" without the period and no prefix', () => {
    expect(parseEventTitle('Racing Santander vs Deportivo Alavés')).toEqual({
      home: 'Racing Santander',
      away: 'Deportivo Alavés',
    });
  });

  it('returns null for non-fixture titles', () => {
    expect(parseEventTitle('Fórmula 1: Clasificación')).toBeNull();
    expect(parseEventTitle('')).toBeNull();
  });
});

describe('parseAngulismoData', () => {
  const payload = {
    events: [
      {
        id: 58,
        evento: 'Liga Profesional: Talleres Córdoba vs. Unión Santa Fe',
        fecha: '2026-09-12 20:00:00',
        competencia: 'Liga Profesional Argentina',
        logoUrl: 'https://pics.example/saf.png',
        canales: [
          {
            name: 'ESPN Premium',
            options: [
              { name: 'Opción 1', iframe: 'https://a.example/one' },
              { name: 'Opción 2', iframe: 'undefined' },
            ],
          },
          { name: 'Sin opciones', options: [{ name: 'x', iframe: 'undefined' }] },
        ],
      },
      // No two teams to match on.
      { id: 59, evento: 'Fórmula 1: Clasificación', fecha: '2026-09-12 11:00:00', canales: [] },
      // Unparsable kickoff.
      { id: 60, evento: 'A vs. B', fecha: 'later', canales: [{ name: 'C', options: [{ name: 'o', iframe: 'https://a.example/two' }] }] },
    ],
    channels: [
      { name: 'ESPN Premium', logo: 'l.png', options: [{ name: 'Opción 1', iframe: 'https://a.example/one' }] },
      { name: 'Dead', logo: '', options: [{ name: 'Opción 1', iframe: 'undefined' }] },
    ],
  };

  it('keeps only fixtures with two teams, a kickoff and a playable channel', () => {
    const { events } = parseAngulismoData(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: '58',
      homeTeam: 'Talleres Córdoba',
      awayTeam: 'Unión Santa Fe',
      competition: 'Liga Profesional Argentina',
    });
    expect(events[0].startTimeMs).toBe(Date.parse('2026-09-12T23:00:00.000Z'));
  });

  it('drops unplayable options and channels left with none', () => {
    const { events, channels } = parseAngulismoData(payload);
    expect(events[0].channels).toHaveLength(1);
    expect(events[0].channels[0].options.map(o => o.iframe)).toEqual(['https://a.example/one']);
    expect(channels.map(c => c.name)).toEqual(['ESPN Premium']);
  });

  it('returns empty lists for an unexpected shape', () => {
    expect(parseAngulismoData({ nope: true })).toEqual({ events: [], channels: [] });
    expect(parseAngulismoData(null)).toEqual({ events: [], channels: [] });
  });
});

describe('fetchAngulismoData', () => {
  const good = {
    events: [],
    channels: [{ name: 'ESPN Premium', logo: '', options: [{ name: 'o', iframe: 'https://a.example/one' }] }],
  };

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('reports a successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => good })));
    const snapshot = await fetchAngulismoData();
    expect(snapshot.ok).toBe(true);
    expect(snapshot.stale).toBe(false);
    expect(snapshot.channels).toHaveLength(1);
  });

  it('reuses the last good payload when a refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => good })));
    await fetchAngulismoData();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const snapshot = await fetchAngulismoData();
    expect(snapshot.ok).toBe(true);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.channels).toHaveLength(1);
  });

  it('treats a structurally valid but empty payload as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ events: [], channels: [] }) })));
    // The previous test left a good payload cached, so this falls back to it
    // rather than reporting nothing.
    const snapshot = await fetchAngulismoData();
    expect(snapshot.stale).toBe(true);
  });
});
