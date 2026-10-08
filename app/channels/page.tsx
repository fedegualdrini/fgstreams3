import { Suspense } from 'react';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import ChannelsPageClient from '@/components/ChannelsPageClient';
import MatchListSkeleton from '@/components/MatchListSkeleton';
import { getChannelCatalog } from '@/lib/channelCatalog';

// The catalog is refreshed from the live feed at request time, so this page
// must not be baked at build time — a prerendered copy would pin the channel
// list to whatever was true on the day of the deploy.
export const dynamic = 'force-dynamic';

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
