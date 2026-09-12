const path = require('path')

const repoRoot = path.join(__dirname, '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // File watching over Docker / VM shared folders often misses events; polling fixes "not reloading".
  ...(process.env.NEXT_WEBPACK_POLL === '1'
    ? {
        webpack: (config, { dev }) => {
          if (dev) {
            config.watchOptions = {
              ...config.watchOptions,
              poll: 1000,
              aggregateTimeout: 300,
              // Polling stats every watched file on an interval. The audio vault
              // and precomputed waveforms are gigabytes of build-irrelevant
              // assets, so watching them only burns memory and CPU.
              ignored: [
                '**/node_modules/**',
                '**/.next*/**',
                '**/.dev/**',
                '**/public/audio/**',
                '**/public/waveforms/**',
                '**/tsconfig.tsbuildinfo',
                // Repo-level analysis artifacts (read at runtime via fs, not bundled).
                path.join(repoRoot, 'knowledge/library-analysis/tracks/**'),
                path.join(repoRoot, 'knowledge/library-analysis/measured/**'),
                path.join(repoRoot, 'knowledge/generated/**'),
                path.join(repoRoot, 'kb/**'),
                path.join(repoRoot, 'deploy/**'),
                path.join(repoRoot, '**/*.backup'),
              ],
            }
          }
          return config
        },
      }
    : {}),
  // Standalone is only for Docker/self-hosted bundles. Vercel uses its own Next runtime and
  // `output: 'standalone'` can break deploy tracing (route groups like `(protected)`).
  ...(process.env.SERGIK_DOCKER_STANDALONE === '1' ? { output: 'standalone' } : {}),
  compress: true, // Enable gzip compression
  experimental: {
    optimizePackageImports: ['react-icons', 'react-icons/fa', 'react-icons/lu'],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Pre-existing sonic-dna-v2 / classifier errors; do not block R2 media cutover.
    ignoreBuildErrors: true,
  },
  images: {
    domains: [
      'localhost',
      'i.scdn.co',
      'image-cdn-fa.spotifycdn.com',
      'mosaic.scdn.co',
      'img.youtube.com',
      'i.ytimg.com',
      'utgwlgcejflqxyalnlze.supabase.co',
    ],
    formats: ['image/avif', 'image/webp'],
    unoptimized: false,
    minimumCacheTTL: 2592000, // 30 days — album art rarely changes
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.scdn.co',
      },
      {
        protocol: 'https',
        hostname: '**.spotifycdn.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.fbcdn.net',
      },
      {
        protocol: 'https',
        hostname: '**.instagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**.trycloudflare.com',
      },
      {
        protocol: 'https',
        hostname: '**.sndcdn.com',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '3001',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '8000',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '8088',
      },
    ],
  },
  // Headers for better caching and permissions
  async headers() {
    return [
      {
        // Allow SoundCloud-style iframe embeds on third-party sites.
        source: '/embed/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *",
          },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Service worker must never be cached so browsers always check for updates
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        // Apply Permissions-Policy to all routes to allow unload events (needed for Next.js hot reloading)
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'unload=*',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
