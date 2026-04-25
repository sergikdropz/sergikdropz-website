/**
 * Service Worker registration and management utilities
 */

let registration: ServiceWorkerRegistration | null = null

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }

  // Only register in production or if explicitly enabled
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_ENABLE_SW) {
    // Service worker is intentionally disabled in development
    // This is expected behavior - no need to log it
    return null
  }

  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })

    // Silently register - no console logs in production

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration!.installing
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available - only log in development
            if (process.env.NODE_ENV === 'development') {
              console.log('New Service Worker available')
            }
          }
        })
      }
    })

    return registration
  } catch (error) {
    console.error('Service Worker registration failed:', error)
    return null
  }
}

/**
 * Unregister service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!registration) {
    return false
  }

  try {
    const unregistered = await registration.unregister()
    if (unregistered) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Service Worker unregistered')
      }
      registration = null
    }
    return unregistered
  } catch (error) {
    console.error('Service Worker unregistration failed:', error)
    return false
  }
}

/**
 * Preload next tracks in queue
 */
export async function preloadTracks(trackUrls: string[]): Promise<void> {
  if (!registration || !registration.active) {
    return
  }

  try {
    registration.active.postMessage({
      type: 'PRELOAD_TRACKS',
      tracks: trackUrls
    })
  } catch (error) {
    console.error('Failed to preload tracks:', error)
  }
}

/**
 * Clear audio cache
 */
export async function clearAudioCache(): Promise<boolean> {
  if (!registration || !registration.active) {
    return false
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel()
    
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data.success || false)
    }

    try {
      registration!.active!.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      )
    } catch (error) {
      console.error('Failed to clear cache:', error)
      resolve(false)
    }
  })
}

/**
 * Get cache information
 */
export async function getCacheInfo(): Promise<{
  itemCount: number
  totalSize: number
  maxSize: number
  maxItems: number
} | null> {
  if (!registration || !registration.active) {
    return null
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel()
    
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data)
    }

    try {
      registration!.active!.postMessage(
        { type: 'GET_CACHE_INFO' },
        [messageChannel.port2]
      )
    } catch (error) {
      console.error('Failed to get cache info:', error)
      resolve(null)
    }
  })
}

/**
 * Check if service worker is supported
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Check if service worker is active
 */
export function isServiceWorkerActive(): boolean {
  return registration !== null && registration.active !== null
}

