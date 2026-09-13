'use client'

import { useEffect, useState, type ReactNode } from 'react'
import BackgroundImages from '@/components/BackgroundImages'
import ConditionalHeader from '@/components/ConditionalHeader'
import ConditionalFooter from '@/components/ConditionalFooter'
import ConditionalNavigationButtons from '@/components/ConditionalNavigationButtons'
import LazyGlobalMusicPlayer from '@/components/LazyGlobalMusicPlayer'

/**
 * Music vault / fan app shell — global player, mosaic background, player safe-area padding.
 */
export default function AppPublicChrome({ children }: { children: ReactNode }) {
  const [isDJMode, setIsDJMode] = useState(false)

  useEffect(() => {
    const checkDJMode = () => {
      setIsDJMode(document.body.getAttribute('data-dj-mode') === 'true')
    }
    checkDJMode()
    const observer = new MutationObserver(checkDJMode)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-dj-mode'],
    })
    return () => observer.disconnect()
  }, [])

  if (isDJMode) {
    return (
      <main id="main-content" className="relative z-10 min-h-screen safe-area-bottom">
        {children}
      </main>
    )
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <BackgroundImages />
      <ConditionalHeader />
      <main
        id="main-content"
        className="relative z-10 min-h-screen pb-8 sm:pb-10 safe-area-bottom [padding-bottom:calc(2rem+var(--global-music-player-height,0px))]"
      >
        {children}
      </main>
      <ConditionalNavigationButtons />
      <ConditionalFooter />
      <LazyGlobalMusicPlayer />
    </>
  )
}
