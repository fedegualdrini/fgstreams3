'use client';

import type { Match } from '@/types/api';
import { getPosterUrl } from '@/lib/api';
import { formatMatchDate } from '@/lib/dateUtils';

const LiveBadge = () => (
  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-600 text-white">
    <span className="w-2 h-2 bg-white rounded-full mr-1.5 animate-pulse" />
    LIVE
  </span>
);

interface MatchCardProps {
  match: Match;
}

export default function MatchCard({ match }: MatchCardProps) {
  const isLive = match.isLive;
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const posterUrl = getPosterUrl(match.poster);

  return (
    <>
      {posterUrl && (
        <div className="relative w-full h-48 bg-gray-800 overflow-hidden">
          <img
            src={posterUrl}
            alt={`${match.team1} vs ${match.team2}`}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {isLive && (
            <div className="absolute top-2 right-2">
              <LiveBadge />
            </div>
          )}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            {match.league}
          </span>
          {isLive && !posterUrl && <LiveBadge />}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="font-medium text-white text-sm">{match.team1}</span>
            </div>
          </div>
          <div className="text-gray-400 text-sm font-bold">VS</div>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="font-medium text-white text-sm">{match.team2}</span>
            </div>
          </div>
        </div>
        {startTime && !isLive && (
          <p className="text-xs text-gray-400 mt-2">{formatMatchDate(startTime)}</p>
        )}
      </div>
    </>
  );
}
