import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import MoviesPageClient from '@/components/MoviesPageClient';

export const metadata: Metadata = {
  // The root layout applies the '%s | FGStreams' template, so no suffix here.
  title: 'Movies & Series',
  description: 'Stream movies and TV series online for free.',
};

export default function MoviesPage() {
  return (
    <>
      <SiteHeader activeSection="movies" />
      <main style={{ flex: 1 }}>
        <div className="page-content movies-page">
          <h1 className="movies-page__title">Movies &amp; Series</h1>
          <MoviesPageClient />
        </div>
      </main>
    </>
  );
}
