import { load } from 'cheerio';
import type { FlashscoreEntry, FlashscoreDetail, FlashscoreEvent, FlashscoreStat, FlashscorePlayer, FlashscoreLineups } from '@/types/api';
import { getFlashscoreUrl } from './sportMap';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Live scores list ───────────────────────────────────────────────────────

/**
 * Fetches the live scores list for a given sport from flashscore.mobi
 * and parses the #score-data HTML into a flat array of FlashscoreEntry.
 *
 * HTML structure (consistent across all 27 sports):
 *   <div id="score-data">
 *     <h4>COUNTRY: League Name</h4>
 *     <span class="live">25'</span>Team A - Team B <a href="/match/ID/" class="live">2:1</a><br />
 *   </div>
 */
export async function fetchLiveScores(sport: string): Promise<FlashscoreEntry[]> {
  const url = getFlashscoreUrl(sport);
  if (!url) return [];

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: 0 },  // always fresh in the API route
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  return parseScoreData(html);
}

function parseScoreData(html: string): FlashscoreEntry[] {
  const $ = load(html);
  const entries: FlashscoreEntry[] = [];

  let currentLeague = '';
  let pendingStatus = '';
  let pendingMinute = '';
  let pendingTeams = '';

  // Walk every direct child node of #score-data (including text nodes)
  $('#score-data').contents().each(function () {
    const node = this as unknown as { type: string; name?: string; data?: string };

    if (node.type === 'tag') {
      const $el = $(this);

      if (node.name === 'h4') {
        currentLeague = $el.text().trim();
        pendingStatus = '';
        pendingTeams = '';
      } else if (node.name === 'span') {
        pendingStatus = ($el.attr('class') || 'sched').trim() || 'sched';
        pendingMinute = $el.text().trim();
        pendingTeams = '';
      } else if (node.name === 'a' && pendingStatus) {
        const href = $el.attr('href') || '';
        const idMatch = href.match(/\/match\/([^/\?]+)/);
        if (idMatch) {
          const flashscoreId = idMatch[1];
          const scoreText = $el.text().trim();
          const score = scoreText === '-:-' || scoreText === '' ? null : scoreText;
          const teamsStr = pendingTeams.trim();
          const sepIdx = teamsStr.indexOf(' - ');
          if (sepIdx !== -1) {
            entries.push({
              flashscoreId,
              league: currentLeague,
              team1: teamsStr.substring(0, sepIdx).trim(),
              team2: teamsStr.substring(sepIdx + 3).trim(),
              score,
              status: pendingStatus,
              minute: pendingMinute,
            });
          }
        }
        pendingStatus = '';
        pendingMinute = '';
        pendingTeams = '';
      }
    } else if (node.type === 'text' && pendingStatus) {
      pendingTeams += node.data ?? '';
    }
  });

  return entries;
}

// ─── Match detail ────────────────────────────────────────────────────────────

/**
 * Fetches a specific match detail page from flashscore.mobi and parses
 * the current score, period breakdown, and incident list.
 *
 * Detail page structure:
 *   <body data-match-id="ID">
 *     <h3>Team A - Team B</h3>
 *     <div class="detail"><b>2:1</b>  (1:0, 1:1)</div>
 *     <div class="incident soccer">
 *       <p class="i-field time">22'</p>
 *       <p class="i-field icon ball">&nbsp;</p>
 *       Haaland E.
 *     </div>
 *   </body>
 */
export async function fetchMatchDetail(flashscoreId: string): Promise<FlashscoreDetail | null> {
  const base = `https://www.flashscore.mobi/match/${flashscoreId}/`;

  // Fetch all three tabs in parallel
  const fetchTab = async (tab?: string): Promise<string | null> => {
    try {
      const url = tab ? `${base}?t=${tab}` : base;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        next: { revalidate: 0 },
      });
      if (!res.ok) return null;
      return res.text();
    } catch {
      return null;
    }
  };

  const [detailHtml, statsHtml, lineupsHtml] = await Promise.all([
    fetchTab(),
    fetchTab('stats'),
    fetchTab('lineups'),
  ]);

  if (!detailHtml) return null;

  const detail = parseMatchDetail(detailHtml, flashscoreId);
  if (!detail) return null;

  detail.stats = statsHtml ? parseMatchStats(statsHtml) : [];
  detail.lineups = lineupsHtml ? parseMatchLineups(lineupsHtml) : null;

  return detail;
}

function parseMatchDetail(html: string, flashscoreId: string): FlashscoreDetail | null {
  const $ = load(html);

  // Score: first <b> inside .detail
  const scoreEl = $('div.detail b').first();
  const scoreText = scoreEl.text().trim();
  const score = scoreText && scoreText !== '-:-' ? scoreText : null;

  // Period breakdown: text in .detail divs after stripping the <b> tag
  let periods = '';
  $('div.detail').each(function () {
    const $d = $(this);
    const text = $d.text().trim();
    // Period breakdown looks like "(1:0, 1:1)" or "(0:0,0:0,1:0)"
    if (/^\([\d:,\s]+\)/.test(text)) {
      periods = text;
    }
  });

  // Status: look for live minute indicator or "finished" text
  let status = 'live';
  let minute = '';

  // Check for a live clock span
  const clockEl = $('div.detail span.live, span.livetime, span.clock').first();
  if (clockEl.length) {
    minute = clockEl.text().trim();
    status = 'live';
  } else {
    // Check detail divs for status text
    $('div.detail').each(function () {
      const text = $(this).text().trim().toLowerCase();
      if (
        text.includes('finished') ||
        text.includes('after extra time') ||
        text.includes('penalties') ||
        text === 'ft' ||
        text === 'aet'
      ) {
        status = 'fin';
      }
    });

    // If no score → not started
    if (!score) status = 'sched';
  }

  // Events: parse incident divs
  const events: FlashscoreEvent[] = [];

  // Parse team names from <h3> to determine home/away assignment
  const matchTitle = $('h3').first().text().trim();
  const titleSep = matchTitle.indexOf(' - ');
  const homeTeam = titleSep !== -1 ? matchTitle.substring(0, titleSep).trim() : '';

  $('div.incident').each(function () {
    const $inc = $(this);
    const incMinute = $inc.find('p.time').text().trim();
    if (!incMinute) return;

    // Determine event type from the icon class
    const iconEl = $inc.find('p.icon');
    const iconClass = iconEl.attr('class') || '';
    let type: FlashscoreEvent['type'] = 'other';
    if (iconClass.includes('ball') || iconClass.includes('goal')) type = 'goal';
    else if (iconClass.includes('yellow')) type = 'yellow_card';
    else if (iconClass.includes('red')) type = 'red_card';
    else if (iconClass.includes('sub') || iconClass.includes('subst')) type = 'substitution';

    // Player name: text content of .incident minus the child <p> elements
    const rawText = $inc.clone().children('p').remove().end().text().trim();
    // Clean up extra whitespace and brackets like "() [DRC]"
    const player = rawText.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

    // Determine home/away: check for a positioning class on the incident
    const incClass = $inc.attr('class') || '';
    let team: FlashscoreEvent['team'] = 'unknown';
    if (incClass.includes('home') || incClass.includes('fl')) team = 'home';
    else if (incClass.includes('away') || incClass.includes('fr')) team = 'away';

    if (player || type !== 'other') {
      events.push({ minute: incMinute, type, team, player });
    }
  });

  return { flashscoreId, score, status, minute, periods, events, stats: [], lineups: null };
}

function parseMatchStats(html: string): FlashscoreStat[] {
  const $ = load(html);
  const stats: FlashscoreStat[] = [];

  // Each stat row: [home value] [label] [away value] with bar chart elements
  $('[data-testid="wcl-statistics"]').each(function () {
    const $row = $(this);

    const values = $row.find('[data-testid="wcl-statistics-value"] span');
    const homeVal = values.eq(0).text().trim();
    const awayVal = values.eq(1).text().trim();
    const label = $row.find('[data-testid="wcl-statistics-category"] span').first().text().trim();

    if (!label || (!homeVal && !awayVal)) return;

    // Bar widths are inline styles on the chart divs: style="width:58%"
    const homeChartStyle = $row.find('[data-testid="wcl-statistics-chart-home"]').attr('style') || '';
    const awayChartStyle = $row.find('[data-testid="wcl-statistics-chart-away"]').attr('style') || '';

    const pctMatch = (s: string) => {
      const m = s.match(/width:\s*([\d.]+)%/);
      return m ? parseFloat(m[1]) : 50;
    };

    const homePct = pctMatch(homeChartStyle);
    const awayPct = pctMatch(awayChartStyle);

    stats.push({ label, home: homeVal, away: awayVal, homePct, awayPct });
  });

  return stats;
}

function parseMatchLineups(html: string): FlashscoreLineups | null {
  const $ = load(html);

  // Lineups page has: h4 (team name) → table.lineup (starters) → hr.lineup-separator → table.lineup (subs)
  // This pattern repeats for home then away.
  const teamBlocks: Array<{
    name: string;
    players: FlashscorePlayer[];
    subs: FlashscorePlayer[];
  }> = [];

  let currentBlock: typeof teamBlocks[0] | null = null;
  let pastSeparator = false;

  // Walk all relevant elements in order
  $('h4, table.lineup, hr.lineup-separator').each(function () {
    const el = this as { name: string };

    if (el.name === 'h4') {
      if (currentBlock) teamBlocks.push(currentBlock);
      currentBlock = { name: $(this).text().trim(), players: [], subs: [] };
      pastSeparator = false;
    } else if (el.name === 'hr') {
      pastSeparator = true;
    } else if (el.name === 'table' && currentBlock) {
      const rows: FlashscorePlayer[] = [];
      $(this).find('tr').each(function () {
        const number = $(this).find('td.number').text().trim();
        const name = $(this).find('td a').text().trim() || $(this).find('td').not('.number').first().text().trim();
        if (name) rows.push({ number, name });
      });
      if (pastSeparator) {
        currentBlock.subs.push(...rows);
      } else {
        currentBlock.players.push(...rows);
      }
    }
  });

  if (currentBlock) teamBlocks.push(currentBlock);

  if (teamBlocks.length < 2) return null;

  return {
    homeTeam: teamBlocks[0].name,
    awayTeam: teamBlocks[1].name,
    homePlayers: teamBlocks[0].players,
    awayPlayers: teamBlocks[1].players,
    homeSubs: teamBlocks[0].subs,
    awaySubs: teamBlocks[1].subs,
  };
}
