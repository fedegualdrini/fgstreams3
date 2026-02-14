import { readFile } from 'fs/promises';
import path from 'path';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { Channel } from '@/types/channels';
import SiteHeader from '@/components/SiteHeader';
import ChannelsPageClient from '@/components/ChannelsPageClient';

export const metadata: Metadata = {
  title: 'Channels | Sports Streaming Mirror',
  description: 'Watch live TV channels',
};

async function getChannels(): Promise<Channel[]> {
  const filePath = path.join(process.cwd(), 'public', 'channels.json');
  const raw = await readFile(filePath, 'utf-8');
  const all: Channel[] = JSON.parse(raw);
  return all.filter(
    c => c.show && c.options.some(o => o.iframe && o.iframe !== 'undefined')
  );
}

export default async function ChannelsPage() {
  const channels = await getChannels();

  return (
    <>
      <SiteHeader activeSection="channels" />
      <main className="flex-1 bg-[var(--background)] text-[var(--foreground)]">
        <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8 text-gray-400">Loading...</div>}>
          <ChannelsPageClient channels={channels} />
        </Suspense>
      </main>
      <footer className="bg-gray-900 border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-400 text-center">
            Streams sourced from publicly available sources
          </p>
        </div>
      </footer>
    </>
  );
}
