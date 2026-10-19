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

  function networkFailure(video: HTMLVideoElement) {
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    fireEvent.error(video);
  }

  it('restarts the same source after a network failure without opening an iframe or rotating sources', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const { container } = render(<StreamPlayer stream={stream} muted onError={onError} />);
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

    act(() => { vi.advanceTimersByTime(2_000); });
    expect(video).toHaveAttribute('src', initialSource);
    expect(video.muted).toBe(true);
    fireEvent.playing(video);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it('bounds repeated failures even when playback briefly resumes, then allows a fresh manual retry', () => {
    vi.useFakeTimers();
    const { container } = render(<StreamPlayer stream={stream} />);
    const video = container.querySelector('video')!;
    for (const delay of [2_000, 4_000, 8_000]) {
      networkFailure(video);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(delay - 1); });
      expect(video).not.toHaveAttribute('src');
      act(() => { vi.advanceTimersByTime(1); });
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
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(container.querySelector('video')).toHaveAttribute('src');
  });

  it('renews the recovery budget after sustained playback rather than exhausting it over a long session', () => {
    vi.useFakeTimers();
    const { container } = render(<StreamPlayer stream={stream} />);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 3 });
    for (const delay of [2_000, 4_000, 8_000]) {
      networkFailure(video);
      act(() => { vi.advanceTimersByTime(delay); });
      fireEvent.playing(video);
    }

    video.currentTime = 60;
    fireEvent.timeUpdate(video);
    networkFailure(video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(video).toHaveAttribute('src');
  });

  it('cancels a pending restart when Original embed is explicitly selected', () => {
    vi.useFakeTimers();
    const { container } = render(<StreamPlayer stream={stream} />);
    const video = container.querySelector('video')!;
    networkFailure(video);
    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    fireEvent.load(container.querySelector('iframe')!);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(video).not.toHaveAttribute('src');
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveAttribute('src', embedUrl);
  });

  it('cancels the old source restart without interrupting a newly selected source', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<StreamPlayer stream={stream} />);
    const oldVideo = container.querySelector('video')!;
    networkFailure(oldVideo);
    rerender(<StreamPlayer stream={{ url: 'https://embed.st/embed/admin/other-match/2' }} />);
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

  it('does not treat seeking forward as sustained healthy playback', () => {
    vi.useFakeTimers();
    const { container } = render(<StreamPlayer stream={stream} />);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 3 });
    for (const delay of [2_000, 4_000, 8_000]) {
      networkFailure(video);
      act(() => { vi.advanceTimersByTime(delay); });
      fireEvent.playing(video);
    }

    fireEvent.seeking(video);
    video.currentTime = 120;
    fireEvent.timeUpdate(video);
    networkFailure(video);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeInTheDocument();
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

describe('StreamTP direct-only playback', () => {
  const source = 'https://la18hd.su/vivo/canales.php?stream=espnpremium';
  const first = 'https://a2lja3m.fubo18.com/espnpremium/mono.m3u8?token=initial-test-signature';
  const fresh = 'https://a2lja3m.fubo18.com/espnpremium/mono.m3u8?token=renewed-test-signature';
  const metadata = (url: string) => new Response(JSON.stringify({ url }), {
    headers: { 'Content-Type': 'application/json' },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('cancels pending resolution when Original embed is selected and ignores its late result', async () => {
    let settle!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { settle = resolve; });
    const request = vi.fn((_url: RequestInfo | URL, _options?: RequestInit) => pending);
    vi.stubGlobal('fetch', request);
    const { container } = render(<StreamPlayer stream={{ url: source }} />);
    const video = container.querySelector('video')!;
    const signal = request.mock.calls[0][1]?.signal;
    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { settle(metadata(first)); await pending; });
    expect(video).not.toHaveAttribute('src');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveAttribute('src', source);
  });

  it('obtains a fresh CDN URL on same-source recovery instead of reusing the failed token', async () => {
    const request = vi.fn().mockResolvedValueOnce(metadata(first)).mockResolvedValueOnce(metadata(fresh));
    vi.stubGlobal('fetch', request);
    const onNext = vi.fn();
    const { container } = render(<StreamPlayer stream={{ url: source }} onError={onNext} />);
    await act(async () => {});
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', first);
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    fireEvent.error(video);
    expect(video).not.toHaveAttribute('src');
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(video).toHaveAttribute('src', fresh);
    expect(request).toHaveBeenCalledTimes(2);
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('rejects a metadata response pointing at a media proxy rather than falling back to it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(metadata(
      'https://fgstreams3.vercel.app/api/hls-proxy?url=https%3A%2F%2Fexample.com%2Fvideo.m3u8',
    )));
    const onNext = vi.fn();
    const { container } = render(<StreamPlayer stream={{ url: source }} onError={onNext} />);
    await act(async () => {});
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('does not let late resolution replace a newly selected embed.st source', async () => {
    let settle!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { settle = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => pending));
    const { container, rerender } = render(<StreamPlayer stream={{ url: source }} />);
    const oldVideo = container.querySelector('video')!;
    rerender(<StreamPlayer stream={stream} />);
    const currentVideo = container.querySelector('video')!;
    const currentSource = currentVideo.getAttribute('src');
    await act(async () => { settle(metadata(first)); await pending; });
    expect(oldVideo).not.toHaveAttribute('src');
    expect(container.querySelector('video')).toBe(currentVideo);
    expect(currentVideo).toHaveAttribute('src', currentSource);
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('keeps channel mode controls accessible while metadata resolution is pending beyond the outer deadline', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const { container } = render(<ChannelPlayer channel={{
      name: 'ESPN Premium', logo: '', show: true, options: [{ name: 'Direct trial', iframe: source }],
    }} fillContainer />);
    act(() => { vi.advanceTimersByTime(CHANNEL_LOAD_TIMEOUT_MS); });
    expect(screen.queryByText('Stream not responding')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Original embed' }));
    expect(container.querySelector('iframe')).toHaveAttribute('src', source);
  });

  it('stops locally if the metadata request never completes instead of opening an embed or proxy', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })));
    const { container } = render(<StreamPlayer stream={{ url: source }} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });
});
