'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { FaSoundcloud } from 'react-icons/fa'
import releasesData from '@/data/releases.json'
import playlistsData from '@/data/soundcloud-playlists.json'
import ReleaseCard from '@/components/ReleaseCard'
import SoundCloudEmbed from '@/components/SoundCloudEmbed'

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

  const releases = useMemo(() => {
    let filtered = releasesData.releases

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

  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">Music</h1>
          <p className="text-gray-400 text-lg mb-8">
            All releases and discography
          </p>

          {/* Filters and Sort */}
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Filter:</span>
              <div className="flex gap-2">
                {releaseTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      filter === type
                        ? 'bg-white text-black'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'year' | 'type')}
                className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-white"
              >
                <option value="year">Year (Newest First)</option>
                <option value="type">Type</option>
              </select>
            </div>

            <div className="ml-auto text-gray-400 text-sm">
              Showing {releases.length} of {releasesData.releases.length} releases
            </div>
          </div>
        </div>

        {/* SoundCloud Profile Section */}
        {playlistsData.profile?.url && (
          <div className="mb-16">
            <div className="bg-gradient-to-r from-[#ff5500] to-[#ff7700] rounded-lg p-8 md:p-12">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                <div className="flex-shrink-0">
                  <FaSoundcloud className="text-6xl md:text-8xl text-white opacity-90" />
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
                    Follow on SoundCloud
                  </h2>
                  <p className="text-white/90 text-lg mb-6">
                    Stream all my latest tracks, mixes, and exclusive releases on SoundCloud
                  </p>
                  <Link
                    href={playlistsData.profile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-white text-[#ff5500] px-6 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors"
                  >
                    <FaSoundcloud className="text-xl" />
                    <span>Visit SoundCloud Profile</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SoundCloud Playlists Section */}
        {soundcloudPlaylists.length > 0 && (
          <div className="mb-16">
            <div className="mb-8">
              <h2 className="text-3xl md:text-4xl font-bold mb-2">SoundCloud</h2>
              <p className="text-gray-400">
                Stream playlists and discover all my tracks
              </p>
            </div>
            <div className="space-y-8">
              {soundcloudPlaylists.map((playlist) => (
                <div key={playlist.id} className="bg-gray-900 rounded-lg p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold mb-2">{playlist.title}</h3>
                      {playlist.description && (
                        <p className="text-gray-400">{playlist.description}</p>
                      )}
                    </div>
                    <Link
                      href={playlist.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#ff5500] hover:text-[#ff6600] text-sm font-medium inline-flex items-center gap-1 transition-colors ml-4"
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
        
        {/* Releases Section */}
        <div className="mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-2">Releases</h2>
          <p className="text-gray-400">
            Browse all releases by type and year
          </p>
        </div>
        
        {releases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {releases.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No releases found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
