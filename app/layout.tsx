import type { Metadata } from 'next';
import localFont from 'next/font/local';
import ErrorBoundary from '@/components/ErrorBoundary';
import AdBlockBanner from '@/components/AdBlockBanner';
import { ADBLOCK_BANNER_BOOT_SCRIPT } from '@/lib/adBlockBanner';
import './globals.css';
// Feature stylesheets, loaded after the base so they can build on its tokens.
import './styles/primitives.css';
import './styles/layout.css';
import './styles/chrome.css';
import './styles/match-list.css';
import './styles/multi-match.css';
import './styles/channels.css';
import './styles/player.css';
import './styles/movies.css';
import './styles/match-detail.css';
import './styles/stream-test.css';

// Bundled font files keep builds independent of Google Fonts availability.
// The CSS variables feed --font-display / --font-body in globals.css.
const bebasNeue = localFont({
  src: './fonts/BebasNeue-Regular.ttf',
  weight: '400',
  display: 'swap',
  variable: '--font-display-src',
});

const spaceGrotesk = localFont({
  src: './fonts/SpaceGrotesk-Variable.ttf',
  weight: '400 600',
  display: 'swap',
  variable: '--font-body-src',
});

export const metadata: Metadata = {
  title: {
    default: 'FGStreams — Live Sports Streaming',
    template: '%s | FGStreams',
  },
  description: 'Clean, reliable live sports streaming — football, basketball, tennis and more.',
  metadataBase: new URL(process.env.URL || 'http://localhost:3000'),
  openGraph: {
    siteName: 'FGStreams',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the banner boot script below may add an attribute to <html> before React hydrates.
    <html lang="en" className={`${bebasNeue.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: ADBLOCK_BANNER_BOOT_SCRIPT }} />
        <AdBlockBanner />
        <div className="site-container">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </body>
    </html>
  );
}
