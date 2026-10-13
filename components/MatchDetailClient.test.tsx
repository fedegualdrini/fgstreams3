import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
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

// Counts mounts, so a remount of the player is observable from the tests.
const playerMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('./StreamPlayer', () => {
  function MockStreamPlayer({ stream }: { stream: { source?: string; url?: string } | null }) {
    React.useEffect(() => { playerMounts.count += 1; }, []);
    return React.createElement('div', { 'data-testid': 'stream-player' }, stream ? `${stream.source}:${stream.url}` : 'none');
  }
  return { default: MockStreamPlayer };
});

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

describe('MatchDetailClient stream attribution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    expect(within(betaStream).getByText(/Playing/)).toBeInTheDocument();
    expect(within(secondAlphaStream).queryByText(/Playing/)).not.toBeInTheDocument();
    expect(screen.getByTestId('stream-player')).toHaveTextContent('beta:https://dup.example/stream');
  });
});

describe('MatchDetailClient player reload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('remounts the player from the Reload button and the R key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [{ url: 'https://alpha.example/one', language: 'en', quality: 'HD' }],
    })));

    render(React.createElement(MatchDetailClient, { match }));
    await screen.findByTestId('stream-player');
    const mountedBefore = playerMounts.count;

    fireEvent.click(screen.getByRole('button', { name: 'Reload player' }));
    await waitFor(() => expect(playerMounts.count).toBe(mountedBefore + 1));

    fireEvent.keyDown(document, { key: 'r' });
    await waitFor(() => expect(playerMounts.count).toBe(mountedBefore + 2));
  });

  it('offers no reload when there is no player to reload', () => {
    render(React.createElement(MatchDetailClient, { match, initialStreams: [], streamsResolved: true }));

    expect(screen.queryByTestId('stream-player')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload player' })).not.toBeInTheDocument();
  });
});
