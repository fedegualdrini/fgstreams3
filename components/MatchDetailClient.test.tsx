import React from 'react';
import Hls from 'hls.js';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import MatchDetailClient from './MatchDetailClient';
import type { Match } from '@/types/api';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    React.createElement('a', { href, ...props }, children)
  ),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', { alt: '', ...props }),
}));

vi.mock('./MultiMatchView', () => ({
  default: () => React.createElement('div', { 'data-testid': 'multi-match-view' }),
}));

vi.mock('./SiteHeader', () => ({
  default: () => React.createElement('header', { 'data-testid': 'site-header' }),
}));

vi.mock('./MatchJsonLd', () => ({
  default: () => null,
}));

vi.mock('./MatchStatsPanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'match-stats' }),
}));

vi.mock('@/lib/useMatchStats', () => ({
  useMatchStats: () => null,
}));

vi.mock('@/lib/dateUtils', () => ({
  useLocalTime: () => null,
}));

vi.mock('@/lib/api', () => ({
  getImageUrl: (url: string) => url,
}));

const match: Match = {
  id: 'match-1',
  sport: 'soccer',
  league: 'Test League',
  team1: 'Home',
  team2: 'Away',
  isLive: true,
  sources: [
    { source: 'alpha', id: 'a' },
    { source: 'beta', id: 'b' },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MatchDetailClient stream attribution', () => {
  it('preserves each response array source when the first source returns multiple streams', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/alpha/')) {
        return {
          ok: true,
          json: async () => [
            { url: 'https://dup.example/stream', language: 'es', quality: 'SD' },
            { url: 'https://alpha.example/second', language: 'fr', quality: 'SD' },
          ],
        };
      }

      return {
        ok: true,
        json: async () => [
          { url: 'https://dup.example/stream', language: 'en', quality: 'HD' },
        ],
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(MatchDetailClient, { match }));

    const firstAlphaStream = await screen.findByRole('button', {
      name: /Select es SD from alpha/,
    });
    const secondAlphaStream = screen.getByRole('button', {
      name: /Select fr SD from alpha/,
    });
    const betaStream = screen.getByRole('button', {
      name: /Select en HD from beta/,
    });

    expect(firstAlphaStream).toBeInTheDocument();
    expect(secondAlphaStream).toBeInTheDocument();

    await waitFor(() => expect(betaStream).toHaveAttribute('aria-pressed', 'true'));
    expect(await screen.findByTitle('Stream')).toHaveAttribute('src', 'https://dup.example/stream');
  });
});

describe('MatchDetailClient player reload', () => {
  beforeEach(() => {
    // Exercise the real Direct player; jsdom has no media playback engine.
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  it('recovers a failed Direct player from Reload and R without changing the selected source', async () => {
    const streams = [
      { url: 'https://strmfree.st/embed/soccer/test-match1080p', source: 'strmfree', quality: '1080p' },
      { url: 'https://strmfree.st/embed/soccer/test-match720p2', source: 'strmfree', quality: '720p' },
    ];
    const { container } = render(React.createElement(MatchDetailClient, {
      match, initialStreams: streams, streamsResolved: true,
    }));
    const chosenSource = screen.getByRole('button', { name: 'Select stream 1080p from strmfree' });
    fireEvent.click(chosenSource);
    await act(async () => { await vi.dynamicImportSettled(); });
    const selectedUrl = container.querySelector('video')!.getAttribute('src');

    for (const reload of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Reload player' })),
      () => fireEvent.keyDown(document, { key: 'r' }),
    ]) {
      fireEvent.error(container.querySelector('video')!);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(container.querySelector('iframe')).not.toBeInTheDocument();

      reload();
      await act(async () => { await vi.dynamicImportSettled(); });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      const recoveredVideo = container.querySelector('video')!;
      expect(recoveredVideo).toHaveAttribute('src', selectedUrl);
      expect(chosenSource).toHaveAttribute('aria-pressed', 'true');
      expect(container.querySelector('iframe')).not.toBeInTheDocument();
      fireEvent.playing(recoveredVideo);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    }
  });

  it('offers no reload when there is no player to reload', () => {
    const { container } = render(React.createElement(MatchDetailClient, { match, initialStreams: [], streamsResolved: true }));

    expect(container.querySelector('video, iframe')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload player' })).not.toBeInTheDocument();
  });
});
