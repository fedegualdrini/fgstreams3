import { getCatalogMatch } from '@/lib/catalog';
import { getPosterUrl } from '@/lib/api';
import MatchDetailClient from '@/components/MatchDetailClient';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface MatchDetailPageProps {
  params: Promise<{ id: string }>;
}

// Rendered per request against the cached catalog. Pre-generating match pages
// baked a build-time snapshot of a list that turns over every few minutes, so
// visitors saw matches that had already finished — or a 404 for one that had
// only just been added.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function generateMetadata({ params }: MatchDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const match = await getCatalogMatch(id);
  if (!match) return { title: 'Match Not Found' };

  const title = `${match.team1} vs ${match.team2} - Live Stream`;
  const description = `Watch ${match.team1} vs ${match.team2} live. ${match.league} — ${match.sport}.`;
  const image = match.poster ? getPosterUrl(match.poster) : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(image && { images: [{ url: image, width: 800, height: 450 }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image && { images: [image] }),
    },
  };
}

export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id } = await params;
  const match = await getCatalogMatch(id);

  if (!match) {
    notFound();
  }

  // Streams and broadcast channels are resolved server-side, so the player and
  // the source list are populated on first paint rather than after a round trip.
  return (
    <MatchDetailClient
      match={match}
      initialStreams={match.streams}
      streamsResolved
      broadcasts={match.broadcasts}
    />
  );
}
