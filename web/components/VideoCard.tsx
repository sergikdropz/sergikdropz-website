'use client'

import { useState } from 'react'
import { FaPlay, FaYoutube } from 'react-icons/fa'
import { videoCategoryLabel, youtubeEmbedUrl, youtubeThumbnailUrls, youtubeWatchUrl } from '@/lib/videos/youtube'

interface Video {
  id: string
  title: string
  description?: string
  youtube_id: string
  thumbnail?: string
  category?: string
  date?: string
  featured?: boolean
}

interface VideoCardProps {
  video: Video
  variant?: 'default' | 'hero'
}

export default function VideoCard({ video, variant = 'default' }: VideoCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [thumbnailIndex, setThumbnailIndex] = useState(0)
  const isHero = variant === 'hero'

  const thumbnailOptions = video.thumbnail
    ? [video.thumbnail, ...youtubeThumbnailUrls(video.youtube_id)]
    : youtubeThumbnailUrls(video.youtube_id)

  const thumbnailUrl = thumbnailOptions[Math.min(thumbnailIndex, thumbnailOptions.length - 1)]
  const embedUrl = youtubeEmbedUrl(video.youtube_id, true)

  return (
    <article
      className={`group overflow-hidden rounded-2xl border border-white/10 bg-gray-950 transition-colors hover:border-white/25 ${
        isHero ? 'shadow-2xl shadow-black/40' : ''
      }`}
    >
      <div
        className="relative aspect-video cursor-pointer bg-gray-900"
        onClick={() => setIsPlaying(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setIsPlaying(true)
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Play ${video.title}`}
      >
        {!isPlaying ? (
          <>
            <img
              src={thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              onError={() => {
                if (thumbnailIndex < thumbnailOptions.length - 1) {
                  setThumbnailIndex((index) => index + 1)
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`flex items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 transition-transform group-hover:scale-110 ${
                  isHero ? 'h-16 w-16' : 'h-12 w-12'
                }`}
              >
                <FaPlay className={isHero ? 'ml-1 h-6 w-6' : 'ml-0.5 h-4 w-4'} aria-hidden />
              </span>
            </div>
            {video.category && (
              <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/90">
                {videoCategoryLabel(video.category)}
              </span>
            )}
          </>
        ) : (
          <iframe
            src={embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        )}
      </div>
      <div className={isHero ? 'space-y-3 p-5 sm:p-6' : 'space-y-2 p-4'}>
        <h3 className={`font-semibold text-white ${isHero ? 'text-2xl sm:text-3xl' : 'text-base line-clamp-2'}`}>
          {video.title}
        </h3>
        {video.description && (
          <p className={`text-gray-400 ${isHero ? 'text-base line-clamp-3' : 'text-sm line-clamp-2'}`}>
            {video.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>{video.date}</span>
          <a
            href={youtubeWatchUrl(video.youtube_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-red-400 hover:text-red-300"
            onClick={(event) => event.stopPropagation()}
          >
            <FaYoutube aria-hidden />
            YouTube
          </a>
        </div>
      </div>
    </article>
  )
}
