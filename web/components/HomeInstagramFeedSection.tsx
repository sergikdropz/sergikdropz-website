'use client'

import { useEffect, useState } from 'react'
import InstagramEmbed from '@/components/InstagramEmbed'

interface HomeInstagramFeedSectionProps {
  username: string
}

/**
 * Homepage Instagram block — visibility from DB (admin toggle), with optional env override.
 */
export default function HomeInstagramFeedSection({ username }: HomeInstagramFeedSectionProps) {
  const envForce = process.env.NEXT_PUBLIC_SHOW_INSTAGRAM_FEED

  const [enabled, setEnabled] = useState<boolean | null>(() => {
    if (envForce === 'false') return false
    if (envForce === 'true') return true
    return null
  })

  useEffect(() => {
    if (envForce === 'false' || envForce === 'true') return

    let cancelled = false
    fetch('/api/public/homepage-flags')
      .then((r) => r.json())
      .then((d: { homepageInstagramFeedEnabled?: boolean }) => {
        if (!cancelled) setEnabled(Boolean(d.homepageInstagramFeedEnabled))
      })
      .catch(() => {
        if (!cancelled) setEnabled(process.env.NODE_ENV !== 'production')
      })
    return () => {
      cancelled = true
    }
  }, [envForce])

  if (enabled === null || !enabled) return null

  return (
    <section className="py-8 sm:py-12 md:py-16 lg:py-20 relative z-10 bg-gradient-to-b from-transparent via-black/30 to-transparent">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="overflow-hidden rounded-lg">
            <div
              className="max-h-[600px] overflow-y-auto overflow-x-hidden"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 #111827' }}
            >
              <InstagramEmbed username={username} className="w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
