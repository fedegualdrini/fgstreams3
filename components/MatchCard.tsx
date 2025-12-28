'use client';

import Link from 'next/link';
import { Match } from '@/types/api';
import { getImageUrl, getPosterUrl } from '@/lib/api';

interface MatchCardProps {
  match: Match;
}

export default function MatchCard({ match }: MatchCardProps) {
  const isLive = match.isLive;
  const startTime = match.startTime ? new Date(match.startTime) : null;
  const posterUrl = getPosterUrl(match.poster);

  return (
    <Link 
      href={`/match/${match.id}`}
      className="block bg-gray-900 rounded-lg overflow-hidden hover:bg-gray-800 transition-colors border border-gray-800"
    >
      {/* Poster Image */}
      {posterUrl && (
        <div className="relative w-full h-48 bg-gray-800 overflow-hidden">
          <img
            src={posterUrl}
            alt={`${match.team1} vs ${match.team2}`}
            className="w-full h-full object-cover"
            onError={(e) => { 
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Overlay for live badge */}
          {isLive && (
            <div className="absolute top-2 right-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-600 text-white">
                <span className="w-2 h-2 bg-white rounded-full mr-1.5 animate-pulse"></span>
                LIVE
              </span>
            </div>
          )}
        </div>
      )}

      {/* Match Info */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            {match.league}
          </span>
          {isLive && !posterUrl && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-600 text-white">
              <span className="w-2 h-2 bg-white rounded-full mr-1.5 animate-pulse"></span>
              LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              {match.image1 && (
                <img
                  src={getImageUrl(match.image1)}
                  alt={match.team1}
                  className="w-8 h-8 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span className="font-medium text-white text-sm">{match.team1}</span>
            </div>
          </div>

          <div className="text-gray-400 text-sm font-bold">VS</div>

          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              {match.image2 && (
                <img
                  src={getImageUrl(match.image2)}
                  alt={match.team2}
                  className="w-8 h-8 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span className="font-medium text-white text-sm">{match.team2}</span>
            </div>
          </div>
        </div>

        {startTime && !isLive && (
          <div className="mt-3 text-center text-sm text-gray-400">
            {startTime.toLocaleString()}
          </div>
        )}
      </div>
    </Link>
  );
}
