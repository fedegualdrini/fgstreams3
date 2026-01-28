import { fetchMatches, fetchSports } from '@/lib/api';
import MatchListWithSearch from '@/components/MatchListWithSearch';

export const revalidate = 30;

export default async function Home() {
  const [matches, sports] = await Promise.all([
    fetchMatches(),
    fetchSports(),
  ]);

  const sortedMatches = [...matches].sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
    return aTime - bTime;
  });

  const liveMatches = sortedMatches.filter(m => m.isLive);
  const upcomingMatches = sortedMatches.filter(m => !m.isLive);

  return (
    <>
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white">Sports Streaming Mirror</h1>
          <p className="text-sm text-gray-400 mt-1">Clean, reliable sports streaming</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <MatchListWithSearch
          liveMatches={liveMatches}
          upcomingMatches={upcomingMatches}
        />
      </main>

      <footer className="bg-gray-900 border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-400 text-center">
            Streams sourced from publicly available sources via Streamed API
          </p>
        </div>
      </footer>
    </>
  );
}
