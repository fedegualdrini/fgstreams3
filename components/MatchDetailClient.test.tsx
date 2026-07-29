import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('./StreamPlayer', () => ({
  default: ({ stream }: { stream: { source?: string; url?: string } | null }) => (
    React.createElement('div', { 'data-testid': 'stream-player' }, stream ? `${stream.source}:${stream.url}` : 'none')
  ),
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
