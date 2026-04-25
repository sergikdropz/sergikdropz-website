'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import playlistsData from '@/data/soundcloud-playlists.json'
import ReleaseCard from '@/components/ReleaseCard'
import UpcomingReleases from '@/components/UpcomingReleases'
import SoundCloudEmbed from '@/components/SoundCloudEmbed'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'

// Fetch live releases from distribution_releases
async function fetchLiveReleases() {
  try {
    const res = await fetch('/api/studio/releases/public')
    if (res.ok) {
      const data = await res.json()
      return data.releases || []
    }
  } catch (error) {
    console.error('Error fetching live releases:', error)
  }
  return []
}

// Filter playlists that have URLs and sort by featured
const soundcloudPlaylists = playlistsData.playlists
  .filter(playlist => playlist.url)
  .sort((a, b) => {
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    return 0
  })

export default function Music() {
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'year' | 'type'>('year')
  const [isMobile, setIsMobile] = useState(false)
  const [liveReleases, setLiveReleases] = useState<any[]>([])
  const [loadingReleases, setLoadingReleases] = useState(true)

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch live releases from distribution
  useEffect(() => {
    async function loadReleases() {
      setLoadingReleases(true)
      const live = await fetchLiveReleases()
      setLiveReleases(live)
      setLoadingReleases(false)
    }
    loadReleases()
  }, [])

  const releases = useMemo(() => {
    // Merge live distribution releases with static releases
    const distributionReleases = liveReleases.map((r: any) => ({
      id: r.id,
      title: r.title,
      type: r.type.charAt(0).toUpperCase() + r.type.slice(1),
      year: r.release_date ? new Date(r.release_date).getFullYear() : new Date().getFullYear(),
      platforms: ['Spotify', 'Apple Music'],
      spotify_url: '',
      soundcloud_url: '',
      image: r.artwork_url || '',
      fetch_from_spotify: false,
    }))

    // Combine with static releases, prioritizing distribution releases
    const allReleases = [...distributionReleases, ...releasesData.releases]
    
    // Remove duplicates by ID
    const uniqueReleases = Array.from(
      new Map(allReleases.map((r) => [r.id, r])).values()
    )

    let filtered = uniqueReleases

    // Filter by type
    if (filter !== 'all') {
      filtered = filtered.filter(release => release.type.toLowerCase() === filter.toLowerCase())
    }

    // Sort by year (newest first) or type
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'year') {
        return b.year - a.year // Newest first
      } else {
        return a.type.localeCompare(b.type)
      }
    })

    return filtered
  }, [filter, sortBy])

  const releaseTypes = ['all', ...Array.from(new Set(releasesData.releases.map(r => r.type)))]

  // Get all album art images for background, filtering out invalid Spotify CDN URLs
  // Reduce images on mobile for better performance
  const invalidCdnPatterns = ['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']
  const maxImages = isMobile ? 4 : 12
  const albumArts = releasesData.releases
    .filter(release => {
      if (!release.image) return false
      // Filter out invalid Spotify CDN URLs
      return !invalidCdnPatterns.some(pattern => release.image!.includes(pattern))
    })
    .map(release => release.image!)
    .slice(0, maxImages)

  return (
    <div className="pt-20 min-h-screen relative overflow-hidden">
      {/* Scrollable Album Art Background - disabled on mobile for performance */}
      {!isMobile && (
        <div className="fixed inset-0 z-[1] overflow-hidden">
          <div className="absolute inset-0 flex flex-wrap gap-4 p-8 opacity-[0.45] blur-sm">
          {albumArts.map((artUrl, index) => (
            <div 
              key={index} 
              className="relative w-64 h-64 flex-shrink-0"
              style={{
                animation: `float ${20 + index * 2}s infinite ease-in-out`,
                animationDelay: `${index * 0.5}s`
              }}
            >
              <Image
                src={artUrl}
                alt=""
                fill
                className="object-cover rounded-lg"
                unoptimized={shouldUnoptimizeImage(artUrl)}
                sizes="256px"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
                loading="lazy"
                quality={25}
              />
            </div>
          ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/80" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-20 container mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16">
        <div className="mb-8 sm:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center font-six-caps" style={{ display: 'flex', flexDirection: 'column', fontSize: '57px', letterSpacing: '7.2px', lineHeight: '61px' }}>Music</h1>
            <Link
              href="/music-library"
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-semibold rounded hover:from-yellow-500 hover:to-yellow-700 transition-all shadow-lg shadow-yellow-500/50 inline-flex items-center justify-center gap-2 text-sm sm:text-base min-h-[44px] touch-manipulation"
            >
              <span>Exclusive ID MusicBank</span>
              <span>→</span>
            </Link>
          </div>

          {/* Filters and Sort */}
          <div className="space-y-4 mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <span className="text-gray-400 text-sm font-medium">Filter:</span>
                <div className="flex flex-wrap gap-2 text-left">
                  {releaseTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilter(type)}
                      className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all min-h-[40px] touch-manipulation ${
                        filter === type
                          ? 'bg-white text-black'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 active:bg-gray-600'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <span className="text-gray-400 text-sm font-medium">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'year' | 'type')}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 sm:px-4 py-2 text-white text-sm focus:outline-none focus:border-white min-h-[44px] touch-manipulation w-full sm:w-auto"
                  aria-label="Sort releases by"
                  title="Sort releases by"
                >
                  <option value="year">Year (Newest First)</option>
                  <option value="type">Type</option>
                </select>
              </div>
            </div>

            <div className="text-gray-400 text-xs sm:text-sm">
              Showing {releases.length} of {releasesData.releases.length} releases
            </div>
          </div>
        </div>

        {/* Upcoming Releases Section */}
        <UpcomingReleases schedule={releaseSchedule.schedule} />

        {/* Releases Section */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Releases</h2>
          <p className="text-gray-400 text-sm sm:text-base">
            Browse all releases by type and year
          </p>
        </div>
        
        {releases.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            {releases.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 sm:py-20">
            <p className="text-gray-400 text-base sm:text-lg">No releases found.</p>
          </div>
        )}

        {/* SoundCloud Playlists Section */}
        {soundcloudPlaylists.length > 0 && (
          <div className="mt-12 sm:mt-16 mb-12 sm:mb-16">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">SoundCloud</h2>
              <p className="text-gray-400 text-sm sm:text-base">
                Stream playlists and discover all my tracks
              </p>
            </div>
            <div className="space-y-6 sm:space-y-8">
              {soundcloudPlaylists.map((playlist) => (
                <div key={playlist.id} className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-4 sm:p-6">
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-xl sm:text-2xl font-semibold mb-2">{playlist.title}</h3>
                      {playlist.description && (
                        <p className="text-gray-400 text-sm sm:text-base">{playlist.description}</p>
                      )}
                    </div>
                    <Link
                      href={playlist.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#ff5500] hover:text-[#ff6600] text-sm font-medium inline-flex items-center gap-1 transition-colors touch-manipulation min-h-[44px] sm:min-h-0"
                    >
                      <span>View on SoundCloud</span>
                      <span>→</span>
                    </Link>
                  </div>
                  <SoundCloudEmbed
                    url={playlist.url}
                    height={playlist.featured ? 500 : 400}
                    visual={true}
                    showArtwork={true}
                    showComments={playlist.featured}
                    showUser={true}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
