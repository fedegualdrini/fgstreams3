import type { MetadataRoute } from 'next';
import { getCatalog } from '@/lib/catalog';

const SITE_URL = 'https://fgstreams3.vercel.app';

// Without this the sitemap is baked at build time and lists matches that
// finished long ago.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  // Only matches that are actually watchable belong in the sitemap.
  const matches = await getCatalog();
  const matchEntries: MetadataRoute.Sitemap = matches.map((match) => ({
    url: `${SITE_URL}/match/${match.id}`,
    lastModified,
    changeFrequency: 'hourly',
    priority: 0.8,
  }));

  return [
    { url: SITE_URL, lastModified, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/channels`, lastModified, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${SITE_URL}/movies`, lastModified, changeFrequency: 'weekly', priority: 0.5 },
    ...matchEntries,
  ];
}
