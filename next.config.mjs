/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.tumblr.com' },
      { protocol: 'https', hostname: '**.blogspot.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 'comicvine.gamespot.com' },
    ],
  },
}

export default nextConfig
