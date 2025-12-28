import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sports Streaming Mirror",
  description: "Clean, reliable sports streaming - fast, stable, and mobile-first",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
