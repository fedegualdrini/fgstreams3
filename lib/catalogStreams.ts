import type { Match, Stream } from '@/types/api';
import { fetchStreamLookup } from './api';
import { CATALOG_CONCURRENCY } from './constants';

/** Run `task` over `items` with at most `limit` in flight, stopping at `deadline`. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  task: (item: T) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results = new Array<R | undefined>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      // Past the budget, leave the rest undefined. Callers treat "unresolved"
      // as "keep the match" so a slow upstream degrades into a longer list,
      // never into an empty page.
      if (Date.now() > deadline) return;
      try {
        results[index] = await task(items[index]);
      } catch {
        results[index] = undefined;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface ResolvedStreams {
  /** Streams that resolved, keyed by index into the `matches` array. */
  streamsByMatch: Map<number, Stream[]>;
  /**
   * Matches with at least one source we could not read (failed request or out
   * of time budget). They must not be judged unwatchable on that basis.
   */
  unresolvedMatches: Set<number>;
}

/** Look up every (match, source) pair and group the playable streams by match. */
export async function resolveStreams(matches: Match[], deadline: number): Promise<ResolvedStreams> {
  // One entry per (match, source) pair; a match is playable if any of them resolve.
  const refs = matches.flatMap((match, matchIndex) =>
    (match.sources ?? []).map(source => ({ matchIndex, source })),
  );

  const lookups = await mapWithConcurrency(
    refs,
    CATALOG_CONCURRENCY,
    deadline,
    ({ source }) => fetchStreamLookup(source.source, source.id),
  );

  const streamsByMatch = new Map<number, Stream[]>();
  const unresolvedMatches = new Set<number>();

  refs.forEach((ref, index) => {
    const lookup = lookups[index];
    // Undefined means we ran out of time budget; ok:false means the request
    // itself failed. Either way we do not know what this source carries.
    if (lookup === undefined || !lookup.ok) {
      unresolvedMatches.add(ref.matchIndex);
      return;
    }
    const bucket = streamsByMatch.get(ref.matchIndex) ?? [];
    for (const stream of lookup.streams) {
      bucket.push({ ...stream, source: stream.source || ref.source.source });
    }
    streamsByMatch.set(ref.matchIndex, bucket);
  });

  return { streamsByMatch, unresolvedMatches };
}
