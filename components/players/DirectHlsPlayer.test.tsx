import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DirectHlsPlayer from './DirectHlsPlayer';

interface EngineDouble {
  loadSource: (src: string) => void;
  attachMedia: (video: HTMLVideoElement) => void;
  destroy: () => void;
  emit: (event: string, data?: { fatal: boolean; type: string }) => void;
}

const { engines } = vi.hoisted(() => ({ engines: [] as EngineDouble[] }));

// These doubles exercise Hls.js ownership and late callbacks, not its media parsing.
vi.mock('hls.js', () => ({
  default: class {
    static isSupported = () => true;
    static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifestParsed' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError' };
    handlers = new Map<string, (event: string, data?: { fatal: boolean; type: string }) => void>();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    constructor() {
      engines.push(this);
    }
    on(event: string, handler: (event: string, data?: { fatal: boolean; type: string }) => void) {
      this.handlers.set(event, handler);
    }
    emit(event: string, data?: { fatal: boolean; type: string }) {
      this.handlers.get(event)?.(event, data);
    }
  },
}));
vi.mock('@/lib/embedStHls', () => ({ createEmbedStLoader: () => class SegmentNormalizer {} }));

async function settleSetup() {
  await act(async () => { await vi.dynamicImportSettled(); });
}

const networkError = { fatal: true, type: 'networkError' };

describe('direct HLS engine ownership', () => {
  beforeEach(() => {
    engines.length = 0;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });


  it('retires engine callbacks and its recovery timer on a provider change even when src is unchanged', async () => {
    vi.useFakeTimers();
    const callbacks = { onPlaying: vi.fn(), onRecovering: vi.fn(), onError: vi.fn() };
    const { rerender } = render(<DirectHlsPlayer src="/same-route" provider="streamfree" {...callbacks} />);
    await settleSetup();
    const old = engines[0];
    act(() => { old.emit('error', networkError); });
    expect(callbacks.onRecovering).toHaveBeenCalledWith(1);
    expect(old.destroy).toHaveBeenCalledTimes(1);

    rerender(<DirectHlsPlayer src="/same-route" provider="embed-st" {...callbacks} />);
    await settleSetup();
    act(() => {
      old.emit('manifestParsed');
      old.emit('error', networkError);
      old.emit('error', { fatal: true, type: 'mediaError' });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(engines).toHaveLength(2);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(callbacks.onRecovering).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    act(() => { engines[1].emit('manifestParsed'); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it('recreates the StreamFree engine against the identical route and ignores duplicate retired errors', async () => {
    vi.useFakeTimers();
    const callbacks = { onPlaying: vi.fn(), onRecovering: vi.fn(), onError: vi.fn() };
    const src = '/api/streamfree/manifest?embed=source2';
    const { unmount } = render(<DirectHlsPlayer src={src} provider="streamfree" {...callbacks} />);
    await settleSetup();
    const old = engines[0];
    act(() => {
      old.emit('error', networkError);
      old.emit('error', networkError);
    });
    expect(callbacks.onRecovering).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await settleSetup();
    expect(engines).toHaveLength(2);
    expect(engines[1].loadSource).toHaveBeenCalledWith(src);
    act(() => { engines[1].emit('error', networkError); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    act(() => { engines[1].emit('error', { fatal: true, type: 'mediaError' }); });
    expect(engines).toHaveLength(2);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
