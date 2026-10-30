import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel, ChannelOption, LpfChannelSnapshot } from '@/types/channels';
import { getLpfSourceUrl, LPF_OPTION_COUNT, LPF_REFRESH_INTERVAL_MS } from '@/lib/lpfUrls';
import ChannelsPageClient from './ChannelsPageClient';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));
vi.mock('@/components/channels/ChannelStream', () => ({
  default: ({ option, onPlaying, onError }: { option: ChannelOption; onPlaying: () => void; onError: () => void }) => (
    <video data-testid="channel-stream" src={option.iframe} onPlaying={onPlaying} onError={onError} />
  ),
}));

const lpf: Channel = {
  name: 'LPF', logo: '', show: true, source: 'lpf',
  options: Array.from({ length: LPF_OPTION_COUNT }, (_, index) => ({
    name: `LPF ${index + 1}`,
    iframe: getLpfSourceUrl(index + 1),
    sourceUrl: getLpfSourceUrl(index + 1),
    status: 'unknown',
  })),
};
const other: Channel = {
  name: 'Other TV', logo: '', show: true,
  options: [{ name: 'Main', iframe: 'https://other.example/live.m3u8' }],
};
const channels = [lpf, other];
const fetchMock = vi.fn<typeof fetch>();
let snapshot: LpfChannelSnapshot;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  navigation.params = new URLSearchParams();
  navigation.replace.mockReset();
  snapshot = {
    checkedAt: Date.now(),
    channel: {
      ...lpf,
      options: lpf.options.map((option, index) => ({
        ...option, iframe: `https://canales.encoders.immergo.tv/game-${index}.m3u8`, status: 'live',
      })),
    },
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(snapshot)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LPF channel snapshots', () => {
  it('replaces a selected destination at the same index without navigation or losing search, and stops when it ends', async () => {
    render(<ChannelsPageClient channels={channels} />);
    await act(async () => {});
    fireEvent.change(screen.getByRole('textbox', { name: 'Search channels' }), { target: { value: 'LPF' } });
    fireEvent.click(screen.getByRole('button', { name: /LPF/ }));
    fireEvent.click(screen.getByRole('button', { name: 'LPF 3 Option 3 Live' }));
    const firstPlayer = screen.getByTestId('channel-stream');
    fireEvent.playing(firstPlayer);
    const navigationCount = navigation.replace.mock.calls.length;
    const replacement = 'https://canales.encoders.immergo.tv/new-game.m3u8';
    snapshot = {
      ...snapshot,
      checkedAt: snapshot.checkedAt + LPF_REFRESH_INTERVAL_MS,
      channel: { ...snapshot.channel, options: snapshot.channel.options.map((option, index) => (
        index === 2 ? { ...option, iframe: replacement } : option
      )) },
    };

    await act(async () => { await vi.advanceTimersByTimeAsync(LPF_REFRESH_INTERVAL_MS); });
    const replacementPlayer = screen.getByTestId('channel-stream');
    expect(replacementPlayer).not.toBe(firstPlayer);
    expect(replacementPlayer).toHaveAttribute('src', replacement);
    expect(screen.getByRole('button', { name: 'LPF 3 Option 3 Live' })).toHaveAttribute('aria-pressed', 'true');
    expect(navigation.replace).toHaveBeenCalledTimes(navigationCount);

    snapshot = { ...snapshot, channel: { ...snapshot.channel, options: snapshot.channel.options.map((option, index) => (
      index === 2 ? { ...option, status: 'unknown' } : option
    )) } };
    await act(async () => { await vi.advanceTimersByTimeAsync(LPF_REFRESH_INTERVAL_MS); });
    expect(screen.getByTestId('channel-stream')).toBe(replacementPlayer);
    expect(screen.getByRole('button', { name: 'LPF 3 Option 3 Unknown' })).toHaveAttribute('aria-pressed', 'true');

    snapshot = { ...snapshot, channel: { ...snapshot.channel, options: snapshot.channel.options.map((option, index) => (
      index === 2 ? { ...option, status: 'ended' } : option
    )) } };
    await act(async () => { await vi.advanceTimersByTimeAsync(LPF_REFRESH_INTERVAL_MS); });
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Broadcast finished');
    expect(screen.getByRole('button', { name: 'LPF 3 Option 3 Broadcast finished' })).toHaveAttribute('aria-pressed', 'true');
    expect(navigation.replace).toHaveBeenCalledTimes(navigationCount);

    fireEvent.click(screen.getByRole('button', { name: 'Back to channels' }));
    expect(screen.getByRole('textbox', { name: 'Search channels' })).toHaveValue('LPF');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search channels' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Other TV/ }));
    const unrelatedPlayer = screen.getByTestId('channel-stream');
    await act(async () => { await vi.advanceTimersByTimeAsync(LPF_REFRESH_INTERVAL_MS); });
    expect(screen.getByTestId('channel-stream')).toBe(unrelatedPlayer);
    expect(unrelatedPlayer).toHaveAttribute('src', other.options[0].iframe);
    expect(screen.queryByRole('button', { name: 'Refresh links' })).not.toBeInTheDocument();
  });

  it('keeps only the active player across failed checks, recovers its status, and still applies a finished broadcast', async () => {
    navigation.params = new URLSearchParams({ c: 'LPF', o: '2' });
    render(<ChannelsPageClient channels={channels} />);
    await act(async () => {});
    const player = screen.getByTestId('channel-stream');
    const destination = player.getAttribute('src');
    fireEvent.playing(player);
    const navigationCount = navigation.replace.mock.calls.length;
    const healthy = snapshot;
    const failed = {
      ...snapshot, error: 'Source checks failed.',
      channel: { ...snapshot.channel, options: snapshot.channel.options.map(option => ({
        ...option, iframe: option.sourceUrl!, status: 'unavailable' as const,
      })) },
    };
    snapshot = failed;
    await act(async () => { await vi.advanceTimersByTimeAsync(LPF_REFRESH_INTERVAL_MS); });
    expect(screen.getByTestId('channel-stream')).toBe(player);
    expect(player).toHaveAttribute('src', destination);
    expect(screen.getByRole('button', { name: 'LPF 3 Option 3 Unknown' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'LPF 4 Option 4 Unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Current playback is continuing');
    // A second failed snapshot must not lose the session's working destination.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    expect(screen.getByTestId('channel-stream')).toBe(player);
    snapshot = healthy;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    expect(screen.getByTestId('channel-stream')).toBe(player);
    expect(screen.getByRole('button', { name: 'LPF 3 Option 3 Live' })).toHaveAttribute('aria-pressed', 'true');

    snapshot = { ...healthy, channel: { ...healthy.channel, options: healthy.channel.options.map((option, index) => (
      index === 2 ? { ...option, status: 'ended' as const } : option
    )) } };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    snapshot = failed;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledTimes(navigationCount);
  });

  it('drops retained playback on a real media error or source switch and never resurrects an earlier game', async () => {
    navigation.params = new URLSearchParams({ c: 'LPF', o: '2' });
    render(<ChannelsPageClient channels={channels} />);
    await act(async () => {});
    fireEvent.playing(screen.getByTestId('channel-stream'));
    const healthy = snapshot;
    const failed = {
      ...snapshot, channel: { ...snapshot.channel, options: snapshot.channel.options.map(option => ({
        ...option, iframe: option.sourceUrl!, status: 'unavailable' as const,
      })) },
    };
    snapshot = failed;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    fireEvent.error(screen.getByTestId('channel-stream'));
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();

    snapshot = healthy;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    fireEvent.playing(screen.getByTestId('channel-stream'));
    snapshot = failed;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'LPF 4 Option 4 Unavailable' }));
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'LPF 3 Option 3 Unavailable' }));
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();

    snapshot = healthy;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    fireEvent.playing(screen.getByTestId('channel-stream'));
    snapshot = { ...healthy, channel: { ...healthy.channel, options: healthy.channel.options.map((option, index) => (
      index === 2 ? { ...option, iframe: 'https://canales.encoders.immergo.tv/next-game.m3u8' } : option
    )) } };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    expect(screen.getByTestId('channel-stream')).toHaveAttribute('src', snapshot.channel.options[2].iframe);
    // The new game has not reported playback; failure cannot resurrect the old one.
    snapshot = failed;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
  });

  it('keeps all numbered deep links and never starts ended, unavailable, or unresolved sources', async () => {
    navigation.params = new URLSearchParams({ c: 'LPF', o: '4' });
    snapshot = { ...snapshot, channel: { ...snapshot.channel, options: snapshot.channel.options.map((option, index) => {
      if (index === 4) return { ...option, status: 'ended' };
      if (index === 5) return { ...option, status: 'unavailable' };
      if (index === 6) return { ...option, iframe: option.sourceUrl!, status: 'unknown' };
      if (index === 7) return { ...option, status: 'unknown' };
      return option;
    }) } };
    const { container } = render(<ChannelsPageClient channels={channels} />);
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    await act(async () => {});
    expect(container.querySelectorAll('.source-option')).toHaveLength(LPF_OPTION_COUNT);
    expect(screen.getByRole('button', { name: 'LPF 5 Option 5 Broadcast finished' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Broadcast finished');
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'LPF 6 Option 6 Unavailable' }));
    expect(screen.getByRole('status')).toHaveTextContent('Source unavailable');
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'LPF 7 Option 7 Unknown' }));
    expect(screen.getByRole('status')).toHaveTextContent('Broadcast status unknown');
    expect(screen.queryByTestId('channel-stream')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'LPF 8 Option 8 Unknown' }));
    expect(screen.getByTestId('channel-stream')).toHaveAttribute('src', snapshot.channel.options[7].iframe);

    snapshot = { ...snapshot, checkedAt: snapshot.checkedAt + 1000, error: 'Some numbered sources could not be checked.' };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent(snapshot.error!);
    expect(screen.getByText('Last checked')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('dateTime', new Date(snapshot.checkedAt).toISOString());
    expect(screen.getByRole('button', { name: 'LPF 8 Option 8 Unknown' })).toHaveAttribute('aria-pressed', 'true');
  });
});
