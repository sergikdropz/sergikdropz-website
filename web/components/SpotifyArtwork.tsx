'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface SpotifyArtworkProps {
  releaseTitle: string
  artistName?: string
  fallback?: string
  className?: string
}

/**
 * Component that fetches and displays Spotify album artwork
 * Searches for the release and displays the artwork
 */
export default function SpotifyArtwork({ 
  releaseTitle, 
  artistName = 'SERGIK',
  fallback,
  className = ''
}: SpotifyArtworkProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(fallback || null)
  const [isLoading, setIsLoading] = useState(!fallback)

  useEffect(() => {
    // Search for the track/album on Spotify
    // This is a simplified approach - in production you'd use Spotify Web API
    const searchQuery = `${releaseTitle} ${artistName}`
    
    // For now, we'll use a placeholder approach
    // In production, implement Spotify Web API search
    setIsLoading(false)
  }, [releaseTitle, artistName, fallback])

  if (isLoading) {
    return (
      <div className={`bg-gray-800 animate-pulse ${className}`}>
        <div className="w-full h-full flex items-center justify-center text-gray-600">
          Loading...
        </div>
      </div>
    )
  }

  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={`${releaseTitle} artwork`}
        fill
        className={`object-cover ${className}`}
        unoptimized={imageUrl.startsWith('http')}
      />
    )
  }

  return (
    <div className={`bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center ${className}`}>
      <div className="text-center p-4 text-gray-600">
        <div className="text-4xl mb-2">🎵</div>
        <div className="text-sm">{releaseTitle}</div>
      </div>
    </div>
  )
}

