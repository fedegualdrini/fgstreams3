/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'streamed.pk',
      },
    ],
  },
};

export default nextConfig;
