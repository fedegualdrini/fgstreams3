import type { Match } from '@/types/api';
import StatusBadge from '@/components/StatusBadge';

interface MatchHeadingProps {
  match: Match;
  /** Single-line ellipsis for tight headers; the picker lets text wrap. */
  truncate?: boolean;
  /** Show the pulsing dot inside the LIVE badge. */
  liveDot?: boolean;
}

/** Title, league and LIVE badge for a match. */
export default function MatchHeading({ match, truncate = false, liveDot = false }: MatchHeadingProps) {
  const lineClass = truncate ? ' truncate' : '';

  return (
    <>
      <p className={`multi-heading__title${lineClass}`}>
        {match.team1}
        {match.team2 ? ` vs ${match.team2}` : ''}
      </p>
      <p className={`multi-heading__meta${lineClass}`}>{match.league || match.sport}</p>
      {match.isLive && <StatusBadge compact dot={liveDot} />}
    </>
  );
}
