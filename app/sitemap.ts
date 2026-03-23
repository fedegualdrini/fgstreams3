import type { MetadataRoute } from 'next';
import { fetchMatches } from '@/lib/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const matches = await fetchMatches();
  const base = 'https://fgstreams3.vercel.app';

  const matchEntries = matches.map(m => ({
    url: `${base}/match/${m.id}`,
    lastModified: new Date(),
    changeFrequency: 'hourly' as const,
    priority: 0.8,
  }));

  return [
    { url: base, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/channels`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    ...matchEntries,
  ];
}
