import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import MoviesPageClient from '@/components/MoviesPageClient';

export const metadata: Metadata = {
  title: 'Movies & Series | FGStreams',
  description: 'Stream movies and TV series online for free.',
};

export default function MoviesPage() {
  return (
    <>
      <SiteHeader activeSection="movies" />
      <main style={{ flex: 1 }}>
        <div className="page-content" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.8rem', letterSpacing: '0.04em',
            color: 'var(--text)', marginBottom: '1.75rem', lineHeight: 1,
          }}>
            Movies &amp; Series
          </h1>
          <MoviesPageClient />
        </div>
      </main>
    </>
  );
}
