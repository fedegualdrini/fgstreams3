import type { AngulismoEvent, BroadcastChannel, Match, PromiedosGame } from '@/types/api';
import type { Channel } from '@/types/channels';
import { matchStartMs } from './matchUtils';
import { estimateFeedOffsetMs, findFixture } from './teamMatch';
import { broadcastsFromEvent, mergeBroadcasts, resolveBroadcastChannels } from './broadcasters';

/**
 * Pairs a Streamed match with its entries in the two broadcast feeds and
 * resolves the channels that carry it.
 */

export interface BroadcastSources {
  promiedosGames: PromiedosGame[];
  promiedosOffsetMs: number | null;
  angulismoEvents: AngulismoEvent[];
  angulismoOffsetMs: number | null;
}

/** A match's entry in each feed, when one matched. */
export interface FeedFixtures {
  event: AngulismoEvent | null;
  fixture: PromiedosGame | null;
}

/**
 * Bundle the feeds with their measured clock offsets against `matches`.
 *
 * Promiedos renders kickoff in the requesting IP's timezone, so its offset is
 * measured once per build rather than assumed (null when too few fixtures agree
 * to be confident). The angulismo feed is a static file, so its Argentina-local
 * times are the same for every caller and zero is the known-correct fallback.
 */
export function buildBroadcastSources(
  matches: Match[],
  promiedosGames: PromiedosGame[],
  angulismoEvents: AngulismoEvent[],
  now: number,
): BroadcastSources {
  const datedMatches = matches.flatMap(match => {
    const startMs = matchStartMs(match, now);
    return startMs === undefined ? [] : [{ team1: match.team1, team2: match.team2, startMs }];
  });

  return {
    promiedosGames,
    promiedosOffsetMs: estimateFeedOffsetMs(datedMatches, promiedosGames),
    angulismoEvents,
    angulismoOffsetMs: estimateFeedOffsetMs(datedMatches, angulismoEvents) ?? 0,
  };
}

export function findFeedFixtures(match: Match, now: number, sources: BroadcastSources): FeedFixtures {
  const startMs = matchStartMs(match, now);
  return {
    event: findFixture(
      match.team1, match.team2, startMs, sources.angulismoEvents,
      { offsetMs: sources.angulismoOffsetMs },
    ),
    fixture: findFixture(
      match.team1, match.team2, startMs, sources.promiedosGames,
      { offsetMs: sources.promiedosOffsetMs },
    ),
  };
}

/**
 * Channels carrying a match, angulismo first.
 *
 * Order matters: the angulismo feed supplies working URLs for the fixture
 * itself, whereas Promiedos supplies a broadcaster name that we then resolve
 * against a catalog that may be out of date. Promiedos still contributes the
 * channels angulismo did not list, and covers far more competitions.
 */
export function resolveFeedBroadcasts({ event, fixture }: FeedFixtures, channels: Channel[]): BroadcastChannel[] {
  const fromEvent = event ? broadcastsFromEvent(event, channels) : [];
  const fromPromiedos = fixture ? resolveBroadcastChannels(fixture, channels) : [];
  return mergeBroadcasts(fromEvent, fromPromiedos);
}
