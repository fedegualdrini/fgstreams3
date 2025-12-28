import { fetchMatches, fetchSports } from '@/lib/api';
import MatchCard from '@/components/MatchCard';

export const revalidate = 30; // Revalidate every 30 seconds

export default async function Home() {
  const [matches, sports] = await Promise.all([
    fetchMatches(),
    fetchSports(),
  ]);

  // Sort matches: live first, then by date
  const sortedMatches = [...matches].sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
    return aTime - bTime;
  });

  // Separate live and upcoming matches
  const liveMatches = sortedMatches.filter(m => m.isLive);
  const upcomingMatches = sortedMatches.filter(m => !m.isLive);

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white">
            Sports Streaming Mirror
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Clean, reliable sports streaming
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {liveMatches.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
              Live Matches ({liveMatches.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xl font-semibold text-white mb-4">
            {liveMatches.length > 0 ? 'Upcoming' : 'All'} Matches {upcomingMatches.length > 0 && `(${upcomingMatches.length})`}
          </h2>
          {upcomingMatches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p>No matches available at the moment</p>
              <p className="text-sm mt-2">Please check back later or try refreshing the page.</p>
            </div>
          ) : (
            <div className="text-center text-gray-400 py-12">
              No upcoming matches at the moment
            </div>
          )}
        </section>
      </main>

      <footer className="bg-gray-900 border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-400 text-center">
            Streams sourced from publicly available sources via Streamed API
          </p>
        </div>
      </footer>
    </div>
  );
}
