import type { Metadata, Viewport } from 'next'
import { Inter, Six_Caps } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import AnalyticsProvider from '@/components/AnalyticsProvider'
import AnalyticsConsentBanner from '@/components/AnalyticsConsentBanner'
import AnalyticsScripts from '@/components/AnalyticsScripts'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
})
const sixCaps = Six_Caps({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-six-caps',
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'),
  title: 'SERGIK | Electronic Music Producer & DJ',
  description: 'SERGIK is an electronic music producer, DJ, curator, and organizer rooted in underground dance culture.',
  keywords: ['SERGIK', 'electronic music', 'DJ', 'producer', 'house music', 'tech house', 'Phoenix', 'underground'],
  authors: [{ name: 'SERGIK' }],
  icons: {
    icon: '/images/gallery/logo.png',
    shortcut: '/images/gallery/logo.png',
    apple: '/images/gallery/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SERGIK',
  },
  openGraph: {
    title: 'SERGIK | Electronic Music Producer & DJ',
    description: 'SERGIK is an electronic music producer, DJ, curator, and organizer rooted in underground dance culture.',
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001',
    siteName: 'SERGIK',
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/og`,
        width: 1200,
        height: 630,
        alt: 'SERGIK - Electronic Music Producer & DJ',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SERGIK | Electronic Music Producer & DJ',
    description: 'SERGIK is an electronic music producer, DJ, curator, and organizer rooted in underground dance culture.',
    images: [`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/og`],
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: {
    telephone: false,
  },
  alternates: {
    canonical: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
  const ogImageUrl = `${siteUrl}/og`
  
  return (
    <html lang="en">
      <head>
        {/* Explicit OG Image tags to prevent random image selection */}
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content="SERGIK - Electronic Music Producer & DJ" />
        <meta name="twitter:image" content={ogImageUrl} />
        <meta name="twitter:image:alt" content="SERGIK - Electronic Music Producer & DJ" />
        
        {/* Resource hints for better performance */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}
        {(process.env.NEXT_PUBLIC_AUDIO_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_CDN_URL) && (
          <link
            rel="preconnect"
            href={process.env.NEXT_PUBLIC_MEDIA_CDN_URL || process.env.NEXT_PUBLIC_AUDIO_BASE_URL}
          />
        )}
        
        {/* Permissions Policy - allow unload for development hot reloading */}
        <meta httpEquiv="Permissions-Policy" content="unload=*" />
        
        {/* Suppress React DevTools message in production */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if (typeof window !== 'undefined') {
                  const originalLog = console.log;
                  console.log = function(...args) {
                    if (args[0] && typeof args[0] === 'string' && args[0].includes('React DevTools')) {
                      return;
                    }
                    originalLog.apply(console, args);
                  };
                }
              `,
            }}
          />
        )}

        {/* Six Caps is loaded via next/font (self-hosted) — do not also pull Google Fonts CSS */}
        
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/images/gallery/logo.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SERGIK" />
      </head>
      <body className={`${inter.className} ${sixCaps.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MusicGroup',
              name: 'SERGIK',
              url: siteUrl,
              genre: ['House', 'Tech House', 'Minimal House', 'Deep House'],
              description: 'Electronic music producer, DJ, curator, and organizer rooted in underground dance culture.',
              sameAs: [
                'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H',
                'https://soundcloud.com/sergikdropz',
                'https://instagram.com/sergikdropz',
                'https://youtube.com/@sergikdropz',
                'https://linktr.ee/sergikdropz',
              ],
              image: `${siteUrl}/images/gallery/logo.png`,
              member: {
                '@type': 'Person',
                name: 'Sergik',
              },
              location: {
                '@type': 'Place',
                name: 'Phoenix, Arizona',
              },
            }),
          }}
        />
        <AnalyticsScripts />
        <AnalyticsProvider />
        <AnalyticsConsentBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
