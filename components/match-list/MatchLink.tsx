import Link from 'next/link';
import type { ListedMatch } from '@/types/api';
import MatchCard from '@/components/MatchCard';

/** Cards this many places from the top of the page load their poster eagerly (above the fold). */
export const PRIORITY_POSTER_COUNT = 2;

interface MatchLinkProps {
  match: ListedMatch;
  onOpen: (match: ListedMatch) => void;
  /** Fixed-width variant used inside the horizontally scrolling live row. */
  live?: boolean;
  score?: string | null;
  scoreMinute?: string;
  /** Load the poster eagerly; use for cards visible on first paint. */
  priorityPoster?: boolean;
}

/** A match card that navigates to its detail page. */
export default function MatchLink({ match, onOpen, live = false, score, scoreMinute, priorityPoster = false }: MatchLinkProps) {
  return (
    <Link
      href={`/match/${match.id}`}
      onClick={() => onOpen(match)}
      className={`match-link${live ? ' match-link--live' : ''}`}
    >
      <MatchCard
        match={match}
        score={score}
        scoreMinute={scoreMinute}
        broadcasts={match.broadcasts}
        priorityPoster={priorityPoster}
      />
    </Link>
  );
}
