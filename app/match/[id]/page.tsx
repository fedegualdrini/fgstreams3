import { fetchMatches, fetchStreams } from '@/lib/api';
import { selectBestStream } from '@/lib/streamSelector';
import MatchDetailClient from '@/components/MatchDetailClient';
import { notFound } from 'next/navigation';

interface MatchDetailPageProps {
  params: Promise<{ id: string }>;
}

export const revalidate = 30;

export default async function MatchDetailPage({ params }: MatchDetailPageProps) {
  const { id } = await params;
  const matches = await fetchMatches();
  const match = matches.find(m => m.id === id);

  if (!match) {
    notFound();
  }

  // Fetch streams from all available sources
  let streams: any[] = [];
  if (match.sources && match.sources.length > 0) {
    // Fetch streams from all sources in parallel
    const streamPromises = match.sources.map(source => 
      fetchStreams(source.source, source.id).catch(err => {
        console.error(`Failed to fetch streams from ${source.source}/${source.id}:`, err);
        return [];
      })
    );
    const streamArrays = await Promise.all(streamPromises);
    // Flatten all streams
    const allStreams = streamArrays.flat();
    
    // Add source info to each stream if not present
    streams = allStreams.map((stream, index) => {
      // Find which source this stream came from based on the embedUrl or source field
      const sourceInfo = match.sources.find(s => 
        stream.source === s.source || stream.embedUrl?.includes(s.source)
      ) || match.sources[0];
      
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
