'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Image from 'next/image'

interface InstagramMedia {
  url: string
  mediaUrl: string
  type: 'image' | 'video'
  permalink: string
  thumbnailUrl?: string
  videoUrl?: string
  caption?: string
  metadata?: any
}

interface InstagramMediaGridProps {
  username: string
  maxPosts?: number
  className?: string
}

const PLACEHOLDER_PATHS = new Set(['/logo.svg', '/images/gallery/logo.png'])

function isPlaceholderAsset(url?: string | null): boolean {
  return !url || PLACEHOLDER_PATHS.has(url)
}

/** Omit API fallback placeholders so only real CDN thumbnails render in the grid. */
function itemHasRenderableThumbnail(item: InstagramMedia): boolean {
  const primary =
    item.type === 'video'
      ? item.thumbnailUrl || item.mediaUrl
      : item.mediaUrl || item.thumbnailUrl
  return !isPlaceholderAsset(primary)
}

export default function InstagramMediaGrid({
  username,
  maxPosts = 100, // Show all by default
  className = '',
}: InstagramMediaGridProps) {
  const [media, setMedia] = useState<InstagramMedia[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set())
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set())
  const expandedRef = useRef<HTMLDivElement>(null)

  // Extract username from URL if it's a full URL
  const cleanUsername = username.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '').replace('@', '')

  const fetchMedia = useCallback(async (retry = false) => {
    if (!retry) {
      setIsLoading(true)
    }
    setError(null)
    try {
      const response = await fetch(`/api/instagram/media?username=${cleanUsername}&limit=${maxPosts}`, {
        cache: 'no-store',
      })
      const data = await response.json()

      if (process.env.NODE_ENV === 'development' && data.instagramGraph) {
        console.info('[Instagram Graph]', data.instagramGraph)
      }
      
      if (response.ok) {
        if (data.media && data.media.length > 0) {
          setMedia(data.media)
          setFailedImages(new Set()) // Reset failed images on successful fetch
          
          // Log source for debugging (only in development)
          if (process.env.NODE_ENV === 'development' && data.source) {
            // Log only in development
          }
        } else {
          // No media but response was OK - might be a fallback scenario
          setError(data.message || 'No posts found')
        }
      } else {
        // Response failed but check if we got fallback data anyway
        if (data.media && data.media.length > 0) {
          setMedia(data.media)
          setFailedImages(new Set())
          // Don't set error if we have fallback media
        } else {
          const errorMessage = data.error || data.message || 'Failed to fetch posts'
          setError(errorMessage)
        }
      }
    } catch (error: any) {
      console.error('Error fetching Instagram media:', error)
      // Don't set error immediately - let the component show a loading state
      // The API should return fallback data even on errors
      setError(`Failed to load Instagram posts: ${error?.message || 'Network error'}`)
    } finally {
      setIsLoading(false)
    }
  }, [cleanUsername, maxPosts])

  const handleRetry = useCallback(() => {
    fetchMedia(true)
  }, [fetchMedia])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  // Lazy load videos when they become visible
  useEffect(() => {
    if (media.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0')
            setVisibleIndices((prev) => new Set(prev).add(index))
          }
        })
      },
      { rootMargin: '100px' } // Start loading 100px before visible
    )

    // Observe all media items
    const mediaElements = document.querySelectorAll('[data-media-index]')
    mediaElements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [media])

  // Handle click outside to close expanded media
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (expandedIndex !== null && expandedRef.current && !expandedRef.current.contains(event.target as Node)) {
        setExpandedIndex(null)
      }
    }

    // Handle Escape key to close
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && expandedIndex !== null) {
        setExpandedIndex(null)
      }
    }

    if (expandedIndex !== null) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [expandedIndex])

  const displayMedia = useMemo(
    () => media.filter(itemHasRenderableThumbnail),
    [media]
  )

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 ${className}`}>
        {[...Array(12)].map((_, i) => (
          <div key={i} className="aspect-square bg-gray-900 rounded overflow-hidden animate-pulse">
            <div className="w-full h-full bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800"></div>
          </div>
        ))}
      </div>
    )
  }

  // API returned posts but every item fell back to placeholder thumbnails (reels, expired CDN, blocked scrapes).
  if (!isLoading && media.length > 0 && displayMedia.length === 0) {
    return (
      <div
        className={`rounded-xl border border-white/10 bg-black/50 px-6 py-12 text-center backdrop-blur-sm ${className}`}
      >
        <p className="text-gray-200 mb-2 text-lg font-medium">Instagram feed preview unavailable</p>
        <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto leading-relaxed">
          Automatic thumbnails are not loading for these posts (common with reels and Instagram CDN limits).
          Open Instagram to see the full feed.
        </p>
        <a
          href={`https://instagram.com/${cleanUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
          @{cleanUsername} on Instagram
        </a>
      </div>
    )
  }

  // Show error state only if we have no media AND there's an error
  // If we have some media (even if some failed), show what we have
  if (media.length === 0 && error) {
    return (
      <div className={`text-center py-12 bg-gray-900 rounded-lg ${className}`}>
        <div className="max-w-md mx-auto">
          <div className="mb-4">
            <svg
              className="w-16 h-16 text-gray-600 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-400 mb-2 text-lg font-medium">{error || 'No Instagram posts configured yet.'}</p>
          <p className="text-gray-500 text-sm mb-6">
            {error ? 'Unable to load Instagram posts. Please try again.' : 'Add your Instagram post URLs to get started.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            {error && (
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </button>
            )}
            <a
              href={`https://instagram.com/${cleanUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-pink-500 hover:text-pink-400 transition-colors inline-flex items-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              View on Instagram
            </a>
          </div>
        </div>
      </div>
    )
  }

  const handleImageError = (index: number) => {
    setFailedImages((prev) => new Set(prev).add(index))
  }

  const handleMediaClick = (index: number) => {
    // Toggle expansion - if already expanded, collapse it
    if (expandedIndex === index) {
      setExpandedIndex(null)
    } else {
      setExpandedIndex(index)
    }
  }

  return (
    <div className={className}>
      {/* Overlay backdrop when media is expanded */}
      {expandedIndex !== null && (
        <div 
          className="fixed inset-0 bg-black/80 z-40"
          onClick={() => setExpandedIndex(null)}
        />
      )}
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-0.5 md:gap-1 ${expandedIndex !== null ? 'mb-4 relative z-50' : ''}`}>
        {displayMedia.map((item, index) => {
          const hasFailed = failedImages.has(index)
          const isExpanded = expandedIndex === index
          
          const isVisible = visibleIndices.has(index) || isExpanded
          const thumbnailSrc = item.type === 'video'
            ? (item.thumbnailUrl || item.mediaUrl || '/placeholder.png')
            : (item.mediaUrl || item.thumbnailUrl || '/placeholder.png')
          const isVideoFilePreview =
            item.type === 'video' && /\.(mp4|mov|webm)(\?|$)/i.test(thumbnailSrc)
          
          return (
            <div 
              key={index} 
              className={isExpanded ? 'col-span-2 md:col-span-3 lg:col-span-4 relative z-50' : ''}
              data-media-index={index}
            >
              {isExpanded ? (
                // Expanded view - plays inline
                <div 
                  ref={expandedRef}
                  className="relative w-full bg-black rounded-lg overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedIndex(null)
                    }}
                    className="absolute top-2 right-2 z-50 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-full p-2 transition-all duration-200 hover:scale-110"
                    aria-label="Close"
                  >
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>

                  {item.type === 'video' ? (
                    <div className="relative w-full bg-black rounded-lg">
                      {item.videoUrl ? (
                        (() => {
                          // Check if this is a Supabase Storage URL (direct playback, no CORS needed)
                          const isSupabaseUrl = item.videoUrl.includes('supabase.co') && 
                            item.videoUrl.includes('/storage/v1/object/public/')
                          
                          return (
                            <video
                              key={`video-${index}-${item.videoUrl}`}
                              controls
                              className="w-full h-auto max-h-[80vh] bg-black"
                              poster={item.thumbnailUrl || item.mediaUrl}
                              playsInline
                              preload="none"
                              crossOrigin={isSupabaseUrl ? undefined : "anonymous"}
                              muted={false}
                              src={item.videoUrl}
                              onError={(e) => {
                                const video = e.currentTarget
                                const error = video.error
                                
                                // Check if this is a proxied Instagram URL (not Supabase)
                                const isProxiedUrl = item.videoUrl?.includes('/api/instagram/proxy-image')
                                
                                console.error('Video playback error:', {
                                  currentSrc: video.currentSrc || video.src,
                                  videoUrl: item.videoUrl,
                                  isSupabaseUrl,
                                  isProxiedUrl,
                                  errorCode: error?.code,
                                  errorMessage: error?.message,
                                })
                                
                                // Show error message
                                const parent = video.parentElement
                                if (parent && !parent.querySelector('.video-error-message')) {
                                  const errorDiv = document.createElement('div')
                                  errorDiv.className = 'video-error-message absolute inset-0 flex items-center justify-center bg-black/90 text-white p-4 text-center z-10'
                                  
                                  let errorText = 'Video playback unavailable'
                                  let helpText = error?.message || 'Unable to load video'
                                  
                                  if (isProxiedUrl && !isSupabaseUrl) {
                                    errorText = 'Video needs to be downloaded'
                                    helpText = 'Instagram videos must be downloaded to Supabase Storage for playback. Run the download script to enable video playback.'
                                  } else if (error?.code === 4) {
                                    errorText = 'Video format not supported'
                                    helpText = 'The video format cannot be played in this browser.'
                                  } else if (error?.code === 3 || error?.code === 2) {
                                    errorText = 'Video source unavailable'
                                    helpText = 'The video URL is not accessible. It may need to be downloaded to Supabase Storage.'
                                  }
                                  
                                  errorDiv.innerHTML = `
                                    <div class="max-w-md">
                                      <p class="mb-2 text-sm font-medium">${errorText}</p>
                                      <p class="mb-4 text-xs text-gray-400">${helpText}</p>
                                      <div class="flex flex-col sm:flex-row gap-2 justify-center items-center">
                                        <a href="${item.permalink}" target="_blank" rel="noopener noreferrer" class="text-pink-500 hover:text-pink-400 underline text-sm">
                                          View on Instagram
                                        </a>
                                        ${isProxiedUrl && !isSupabaseUrl ? `
                                          <span class="text-gray-500 text-xs">•</span>
                                          <span class="text-gray-400 text-xs">Run: node scripts/fetch-and-download-instagram-videos.mjs</span>
                                        ` : ''}
                                      </div>
                                    </div>
                                  `
                                  parent.appendChild(errorDiv)
                                }
                              }}
                              onCanPlay={() => {
                                if (process.env.NODE_ENV === 'development') {
                                  console.log('Video can play:', item.videoUrl)
                                }
                              }}
                            >
                              <source src={item.videoUrl} type="video/mp4" />
                              Your browser does not support the video tag.
                            </video>
                          )
                        })()
                      ) : (
                        // No video URL - show message to download
                        <div className="relative w-full aspect-video bg-black rounded-lg flex items-center justify-center">
                          <div className="text-center p-6 max-w-md">
                            <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <p className="text-white mb-2 text-sm font-medium">Video not available</p>
                            <p className="text-gray-400 mb-4 text-xs leading-relaxed">
                              Instagram videos must be downloaded to Supabase Storage for playback.
                            </p>
                            <div className="flex flex-col gap-3 items-center">
                              <a
                                href={item.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-pink-500 hover:text-pink-400 transition-colors text-sm underline"
                              >
                                <span>View on Instagram</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                              <p className="text-gray-500 text-xs font-mono bg-gray-900 px-3 py-1.5 rounded">
                                node scripts/fetch-and-download-instagram-videos.mjs
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Image view - handle placeholders
                    isPlaceholderAsset(item.mediaUrl) ? (
                      <div className="relative w-full aspect-square md:aspect-auto md:max-h-[80vh] flex items-center justify-center bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500">
                        <div className="text-center p-8">
                          <svg
                            className="w-16 h-16 text-white mx-auto mb-4 opacity-80"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                          <p className="text-white mb-4 text-lg font-medium">View on Instagram</p>
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-pink-600 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                          >
                            <span>Open Post</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full aspect-square md:aspect-auto md:max-h-[80vh] flex items-center justify-center bg-black">
                        <Image
                          src={item.mediaUrl}
                          alt={`Instagram post ${index + 1}`}
                          width={1200}
                          height={1200}
                          className="max-w-full max-h-[80vh] object-contain"
                          unoptimized
                        />
                        {/* Captions removed - user wants media only */}
                      </div>
                    )
                  )}
                </div>
              ) : (
                // Thumbnail view
                hasFailed || isPlaceholderAsset(item.mediaUrl) ? (
                  // Fallback: Show clickable placeholder with Instagram icon that links to post
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square overflow-hidden bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 hover:opacity-90 transition-opacity flex items-center justify-center"
                    aria-label={`View ${item.type === 'video' ? 'video' : 'image'} on Instagram`}
                  >
                    <div className="text-center p-4">
                      <svg
                        className="w-12 h-12 text-white mx-auto mb-2 opacity-80"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      <p className="text-white text-xs opacity-90">View on Instagram</p>
                    </div>
                  </a>
                ) : (
                  <button
                    onClick={() => handleMediaClick(index)}
                    className="group relative aspect-square overflow-hidden bg-gray-900 hover:opacity-90 transition-all duration-200 cursor-pointer border-0 p-0 w-full"
                    aria-label={`${item.type === 'video' ? 'Play video' : 'View image'}`}
                  >
                    {/* Show actual media for images, thumbnails for videos (clean minimal look) */}
                    {isVideoFilePreview ? (
                      <video
                        src={thumbnailSrc}
                        className="absolute inset-0 w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                        onError={() => handleImageError(index)}
                      />
                    ) : (
                      <Image
                        src={thumbnailSrc}
                        alt={`Instagram post ${index + 1}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        unoptimized
                        onError={() => handleImageError(index)}
                      />
                    )}
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

