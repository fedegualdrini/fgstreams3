import Link from 'next/link';
import { Suspense } from 'react';
import { fetchMatches } from '@/lib/api';
import MatchListWithSearch from '@/components/MatchListWithSearch';
import SiteHeader from '@/components/SiteHeader';
import MatchListSkeleton from '@/components/MatchListSkeleton';
import { REVALIDATE_MATCHES } from '@/lib/constants';

export const revalidate = REVALIDATE_MATCHES;

export default async function Home() {
  const matches = await fetchMatches();

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
      <SiteHeader activeSection="matches" liveCount={liveMatches.length} />

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <Suspense fallback={<MatchListSkeleton />}>
          <MatchListWithSearch
            liveMatches={liveMatches}
            upcomingMatches={upcomingMatches}
          />
        </Suspense>
      </main>

      <footer style={{ borderTop: '1px solid var(--line)', marginTop: 'auto', padding: '1.25rem 0' }}>
        <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
            Streams sourced from publicly available sources
          </span>
          <nav aria-label="Footer navigation" style={{ display: 'flex', gap: '1rem' }}>
            {[
              { href: '/', label: 'Matches' },
              { href: '/channels', label: 'Channels' },
              { href: '/movies', label: 'Movies' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} style={{ fontSize: '0.65rem', color: 'var(--subtle)', textDecoration: 'none', fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </>
  );
}
