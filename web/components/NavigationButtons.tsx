'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

  const links = (
    <div className="flex flex-col gap-4 sm:gap-4">
      {!isMusicLibraryPage && !isMusicPage && (
        <Link
          href="/music-library"
          className="w-full px-6 sm:px-8 py-4 sm:py-5 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-lg hover:from-yellow-500 hover:to-yellow-700 transition-all shadow-2xl shadow-yellow-500/70 flex items-center justify-center gap-2 text-base sm:text-lg md:text-xl min-h-[56px] sm:min-h-[64px] touch-manipulation relative z-10 transform hover:scale-105"
        >
          <span>Exclusive ID MusicBank</span>
          <span>→</span>
        </Link>
      )}
      {isMusicPage ? (
        <Link
          href="/music-library"
          className="w-full px-6 sm:px-8 py-4 sm:py-5 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-lg hover:from-yellow-500 hover:to-yellow-700 transition-all shadow-2xl shadow-yellow-500/70 flex items-center justify-center gap-2 text-base sm:text-lg md:text-xl min-h-[56px] sm:min-h-[64px] touch-manipulation relative z-10 transform hover:scale-105"
        >
          <span>Exclusive ID MusicBank</span>
          <span>→</span>
        </Link>
      ) : (
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
          className="px-6 py-3 bg-gray-900/40 text-white font-bold rounded-lg hover:bg-gray-800/40 transition-all text-center text-base sm:text-lg shadow-lg border-2 border-gray-700 opacity-100 relative z-10 min-h-[44px] touch-manipulation"
        >
          Gallery
        </Link>
      )}
      {!isVideosPage && (
        <Link
          href="/videos"
          className="px-6 py-3 bg-gray-900/40 text-white font-bold rounded-lg hover:bg-gray-800/40 transition-all text-center text-base sm:text-lg shadow-lg border-2 border-gray-700 opacity-100 relative z-10 min-h-[44px] touch-manipulation"
        >
          Videos
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
