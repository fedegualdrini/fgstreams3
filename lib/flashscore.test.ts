import { describe, it, expect } from 'vitest';
import { parseScoreData } from './flashscore';

// Minimal HTML fixtures mirroring the actual flashscore.mobi #score-data structure
const FIXTURE_WITH_LIVE_MATCH = `
<html><body>
  <div id="score-data">
    <h4>ENGLAND: Premier League</h4>
    <span class="live">42'</span>Arsenal - Chelsea <a href="/match/abc123/" class="live">1:0</a><br/>
    <span class="sched">20:00</span>Liverpool - Everton <a href="/match/def456/">-:-</a><br/>
  </div>
</body></html>
`;

const FIXTURE_FINISHED = `
<html><body>
  <div id="score-data">
    <h4>SPAIN: La Liga</h4>
    <span class="fin">FT</span>Real Madrid - Atletico Madrid <a href="/match/ghi789/" class="fin">2:1</a><br/>
  </div>
</body></html>
`;

const FIXTURE_EMPTY = `
<html><body>
  <div id="score-data"></div>
</body></html>
`;

const FIXTURE_NO_SCORE_DATA = `<html><body><div id="other"></div></body></html>`;

describe('parseScoreData', () => {
  it('parses live match correctly', () => {
    const entries = parseScoreData(FIXTURE_WITH_LIVE_MATCH);
    const live = entries.find(e => e.flashscoreId === 'abc123');
    expect(live).toBeDefined();
    expect(live?.team1).toBe('Arsenal');
    expect(live?.team2).toBe('Chelsea');
    expect(live?.score).toBe('1:0');
    expect(live?.status).toBe('live');
    expect(live?.minute).toBe("42'");
    expect(live?.league).toBe('ENGLAND: Premier League');
  });

  it('parses scheduled match with null score', () => {
    const entries = parseScoreData(FIXTURE_WITH_LIVE_MATCH);
    const sched = entries.find(e => e.flashscoreId === 'def456');
    expect(sched).toBeDefined();
    expect(sched?.score).toBeNull();
    expect(sched?.status).toBe('sched');
    expect(sched?.team1).toBe('Liverpool');
    expect(sched?.team2).toBe('Everton');
  });

  it('parses finished match correctly', () => {
    const entries = parseScoreData(FIXTURE_FINISHED);
    expect(entries).toHaveLength(1);
    const [m] = entries;
    expect(m.flashscoreId).toBe('ghi789');
    expect(m.score).toBe('2:1');
    expect(m.status).toBe('fin');
    expect(m.team1).toBe('Real Madrid');
    expect(m.team2).toBe('Atletico Madrid');
  });

  it('returns empty array for empty score-data', () => {
    expect(parseScoreData(FIXTURE_EMPTY)).toEqual([]);
  });

  it('returns empty array when score-data element is absent', () => {
    expect(parseScoreData(FIXTURE_NO_SCORE_DATA)).toEqual([]);
  });

  it('strips HTML tags from team names', () => {
    const html = `
      <html><body><div id="score-data">
        <h4>TEST</h4>
        <span class="live">5'</span><b>Team A</b> - <i>Team B</i> <a href="/match/t1/">1:0</a><br/>
      </div></body></html>
    `;
    const entries = parseScoreData(html);
    // HTML tags should be stripped from the text node between span and anchor
    entries.forEach(e => {
      expect(e.team1).not.toMatch(/<[^>]+>/);
      expect(e.team2).not.toMatch(/<[^>]+>/);
    });
  });
});
