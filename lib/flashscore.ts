import { load } from 'cheerio';
import type { FlashscoreEntry, FlashscoreDetail, FlashscoreEvent, FlashscoreStat, FlashscorePlayer, FlashscoreLineups } from '@/types/api';
import { getFlashscoreUrl } from './sportMap';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Strip HTML tags from scraped text to prevent injected markup reaching the UI. */
function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

/** Map a raw flashscore span class to a typed status value. */
function toMatchStatus(cls: string): 'live' | 'fin' | 'sched' {
  if (cls === 'live' || cls === 'fin') return cls;
  return 'sched';
}

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

export function parseScoreData(html: string): FlashscoreEntry[] {
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
        currentLeague = sanitize($el.text());
        pendingStatus = '';
        pendingTeams = '';
      } else if (node.name === 'span') {
        pendingStatus = toMatchStatus(($el.attr('class') || '').trim());
        pendingMinute = sanitize($el.text());
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
              team1: sanitize(teamsStr.substring(0, sepIdx)),
              team2: sanitize(teamsStr.substring(sepIdx + 3)),
              score,
              status: pendingStatus as 'live' | 'fin' | 'sched',
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

export function parseMatchDetail(html: string, flashscoreId: string): FlashscoreDetail | null {
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
  let status: 'live' | 'fin' | 'sched' = 'live';
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

  // Extract both team names from <h3> title: "Home Team - Away Team"
  // Used to attribute bracket codes [XXX] in incident text to home or away.
  const matchTitle = $('h3').first().text().trim();
  const titleSep = matchTitle.indexOf(' - ');
  const homeTeam = titleSep !== -1 ? matchTitle.substring(0, titleSep).trim() : '';
  const awayTeam = titleSep !== -1 ? matchTitle.substring(titleSep + 3).trim() : '';
  // Each team's first word, uppercased, for prefix-matching the bracket codes.
  const homeFirstWord = homeTeam.split(/\s+/)[0].toUpperCase();
  const awayFirstWord = awayTeam.split(/\s+/)[0].toUpperCase();
  // Also compute initials (e.g. "Real Madrid" → "RM") as a fallback.
  const initials = (name: string) => name.split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase();
  const homeInitials = initials(homeTeam);
  const awayInitials = initials(awayTeam);

  $('div.incident').each(function () {
    const $inc = $(this);
    const incMinute = $inc.find('p.time').text().trim();
    if (!incMinute) return;

    // Determine event type from the icon <p> class.
    // Confirmed Flashscore.mobi class names (as of 2025):
    //   y-card       → yellow card
    //   r-card       → red card (straight or second yellow)
    //   substitution → substitution
    //   ball / goal  → goal
    const iconEl = $inc.find('p.icon, span.icon').first();
    const iconClass = (iconEl.attr('class') || '').toLowerCase();

    let type: FlashscoreEvent['type'] = 'other';
    if (iconClass.includes('ball') || iconClass.includes('goal')) type = 'goal';
    else if (iconClass.includes('y-card') && iconClass.includes('r-card')) type = 'red_card'; // second yellow
    else if (iconClass.includes('y-card') || iconClass.includes('yellow')) type = 'yellow_card';
    else if (iconClass.includes('r-card') || iconClass.includes('red')) type = 'red_card';
    else if (iconClass.includes('sub')) type = 'substitution';

    // Player name: raw text content with child <p> elements removed.
    // Bracket tag [XXX] and substitution parentheses are stripped after capture.
    const rawText = $inc.clone().children('p').remove().end().text().trim();

    // Team detection: Flashscore.mobi appends a bracket code to each incident,
    // e.g. "Mazzantti W. [NEW]" for Newells Old Boys or "Mosevich L. [INS]" for Instituto.
    // The code matches the first N uppercase letters of the team's first word.
    const bracketMatch = rawText.match(/\[([A-Z]{2,5})\]/);
    const teamTag = bracketMatch ? bracketMatch[1] : '';

    let team: FlashscoreEvent['team'] = 'unknown';
    if (teamTag.length >= 2) {
      const homeMatch = homeFirstWord.startsWith(teamTag) || homeInitials === teamTag;
      const awayMatch = awayFirstWord.startsWith(teamTag) || awayInitials === teamTag;
      if (homeMatch && !awayMatch) team = 'home';
      else if (awayMatch && !homeMatch) team = 'away';
    }

    const player = sanitize(rawText.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, ''));

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
        const number = sanitize($(this).find('td.number').text());
        const name = sanitize($(this).find('td a').text() || $(this).find('td').not('.number').first().text());
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
