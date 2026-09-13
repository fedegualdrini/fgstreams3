import type { MetadataRoute } from 'next';
import { getCatalog } from '@/lib/catalog';

// Without this the sitemap is baked at build time and lists matches that
// finished long ago.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Only matches that are actually watchable belong in the sitemap.
  const matches = await getCatalog();
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
    { url: `${base}/movies`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
    ...matchEntries,
  ];
}
