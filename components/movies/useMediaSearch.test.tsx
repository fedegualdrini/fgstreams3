import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaSearch } from './useMediaSearch';

function result(id: number, title: string) {
  return { tmdbId: id, type: 'movie', title, year: '2026', overview: '', posterPath: null, voteAverage: 0 };
}

function response(id: number, title: string) {
  return new Response(JSON.stringify([result(id, title)]));
}

describe('movie search request lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('cancels superseded searches and ignores an older response arriving after the current results', async () => {
    const { promise: older, resolve: finishOlder } = Promise.withResolvers<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older).mockResolvedValueOnce(response(2, 'Newer result'));
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const { result: hook } = renderHook(() => useMediaSearch('movie', onError));

    act(() => { hook.current.setQuery('Older'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    const olderSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    act(() => { hook.current.setQuery('Newer'); });
    expect(olderSignal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(hook.current.results).toEqual([result(2, 'Newer result')]);

    await act(async () => { finishOlder(response(1, 'Older result')); });
    expect(hook.current.results).toEqual([result(2, 'Newer result')]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps the current search loading when a cancelled media-type request rejects', async () => {
    const { promise: movie, reject: rejectMovie } = Promise.withResolvers<Response>();
    const { promise: tv, resolve: finishTv } = Promise.withResolvers<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(movie).mockReturnValueOnce(tv));
    const onError = vi.fn();
    const { result: hook, rerender } = renderHook(({ type }: { type: 'movie' | 'tv' }) => useMediaSearch(type, onError), {
      initialProps: { type: 'movie' as 'movie' | 'tv' },
    });
    act(() => { hook.current.setQuery('Example'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    rerender({ type: 'tv' });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    await act(async () => { rejectMovie(new DOMException('Cancelled', 'AbortError')); });
    expect(hook.current.loading).toBe(true);
    expect(onError).not.toHaveBeenCalled();

    await act(async () => { finishTv(new Response(JSON.stringify([{ ...result(3, 'Current series'), type: 'tv' }]))); });
    expect(hook.current.results[0].title).toBe('Current series');
    expect(hook.current.loading).toBe(false);
  });

  it('stops loading when a query becomes too short and cannot repopulate it from a cancelled response', async () => {
    const { promise: pending, resolve: finish } = Promise.withResolvers<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const { result: hook } = renderHook(() => useMediaSearch('movie', onError));
    act(() => { hook.current.setQuery('Example'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(hook.current.loading).toBe(true);
    act(() => { hook.current.setQuery('E'); });
    expect(hook.current.loading).toBe(false);
    expect(hook.current.results).toEqual([]);
    await act(async () => { finish(response(1, 'Cancelled result')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(hook.current.results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
