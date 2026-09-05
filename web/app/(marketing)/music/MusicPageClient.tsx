'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import playlistsData from '@/data/soundcloud-playlists.json'
import ReleaseCard from '@/components/ReleaseCard'
import UpcomingReleases from '@/components/UpcomingReleases'
import SoundCloudEmbed from '@/components/SoundCloudEmbed'
import NavigationButtons from '@/components/NavigationButtons'
import { PlatformCollapse, PlatformLinkPanel } from '@/components/PlatformCollapse'
import artistData from '@/data/artist.json'
import type { PublicLiveRelease } from '@/lib/marketing/public-releases'

// Filter playlists that have URLs and sort by featured
const soundcloudPlaylists = playlistsData.playlists
  .filter(playlist => playlist.url)
  .sort((a, b) => {
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    return 0
  })

type MusicPageClientProps = {
  initialLiveReleases: PublicLiveRelease[]
}

export default function MusicPageClient({ initialLiveReleases }: MusicPageClientProps) {
  const [filter, setFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'year' | 'type'>('year')
  const liveReleases = initialLiveReleases
  const [releasesExpanded, setReleasesExpanded] = useState(false)
  const [soundcloudExpanded, setSoundcloudExpanded] = useState(false)
  const [youtubeExpanded, setYoutubeExpanded] = useState(false)
  const [appleExpanded, setAppleExpanded] = useState(false)
  const [beatportExpanded, setBeatportExpanded] = useState(false)
  const [spotifyExpanded, setSpotifyExpanded] = useState(false)

  const releases = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)

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

    // Scheduled EPs drop off "Upcoming" after release_date; keep them in the catalog.
    const releasedFromSchedule = releaseSchedule.schedule
      .filter((r) => r.release_date <= today)
      .map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        year: Number(r.release_date.slice(0, 4)),
        platforms: ['Spotify', 'Apple Music', 'SoundCloud'],
        spotify_url: '',
        soundcloud_url: '',
        image: r.artwork || '',
        fetch_from_spotify: false,
      }))

    const allReleases = [...distributionReleases, ...releasedFromSchedule, ...releasesData.releases]

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
  }, [filter, sortBy, liveReleases])

  const releaseTypes = ['all', ...Array.from(new Set(releasesData.releases.map(r => r.type)))]

  const renderFilterToolbar = () => (
    <div className="mb-4 sm:mb-6">
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {releaseTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`min-h-[40px] rounded-full px-3 py-2 text-xs font-medium transition-all touch-manipulation sm:px-4 sm:text-sm ${
                filter === type
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 active:bg-gray-600'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'year' | 'type')}
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-center text-sm text-white touch-manipulation focus:border-white focus:outline-none sm:w-auto sm:px-4 sm:text-left"
          aria-label="Sort releases by"
          title="Sort releases by"
        >
          <option value="year">Year (Newest First)</option>
          <option value="type">Type</option>
        </select>
      </div>
    </div>
  )

  return (
    <div className="pt-20 min-h-screen relative">
      <div className="relative z-10 container mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-16">
        <div className="mb-8 sm:mb-12">
          <div className="mb-4 flex flex-col items-center gap-4">
            <div className="flex w-full justify-center">
              <h1
                className="text-4xl sm:text-5xl md:text-6xl font-bold text-center font-six-caps"
                style={{ display: 'flex', flexDirection: 'column', fontSize: '114px', letterSpacing: '14.4px', lineHeight: '122px' }}
              >
                Music
              </h1>
            </div>
            <div className="flex w-full justify-center">
              <Link
                href="/music-library"
                prefetch={false}
                className="inline-flex min-h-[44px] origin-center items-center justify-center gap-2 rounded border border-yellow-400 px-4 py-2 text-center font-six-caps text-3xl font-semibold text-yellow-400 transition-colors hover:bg-yellow-400/10 hover:text-yellow-300 touch-manipulation sm:px-5 sm:py-2.5 sm:text-4xl md:text-5xl"
                style={{
                  letterSpacing: '0.22em',
                  transform: 'scaleX(1.12)',
                  textShadow: '0.4px 0 0 currentColor, -0.4px 0 0 currentColor',
                }}
              >
                Exclusive ID MusicBank
              </Link>
            </div>
          </div>
        </div>

        {/* Upcoming Releases Section */}
        <UpcomingReleases
          schedule={releaseSchedule.schedule}
          expandedToolbar={renderFilterToolbar()}
        />

        {/* Releases Section */}
        <div className="mb-12 sm:mb-16">
          <button
            type="button"
            onClick={() => setReleasesExpanded((v) => !v)}
            aria-expanded={releasesExpanded}
            className="relative mb-4 sm:mb-6 flex w-full items-center justify-center rounded-lg border border-gray-800/80 bg-gray-900/40 px-10 py-3 text-center transition-colors hover:border-gray-700 hover:bg-gray-900/70 touch-manipulation sm:px-12"
          >
            <h2
              className="origin-center font-six-caps text-3xl font-bold sm:text-4xl md:text-5xl"
              style={{
                letterSpacing: '0.22em',
                transform: 'scaleX(1.12)',
                textShadow: '0.4px 0 0 currentColor, -0.4px 0 0 currentColor',
              }}
            >
              Releases
            </h2>
            <span
              className={`absolute right-3 top-1/2 shrink-0 -translate-y-1/2 text-gray-400 transition-transform duration-200 sm:right-4 ${
                releasesExpanded ? 'rotate-180' : ''
              }`}
              aria-hidden
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </span>
          </button>

          {releasesExpanded && (
            <>
              {renderFilterToolbar()}
              {releases.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 md:gap-8">
                  {releases.map((release) => (
                    <ReleaseCard key={release.id} release={release} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 sm:py-20">
                  <p className="text-gray-400 text-base sm:text-lg">No releases found.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Streaming platforms — SoundCloud → YouTube → Apple Music → Beatport → Spotify */}
        <div className="mt-12 mb-12 space-y-4 sm:mt-16 sm:mb-16 sm:space-y-6">
          {soundcloudPlaylists.length > 0 && (
            <PlatformCollapse
              title="SoundCloud"
              titleClassName="text-[#ff5500]"
              expanded={soundcloudExpanded}
              onToggle={() => setSoundcloudExpanded((v) => !v)}
            >
              <div className="space-y-6 sm:space-y-8">
                {soundcloudPlaylists.map((playlist) => (
                  <div key={playlist.id}>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <h3 className="mb-2 text-xl font-semibold sm:text-2xl">{playlist.title}</h3>
                        {playlist.description && (
                          <p className="text-sm text-gray-400 sm:text-base">{playlist.description}</p>
                        )}
                      </div>
                      <Link
                        href={playlist.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-[#ff5500] transition-colors hover:text-[#ff6600] touch-manipulation sm:min-h-0"
                      >
                        <span>View on SoundCloud</span>
                        <span aria-hidden>→</span>
                      </Link>
                    </div>
                    <SoundCloudEmbed
                      url={playlist.url}
                      height={680}
                      visual={false}
                      showArtwork={true}
                      showComments={playlist.featured}
                      showUser={true}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            </PlatformCollapse>
          )}

          <PlatformCollapse
            title="YouTube"
            titleClassName="text-[#FF0000]"
            expanded={youtubeExpanded}
            onToggle={() => setYoutubeExpanded((v) => !v)}
          >
            <PlatformLinkPanel
              href={artistData.platforms.youtube}
              label="Open on YouTube"
              accentClassName="text-[#FF0000] hover:text-red-400"
            />
          </PlatformCollapse>

          <PlatformCollapse
            title="Apple Music"
            titleClassName="text-[#FA243C]"
            expanded={appleExpanded}
            onToggle={() => setAppleExpanded((v) => !v)}
          >
            <PlatformLinkPanel
              href={`https://music.apple.com/search?term=${encodeURIComponent('SERGIK')}`}
              label="Open on Apple Music"
              accentClassName="text-[#FA243C] hover:text-pink-400"
            />
          </PlatformCollapse>

          <PlatformCollapse
            title="Beatport"
            titleClassName="text-[#94D500]"
            expanded={beatportExpanded}
            onToggle={() => setBeatportExpanded((v) => !v)}
          >
            <PlatformLinkPanel
              href="https://www.beatport.com/artist/sergik/1002796"
              label="Open on Beatport"
              accentClassName="text-[#94D500] hover:text-lime-300"
            />
          </PlatformCollapse>

          <PlatformCollapse
            title="Spotify"
            titleClassName="text-[#1DB954]"
            expanded={spotifyExpanded}
            onToggle={() => setSpotifyExpanded((v) => !v)}
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <Link
                  href={artistData.platforms.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-[#1DB954] transition-colors hover:text-green-400 touch-manipulation sm:min-h-0"
                >
                  <span>Open on Spotify</span>
                  <span aria-hidden>→</span>
                </Link>
              </div>
              <iframe
                title="SERGIK on Spotify"
                src="https://open.spotify.com/embed/artist/7MnvMhWoSe4wYXuiI6iQ8H?utm_source=generator"
                width="100%"
                height="680"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="w-full rounded-lg border-0"
              />
            </div>
          </PlatformCollapse>
        </div>

        <NavigationButtons embedded />
      </div>
    </div>
  )
}
