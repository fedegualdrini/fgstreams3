import { fetchMatches, fetchStreams, getPosterUrl } from '@/lib/api';
import { selectBestStream } from '@/lib/streamSelector';
import MatchDetailClient from '@/components/MatchDetailClient';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Stream } from '@/types/api';
import { REVALIDATE_MATCHES } from '@/lib/constants';

interface MatchDetailPageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = REVALIDATE_MATCHES;

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

  let streams: Stream[] = [];
  if (match.sources && match.sources.length > 0) {
    const streamPromises = match.sources.map(source =>
      fetchStreams(source.source, source.id).catch(err => {
        console.error(`Failed to fetch streams from ${source.source}/${source.id}:`, err);
        return [];
      })
    );
    const streamArrays = await Promise.all(streamPromises);
    const allStreams = streamArrays.flat();

    streams = allStreams.map((stream) => {
      const sourceInfo = match.sources!.find(s =>
        stream.source === s.source || (stream.embedUrl && stream.embedUrl.includes(s.source))
      ) || match.sources![0];
      return {
        ...stream,
        source: stream.source || sourceInfo.source,
      };
    });
  }

  const bestStream = selectBestStream(streams);

  return (
    <MatchDetailClient
      match={match}
      streams={streams}
      initialStream={bestStream}
    />
  );
}
