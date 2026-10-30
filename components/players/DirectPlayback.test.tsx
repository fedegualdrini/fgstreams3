import React from 'react';
import Hls from 'hls.js';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DirectPlayback from './DirectPlayback';
import StreamPlayer from '../StreamPlayer';
import ChannelPlayer from '../ChannelPlayer';
import { CHANNEL_LOAD_TIMEOUT_MS } from '@/lib/constants';

const embedUrl = 'https://embed.st/embed/admin/example-match/1';
const streamFreeUrl = 'https://strmfree.st/embed/basketball/example-match1080p2';

function TestPlayback({
  embedUrl: url = embedUrl, ...props
}: Omit<React.ComponentProps<typeof DirectPlayback>, 'children' | 'embedUrl'> & { embedUrl?: string }) {
  return <DirectPlayback embedUrl={url} {...props}><iframe src={url} title="Original provider" /></DirectPlayback>;
}

async function settlePlayerSetup() {
  await act(async () => { await vi.dynamicImportSettled(); });
}

async function advancePlayback(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
    await vi.dynamicImportSettled();
  });
}

describe('shared direct playback choice', () => {
  beforeEach(() => {
    // Exercise the real player through its native-HLS branch without fetching media in jsdom.
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads the provider iframe only by explicit choice and removes it when returning to direct playback', async () => {
    const { container } = render(<TestPlayback />);
    const firstVideo = container.querySelector('video')!;
    expect(firstVideo).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    await settlePlayerSetup();
    expect(firstVideo).not.toHaveAttribute('src');
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveAttribute('src', embedUrl);

    fireEvent.click(screen.getByRole('button', { name: /^Direct player/ }));
    await settlePlayerSetup();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Direct player/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a direct failure local, retries without an iframe, and rotates only on an explicit next-stream action', () => {
    const onError = vi.fn();
    const { container } = render(<TestPlayback onNextStream={onError} />);
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry direct playback' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    fireEvent.error(container.querySelector('video')!);
    fireEvent.click(screen.getByRole('button', { name: 'Try next stream' }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('clears a failed attempt when another supported source is selected', () => {
    const { container, rerender } = render(<TestPlayback />);
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<TestPlayback embedUrl="https://embed.st/embed/admin/other-match/2" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.playing(container.querySelector('video')!);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  function networkFailure(video: HTMLVideoElement) {
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    fireEvent.error(video);
  }

  it('restarts the same source after a network failure without opening an iframe or rotating sources', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const { container } = render(<TestPlayback muted onNextStream={onError} />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    const initialSource = video.getAttribute('src');
    fireEvent.playing(video);

    networkFailure(video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(video).not.toHaveAttribute('src');
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    networkFailure(video);
    expect(onError).not.toHaveBeenCalled();

    await advancePlayback(2_000);
    expect(video).toHaveAttribute('src', initialSource);
    expect(video.muted).toBe(true);
    fireEvent.playing(video);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it('bounds repeated failures even when playback briefly resumes, then allows a fresh manual retry', async () => {
    vi.useFakeTimers();
    const { container } = render(<TestPlayback />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    for (const delay of [2_000, 4_000, 8_000]) {
      networkFailure(video);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(delay - 1); });
      expect(video).not.toHaveAttribute('src');
      await advancePlayback(1);
      expect(video).toHaveAttribute('src');
      fireEvent.playing(video);
    }

    networkFailure(video);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(container.querySelector('video')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry direct playback' }));
    networkFailure(container.querySelector('video')!);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await advancePlayback(2_000);
    expect(container.querySelector('video')).toHaveAttribute('src');
  });

  it('renews the recovery budget after sustained playback rather than exhausting it over a long session', async () => {
    vi.useFakeTimers();
    const { container } = render(<TestPlayback />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 3 });
    for (const delay of [2_000, 4_000, 8_000]) {
      networkFailure(video);
      await advancePlayback(delay);
      fireEvent.playing(video);
    }

    video.currentTime = 60;
    fireEvent.timeUpdate(video);
    networkFailure(video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await advancePlayback(2_000);
    expect(video).toHaveAttribute('src');
  });

  it('cancels a pending restart when Original embed is explicitly selected', () => {
    vi.useFakeTimers();
    const { container } = render(<TestPlayback />);
    const video = container.querySelector('video')!;
    networkFailure(video);
    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    fireEvent.load(container.querySelector('iframe')!);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(video).not.toHaveAttribute('src');
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveAttribute('src', embedUrl);
  });

  it('cancels the old source restart without interrupting a newly selected source', async () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<TestPlayback />);
    await settlePlayerSetup();
    const oldVideo = container.querySelector('video')!;
    networkFailure(oldVideo);
    rerender(<TestPlayback embedUrl="https://embed.st/embed/admin/other-match/2" />);
    await settlePlayerSetup();
    const newVideo = container.querySelector('video')!;
    fireEvent.playing(newVideo);
    newVideo.currentTime = 42;

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(oldVideo).not.toHaveAttribute('src');
    expect(container.querySelector('video')).toBe(newVideo);
    expect(newVideo.currentTime).toBe(42);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not treat seeking forward as sustained healthy playback', async () => {
    vi.useFakeTimers();
    const { container } = render(<TestPlayback />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 3 });
    for (const delay of [2_000, 4_000, 8_000]) {
      networkFailure(video);
      await advancePlayback(delay);
      fireEvent.playing(video);
    }

    fireEvent.seeking(video);
    video.currentTime = 120;
    fireEvent.timeUpdate(video);
    networkFailure(video);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeInTheDocument();
  });

  it('changes native mute state without resetting playback progress', async () => {
    const { container, rerender } = render(<TestPlayback muted />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    video.currentTime = 42;
    expect(video.muted).toBe(true);

    rerender(<TestPlayback muted={false} />);
    const unmuted = container.querySelector('video')!;
    expect(unmuted.muted).toBe(false);
    expect(unmuted.currentTime).toBe(42);
  });

  it('does not offer direct playback to an unsupported URL merely because its source label matches', () => {
    const { container } = render(<StreamPlayer stream={{ source: 'admin', url: 'https://embed.st.evil.example/embed/admin/id/1' }} />);
    expect(screen.queryByRole('group', { name: 'Playback mode' })).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeInTheDocument();
  });

  it('keeps channel play and mode controls available after the outer connection deadline', () => {
    vi.useFakeTimers();
    const { container } = render(<ChannelPlayer channel={{
      name: 'Supported source', logo: '', show: true,
      options: [{ name: 'Main', iframe: embedUrl }],
    }} fillContainer />);
    act(() => { vi.advanceTimersByTime(CHANNEL_LOAD_TIMEOUT_MS); });
    expect(screen.queryByText('Stream not responding')).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    expect(container.querySelector('iframe')).toHaveAttribute('src', embedUrl);
  });

  it('keeps an unsupported local HLS capability failure local instead of opening the provider', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
    const onNextStream = vi.fn();
    const { container } = render(<TestPlayback embedUrl={streamFreeUrl} onNextStream={onNextStream} />);
    await settlePlayerSetup();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(onNextStream).not.toHaveBeenCalled();
  });

  it('defaults StreamFree to its selected variant and mounts the provider only on explicit choice', async () => {
    const { container } = render(<TestPlayback embedUrl={streamFreeUrl} />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', `/api/streamfree/manifest?embed=${encodeURIComponent(streamFreeUrl)}`);
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Direct player' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    expect(video).not.toHaveAttribute('src');
    expect(container.querySelector('iframe')).toHaveAttribute('src', streamFreeUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Direct player' }));
    await settlePlayerSetup();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(container.querySelector('video')).toHaveAttribute('src', `/api/streamfree/manifest?embed=${encodeURIComponent(streamFreeUrl)}`);
  });

  it('renews StreamFree through the same server route and bounds recovery without automatic fallback', async () => {
    vi.useFakeTimers();
    const onNextStream = vi.fn();
    const { container } = render(<TestPlayback embedUrl={streamFreeUrl} onNextStream={onNextStream} />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    const src = video.getAttribute('src');
    for (const delay of [2_000, 4_000, 8_000]) {
      networkFailure(video);
      expect(video).not.toHaveAttribute('src');
      expect(container.querySelector('iframe')).not.toBeInTheDocument();
      await advancePlayback(delay);
      expect(video).toHaveAttribute('src', src);
      fireEvent.playing(video);
    }
    networkFailure(video);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(onNextStream).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry direct playback' }));
    await settlePlayerSetup();
    expect(container.querySelector('video')).toHaveAttribute('src', src);
  });

  it('cancels StreamFree recovery when Original embed is selected', async () => {
    vi.useFakeTimers();
    const { container } = render(<TestPlayback embedUrl={streamFreeUrl} />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    networkFailure(video);
    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    await advancePlayback(60_000);
    expect(video).not.toHaveAttribute('src');
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveAttribute('src', streamFreeUrl);
  });

  it('invalidates pending SDK setup when switching providers before it resolves', async () => {
    const onPlaying = vi.fn();
    const { container, rerender } = render(<TestPlayback onPlaying={onPlaying} />);
    const oldVideo = container.querySelector('video')!;
    rerender(<TestPlayback embedUrl={streamFreeUrl} onPlaying={onPlaying} />);
    await settlePlayerSetup();
    expect(oldVideo).not.toHaveAttribute('src');
    fireEvent.playing(oldVideo);
    expect(onPlaying).not.toHaveBeenCalled();
    expect(container.querySelector('video')).toHaveAttribute('src', `/api/streamfree/manifest?embed=${encodeURIComponent(streamFreeUrl)}`);
    fireEvent.playing(container.querySelector('video')!);
    expect(onPlaying).toHaveBeenCalledTimes(1);
  });

  it('cancels StreamFree timers and retired events on unmount', async () => {
    vi.useFakeTimers();
    const onPlaying = vi.fn();
    const { container, unmount } = render(<TestPlayback embedUrl={streamFreeUrl} onPlaying={onPlaying} />);
    await settlePlayerSetup();
    const video = container.querySelector('video')!;
    networkFailure(video);
    unmount();
    await advancePlayback(60_000);
    fireEvent.playing(video);
    expect(video).not.toHaveAttribute('src');
    expect(onPlaying).not.toHaveBeenCalled();
  });
});
