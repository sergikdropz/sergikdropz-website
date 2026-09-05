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
          className="inline-flex w-full min-h-[44px] origin-center items-center justify-center gap-2 rounded border border-yellow-400 px-4 py-2 text-center font-six-caps text-3xl font-semibold text-yellow-400 transition-colors hover:bg-yellow-400/10 hover:text-yellow-300 touch-manipulation sm:px-5 sm:py-2.5 sm:text-4xl md:text-5xl"
          style={{
            letterSpacing: '0.22em',
            transform: 'scaleX(1.12)',
            textShadow: '0.4px 0 0 currentColor, -0.4px 0 0 currentColor',
          }}
        >
          Exclusive ID MusicBank
        </Link>
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
