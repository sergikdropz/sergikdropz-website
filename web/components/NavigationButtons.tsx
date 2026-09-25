'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ExclusiveMusicbankCta from '@/components/music/ExclusiveMusicbankCta'

interface NavigationButtonsProps {
  /** Omit outer page container; use inside another layout (e.g. Music Library). */
  embedded?: boolean
}

export default function NavigationButtons({ embedded = false }: NavigationButtonsProps) {
  const pathname = usePathname()
  const isMusicLibraryPage = pathname === '/music-library'
  const isMusicPage = pathname === '/music'
  const isGalleryPage = pathname === '/gallery'
  const isVideosPage = pathname === '/videos'
  const isShopPage = pathname === '/shop' || pathname.startsWith('/shop/')

  const links = (
    <div className="flex flex-col gap-4 sm:gap-4">
      {!isMusicLibraryPage && !isMusicPage && (
        <ExclusiveMusicbankCta layout="full" showHint={false} />
      )}
      {!isMusicPage && (
        <Link
          href="/music"
          className="px-6 py-3 bg-gray-900/40 text-white font-bold rounded-lg hover:bg-gray-800/40 transition-all text-center text-base sm:text-lg shadow-lg border-2 border-gray-700 opacity-100 relative z-10 min-h-[44px] touch-manipulation"
        >
          Music
        </Link>
      )}
      {!isGalleryPage && (
        <Link
          href="/gallery"
          className="px-6 py-3 bg-gray-900/40 text-white font-bold rounded-lg hover:bg-gray-800/40 transition-all text-center text-base sm:text-lg shadow-lg opacity-100 relative z-10 min-h-[44px] touch-manipulation"
        >
          Gallery
        </Link>
      )}
      {!isVideosPage && (
        <Link
          href="/videos"
          className="px-6 py-3 bg-gray-900/40 text-white font-bold rounded-lg hover:bg-gray-800/40 transition-all text-center text-base sm:text-lg shadow-lg opacity-100 relative z-10 min-h-[44px] touch-manipulation"
        >
          Videos
        </Link>
      )}
      {!isShopPage && (
        <Link
          href="/shop"
          className="px-6 py-3 bg-gray-900/40 text-white font-bold rounded-lg hover:bg-gray-800/40 transition-all text-center text-base sm:text-lg shadow-lg border-2 border-gray-700 opacity-100 relative z-10 min-h-[44px] touch-manipulation"
        >
          Shop
        </Link>
      )}
    </div>
  )

  if (embedded) {
    return (
      <div className="max-w-4xl mx-auto w-full mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-gray-800/60">
        {links}
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="max-w-4xl mx-auto">
        {links}
      </div>
    </div>
  )
}
