import { fetchMatches, getPosterUrl } from '@/lib/api';
import MatchDetailClient from '@/components/MatchDetailClient';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { REVALIDATE_MATCHES } from '@/lib/constants';

interface MatchDetailPageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = REVALIDATE_MATCHES;

export async function generateStaticParams() {
  const matches = await fetchMatches();
  // Only pre-generate the first 50 matches — others generate on-demand
  return matches.slice(0, 50).map(m => ({ id: m.id }));
}

export async function generateMetadata({ params }: MatchDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const matches = await fetchMatches();
  const match = matches.find(m => m.id === id);
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
  const matches = await fetchMatches();
  const match = matches.find(m => m.id === id);

  if (!match) {
    notFound();
  }

  return <MatchDetailClient match={match} />;
}
