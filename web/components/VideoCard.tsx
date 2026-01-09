'use client'

import { useState } from 'react'

interface Video {
  id: string
  title: string
  description?: string
  youtube_id: string
  thumbnail?: string
  category?: string
  date?: string
}

interface VideoCardProps {
  video: Video
}

export default function VideoCard({ video }: VideoCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [thumbnailIndex, setThumbnailIndex] = useState(0)

  // Thumbnail quality fallback chain (from highest to lowest quality)
  // Start with sddefault since maxresdefault often doesn't exist
  const thumbnailOptions = video.thumbnail 
    ? [video.thumbnail] // Use custom thumbnail if provided
    : [
        `https://img.youtube.com/vi/${video.youtube_id}/sddefault.jpg`,     // 640x480 - standard definition (most reliable)
        `https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`, // 1280x720 - highest quality (if available)
        `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`,     // 480x360 - high quality default
        `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`,     // 320x180 - medium quality
      ]

  const thumbnailUrl = thumbnailOptions[thumbnailIndex]
  const embedUrl = `https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&rel=0`

  const handleThumbnailError = () => {
    // Try next thumbnail in fallback chain
    if (thumbnailIndex < thumbnailOptions.length - 1) {
      setThumbnailIndex(thumbnailIndex + 1)
    }
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden hover:bg-gray-800 transition-colors">
      <div className="aspect-video bg-gray-800 relative group cursor-pointer">
        {!isPlaying ? (
          <>
            <img
              src={thumbnailUrl}
              alt={video.title}
              className="absolute inset-0 w-full h-full object-cover"
              onError={handleThumbnailError}
            />
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors"
              onClick={() => setIsPlaying(true)}
            >
              <div className="bg-red-600 rounded-full p-4 group-hover:scale-110 transition-transform">
                <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-white text-sm font-medium line-clamp-2">{video.title}</p>
            </div>
          </>
        ) : (
          <iframe
            src={embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        )}
      </div>
      <div className="p-4">
        {video.description && (
          <p className="text-gray-400 text-sm mb-2 line-clamp-2">{video.description}</p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500">
          {video.category && (
            <span className="bg-gray-800 px-2 py-1 rounded">{video.category}</span>
          )}
          {video.date && <span>{video.date}</span>}
        </div>
      </div>
    </div>
  )
}

