/**
 * Service Worker for audio file caching
 * Implements smart caching strategy: Cache First for recent tracks, Network First for new tracks
 */

// Audio bytes cache (actual mp3/wav streams)
// NOTE: Browsers may still evict storage under pressure, but these higher limits
// let us retain more data for repeat listeners.
const CACHE_NAME = 'sergik-audio-cache-v2'
const MAX_CACHE_SIZE = 1024 * 1024 * 1024 // ~1GB
const MAX_CACHE_ITEMS = 100 // Maximum number of cached tracks
const PRELOAD_COUNT = 5 // Number of next tracks to preload

// Public API JSON cache (music library structure, waveform/bpm, sonic-dna reads)
// v2: Cleared stale sonic-dna responses after data enhancement (2026-01-30)
const API_CACHE_NAME = 'sergik-api-cache-v2'
const API_MAX_ITEMS = 500 // High cap; browser may still evict

// Track cache metadata
const CACHE_METADATA_KEY = 'cache-metadata'

// Get cache metadata from IndexedDB
async function getCacheMetadata() {
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(CACHE_METADATA_KEY)
    if (response) {
      return await response.json()
    }
  } catch (error) {
    console.error('Error getting cache metadata:', error)
  }
  return { items: [], totalSize: 0 }
}

// Save cache metadata to IndexedDB
async function saveCacheMetadata(metadata) {
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(CACHE_METADATA_KEY, new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json' }
    }))
  } catch (error) {
    console.error('Error saving cache metadata:', error)
  }
}

// Get file size from response
async function getResponseSize(response) {
  const cloned = response.clone()
  const blob = await cloned.blob()
  return blob.size
}

// LRU eviction: Remove least recently used items
async function evictLRU(targetSize) {
  const metadata = await getCacheMetadata()
  const cache = await caches.open(CACHE_NAME)
  
  // Sort by last accessed time (oldest first)
  metadata.items.sort((a, b) => a.lastAccessed - b.lastAccessed)
  
  let currentSize = metadata.totalSize
  const itemsToRemove = []
  
  for (const item of metadata.items) {
    if (currentSize <= targetSize) break
    
    try {
      await cache.delete(item.url)
      currentSize -= item.size
      itemsToRemove.push(item.url)
    } catch (error) {
      console.error('Error deleting cache item:', error)
    }
  }
  
  // Update metadata
  metadata.items = metadata.items.filter(item => !itemsToRemove.includes(item.url))
  metadata.totalSize = currentSize
  await saveCacheMetadata(metadata)
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          // Keep our caches; delete only old versions of our own caches.
          .filter((name) => {
            if (name === CACHE_NAME) return false
            if (name === API_CACHE_NAME) return false
            // Delete only old sergik caches, leave unrelated caches alone.
            return name.startsWith('sergik-audio-cache-') || name.startsWith('sergik-api-cache-')
          })
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// Fetch event - implement caching strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  
  // Cache *public* API GET responses (stale-while-revalidate).
  // We explicitly avoid admin/auth endpoints and anything with Authorization.
  if (url.pathname.startsWith('/api/')) {
    if (event.request.method !== 'GET') return
    if (event.request.headers.get('Authorization')) return
    if (url.pathname.startsWith('/api/admin')) return
    if (url.pathname.startsWith('/api/analytics')) return

    const isCacheableApi =
      url.pathname.startsWith('/api/music-library/') ||
      url.pathname.startsWith('/api/audio/waveform') ||
      url.pathname.startsWith('/api/audio/bpm') ||
      url.pathname.startsWith('/api/audio/sonic-dna')

    if (!isCacheableApi) return

    event.respondWith(handleApiRequest(event.request))
    return
  }
  
  // Skip image files FIRST - let browser handle them directly
  // This must happen before any other checks to prevent image interception
  // Check both pathname and full URL to catch all image files
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i
  const isImageFile = imageExtensions.test(url.pathname) || imageExtensions.test(url.href)
  
  if (isImageFile) {
    return // Let browser handle image requests - NEVER intercept images
  }
  
  // For Supabase URLs, explicitly skip images (double-check for safety)
  if (url.hostname.includes('supabase.co') && isImageFile) {
    return // Never intercept Supabase image files
  }
  
  // Only handle actual audio files (not API endpoints, images, or other resources)
  const hasAudioExtension = /\.(mp3|wav|m4a|flac|aac|ogg|wma|mp4|m4v)(\?|$)/i.test(url.pathname)
  
  // For Supabase URLs, only intercept if it has an audio file extension
  // Don't intercept images or other file types from Supabase
  if (url.hostname.includes('supabase.co')) {
    if (!hasAudioExtension) {
      return // Let browser handle non-audio Supabase requests (images, etc.)
    }
  }
  
  // For local paths, check if it's in /audio/ directory
  const isAudioPath = url.pathname.includes('/audio/') && 
                      !url.pathname.startsWith('/api/') &&
                      !isImageFile
  
  const isAudioFile = hasAudioExtension || isAudioPath
  
  if (!isAudioFile) {
    return // Let browser handle non-audio requests
  }
  
  event.respondWith(handleAudioRequest(event.request))
})

// Handle cacheable public API requests with stale-while-revalidate
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME)
  const cached = await cache.match(request)

  // Kick off a background refresh (best effort)
  const refreshPromise = fetch(request)
    .then(async (networkResponse) => {
      // Only cache successful full responses
      if (!networkResponse || !networkResponse.ok) return

      // Respect explicit no-store/private signals
      const cc = (networkResponse.headers.get('Cache-Control') || '').toLowerCase()
      if (cc.includes('no-store') || cc.includes('private')) return

      // Avoid caching huge API responses (keeps cache stable)
      const cloned = networkResponse.clone()
      const blob = await cloned.blob()
      if (blob.size > 5 * 1024 * 1024) return // 5MB

      await cache.put(request, networkResponse.clone())

      // Simple cap: if we exceed max entries, delete oldest
      const keys = await cache.keys()
      if (keys.length > API_MAX_ITEMS) {
        const toDelete = keys.slice(0, keys.length - API_MAX_ITEMS)
        await Promise.all(toDelete.map((k) => cache.delete(k)))
      }
    })
    .catch(() => {})

  if (cached) {
    // Return cached immediately; refresh continues in background.
    refreshPromise.catch(() => {})
    return cached
  }

  // No cache yet: fall back to network (and let refresh store it if ok)
  const network = await fetch(request)
  refreshPromise.catch(() => {})
  return network
}

// Fetch with one retry after a short delay (handles transient network blips)
async function fetchWithRetry(request, retries = 1, delay = 1000) {
  try {
    return await fetch(request)
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise(r => setTimeout(r, delay))
    return fetchWithRetry(request, retries - 1, delay * 2)
  }
}

// Handle audio request with smart caching
async function handleAudioRequest(request) {
  const url = request.url
  const cache = await caches.open(CACHE_NAME)
  const metadata = await getCacheMetadata()
  
  // Check if in cache
  const cachedResponse = await cache.match(url)
  
  if (cachedResponse) {
    const item = metadata.items.find(i => i.url === url)
    if (item) {
      item.lastAccessed = Date.now()
      await saveCacheMetadata(metadata)
    }
    return cachedResponse
  }
  
  // Cache miss - fetch from network with retry
  try {
    const response = await fetchWithRetry(request)
    
    if (response.status === 404) {
      return response
    }
    
    if (!response.ok && response.status !== 206) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    // Don't cache partial/range responses
    const isRangeRequest = request.headers.get('Range') !== null
    if (response.status === 206 || isRangeRequest) {
      return response
    }
    
    // Cache full 200 responses
    if (response.status === 200) {
      const responseToCache = response.clone()
      const size = await getResponseSize(responseToCache)
      
      const shouldCache = metadata.items.length < MAX_CACHE_ITEMS || 
                         metadata.totalSize + size < MAX_CACHE_SIZE
      
      if (shouldCache) {
        if (metadata.totalSize + size > MAX_CACHE_SIZE) {
          await evictLRU(MAX_CACHE_SIZE - size)
          const updatedMetadata = await getCacheMetadata()
          metadata.items = updatedMetadata.items
          metadata.totalSize = updatedMetadata.totalSize
        }
        
        await cache.put(url, responseToCache)
        
        metadata.items.push({
          url,
          size,
          lastAccessed: Date.now(),
          cachedAt: Date.now()
        })
        metadata.totalSize += size
        await saveCacheMetadata(metadata)
      }
    }
    
    return response
  } catch (error) {
    const is404Error = error.message && error.message.includes('404')
    
    const staleCached = await cache.match(url)
    if (staleCached) {
      return staleCached
    }
    
    if (is404Error) {
      return new Response('File not found', {
        status: 404,
        statusText: 'Not Found'
      })
    }
    
    return new Response('Network error and no cache available', {
      status: 503,
      statusText: 'Service Unavailable'
    })
  }
}

// Message handler for preloading tracks
self.addEventListener('message', async (event) => {
  if (event.data.type === 'PRELOAD_TRACKS') {
    const tracks = event.data.tracks || []
    const cache = await caches.open(CACHE_NAME)
    
    // Preload next tracks in background
    for (let i = 0; i < Math.min(tracks.length, PRELOAD_COUNT); i++) {
      const trackUrl = tracks[i]
      
      // Check if already cached
      const cached = await cache.match(trackUrl)
      if (cached) continue
      
      // Preload in background (don't wait)
      // Don't include Range header for preload - we want full file
      fetch(trackUrl, {
        headers: {
          // Explicitly don't send Range header to get full response
        }
      })
        .then(async (response) => {
          // Only cache full responses (200), not partial (206)
          if (response.ok && response.status === 200) {
            const metadata = await getCacheMetadata()
            const size = await getResponseSize(response.clone())
            
            // Only cache if we have space
            if (metadata.items.length < MAX_CACHE_ITEMS && 
                metadata.totalSize + size < MAX_CACHE_SIZE) {
              await cache.put(trackUrl, response.clone())
              
              metadata.items.push({
                url: trackUrl,
                size,
                lastAccessed: Date.now(),
                cachedAt: Date.now(),
                preloaded: true
              })
              metadata.totalSize += size
              await saveCacheMetadata(metadata)
            }
          }
        })
        .catch((error) => {
          // Silently fail preload
          console.debug('Preload failed:', error)
        })
    }
  } else if (event.data.type === 'CLEAR_CACHE') {
    // Clear all cached audio
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()
    await Promise.all(keys.map(key => cache.delete(key)))
    await saveCacheMetadata({ items: [], totalSize: 0 })
    
    event.ports[0].postMessage({ success: true })
  } else if (event.data.type === 'GET_CACHE_INFO') {
    // Return cache information
    const metadata = await getCacheMetadata()
    event.ports[0].postMessage({
      itemCount: metadata.items.length,
      totalSize: metadata.totalSize,
      maxSize: MAX_CACHE_SIZE,
      maxItems: MAX_CACHE_ITEMS
    })
  }
})

