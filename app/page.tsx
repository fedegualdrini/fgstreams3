import Link from 'next/link';
import { Suspense } from 'react';
import { getCatalog, sortCatalog } from '@/lib/catalog';
import MatchListWithSearch from '@/components/MatchListWithSearch';
import SiteHeader from '@/components/SiteHeader';
import MatchListSkeleton from '@/components/MatchListSkeleton';

// Rendered per request. Under ISR this page served the previous snapshot while
// revalidating behind it, which is why a first visit showed a stale (often
// empty) list and a manual refresh "fixed" it. The upstream calls behind
// getCatalog are cached instead, so a fresh render stays cheap.
export const dynamic = 'force-dynamic';

// Resolving stream availability for the whole listing costs a few seconds the
// first time after a deploy; every later render reads the cached catalog.
export const maxDuration = 60;

export default async function Home() {
  const sortedMatches = sortCatalog(await getCatalog());

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
