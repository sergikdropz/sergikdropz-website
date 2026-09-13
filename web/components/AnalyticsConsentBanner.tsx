'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsentStatus,
} from '@/lib/analytics'
import {
  CONTENT_AREA_OVERLAY_CLASS,
  MUSIC_LIBRARY_OVERLAY_HOST_ID,
  VIEWPORT_OVERLAY_CLASS,
} from '@/lib/content-overlay'

function ConsentDialog({
  onAccept,
  onDecline,
}: {
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-black/95 p-5 shadow-2xl sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="text-sm text-gray-200">
          <span className="font-semibold text-white">Analytics consent.</span>{' '}
          We use privacy-friendly analytics to understand what content performs best.
          No audio autoplay and no tracking on admin routes.
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-gray-200 transition hover:border-white/40 hover:text-white"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-gray-100"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsConsentBanner() {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin') ?? false
  const isMusicLibraryRoute = pathname?.startsWith('/music-library') ?? false
  const isShareEmbedRoute = pathname?.startsWith('/embed/') ?? false
  const isShareListenRoute = pathname?.startsWith('/s/') ?? false
  const [consent, setConsent] = useState<AnalyticsConsentStatus>('unknown')
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setConsent(getAnalyticsConsent())

    const handleConsentChange = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail === 'granted' || detail === 'denied') {
        setConsent(detail)
      } else {
        setConsent(getAnalyticsConsent())
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'analytics_consent') {
        setConsent(getAnalyticsConsent())
      }
    }

    window.addEventListener('analytics-consent', handleConsentChange as EventListener)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('analytics-consent', handleConsentChange as EventListener)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    if (!isMusicLibraryRoute) {
      setOverlayHost(null)
      return
    }

    const findHost = () => document.getElementById(MUSIC_LIBRARY_OVERLAY_HOST_ID)

    const host = findHost()
    if (host) {
      setOverlayHost(host)
      return
    }

    const observer = new MutationObserver(() => {
      const nextHost = findHost()
      if (nextHost) {
        setOverlayHost(nextHost)
        observer.disconnect()
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isMusicLibraryRoute, pathname])

  if (!mounted || isAdminRoute || isShareEmbedRoute || isShareListenRoute || consent !== 'unknown') {
    return null
  }

  const handleAccept = () => {
    setAnalyticsConsent('granted')
    setConsent('granted')
  }

  const handleDecline = () => {
    setAnalyticsConsent('denied')
    setConsent('denied')
  }

  const overlayClass = overlayHost ? CONTENT_AREA_OVERLAY_CLASS : VIEWPORT_OVERLAY_CLASS

  const overlay = (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-label="Analytics consent"
    >
      <ConsentDialog onAccept={handleAccept} onDecline={handleDecline} />
    </div>
  )

  if (overlayHost) {
    return createPortal(overlay, overlayHost)
  }

  return overlay
}
