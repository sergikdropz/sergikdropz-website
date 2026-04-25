'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { trackPageView, trackEvent, getAnalyticsConsent, type AnalyticsConsentStatus } from '@/lib/analytics'

/**
 * AnalyticsProvider - Initializes analytics and tracks page views
 * This component should be added to the root layout
 * 
 * For Next.js App Router, we track page views when the pathname changes
 * rather than using the history API approach in initAnalytics()
 * 
 * IMPORTANT: Only tracks public frontend activity, NOT admin routes
 */
export default function AnalyticsProvider() {
  const pathname = usePathname()
  const hasInitialized = useRef(false)
  const pageStartTime = useRef<number | null>(null)
  const previousPathname = useRef<string | null>(null)
  const sessionStartTime = useRef<number | null>(null)
  const [consent, setConsent] = useState<AnalyticsConsentStatus>('unknown')

  // Check if current route is an admin route (should not be tracked)
  const isAdminRoute = pathname?.startsWith('/admin') ?? false

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
    // Track session start on first page load (only for public routes + consent)
    if (!hasInitialized.current && consent === 'granted' && pathname && !isAdminRoute) {
      hasInitialized.current = true
      sessionStartTime.current = Date.now()

      // Track session start
      trackEvent('session_start', {
        timestamp: sessionStartTime.current,
      })

      // Track initial page view
      setTimeout(() => {
        trackPageView(pathname, document.title)
        pageStartTime.current = Date.now()
        previousPathname.current = pathname
      }, 100)
    }
  }, [pathname, isAdminRoute, consent])

  useEffect(() => {
    // Track page view when pathname changes (Next.js App Router navigation)
    // Only track public frontend routes, NOT admin routes, and only with consent
    if (hasInitialized.current && consent === 'granted' && pathname && !isAdminRoute) {
      // Track time on previous page before navigating
      if (previousPathname.current && pageStartTime.current) {
        const timeOnPage = Date.now() - pageStartTime.current
        // Only track if user spent at least 1 second on the page
        if (timeOnPage >= 1000) {
          trackEvent('time_on_page', {
            path: previousPathname.current,
            duration: Math.round(timeOnPage / 1000), // Duration in seconds
          })
        }
      }

      // Track new page view
      setTimeout(() => {
        trackPageView(pathname, document.title)
        pageStartTime.current = Date.now()
        previousPathname.current = pathname
      }, 100)
    }
  }, [pathname, isAdminRoute])

  // Track session end and time on last page when component unmounts or user leaves
  useEffect(() => {
    if (typeof window === 'undefined' || isAdminRoute || consent !== 'granted') return

    const handleBeforeUnload = () => {
      // Track time on current page (only if user spent at least 1 second)
      if (pageStartTime.current && pathname) {
        const timeOnPage = Date.now() - pageStartTime.current
        if (timeOnPage >= 1000) {
          // Use sendBeacon for reliability during page unload
          const sessionId = sessionStorage.getItem('analytics_session_id')
          const eventData = {
            eventType: 'time_on_page',
            eventData: {
              path: pathname,
              duration: Math.round(timeOnPage / 1000),
            },
            sessionId,
            consent: true,
          }
          // sendBeacon requires Blob for JSON data
          if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(eventData)], { type: 'application/json' })
            navigator.sendBeacon('/api/analytics/track', blob)
          } else {
            // Fallback to sync fetch (may not complete, but better than nothing)
            fetch('/api/analytics/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(eventData),
              keepalive: true,
            }).catch(() => {}) // Silently fail
          }
        }
      }

      // Track session end
      if (sessionStartTime.current) {
        const sessionDuration = Date.now() - sessionStartTime.current
        const sessionId = sessionStorage.getItem('analytics_session_id')
        const eventData = {
          eventType: 'session_end',
          eventData: {
            duration: Math.round(sessionDuration / 1000),
          },
          sessionId,
          consent: true,
        }
        // sendBeacon requires Blob for JSON data
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(eventData)], { type: 'application/json' })
          navigator.sendBeacon('/api/analytics/track', blob)
        } else {
          // Fallback to sync fetch
          fetch('/api/analytics/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
            keepalive: true,
          }).catch(() => {}) // Silently fail
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // Also track when page becomes hidden (tab switch, minimize, etc.)
    const handleVisibilityChange = () => {
      if (document.hidden && pageStartTime.current && pathname) {
        const timeOnPage = Date.now() - pageStartTime.current
        trackEvent('time_on_page', {
          path: pathname,
          duration: Math.round(timeOnPage / 1000),
        })
        // Reset timer when page becomes visible again
        pageStartTime.current = null
      } else if (!document.hidden && pathname) {
        pageStartTime.current = Date.now()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pathname, isAdminRoute, consent])

  // This component doesn't render anything
  return null
}
