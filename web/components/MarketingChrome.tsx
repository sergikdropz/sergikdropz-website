'use client'

import type { ReactNode } from 'react'
import BackgroundImages from '@/components/BackgroundImages'
import ConditionalHeader from '@/components/ConditionalHeader'
import ConditionalFooter from '@/components/ConditionalFooter'
import ConditionalNavigationButtons from '@/components/ConditionalNavigationButtons'

/**
 * Public marketing shell — no global player, no catalog polling, no player padding.
 */
export default function MarketingChrome({ children }: { children: ReactNode }) {
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
        className="relative z-10 min-h-screen pb-8 sm:pb-10 safe-area-bottom"
      >
        {children}
      </main>
      <ConditionalNavigationButtons />
      <ConditionalFooter />
    </>
  )
}
