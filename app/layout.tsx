import type { Metadata } from 'next';
import { Bebas_Neue, Space_Grotesk } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import ErrorBoundary from '@/components/ErrorBoundary';
import AdBlockBanner from '@/components/AdBlockBanner';
import { ADBLOCK_BANNER_BOOT_SCRIPT } from '@/lib/adBlockBanner';
import './globals.css';

// Self-hosted by next/font so the fonts are not a render-blocking third-party
// request. The CSS variables feed --font-display / --font-body in globals.css.
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display-src',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-body-src',
});

export const metadata: Metadata = {
  title: {
    default: 'FGStreams — Live Sports Streaming',
    template: '%s | FGStreams',
  },
  description: 'Clean, reliable live sports streaming — football, basketball, tennis and more.',
  metadataBase: new URL('https://fgstreams3.vercel.app'),
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
