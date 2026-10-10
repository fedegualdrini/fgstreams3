'use client';

import { useState } from 'react';
import type { ListedMatch } from '@/types/api';
import SectionHeader from './SectionHeader';
import MatchLink, { PRIORITY_POSTER_COUNT } from './MatchLink';

/**
 * Cards rendered per page. The upcoming list can run to a couple of hundred
 * matches; rendering them all makes the first load heavy (every card is HTML,
 * data and a poster), so the rest is revealed on demand. Search and sport
 * filters still look at every match; only the rendering is paged.
 */
const PAGE_SIZE = 24;

interface UpcomingMatchGridProps {
  matches: ListedMatch[];
  /** The grid is the whole listing when nothing is live, so it is titled accordingly. */
  hasLiveSection: boolean;
  onOpen: (match: ListedMatch) => void;
}

export default function UpcomingMatchGrid({ matches, hasLiveSection, onOpen }: UpcomingMatchGridProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const remaining = matches.length - visibleCount;

  return (
    <section>
      <SectionHeader count={matches.length}>{hasLiveSection ? 'Upcoming' : 'All Matches'}</SectionHeader>
      <div className="match-grid">
        {matches.slice(0, visibleCount).map((match, index) => (
          <MatchLink
            key={match.id}
            match={match}
            onOpen={onOpen}
            // The grid only sits at the top of the page when there is no live row above it.
            priorityPoster={!hasLiveSection && index < PRIORITY_POSTER_COUNT}
          />
        ))}
      </div>
      {remaining > 0 && (
        <div className="match-grid__more">
          <button type="button" className="btn" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Show more ({remaining})
          </button>
        </div>
      )}
    </section>
  );
}
