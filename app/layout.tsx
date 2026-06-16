import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import ErrorBoundary from "@/components/ErrorBoundary";
import AdBlockBanner from "@/components/AdBlockBanner";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AdBlockBanner />
        <div className="site-container">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
