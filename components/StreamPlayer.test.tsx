import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StreamPlayer from './StreamPlayer';
import { STREAM_LOAD_TIMEOUT_MS } from '@/lib/constants';

const stream = { url: 'https://embed.example/1', embedUrl: 'https://embed.example/1' };

describe('StreamPlayer load timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a failure only once the embed has had the full load window', () => {
    const onError = vi.fn();
    render(<StreamPlayer stream={stream} onError={onError} />);

    act(() => { vi.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS - 1); });
    expect(onError).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not report a failure for an embed that finished loading', () => {
    const onError = vi.fn();
    const { container } = render(<StreamPlayer stream={stream} onError={onError} />);

    fireEvent.load(container.querySelector('iframe') as HTMLIFrameElement);
    act(() => { vi.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS * 2); });

    expect(onError).not.toHaveBeenCalled();
  });

  it('starts the clock again for a remounted player', () => {
    const onError = vi.fn();
    const { rerender } = render(<StreamPlayer key={0} stream={stream} onError={onError} />);

    act(() => { vi.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS - 1); });
    rerender(<StreamPlayer key={1} stream={stream} onError={onError} />);
    act(() => { vi.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS - 1); });

    expect(onError).not.toHaveBeenCalled();
  });
});
