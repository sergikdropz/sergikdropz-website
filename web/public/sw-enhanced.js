/**
 * Enhanced Service Worker for SERGIK
 * Optimized for music streaming with intelligent prefetching and caching
 */

const AUDIO_CACHE = 'sergik-audio-v3'
const API_CACHE = 'sergik-api-v3'
const METADATA_CACHE = 'sergik-metadata-v3'

const CACHE_CONFIG = {
  audio: {
    maxSize: 1024 * 1024 * 1024, // 1GB
    maxItems: 50,
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  api: {
    maxItems: 1000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  },
  metadata: {
    maxItems: 5000,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  }
}

// Intelligent prefetching based on user behavior
class PrefetchManager {
  constructor() {
    this.prefetchQueue = new Set()
    this.activePrefetches = new Set()
    this.userBehavior = {
      recentlyPlayed: new Set(),
      frequentlyPlayed: new Map(),
      preferredGenres: new Set(),
    }
  }

  // Track user behavior for smarter prefetching
  trackPlay(trackId, genre) {
    this.userBehavior.recentlyPlayed.add(trackId)
    this.userBehavior.frequentlyPlayed.set(
      trackId,
      (this.userBehavior.frequentlyPlayed.get(trackId) || 0) + 1
    )
    if (genre) {
      this.userBehavior.preferredGenres.add(genre)
    }

    // Keep sets/maps bounded
    if (this.userBehavior.recentlyPlayed.size > 20) {
      const oldest = this.userBehavior.recentlyPlayed.values().next().value
      this.userBehavior.recentlyPlayed.delete(oldest)
    }
  }

  // Prefetch related tracks based on user behavior
  async prefetchRelatedTracks(currentTrack, allTracks) {
    const relatedTracks = this.findRelatedTracks(currentTrack, allTracks)
    for (const track of relatedTracks.slice(0, 3)) {
      this.addToPrefetchQueue(track.file_url, 'audio')
    }
  }

  findRelatedTracks(currentTrack, allTracks) {
    return allTracks
      .filter(track => {
        // Same artist or genre
        const sameArtist = track.artist === currentTrack.artist
        const sameGenre = track.sonic_dna?.genre === currentTrack.sonic_dna?.genre
        const frequentlyPlayed = this.userBehavior.frequentlyPlayed.has(track.id)

        return (sameArtist || sameGenre) && !frequentlyPlayed
      })
      .sort((a, b) => {
        // Prioritize by user behavior
        const aFreq = this.userBehavior.frequentlyPlayed.get(a.id) || 0
        const bFreq = this.userBehavior.frequentlyPlayed.get(b.id) || 0
        return bFreq - aFreq
      })
  }

  addToPrefetchQueue(url, type = 'audio') {
    if (this.prefetchQueue.size < 10 && !this.activePrefetches.has(url)) {
      this.prefetchQueue.add({ url, type, priority: 0 })
      this.processQueue()
    }
  }

  async processQueue() {
    if (this.activePrefetches.size >= 2) return // Limit concurrent prefetches

    const item = this.prefetchQueue.values().next().value
    if (!item) return

    this.prefetchQueue.delete(item)
    this.activePrefetches.add(item.url)

    try {
      const cache = await caches.open(item.type === 'audio' ? AUDIO_CACHE : API_CACHE)
      const response = await fetch(item.url)

      if (response.ok) {
        await cache.put(item.url, response)
      }
    } catch (error) {
      console.debug('Prefetch failed:', item.url, error)
    } finally {
      this.activePrefetches.delete(item.url)
      // Process next item
      setTimeout(() => this.processQueue(), 100)
    }
  }
}

const prefetchManager = new PrefetchManager()

// Enhanced caching strategies
class CacheManager {
  constructor() {
    this.metadata = new Map()
  }

  async get(url) {
    const cache = await this.getCacheForUrl(url)
    return cache ? cache.match(url) : null
  }

  async put(url, response) {
    const cache = await this.getCacheForUrl(url)
    if (cache) {
      await cache.put(url, response.clone())

      // Update metadata
      const metadata = {
        url,
        cachedAt: Date.now(),
        size: await this.getResponseSize(response),
        type: this.getCacheType(url)
      }
      this.metadata.set(url, metadata)

      // Cleanup if needed
      await this.cleanup()
    }
  }

  getCacheForUrl(url) {
    const urlObj = new URL(url)

    if (urlObj.pathname.match(/\.(mp3|wav|m4a|flac|aac|ogg)$/i)) {
      return caches.open(AUDIO_CACHE)
    } else if (urlObj.pathname.startsWith('/api/')) {
      return caches.open(API_CACHE)
    } else {
      return caches.open(METADATA_CACHE)
    }
  }

  getCacheType(url) {
    if (url.includes('/api/audio/sonic-dna')) return 'sonic-dna'
    if (url.includes('/api/audio/waveform')) return 'waveform'
    if (url.includes('/api/music-library/tracks')) return 'tracks'
    if (url.match(/\.(mp3|wav|m4a|flac|aac|ogg)$/i)) return 'audio'
    return 'other'
  }

  async getResponseSize(response) {
    const cloned = response.clone()
    const blob = await cloned.blob()
    return blob.size
  }

  async cleanup() {
    // Implement LRU-style cleanup based on access patterns
    const now = Date.now()

    for (const [url, meta] of this.metadata) {
      const config = CACHE_CONFIG[meta.type] || CACHE_CONFIG.metadata
      if (now - meta.cachedAt > config.ttl) {
        const cache = await this.getCacheForUrl(url)
        if (cache) {
          await cache.delete(url)
          this.metadata.delete(url)
        }
      }
    }
  }
}

const cacheManager = new CacheManager()

// Enhanced fetch handler with intelligent caching
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // API requests - Network First with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    if (event.request.method !== 'GET') return

    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            cacheManager.put(event.request.url, response.clone())
          }
          return response
        })
        .catch(async () => {
          const cached = await cacheManager.get(event.request.url)
          return cached || new Response('Offline', { status: 503 })
        })
    )
    return
  }

  // Audio files - Cache First with Network Fallback
  if (url.pathname.match(/\.(mp3|wav|m4a|flac|aac|ogg)$/i)) {
    event.respondWith(
      cacheManager.get(event.request.url)
        .then(cached => {
          if (cached) return cached

          // Not in cache, fetch and cache
          return fetch(event.request).then(response => {
            if (response.ok) {
              cacheManager.put(event.request.url, response.clone())
            }
            return response
          })
        })
    )
    return
  }
})

// Message handler for prefetching
self.addEventListener('message', (event) => {
  if (event.data.type === 'PREFETCH_RELATED') {
    prefetchManager.prefetchRelatedTracks(event.data.currentTrack, event.data.allTracks)
  } else if (event.data.type === 'TRACK_PLAYED') {
    prefetchManager.trackPlay(event.data.trackId, event.data.genre)
  }
})

// Install and activate handlers
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(names =>
        names
          .filter(name => !['sergik-audio-v3', 'sergik-api-v3', 'sergik-metadata-v3'].includes(name))
          .map(name => caches.delete(name))
      )
    ])
  )
  self.clients.claim()
})