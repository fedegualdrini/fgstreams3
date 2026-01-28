'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Match } from '@/types/api';
import MatchCard from '@/components/MatchCard';

function matchesSearch(match: Match, q: string): boolean {
  const normalized = q.trim().toLowerCase();
  if (!normalized) return true;
  const fields = [
    match.team1 ?? '',
    match.team2 ?? '',
    match.league ?? '',
    match.sport ?? '',
  ];
  return fields.some((f) => f.toLowerCase().includes(normalized));
}

const cardLinkClass =
  'block bg-gray-900 rounded-lg overflow-hidden hover:bg-gray-800 transition-colors border border-gray-800';

interface MatchListWithSearchProps {
  liveMatches: Match[];
  upcomingMatches: Match[];
}

export default function MatchListWithSearch({
  liveMatches,
  upcomingMatches,
}: MatchListWithSearchProps) {
  const [query, setQuery] = useState('');

  const filteredLive = liveMatches.filter((m) => matchesSearch(m, query));
  const filteredUpcoming = upcomingMatches.filter((m) => matchesSearch(m, query));
  const hasQuery = query.trim().length > 0;
  const noMatchesAtAll = liveMatches.length === 0 && upcomingMatches.length === 0;
  const bothFilteredEmpty = hasQuery && filteredLive.length === 0 && filteredUpcoming.length === 0;

  return (
    <>
      <div className="mb-8">
        <label htmlFor="match-search" className="block text-sm text-gray-400 mb-1">
          Search matches
        </label>
        <input
          id="match-search"
          type="text"
          placeholder="Search matches…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-xl px-4 py-2.5 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {filteredLive.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
            Live Matches ({filteredLive.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLive.map((match) => (
              <Link key={match.id} href={`/match/${match.id}`} className={cardLinkClass}>
                <MatchCard match={match} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {bothFilteredEmpty ? (
        <p className="text-gray-400 text-center py-12">No matches match your search.</p>
      ) : (
        <section>
          <h2 className="text-xl font-semibold text-white mb-4">
            {filteredLive.length > 0 ? 'Upcoming' : 'All'} Matches
            {filteredUpcoming.length > 0 && ` (${filteredUpcoming.length})`}
          </h2>
          {filteredUpcoming.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUpcoming.map((match) => (
                <Link key={match.id} href={`/match/${match.id}`} className={cardLinkClass}>
                  <MatchCard match={match} />
                </Link>
              ))}
            </div>
          ) : noMatchesAtAll ? (
            <p className="text-gray-400 text-center py-12">
              No matches available at the moment.
              <br />
              Please check back later or try refreshing the page.
            </p>
          ) : (
            <p className="text-gray-400 text-center py-12">
              No upcoming matches at the moment.
            </p>
          )}
        </section>
      )}
    </>
  );
}
