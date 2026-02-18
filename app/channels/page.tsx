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
      <main style={{ flex: 1 }}>
        <Suspense fallback={
          <div className="page-content" style={{ paddingTop: '2rem', color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            Loading…
          </div>
        }>
          <ChannelsPageClient channels={channels} />
        </Suspense>
      </main>
    </>
  );
}
