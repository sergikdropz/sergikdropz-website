'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsentStatus,
} from '@/lib/analytics'

export default function AnalyticsConsentBanner() {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin') ?? false
  const [consent, setConsent] = useState<AnalyticsConsentStatus>('unknown')

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

  if (isAdminRoute || consent !== 'unknown') {
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

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-black/90 p-5 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-200">
            <span className="font-semibold text-white">Analytics consent.</span>{' '}
            We use privacy-friendly analytics to understand what content performs best.
            No audio autoplay and no tracking on admin routes.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleDecline}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-gray-200 transition hover:border-white/40 hover:text-white"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-gray-100"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
