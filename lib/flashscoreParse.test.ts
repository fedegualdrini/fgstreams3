import { describe, it, expect } from 'vitest';
import { parseMatchDetail, parseMatchLineups, parseMatchStats } from './flashscoreParse';

const FINISHED_MATCH = `
<body>
  <h3>Newells Old Boys - Instituto</h3>
  <div class="detail"><b>2:1</b></div>
  <div class="detail">(1:0, 1:1)</div>
  <div class="detail">Finished</div>
  <div class="incident soccer">
    <p class="i-field time">22'</p>
    <p class="i-field icon ball">&nbsp;</p>
    Mazzantti W. [NEW]
  </div>
  <div class="incident soccer">
    <p class="i-field time">60'</p>
    <p class="i-field icon y-card">&nbsp;</p>
    Mosevich L. [INS]
  </div>
</body>`;

describe('parseMatchDetail', () => {
  it('reads score, periods, status and incidents from a finished match', () => {
    const detail = parseMatchDetail(FINISHED_MATCH, 'abc');

    expect(detail).toMatchObject({
      flashscoreId: 'abc',
      score: '2:1',
      periods: '(1:0, 1:1)',
      status: 'fin',
      minute: '',
      stats: [],
      lineups: null,
    });
    expect(detail?.events).toEqual([
      { minute: "22'", type: 'goal', team: 'home', player: 'Mazzantti W.' },
      { minute: "60'", type: 'yellow_card', team: 'away', player: 'Mosevich L.' },
    ]);
  });

  it('reports a live clock as live with its minute', () => {
    const html = `<body><h3>A - B</h3><div class="detail"><b>1:0</b> <span class="live">34'</span></div></body>`;
    expect(parseMatchDetail(html, 'x')).toMatchObject({ status: 'live', minute: "34'", score: '1:0' });
  });

  it('treats a match with no score as not started', () => {
    const html = `<body><h3>A - B</h3><div class="detail"><b>-:-</b></div></body>`;
    expect(parseMatchDetail(html, 'x')).toMatchObject({ status: 'sched', score: null });
  });

  it('leaves the team unknown when the bracket code fits neither side', () => {
    const html = `
      <body><h3>Boca Juniors - River Plate</h3>
        <div class="incident"><p class="time">5'</p><p class="icon ball"></p>Someone X. [ZZZ]</div>
      </body>`;
    expect(parseMatchDetail(html, 'x')?.events).toEqual([
      { minute: "5'", type: 'goal', team: 'unknown', player: 'Someone X.' },
    ]);
  });
});

describe('parseMatchLineups', () => {
  const html = `
    <h4>Home FC</h4>
    <table class="lineup">
      <tr><td class="number">1</td><td><a>Keeper A.</a></td></tr>
      <tr><td class="number">9</td><td>Striker B.</td></tr>
    </table>
    <hr class="lineup-separator">
    <table class="lineup"><tr><td class="number">12</td><td><a>Sub C.</a></td></tr></table>
    <h4>Away FC</h4>
    <table class="lineup"><tr><td class="number">1</td><td><a>Keeper D.</a></td></tr></table>`;

  it('splits starters and substitutes for both teams', () => {
    expect(parseMatchLineups(html)).toEqual({
      homeTeam: 'Home FC',
      awayTeam: 'Away FC',
      homePlayers: [
        { number: '1', name: 'Keeper A.' },
        { number: '9', name: 'Striker B.' },
      ],
      awayPlayers: [{ number: '1', name: 'Keeper D.' }],
      homeSubs: [{ number: '12', name: 'Sub C.' }],
      awaySubs: [],
    });
  });

  it('returns null unless both teams are present', () => {
    expect(parseMatchLineups('<h4>Only FC</h4><table class="lineup"></table>')).toBeNull();
  });
});

describe('parseMatchStats', () => {
  it('reads values, label and bar widths, defaulting a missing bar to 50%', () => {
    const html = `
      <div data-testid="wcl-statistics">
        <div data-testid="wcl-statistics-value"><span>58%</span></div>
        <div data-testid="wcl-statistics-category"><span>Ball Possession</span></div>
        <div data-testid="wcl-statistics-value"><span>42%</span></div>
        <div data-testid="wcl-statistics-chart-home" style="width:58%"></div>
      </div>`;
    expect(parseMatchStats(html)).toEqual([
      { label: 'Ball Possession', home: '58%', away: '42%', homePct: 58, awayPct: 50 },
    ]);
  });
});
