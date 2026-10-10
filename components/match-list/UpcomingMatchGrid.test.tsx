import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ListedMatch } from '@/types/api';
import UpcomingMatchGrid from './UpcomingMatchGrid';

vi.mock('./MatchLink', () => ({
  PRIORITY_POSTER_COUNT: 2,
  default: ({ match }: { match: ListedMatch }) => React.createElement('a', { href: `/match/${match.id}` }, match.team1),
}));

function matches(count: number): ListedMatch[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    sport: 'football',
    league: 'Liga',
    team1: `Team ${i}`,
    team2: 'Rivals',
    broadcasts: [],
  }));
}

describe('UpcomingMatchGrid', () => {
  it('renders the first page and reveals the rest on demand', () => {
    render(<UpcomingMatchGrid matches={matches(30)} hasLiveSection onOpen={() => {}} />);

    expect(screen.getAllByRole('link')).toHaveLength(24);
    fireEvent.click(screen.getByRole('button', { name: 'Show more (6)' }));

    expect(screen.getAllByRole('link')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
  });

  it('offers no pager when everything fits on the first page', () => {
    render(<UpcomingMatchGrid matches={matches(24)} hasLiveSection onOpen={() => {}} />);

    expect(screen.getAllByRole('link')).toHaveLength(24);
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
  });
});
