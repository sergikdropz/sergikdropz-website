'use client'

import { useEffect, useMemo, useState } from 'react'
import { FaYoutube } from 'react-icons/fa'
import NavigationButtons from '@/components/NavigationButtons'
import VideoCard from '@/components/VideoCard'
import { featuredVideo, publicVideos } from '@/lib/videos/catalog-model'
import { VIDEO_CATEGORIES } from '@/lib/videos/types'
import type { CatalogVideo, VideoCatalog } from '@/lib/videos/types'

type VideosPageClientProps = {
  initialCatalog: VideoCatalog
}

export default function VideosPageClient({ initialCatalog }: VideosPageClientProps) {
  const [catalog, setCatalog] = useState(initialCatalog)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    async function loadLiveCatalog() {
      try {
        const response = await fetch('/api/videos', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled && Array.isArray(data.videos)) {
          setCatalog({
            videos: data.videos,
            youtube_channel: data.youtube_channel || initialCatalog.youtube_channel,
          })
        }
      } catch {
        // Keep the committed JSON catalog if the live API is unavailable.
      }
    }
    loadLiveCatalog()
    return () => {
      cancelled = true
    }
  }, [initialCatalog.youtube_channel])

  const videos = publicVideos(catalog)
  const hero = featuredVideo(videos)
  const categories = useMemo(() => {
    const present = new Set(videos.map((video) => video.category))
    return VIDEO_CATEGORIES.filter((category) => present.has(category.id))
  }, [videos])

  const visible = useMemo(() => {
    if (filter === 'all') return videos
    return videos.filter((video) => video.category === filter)
  }, [videos, filter])

  const gridVideos = hero && filter === 'all' ? visible.filter((video) => video.id !== hero.id) : visible

  return (
    <div className="relative min-h-screen pt-20">
      <div className="container relative z-10 mx-auto px-4 py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-4xl text-center">
          <h1 className="font-six-caps mb-4 text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl md:text-7xl">
            Videos
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
            Music videos, visualizers, and collaborations from the SERGIK channel. Click a thumbnail to play — nothing
            autoplays.
          </p>
        </div>

        {videos.length > 0 ? (
          <>
            {hero && filter === 'all' && (
              <div className="mx-auto mb-10 max-w-5xl">
                <VideoCard video={hero} variant="hero" />
              </div>
            )}

            <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
              <FilterChip
                active={filter === 'all'}
                label="All"
                count={videos.length}
                onClick={() => setFilter('all')}
              />
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  active={filter === category.id}
                  label={category.label}
                  count={videos.filter((video) => video.category === category.id).length}
                  onClick={() => setFilter(category.id)}
                />
              ))}
            </div>

            {gridVideos.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {gridVideos.map((video: CatalogVideo) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-gray-500">No videos in this category yet.</p>
            )}

            <div className="mt-12 flex justify-center">
              <a
                href={catalog.youtube_channel}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                <FaYoutube aria-hidden />
                Watch more on YouTube
              </a>
            </div>
          </>
        ) : (
          <div className="py-20 text-center">
            <p className="mb-4 text-lg text-gray-400">No videos published yet.</p>
            <a
              href={catalog.youtube_channel}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-red-400 hover:text-red-300"
            >
              <FaYoutube aria-hidden />
              Open the YouTube channel
            </a>
          </div>
        )}

        <NavigationButtons embedded />
      </div>
    </div>
  )
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[40px] rounded-full px-3 py-2 text-xs font-medium transition-all touch-manipulation sm:px-4 sm:text-sm ${
        active ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {label}
      <span className={`ml-1.5 text-[10px] sm:text-xs ${active ? 'text-gray-600' : 'text-gray-500'}`}>({count})</span>
    </button>
  )
}
