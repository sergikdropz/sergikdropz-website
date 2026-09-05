'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { getAnalyticsConsent, type AnalyticsConsentStatus } from '@/lib/analytics'

export default function AnalyticsScripts() {
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

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  if (!measurementId || isAdminRoute || consent !== 'granted') {
    return null
  }

  return (
    <>
      <Script
        strategy="lazyOnload"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <Script
        id="google-analytics"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${measurementId}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />
    </>
  )
}
