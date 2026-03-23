import { fetchMatches, fetchSports } from '@/lib/api';
import MatchListWithSearch from '@/components/MatchListWithSearch';
import SiteHeader from '@/components/SiteHeader';
import { REVALIDATE_MATCHES } from '@/lib/constants';

export const revalidate = REVALIDATE_MATCHES;

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
      <SiteHeader activeSection="matches" />

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
