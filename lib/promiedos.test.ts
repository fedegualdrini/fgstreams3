import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parsePromiedosStartTime,
  extractNextData,
  parsePromiedosPayload,
  fetchPromiedosGames,
} from './promiedos';

describe('parsePromiedosStartTime', () => {
  it('reads the wall clock against the nominal UTC-3 reference', () => {
    // The absolute value is only a reference point — Promiedos localises times
    // to the viewer, and estimateFeedOffsetMs corrects any constant error.
    expect(parsePromiedosStartTime('12-09-2026 20:00')).toBe(
      Date.parse('2026-09-12T23:00:00.000Z'),
    );
  });

  it('rejects other formats', () => {
    expect(parsePromiedosStartTime('2026-09-12 20:00')).toBeNaN();
    expect(parsePromiedosStartTime(undefined)).toBeNaN();
    expect(parsePromiedosStartTime('')).toBeNaN();
  });
});

describe('extractNextData', () => {
  it('pulls the embedded payload out of the page', () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"a":1}</script></body></html>`;
    expect(extractNextData(html)).toEqual({ a: 1 });
  });

  it('returns null when the payload is absent or malformed', () => {
    expect(extractNextData('<html></html>')).toBeNull();
    expect(
      extractNextData('<script id="__NEXT_DATA__" type="application/json">{oops</script>'),
    ).toBeNull();
  });
});

describe('parsePromiedosPayload', () => {
  const payload = {
    props: {
      pageProps: {
        data: {
          leagues: [
            {
              id: 'hc',
              name: 'Liga Profesional Argentina',
              country_id: 'ba',
              games: [
                {
                  id: 'egdddbg',
                  teams: [{ name: 'Talleres de Córdoba' }, { name: 'Unión de Santa Fe' }],
                  start_time: '12-09-2026 20:00',
                  tv_networks: [{ id: 'idef', name: 'TNT Sports Premium' }],
                },
                {
                  id: 'no-tv',
                  teams: [{ name: 'A' }, { name: 'B' }],
                  start_time: '12-09-2026 21:00',
                  tv_networks: [],
                },
                {
                  id: 'bad-time',
                  teams: [{ name: 'A' }, { name: 'B' }],
                  start_time: 'tomorrow',
                  tv_networks: [{ name: 'ESPN' }],
                },
              ],
            },
          ],
        },
      },
    },
  };

  it('keeps only fixtures with a broadcaster and a parsable kickoff', () => {
    const games = parsePromiedosPayload(payload);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      id: 'egdddbg',
      league: 'Liga Profesional Argentina',
      leagueId: 'hc',
      homeTeam: 'Talleres de Córdoba',
      awayTeam: 'Unión de Santa Fe',
      networks: ['TNT Sports Premium'],
    });
    expect(games[0].startTimeMs).toBe(Date.parse('2026-09-12T23:00:00.000Z'));
  });

  it('returns an empty list for an unexpected shape', () => {
    expect(parsePromiedosPayload({})).toEqual([]);
    expect(parsePromiedosPayload(null)).toEqual([]);
    expect(parsePromiedosPayload({ props: { pageProps: { data: { leagues: 'nope' } } } })).toEqual([]);
  });
});

describe('fetchPromiedosGames', () => {
  const page = (games: unknown[]) =>
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { data: { leagues: [{ id: 'hc', name: 'LPF', country_id: 'ba', games }] } } },
    })}</script>`;

  const fixture = {
    id: 'g1',
    teams: [{ name: 'Talleres de Córdoba' }, { name: 'Unión de Santa Fe' }],
    start_time: '12-09-2026 20:00',
    tv_networks: [{ name: 'ESPN Premium' }],
  };

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('reports a successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => page([fixture]) })));
    const snapshot = await fetchPromiedosGames();
    expect(snapshot.ok).toBe(true);
    expect(snapshot.stale).toBe(false);
    expect(snapshot.games).toHaveLength(1);
  });

  it('reuses the last good snapshot when every page fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => page([fixture]) })));
    await fetchPromiedosGames();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('blocked'); }));
    const snapshot = await fetchPromiedosGames();
    expect(snapshot.ok).toBe(true);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.games).toHaveLength(1);
  });

  it('survives a partial outage using the pages that did respond', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('blocked');
      return { ok: true, text: async () => page([fixture]) };
    }));
    const snapshot = await fetchPromiedosGames();
    expect(snapshot.ok).toBe(true);
    expect(snapshot.games).toHaveLength(1);
  });
});
