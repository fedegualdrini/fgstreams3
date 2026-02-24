import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sports Streaming Mirror",
  description: "Clean, reliable sports streaming - fast, stable, and mobile-first",
  referrer: "no-referrer-when-downgrade",
  other: {
    "df6f0aa1f95d1fecbda63f8e80bda4e1bb8d6c2c": "df6f0aa1f95d1fecbda63f8e80bda4e1bb8d6c2c",
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
        <div className="site-container">
          {children}
        </div>
        <Analytics />
        <Script
          id="hilltopads-popunder"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(kyed){var d=document,s=d.createElement('script'),l=d.scripts[d.scripts.length-1];s.settings=kyed||{};s.src="//prime-president.com/c.D/9l6jbA2E5JlKSjWpQQ9NNGjpg/y-MRjig/5UM/yD0k2OOiDFI-yqOIDUkD3s";s.async=true;s.referrerPolicy='no-referrer-when-downgrade';l.parentNode.insertBefore(s,l);})({})`
          }}
        />
      </body>
    </html>
  );
}
