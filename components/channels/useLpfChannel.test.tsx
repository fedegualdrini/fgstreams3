import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LpfChannelSnapshot } from '@/types/channels';
import { LPF_REFRESH_INTERVAL_MS } from '@/lib/lpfUrls';
import { useLpfChannel } from './useLpfChannel';

const snapshot: LpfChannelSnapshot = {
  checkedAt: 1_700_000_000_000,
  channel: {
    name: 'LPF', logo: '', show: true, source: 'lpf',
    options: [
      { name: 'LPF 1', iframe: 'https://canales.encoders.immergo.tv/live.m3u8', status: 'live' },
      { name: 'LPF 2', iframe: 'https://canales.encoders.immergo.tv/finished.m3u8', status: 'ended' },
    ],
  },
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useLpfChannel', () => {
  it('polls only while visible, resumes immediately, avoids overlap, and aborts and removes polling on teardown', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, unmount } = renderHook(() => useLpfChannel(true));
    expect(fetchMock).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * LPF_REFRESH_INTERVAL_MS); });
    act(() => { result.current.refresh(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(new Response(JSON.stringify(snapshot))); });
    expect(result.current.snapshot).toEqual(snapshot);

    visibility.mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LPF_REFRESH_INTERVAL_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const signal = fetchMock.mock.calls[1][1]?.signal;

    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { second.resolve(new Response(JSON.stringify({ ...snapshot, checkedAt: snapshot.checkedAt + 1 }))); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * LPF_REFRESH_INTERVAL_MS); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot).toEqual(snapshot);
  });

  it('does not keep advertising stale live status after a failed refresh or restart ended playback', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(snapshot))).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useLpfChannel(true));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(LPF_REFRESH_INTERVAL_MS); });
    expect(result.current.snapshot?.checkedAt).toBe(snapshot.checkedAt);
    expect(result.current.snapshot?.channel.options.map(option => option.status)).toEqual(['unknown', 'ended']);
    expect(result.current.error).toContain('Could not refresh LPF links');
    expect(result.current.isRefreshing).toBe(false);
  });
});
