import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import { fetchRscMatches } from '@/lib/api';
import RscPageClient from '@/components/RscPageClient';

export const metadata: Metadata = {
  title: 'RSC | SportsSRC Mirror',
  description: 'Live football data from SportSRC V2.',
};

export const revalidate = 60;

export default async function RscPage() {
  const data = await fetchRscMatches();

  return (
    <>
      <SiteHeader activeSection="rsc" />
      <main style={{ flex: 1 }}>
        <RscPageClient data={data} />
      </main>
    </>
  );
}

