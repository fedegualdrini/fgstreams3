'use client';

import { memo } from 'react';
import type { BroadcastChannel, Match } from '@/types/api';
import { getPosterUrl } from '@/lib/api';
import { useLocalTime } from '@/lib/dateUtils';
import PosterImage from '@/components/match-list/PosterImage';
import { useScoreFlash } from '@/components/match-list/useScoreFlash';

/** Broadcasters shown on a card; more would crowd out the league name. */
const MAX_BROADCASTS = 2;

interface MatchCardProps {
  match: Match;
  score?: string | null;
  scoreMinute?: string;
  /** Channels from the local catalog carrying this match, if any. */
  broadcasts?: BroadcastChannel[];
}

function MatchCard({ match, score, scoreMinute, broadcasts = [] }: MatchCardProps) {
  const localTime = useLocalTime(match.startTime ? new Date(match.startTime) : null);
  const displayScore = match.isLive && score ? score : null;

  return (
    <div className="match-card">
      <Poster match={match} />

      <div className="match-card__header">
        <span className="match-card__league truncate">{match.league || match.sport}</span>
        <Broadcasts broadcasts={broadcasts} />
      </div>

      <div className="match-card__matchup">
        <span className="match-card__team match-card__team--home truncate">{match.team1}</span>
        <ScoreOrVersus score={displayScore} minute={scoreMinute} />
        {match.team2
          ? <span className="match-card__team truncate">{match.team2}</span>
          : <span style={{ flex: 1 }} />}
      </div>

      <div className="match-card__footer">
        <span className="match-card__sport">{match.sport}</span>
        {match.isLive && <span className="match-card__watch">WATCH →</span>}
        {!match.isLive && localTime && (
          <span className="match-card__time" suppressHydrationWarning>{localTime}</span>
        )}
      </div>
    </div>
  );
}

function Poster({ match }: { match: Match }) {
  const posterUrl = getPosterUrl(match.poster);

  return (
    <div className="match-card__poster">
      {posterUrl && (
        <PosterImage
          src={posterUrl}
          alt={`${match.team1} vs ${match.team2 ?? ''}`}
          sizes="(max-width: 768px) 100vw, 300px"
          className="match-card__poster-image"
        />
      )}
      <div className="match-card__poster-fade" />
      {match.isLive && (
        <div className="match-card__live">
          <span className="live-dot match-card__live-dot" />
          LIVE
        </div>
      )}
    </div>
  );
}

function Broadcasts({ broadcasts }: { broadcasts: BroadcastChannel[] }) {
  if (broadcasts.length === 0) return null;

  return (
    <span className="match-card__broadcasts">
      {broadcasts.slice(0, MAX_BROADCASTS).map((broadcast) => (
        <span key={broadcast.channel} title={broadcast.network} className="match-card__broadcast truncate">
          {broadcast.channel}
        </span>
      ))}
    </span>
  );
}

function ScoreOrVersus({ score, minute }: { score: string | null; minute?: string }) {
  const flashing = useScoreFlash(score);

  if (!score) return <span className="match-card__vs">VS</span>;

  return (
    <div className="match-card__score">
      <span className={`match-card__score-value${flashing ? ' score-flash' : ''}`}>{score}</span>
      {minute && <span className="match-card__score-minute">{minute}</span>}
    </div>
  );
}

export default memo(MatchCard);
