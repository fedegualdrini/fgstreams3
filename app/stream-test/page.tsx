import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import StreamTestClient from '@/components/StreamTestClient';

export const metadata: Metadata = {
  title: 'Stream Test',
  description: 'Experimental direct HLS playback without a third-party embed.',
  robots: { index: false, follow: false },
};

export default function StreamTestPage() {
  return (
    <>
      <SiteHeader activeSection="stream-test" />
      <main className="page-main">
        <div className="page-content stream-test">
          <h1 className="display stream-test__title">Stream Test</h1>
          <p className="stream-test__intro">Test a fresh StreamFree or embed.st stream without loading its iframe, ads or popup scripts. The same direct player is available on supported match and channel sources.</p>
          <StreamTestClient />
        </div>
      </main>
    </>
  );
}
