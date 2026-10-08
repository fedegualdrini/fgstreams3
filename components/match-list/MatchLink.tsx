import Link from 'next/link';
import type { CatalogMatch } from '@/types/api';
import MatchCard from '@/components/MatchCard';

interface MatchLinkProps {
  match: CatalogMatch;
  onOpen: (match: CatalogMatch) => void;
  /** Fixed-width variant used inside the horizontally scrolling live row. */
  live?: boolean;
  score?: string | null;
  scoreMinute?: string;
}

/** A match card that navigates to its detail page. */
export default function MatchLink({ match, onOpen, live = false, score, scoreMinute }: MatchLinkProps) {
  return (
    <Link
      href={`/match/${match.id}`}
      onClick={() => onOpen(match)}
      className={`match-link${live ? ' match-link--live' : ''}`}
    >
      <MatchCard match={match} score={score} scoreMinute={scoreMinute} broadcasts={match.broadcasts} />
    </Link>
  );
}
