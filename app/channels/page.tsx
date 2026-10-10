import { Suspense } from 'react';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import ChannelsPageClient from '@/components/ChannelsPageClient';
import MatchListSkeleton from '@/components/MatchListSkeleton';
import { getChannelCatalog } from '@/lib/channelCatalog';

// The catalog is merged with the live feed, which itself refreshes every 10
// minutes (REVALIDATE_ANGULISMO), so a copy this old is as fresh as the data.
// Serving it from the CDN instead of rendering per request cuts the response
// from ~250 ms to the edge's ~50 ms, and it lets browsers restore the page on Back.
// Segment config must be a literal, so this mirrors REVALIDATE_ANGULISMO in lib/constants.ts.
export const revalidate = 600;

export const metadata: Metadata = {
  // The root layout applies the '%s | FGStreams' template, so no suffix here.
  title: 'Channels',
  description: 'Watch live TV channels',
};

export default async function ChannelsPage() {
  const channels = await getChannelCatalog();

  return (
    <>
      <SiteHeader activeSection="channels" />
      <main style={{ flex: 1 }}>
        <Suspense fallback={<MatchListSkeleton />}>
          <ChannelsPageClient channels={channels} />
        </Suspense>
      </main>
    </>
  );
}
