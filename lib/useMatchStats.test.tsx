import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashscoreDetail, FlashscoreEntry, Match } from '@/types/api';
import { FIXTURE_POLL_INTERVAL_MS } from './constants';
import { useMatchStats } from './useMatchStats';

const fixture: Match = {
  id: 'match', sport: 'football', league: '', team1: 'Home Team', team2: 'Away Team', sources: [],
};
const entry: FlashscoreEntry = {
  flashscoreId: 'score-id', league: 'League', team1: 'Home Team', team2: 'Away Team',
  score: '1:0', status: 'live', minute: "25'",
};
const detail: FlashscoreDetail = {
  flashscoreId: entry.flashscoreId, score: '1:0', status: 'live', minute: "25'",
  periods: '', events: [], stats: [], lineups: null,
};
const fetchMock = vi.fn<typeof fetch>();
const response = (data: unknown) => new Response(JSON.stringify(data));

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useMatchStats', () => {
  it('does not start polling when the first detail is already finished', async () => {
    const finished: FlashscoreDetail = { ...detail, status: 'fin', minute: 'FT' };
    fetchMock.mockResolvedValueOnce(response([entry])).mockResolvedValue(response(finished));
    const { result } = renderHook(() => useMatchStats(fixture));
    await act(async () => {});

    await act(async () => { await vi.advanceTimersByTimeAsync(3 * FIXTURE_POLL_INTERVAL_MS); });

    expect(result.current).toEqual(finished);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not overlap a slow detail poll and stops when it reports the finished transition', async () => {
    const { promise: pending, resolve: finishRequest } = Promise.withResolvers<Response>();
    const finished: FlashscoreDetail = { ...detail, score: '2:0', status: 'fin', minute: 'FT' };
    fetchMock.mockResolvedValueOnce(response([entry])).mockResolvedValueOnce(response(detail)).mockReturnValueOnce(pending);
    const { result } = renderHook(() => useMatchStats(fixture));
    await act(async () => {});

    await act(async () => { await vi.advanceTimersByTimeAsync(3 * FIXTURE_POLL_INTERVAL_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current?.status).toBe('live');
    await act(async () => { finishRequest(response(finished)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * FIXTURE_POLL_INTERVAL_MS); });

    expect(result.current).toEqual(finished);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips hidden detail polls, resumes at the existing interval and retains stale data on failure', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    const updated: FlashscoreDetail = { ...detail, score: '2:0' };
    fetchMock.mockResolvedValueOnce(response([entry])).mockResolvedValueOnce(response(detail))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(updated));
    const { result } = renderHook(() => useMatchStats(fixture));
    await act(async () => {});

    visibility.mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * FIXTURE_POLL_INTERVAL_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('visible');
    await act(async () => { await vi.advanceTimersByTimeAsync(FIXTURE_POLL_INTERVAL_MS); });
    expect(result.current).toEqual(detail);
    await act(async () => { await vi.advanceTimersByTimeAsync(FIXTURE_POLL_INTERVAL_MS); });
    expect(result.current).toEqual(updated);
  });

  it('cannot overwrite a new match with an obsolete detail response after navigation', async () => {
    const { promise: pending, resolve: finishRequest } = Promise.withResolvers<Response>();
    const nextMatch: Match = { ...fixture, id: 'next', team1: 'Next Home', team2: 'Next Away' };
    const nextEntry: FlashscoreEntry = { ...entry, flashscoreId: 'next-score', team1: nextMatch.team1, team2: nextMatch.team2 };
    const nextDetail: FlashscoreDetail = { ...detail, flashscoreId: nextEntry.flashscoreId, score: '3:1' };
    fetchMock.mockResolvedValueOnce(response([entry])).mockReturnValueOnce(pending)
      .mockResolvedValueOnce(response([nextEntry])).mockResolvedValueOnce(response(nextDetail));
    const { result, rerender } = renderHook(({ match }: { match: Match }) => useMatchStats(match), {
      initialProps: { match: fixture },
    });
    await act(async () => {});
    const signal = fetchMock.mock.calls[1][1]?.signal;

    rerender({ match: nextMatch });
    await act(async () => {});
    expect(result.current).toEqual(nextDetail);
    await act(async () => { finishRequest(response(detail)); });
    expect(signal?.aborted).toBe(true);
    expect(result.current).toEqual(nextDetail);
  });
});
