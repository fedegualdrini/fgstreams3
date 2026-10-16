import React from 'react';
import Hls from 'hls.js';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StreamPlayer from '../StreamPlayer';
import ChannelPlayer from '../ChannelPlayer';
import { CHANNEL_LOAD_TIMEOUT_MS } from '@/lib/constants';

const embedUrl = 'https://embed.st/embed/admin/example-match/1';
const stream = { url: embedUrl, source: 'admin' };

describe('embed.st playback choice', () => {
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

  it('loads the provider iframe only by explicit choice and removes it when returning to direct playback', () => {
    const { container } = render(<StreamPlayer stream={stream} />);
    expect(container.querySelector('video')).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveAttribute('src', embedUrl);

    fireEvent.click(screen.getByRole('button', { name: /^Direct player/ }));
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Direct player/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a direct failure local, retries without an iframe, and rotates only on an explicit next-stream action', () => {
    const onError = vi.fn();
    const { container } = render(<StreamPlayer stream={stream} onError={onError} />);
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
    const { container, rerender } = render(<StreamPlayer stream={stream} />);
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<StreamPlayer stream={{ url: 'https://embed.st/embed/admin/other-match/2' }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.playing(container.querySelector('video')!);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('changes native mute state without resetting playback progress', () => {
    const { container, rerender } = render(<StreamPlayer stream={stream} muted />);
    const video = container.querySelector('video')!;
    video.currentTime = 42;
    expect(video.muted).toBe(true);

    rerender(<StreamPlayer stream={stream} muted={false} />);
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
});
