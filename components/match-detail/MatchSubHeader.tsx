import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { FlashscoreDetail, Match } from '@/types/api';
import { getImageUrl } from '@/lib/api';
import { useLocalTime } from '@/lib/dateUtils';
import ScoreBadge from './ScoreBadge';

interface MatchSubHeaderProps {
  match: Match;
  stats: FlashscoreDetail | null;
  /** Buttons aligned to the right of the bar. */
  actions: ReactNode;
  /** Content rendered under the bar, inside the same banner. */
  children?: ReactNode;
}

/** Banner under the site header: teams, score, league, kickoff time and actions. */
export default function MatchSubHeader({ match, stats, actions, children }: MatchSubHeaderProps) {
  return (
    <div className="match-subheader">
      <div className="page-content match-subheader__bar">
        <Link href="/" className="match-subheader__back" aria-label="Back to matches">←</Link>
        <span className="match-subheader__divider" aria-hidden="true">|</span>

        <TeamLogo src={match.image1} name={match.team1} />
        <span className="match-team__name">{match.team1}</span>
        <ScoreBadge stats={stats} />
        {match.team2 && <span className="match-team__name">{match.team2}</span>}
        <TeamLogo src={match.image2} name={match.team2 ?? ''} />

        <MatchMeta match={match} />
        <div className="match-subheader__actions">{actions}</div>
      </div>
      {children}
    </div>
  );
}

function TeamLogo({ src, name }: { src?: string; name: string }) {
  if (!src) return null;
  return (
    <Image
      src={getImageUrl(src)}
      alt={name}
      width={24}
      height={24}
      className="match-team__logo"
    />
  );
}

function MatchMeta({ match }: { match: Match }) {
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const localTime = useLocalTime(startTime);

  return (
    <>
      <span className="label match-subheader__league">{match.league || match.sport}</span>
      {match.isLive && (
        <span className="match-live-badge">
          <span className="live-dot match-live-badge__dot" />
          LIVE
        </span>
      )}
      {localTime && !match.isLive && (
        <span suppressHydrationWarning className="match-subheader__time">{localTime}</span>
      )}
    </>
  );
}
