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
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com https://vercel.live`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              // hls.js fetches HLS segments via XHR — must be in connect-src, not media-src.
              "connect-src 'self' https://va.vercel-scripts.com https:",
              // https: covers all sports stream embeds + VidSrc (vidsrcme.ru)
              "frame-src https:",
              // blob: is required for HLS.js Media Source Extensions
              "media-src 'self' https: blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
