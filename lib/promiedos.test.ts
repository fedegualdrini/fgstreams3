import { describe, it, expect } from 'vitest';
import { parsePromiedosStartTime, extractNextData, parsePromiedosPayload } from './promiedos';

describe('parsePromiedosStartTime', () => {
  it('reads Argentina local time as UTC-3', () => {
    // 20:00 in Buenos Aires is 23:00 UTC the same day.
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
