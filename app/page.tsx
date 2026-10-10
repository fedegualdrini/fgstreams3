import Link from 'next/link';
import { Suspense } from 'react';
import { getCatalog, sortCatalog } from '@/lib/catalog';
import { toListedMatch } from '@/lib/matchListView';
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

const FOOTER_LINKS = [
  { href: '/', label: 'Matches' },
  { href: '/channels', label: 'Channels' },
  { href: '/movies', label: 'Movies' },
];

export default async function Home() {
  const sortedMatches = sortCatalog(await getCatalog());

  // The list only renders cards; stream URLs stay on the server and reach the match page on demand.
  const liveMatches = sortedMatches.filter((match) => match.isLive).map(toListedMatch);
  const upcomingMatches = sortedMatches.filter((match) => !match.isLive).map(toListedMatch);

  return (
    <>
      <SiteHeader activeSection="matches" liveCount={liveMatches.length} />

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <Suspense fallback={<MatchListSkeleton />}>
          <MatchListWithSearch liveMatches={liveMatches} upcomingMatches={upcomingMatches} />
        </Suspense>
      </main>

      <SiteFooter />
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-content site-footer__inner">
        <span className="site-footer__note">Streams sourced from publicly available sources</span>
        <nav aria-label="Footer navigation" className="site-footer__nav">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="site-footer__link">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
