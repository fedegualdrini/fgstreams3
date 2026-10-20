import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashscoreEntry, Match } from '@/types/api';
import { SCORES_POLL_INTERVAL_MS } from './constants';
import { useLiveScores } from './useLiveScores';

const fixture: Match = {
  id: 'match', sport: 'football', league: '', team1: 'Home Team', team2: 'Away Team', sources: [],
};
const entry: FlashscoreEntry = {
  flashscoreId: 'score-id', league: 'League', team1: 'Home Team', team2: 'Away Team',
  score: '1:0', status: 'live', minute: "25'",
};
const fetchMock = vi.fn<typeof fetch>();
const response = (entries: FlashscoreEntry[]) => new Response(JSON.stringify(entries));

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

describe('useLiveScores', () => {
  it.each(['network', 'http'] as const)('keeps stale scores on a %s failure but accepts a confirmed empty list', async failure => {
    fetchMock.mockResolvedValueOnce(response([entry]));
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'));
    else fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchMock.mockResolvedValueOnce(response([]));
    const { result } = renderHook(() => useLiveScores([fixture]));
    await act(async () => {});
    expect(result.current.get(fixture.id)?.score).toBe('1:0');

    await act(async () => { await vi.advanceTimersByTimeAsync(SCORES_POLL_INTERVAL_MS); });
    expect(result.current.get(fixture.id)?.score).toBe('1:0');

    await act(async () => { await vi.advanceTimersByTimeAsync(SCORES_POLL_INTERVAL_MS); });
    expect(result.current.size).toBe(0);
  });

  it('updates successful sports while retaining only the failed sport’s previous scores', async () => {
    const tennis: Match = { ...fixture, id: 'tennis', sport: 'tennis', team1: 'Tennis Home', team2: 'Tennis Away' };
    const tennisEntry: FlashscoreEntry = {
      ...entry, flashscoreId: 'tennis-score', team1: tennis.team1, team2: tennis.team2, score: '5:4',
    };
    fetchMock.mockResolvedValueOnce(response([entry])).mockResolvedValueOnce(response([tennisEntry]))
      .mockResolvedValueOnce(response([{ ...entry, score: '2:0' }]))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const { result } = renderHook(() => useLiveScores([fixture, tennis]));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(SCORES_POLL_INTERVAL_MS); });
    expect(result.current.get(fixture.id)?.score).toBe('2:0');
    expect(result.current.get(tennis.id)?.score).toBe('5:4');
  });

  it('publishes metadata and status changes even when the score is unchanged', async () => {
    const updated: FlashscoreEntry = { ...entry, flashscoreId: 'corrected-id', league: 'Corrected League', status: 'fin', minute: 'FT' };
    fetchMock.mockResolvedValueOnce(response([entry])).mockResolvedValueOnce(response([updated]));
    const { result } = renderHook(() => useLiveScores([fixture]));
    await act(async () => {});

    await act(async () => { await vi.advanceTimersByTimeAsync(SCORES_POLL_INTERVAL_MS); });
    expect(result.current.get(fixture.id)).toEqual(updated);
  });

  it('does not overlap a slow poll and resumes on the next existing interval', async () => {
    const { promise, resolve: finishRequest } = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(promise);
    fetchMock.mockResolvedValue(response([{ ...entry, score: '2:0' }]));
    const { result } = renderHook(() => useLiveScores([fixture]));

    await act(async () => { await vi.advanceTimersByTimeAsync(2 * SCORES_POLL_INTERVAL_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { finishRequest(response([entry])); });
    expect(result.current.get(fixture.id)?.score).toBe('1:0');

    await act(async () => { await vi.advanceTimersByTimeAsync(SCORES_POLL_INTERVAL_MS); });
    expect(result.current.get(fixture.id)?.score).toBe('2:0');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('discards and aborts an obsolete live-list request rather than restoring removed scores', async () => {
    const { promise, resolve: finishRequest } = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(promise);
    const { result, rerender } = renderHook(
      ({ matches }: { matches: Match[] }) => useLiveScores(matches),
      { initialProps: { matches: [fixture] } },
    );
    const signal = fetchMock.mock.calls[0][1]?.signal;

    rerender({ matches: [] });
    await act(async () => { finishRequest(response([entry])); });

    expect(signal?.aborted).toBe(true);
    expect(result.current.size).toBe(0);
  });
});
