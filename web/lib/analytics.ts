/**
 * Analytics tracking utilities
 * Supports both client-side and server-side tracking
 */

export type AnalyticsConsentStatus = 'granted' | 'denied' | 'unknown'

const ANALYTICS_CONSENT_KEY = 'analytics_consent'

export function getAnalyticsConsent(): AnalyticsConsentStatus {
  if (typeof window === 'undefined') {
    return 'unknown'
  }

  const stored = localStorage.getItem(ANALYTICS_CONSENT_KEY)
  if (stored === 'granted' || stored === 'denied') {
    return stored
  }
  return 'unknown'
}

export function setAnalyticsConsent(status: Exclude<AnalyticsConsentStatus, 'unknown'>): void {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(ANALYTICS_CONSENT_KEY, status)
  window.dispatchEvent(new CustomEvent('analytics-consent', { detail: status }))
}

export function isAnalyticsConsentGranted(): boolean {
  return getAnalyticsConsent() === 'granted'
}

// Generate or retrieve session ID
function getSessionId(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  let sessionId = sessionStorage.getItem('analytics_session_id')
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('analytics_session_id', sessionId)
  }
  return sessionId
}

// Get user ID from auth (if available)
function getUserId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  // Try to get from localStorage or context
  try {
    const authData = localStorage.getItem('sb-auth-token')
    if (authData) {
      // Parse JWT to get user ID (simplified - in production use a proper JWT library)
      try {
        const payload = JSON.parse(atob(authData.split('.')[1]))
        return payload.sub || null
      } catch {
        return null
      }
    }
  } catch {
    // Ignore errors
  }

  return null
}

/**
 * Track an analytics event (client-side)
 */
export async function trackEvent(
  eventType: string,
  eventData?: Record<string, any>
): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (!isAnalyticsConsentGranted()) {
      return
    }

    const sessionId = getSessionId()
    const userId = getUserId()

    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventType,
        eventData,
        sessionId,
        userId,
        consent: true,
      }),
    })

    // Also send to Google Analytics if configured
    if (typeof window !== 'undefined' && (window as any).gtag) {
      const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
      if (gaMeasurementId) {
        ;(window as any).gtag('event', eventType, {
          ...eventData,
          event_category: 'custom',
        })
      }
    }
  } catch (error) {
    // Silently fail - analytics is non-critical
    console.error('Analytics tracking error:', error)
  }
}

/**
 * Track page view (client-side)
 */
export function trackPageView(path: string, title?: string): void {
  // Get referrer information
  const referrer = document.referrer || null
  const referrerDomain = referrer ? new URL(referrer).hostname : null
  
  // Determine traffic source
  let source = 'direct'
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer)
      const hostname = referrerUrl.hostname
      
      // Check if it's a search engine
      const searchEngines = ['google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com', 'yandex.com']
      if (searchEngines.some(se => hostname.includes(se))) {
        source = 'search'
      } else if (hostname === window.location.hostname) {
        source = 'internal'
      } else {
        source = 'referral'
      }
    } catch {
      source = 'unknown'
    }
  }

  trackEvent('page_view', {
    path,
    title: title || document.title,
    url: window.location.href,
    referrer: referrer,
    referrerDomain: referrerDomain,
    source: source,
  })
}

/**
 * Track track play (client-side)
 */
export function trackTrackPlay(trackId: string, trackTitle?: string): void {
  trackEvent('track_play', {
    trackId,
    trackTitle,
  })
}

/**
 * Track download (client-side)
 */
export function trackDownload(fileId: string, fileName?: string): void {
  trackEvent('download', {
    fileId,
    fileName,
  })
}

/**
 * Track purchase (server-side)
 * Call this from API routes after a successful purchase
 */
export async function trackPurchase(
  amount: number,
  currency: string = 'usd',
  trackId?: string,
  trackTitle?: string
): Promise<void> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/analytics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventType: 'purchase',
        eventData: {
          amount,
          currency,
          trackId,
          trackTitle,
        },
        consent: false,
      }),
    })

    if (!response.ok) {
      console.error('Failed to track purchase')
    }
  } catch (error) {
    // Silently fail - analytics is non-critical
    console.error('Purchase tracking error:', error)
  }
}

/**
 * Initialize analytics (client-side)
 * Call this in your app layout or root component
 */
export function initAnalytics(): void {
  if (typeof window === 'undefined') {
    return
  }

  // Track initial page view
  trackPageView(window.location.pathname)

  // Track page views on navigation (for Next.js)
  if (typeof window !== 'undefined') {
    // Listen for Next.js route changes
    const originalPushState = history.pushState
    history.pushState = function (...args) {
      originalPushState.apply(history, args)
      const url = new URL(window.location.href)
      trackPageView(url.pathname)
    }

    const originalReplaceState = history.replaceState
    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args)
      const url = new URL(window.location.href)
      trackPageView(url.pathname)
    }

    // Also listen to popstate for back/forward navigation
    window.addEventListener('popstate', () => {
      trackPageView(window.location.pathname)
    })
  }
}
