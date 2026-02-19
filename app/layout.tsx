import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
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
      </body>
    </html>
  );
}
