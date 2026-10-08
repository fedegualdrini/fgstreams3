import { load, type CheerioAPI } from 'cheerio';
import type {
  FlashscoreDetail,
  FlashscoreEntry,
  FlashscoreEvent,
  FlashscoreLineups,
  FlashscorePlayer,
  FlashscoreStat,
} from '@/types/api';

/**
 * Pure HTML → typed data for flashscore.mobi pages. No I/O lives here, so every
 * parser can be exercised against a saved page (see flashscore.test.ts);
 * lib/flashscore.ts is the part that talks to the network.
 */

type MatchStatus = FlashscoreEntry['status'];

/** Separator flashscore puts between the two team names. */
const TEAM_SEPARATOR = ' - ';

/** Strip HTML tags from scraped text to prevent injected markup reaching the UI. */
function sanitize(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

/** Map a raw flashscore span class to a typed status value. */
function toMatchStatus(cls: string): MatchStatus {
  if (cls === 'live' || cls === 'fin') return cls;
  return 'sched';
}

/** Split "Home - Away" into its two names, or null when there is no separator. */
function splitTeams(text: string): { home: string; away: string } | null {
  const index = text.indexOf(TEAM_SEPARATOR);
  if (index === -1) return null;
  return {
    home: text.substring(0, index),
    away: text.substring(index + TEAM_SEPARATOR.length),
  };
}

// ─── Live scores list ───────────────────────────────────────────────────────

/**
 * Parses the #score-data block of a live scores page into a flat list of
 * entries.
 *
 * HTML structure (consistent across all 27 sports):
 *   <div id="score-data">
 *     <h4>COUNTRY: League Name</h4>
 *     <span class="live">25'</span>Team A - Team B <a href="/match/ID/" class="live">2:1</a><br />
 *   </div>
 *
 * The block is a flat run of sibling nodes, so rows are rebuilt by walking
 * them in order: `<span>` opens a row (status + minute), the text node after it
 * carries the teams, and the `<a>` closes it with the score and match id.
 */
export function parseScoreData(html: string): FlashscoreEntry[] {
  const $ = load(html);
  const entries: FlashscoreEntry[] = [];

  let currentLeague = '';
  let pendingStatus: MatchStatus | null = null;
  let pendingMinute = '';
  let pendingTeams = '';

  $('#score-data').contents().each(function () {
    const node = this as unknown as { type: string; name?: string; data?: string };

    if (node.type === 'text') {
      if (pendingStatus) pendingTeams += node.data ?? '';
      return;
    }
    if (node.type !== 'tag') return;

    const $el = $(this);

    if (node.name === 'h4') {
      currentLeague = sanitize($el.text());
      pendingStatus = null;
      pendingTeams = '';
    } else if (node.name === 'span') {
      pendingStatus = toMatchStatus(($el.attr('class') || '').trim());
      pendingMinute = sanitize($el.text());
      pendingTeams = '';
    } else if (node.name === 'a' && pendingStatus) {
      const flashscoreId = ($el.attr('href') || '').match(/\/match\/([^/?]+)/)?.[1];
      const teams = splitTeams(pendingTeams.trim());

      if (flashscoreId && teams) {
        const scoreText = $el.text().trim();
        entries.push({
          flashscoreId,
          league: currentLeague,
          team1: sanitize(teams.home),
          team2: sanitize(teams.away),
          score: scoreText === '-:-' || scoreText === '' ? null : scoreText,
          status: pendingStatus,
          minute: pendingMinute,
        });
      }
      pendingStatus = null;
      pendingMinute = '';
      pendingTeams = '';
    }
  });

  return entries;
}

// ─── Match detail ────────────────────────────────────────────────────────────

/**
 * Parses the main tab of a match page: current score, period breakdown and
 * incident list. `stats` and `lineups` come from separate tabs and are filled
 * in by the caller.
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
export function parseMatchDetail(html: string, flashscoreId: string): FlashscoreDetail | null {
  const $ = load(html);

  const score = parseDetailScore($);
  const { status, minute } = parseDetailStatus($, score);

  return {
    flashscoreId,
    score,
    status,
    minute,
    periods: parsePeriods($),
    events: parseIncidents($),
    stats: [],
    lineups: null,
  };
}

/** The first <b> inside .detail holds the score; "-:-" means not started. */
function parseDetailScore($: CheerioAPI): string | null {
  const scoreText = $('div.detail b').first().text().trim();
  return scoreText && scoreText !== '-:-' ? scoreText : null;
}

/** Period breakdown looks like "(1:0, 1:1)" or "(0:0,0:0,1:0)". */
function parsePeriods($: CheerioAPI): string {
  let periods = '';
  $('div.detail').each(function () {
    const text = $(this).text().trim();
    if (/^\([\d:,\s]+\)/.test(text)) periods = text;
  });
  return periods;
}

function isFinishedText(text: string): boolean {
  return (
    text.includes('finished') ||
    text.includes('after extra time') ||
    text.includes('penalties') ||
    text === 'ft' ||
    text === 'aet'
  );
}

function parseDetailStatus($: CheerioAPI, score: string | null): { status: MatchStatus; minute: string } {
  const clock = $('div.detail span.live, span.livetime, span.clock').first();
  if (clock.length) return { status: 'live', minute: clock.text().trim() };

  // No score yet means the match has not started, whatever the text says.
  if (!score) return { status: 'sched', minute: '' };

  const finished = $('div.detail')
    .toArray()
    .some(el => isFinishedText($(el).text().trim().toLowerCase()));
  return { status: finished ? 'fin' : 'live', minute: '' };
}

/**
 * Confirmed flashscore.mobi icon class names (as of 2025):
 *   y-card → yellow card, r-card → red card (straight or second yellow),
 *   substitution → substitution, ball / goal → goal.
 */
function classifyIncident(iconClass: string): FlashscoreEvent['type'] {
  if (iconClass.includes('ball') || iconClass.includes('goal')) return 'goal';
  if (iconClass.includes('y-card') && iconClass.includes('r-card')) return 'red_card'; // second yellow
  if (iconClass.includes('y-card') || iconClass.includes('yellow')) return 'yellow_card';
  if (iconClass.includes('r-card') || iconClass.includes('red')) return 'red_card';
  if (iconClass.includes('sub')) return 'substitution';
  return 'other';
}

interface TeamIdentity {
  /** First word, uppercased, for prefix-matching bracket codes. */
  firstWord: string;
  /** Initials ("Real Madrid" → "RM"), the fallback when the code is not a prefix. */
  initials: string;
}

function teamIdentity(name: string): TeamIdentity {
  const words = name.split(/\s+/);
  return {
    firstWord: words[0].toUpperCase(),
    initials: words.map(word => word[0] ?? '').join('').toUpperCase(),
  };
}

function matchesTag(team: TeamIdentity, tag: string): boolean {
  return team.firstWord.startsWith(tag) || team.initials === tag;
}

/**
 * Flashscore.mobi appends a bracket code to each incident, e.g.
 * "Mazzantti W. [NEW]" for Newells Old Boys or "Mosevich L. [INS]" for
 * Instituto. The code is usually the first letters of the team's first word.
 * Ambiguous or missing codes stay 'unknown' rather than guessing.
 */
function attributeTeam(
  incidentText: string,
  home: TeamIdentity,
  away: TeamIdentity,
): FlashscoreEvent['team'] {
  const tag = incidentText.match(/\[([A-Z]{2,5})\]/)?.[1] ?? '';
  if (tag.length < 2) return 'unknown';

  const homeMatch = matchesTag(home, tag);
  const awayMatch = matchesTag(away, tag);
  if (homeMatch && !awayMatch) return 'home';
  if (awayMatch && !homeMatch) return 'away';
  return 'unknown';
}

function parseIncidents($: CheerioAPI): FlashscoreEvent[] {
  // The <h3> title is "Home Team - Away Team"; both names are needed to
  // attribute each incident's bracket code.
  const title = $('h3').first().text().trim();
  const teams = splitTeams(title);
  const home = teamIdentity(teams?.home.trim() ?? '');
  const away = teamIdentity(teams?.away.trim() ?? '');

  const events: FlashscoreEvent[] = [];

  $('div.incident').each(function () {
    const $incident = $(this);
    const minute = $incident.find('p.time').text().trim();
    if (!minute) return;

    const iconClass = ($incident.find('p.icon, span.icon').first().attr('class') || '').toLowerCase();
    const type = classifyIncident(iconClass);

    // Player name: text content with child <p> elements removed. The bracket
    // tag and substitution parentheses are stripped after team detection.
    const rawText = $incident.clone().children('p').remove().end().text().trim();
    const team = attributeTeam(rawText, home, away);
    const player = sanitize(rawText.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, ''));

    if (player || type !== 'other') {
      events.push({ minute, type, team, player });
    }
  });

  return events;
}

// ─── Match stats tab ────────────────────────────────────────────────────────

/** Bar width as a percentage from an inline style like "width:58%"; 50 when absent. */
function barWidthPercent(style: string): number {
  const match = style.match(/width:\s*([\d.]+)%/);
  return match ? parseFloat(match[1]) : 50;
}

/** Each row is [home value] [label] [away value] plus bar-chart elements. */
export function parseMatchStats(html: string): FlashscoreStat[] {
  const $ = load(html);
  const stats: FlashscoreStat[] = [];

  $('[data-testid="wcl-statistics"]').each(function () {
    const $row = $(this);

    const values = $row.find('[data-testid="wcl-statistics-value"] span');
    const home = values.eq(0).text().trim();
    const away = values.eq(1).text().trim();
    const label = $row.find('[data-testid="wcl-statistics-category"] span').first().text().trim();
    if (!label || (!home && !away)) return;

    const homeStyle = $row.find('[data-testid="wcl-statistics-chart-home"]').attr('style') || '';
    const awayStyle = $row.find('[data-testid="wcl-statistics-chart-away"]').attr('style') || '';

    stats.push({
      label,
      home,
      away,
      homePct: barWidthPercent(homeStyle),
      awayPct: barWidthPercent(awayStyle),
    });
  });

  return stats;
}

// ─── Lineups tab ────────────────────────────────────────────────────────────

interface TeamBlock {
  name: string;
  players: FlashscorePlayer[];
  subs: FlashscorePlayer[];
}

/**
 * The lineups page repeats, for home then away:
 *   h4 (team name) → table.lineup (starters) → hr.lineup-separator → table.lineup (subs)
 * so blocks are built by walking those elements in document order.
 */
export function parseMatchLineups(html: string): FlashscoreLineups | null {
  const $ = load(html);
  const blocks: TeamBlock[] = [];

  let current: TeamBlock | null = null;
  let pastSeparator = false;

  $('h4, table.lineup, hr.lineup-separator').each(function () {
    const $el = $(this);

    if ($el.is('h4')) {
      current = { name: $el.text().trim(), players: [], subs: [] };
      blocks.push(current);
      pastSeparator = false;
    } else if ($el.is('hr')) {
      pastSeparator = true;
    } else if (current) {
      const rows: FlashscorePlayer[] = [];
      $el.find('tr').each(function () {
        const number = sanitize($(this).find('td.number').text());
        const name = sanitize($(this).find('td a').text() || $(this).find('td').not('.number').first().text());
        if (name) rows.push({ number, name });
      });
      (pastSeparator ? current.subs : current.players).push(...rows);
    }
  });

  if (blocks.length < 2) return null;
  const [home, away] = blocks;

  return {
    homeTeam: home.name,
    awayTeam: away.name,
    homePlayers: home.players,
    awayPlayers: away.players,
    homeSubs: home.subs,
    awaySubs: away.subs,
  };
}
