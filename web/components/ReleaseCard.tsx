'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect } from 'react'

interface Release {
  id: string
  title: string
  type: string
  year: number
  platforms: string[]
  spotify_url?: string
  image?: string | null
  fetch_from_spotify?: boolean
}

export default function ReleaseCard({ release }: { release: Release }) {
  const [imageUrl, setImageUrl] = useState<string | null>(release.image || null)
  const [isLoading, setIsLoading] = useState(!release.image)

  // Try to fetch artwork from Spotify if no image and we have a track/album URL
  useEffect(() => {
    if (!imageUrl && release.spotify_url && release.fetch_from_spotify) {
      // Check if it's a track or album URL (not just artist page)
      const isTrackOrAlbum = release.spotify_url.includes('/track/') || 
                            release.spotify_url.includes('/album/')
      
      if (isTrackOrAlbum) {
        fetch(`/api/spotify-artwork?url=${encodeURIComponent(release.spotify_url)}`)
          .then(res => res.json())
          .then(data => {
            if (data.imageUrl) {
              setImageUrl(data.imageUrl)
              setIsLoading(false)
            } else {
              setIsLoading(false)
            }
          })
          .catch(() => setIsLoading(false))
      } else {
        // If it's just an artist page, we can't get specific artwork
        setIsLoading(false)
      }
    } else if (imageUrl) {
      setIsLoading(false)
    }
  }, [imageUrl, release.spotify_url, release.fetch_from_spotify])

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden hover:bg-gray-800 transition-colors">
      <div className="aspect-square bg-gray-800 relative">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={release.title}
            fill
            className="object-cover"
            unoptimized={imageUrl.startsWith('http')} // Don't optimize external URLs
            onError={() => {
              // Fallback if image fails to load
              setImageUrl(null)
            }}
          />
        ) : isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <div className="animate-pulse text-center">
              <div className="text-4xl mb-2">🎵</div>
              <div className="text-sm">Loading artwork...</div>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 bg-gradient-to-br from-gray-800 to-gray-900">
            <div className="text-center p-4">
              <div className="text-4xl mb-2">🎵</div>
              <div className="text-sm font-medium">{release.title}</div>
              <div className="text-xs mt-1 text-gray-500">{release.type}</div>
            </div>
          </div>
        )}
      </div>
      <div className="p-6">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-semibold">{release.title}</h3>
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
            {release.type}
          </span>
        </div>
        <p className="text-gray-400 text-sm mb-4">{release.year}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {release.platforms.map((platform) => (
            <span
              key={platform}
              className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded"
            >
              {platform}
            </span>
          ))}
        </div>
        {release.spotify_url && (
          <Link
            href={release.spotify_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-300 text-sm font-medium inline-flex items-center gap-1"
          >
            <span>Listen on Spotify</span>
            <span>→</span>
          </Link>
        )}
      </div>
    </div>
  )
}
