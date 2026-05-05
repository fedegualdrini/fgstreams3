/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'streamed.pk' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            // frame-src https: blocks javascript:, data:, and http: iframes while
            // allowing the wide range of third-party HTTPS streaming embeds used by the app.
            value: [
              "default-src 'self'",
              // 'unsafe-eval' is required by Next.js webpack HMR in dev mode only.
              // Production builds never use eval(), so we omit it there.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              // hls.js fetches segments via XHR (connect-src, not media-src).
              // IPTV streams use plain HTTP IPs, so http: must be included here
              // or segment fetches are blocked in production under HTTPS.
              "connect-src 'self' https://va.vercel-scripts.com http: https:",
              // https: covers all sports stream embeds + VidSrc mirrors:
              // vidsrc-embed.ru, vidsrc-embed.su, vidsrcme.su, vsrc.su
              "frame-src https:",
              "media-src 'self' https: http:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
