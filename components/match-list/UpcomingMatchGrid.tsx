import type { CatalogMatch } from '@/types/api';
import SectionHeader from './SectionHeader';
import MatchLink from './MatchLink';

interface UpcomingMatchGridProps {
  matches: CatalogMatch[];
  /** The grid is the whole listing when nothing is live, so it is titled accordingly. */
  hasLiveSection: boolean;
  onOpen: (match: CatalogMatch) => void;
}

export default function UpcomingMatchGrid({ matches, hasLiveSection, onOpen }: UpcomingMatchGridProps) {
  return (
    <section>
      <SectionHeader count={matches.length}>{hasLiveSection ? 'Upcoming' : 'All Matches'}</SectionHeader>
      <div className="match-grid">
        {matches.map((match) => (
          <MatchLink key={match.id} match={match} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
