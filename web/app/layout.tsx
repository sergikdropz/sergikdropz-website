import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SERGIK | Electronic Music Producer & DJ',
  description: 'SERGIK is an electronic music producer, DJ, curator, and organizer rooted in underground dance culture.',
  keywords: ['SERGIK', 'electronic music', 'DJ', 'producer', 'house music', 'tech house', 'Phoenix', 'underground'],
  authors: [{ name: 'SERGIK' }],
  openGraph: {
    title: 'SERGIK | Electronic Music Producer & DJ',
    description: 'SERGIK is an electronic music producer, DJ, curator, and organizer rooted in underground dance culture.',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SERGIK | Electronic Music Producer & DJ',
    description: 'SERGIK is an electronic music producer, DJ, curator, and organizer rooted in underground dance culture.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
