'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useEffect, memo } from 'react'
import { FaSpotify, FaApple, FaAmazon, FaSoundcloud, FaYoutube, FaInstagram, FaLink, FaMusic } from 'react-icons/fa'
import SoundCloudEmbed from './SoundCloudEmbed'
import artistData from '@/data/artist.json'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

interface Release {
  id: string
  title: string
  type: string
  year: number
  platforms: string[]
  spotify_url?: string
  soundcloud_url?: string
  image?: string | null
  fetch_from_spotify?: boolean
}

// Platform configuration with icons and colors
const platformConfig = {
  Spotify: {
    icon: FaSpotify,
    color: 'text-green-500 hover:text-green-400',
    bgColor: 'hover:bg-green-500/10',
    name: 'Spotify',
    description: 'All releases, albums, singles, discography'
  },
  'Apple Music': {
    icon: FaApple,
    color: 'text-pink-500 hover:text-pink-400',
    bgColor: 'hover:bg-pink-500/10',
    name: 'Apple Music',
    description: 'All albums, EPs, singles, discography'
  },
  'Amazon Music': {
    icon: FaAmazon,
    color: 'text-orange-500 hover:text-orange-400',
    bgColor: 'hover:bg-orange-500/10',
    name: 'Amazon Music',
    description: 'All music, albums, discography'
  },
  TIDAL: {
    icon: FaMusic,
    color: 'text-blue-400 hover:text-blue-300',
    bgColor: 'hover:bg-blue-500/10',
    name: 'TIDAL',
    description: 'All music, albums, discography'
  },
  DEEZER: {
    icon: FaMusic,
    color: 'text-purple-500 hover:text-purple-400',
    bgColor: 'hover:bg-purple-500/10',
    name: 'DEEZER',
    description: 'All music, albums, discography'
  },
  Pandora: {
    icon: FaMusic,
    color: 'text-blue-500 hover:text-blue-400',
    bgColor: 'hover:bg-blue-500/10',
    name: 'Pandora',
    description: 'Artist station and all music'
  },
  Beatport: {
    icon: FaMusic,
    color: 'text-yellow-500 hover:text-yellow-400',
    bgColor: 'hover:bg-yellow-500/10',
    name: 'Beatport',
    description: 'DJ-focused platform - tracks, releases, charts'
  },
  'YouTube Music': {
    icon: FaYoutube,
    color: 'text-red-500 hover:text-red-400',
    bgColor: 'hover:bg-red-500/10',
    name: 'YouTube Music',
    description: 'All music, albums, singles, discography'
  },
  Shazam: {
    icon: FaMusic,
    color: 'text-cyan-500 hover:text-cyan-400',
    bgColor: 'hover:bg-cyan-500/10',
    name: 'Shazam',
    description: 'Music discovery - top songs, latest releases'
  },
  SoundCloud: {
    icon: FaSoundcloud,
    color: 'text-[#ff5500] hover:text-[#ff6600]',
    bgColor: 'hover:bg-orange-500/10',
    name: 'SoundCloud',
    description: 'Personal profile - all tracks and playlists'
  },
  YouTube: {
    icon: FaYoutube,
    color: 'text-red-500 hover:text-red-400',
    bgColor: 'hover:bg-red-500/10',
    name: 'YouTube',
    description: 'Personal channel - all videos and music'
  },
  Instagram: {
    icon: FaInstagram,
    color: 'text-purple-500 hover:text-purple-400',
    bgColor: 'hover:bg-purple-500/10',
    name: 'Instagram',
    description: 'Personal profile'
  },
  Linktree: {
    icon: FaLink,
    color: 'text-cyan-500 hover:text-cyan-400',
    bgColor: 'hover:bg-cyan-500/10',
    name: 'Linktree',
    description: 'All platform links in one place'
  }
}

function ReleaseCard({
  release,
  priority = false,
}: {
  release: Release
  /** Prefer true for the first homepage tiles — they often win LCP (hero has no image). */
  priority?: boolean
}) {
  // Filter out invalid Spotify CDN URLs from initial image
  const getValidImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null
    const invalidCdnPatterns = ['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']
    const isInvalid = invalidCdnPatterns.some(pattern => url.includes(pattern))
    return isInvalid ? null : resolveImageUrl(url)
  }
  
  const initialImageUrl = getValidImageUrl(release.image)
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl)
  const [isLoading, setIsLoading] = useState(!initialImageUrl && release.fetch_from_spotify)
  const [showSoundCloud, setShowSoundCloud] = useState(false)

  // Get platform URL - use release-specific URL if available, otherwise fall back to artist profile
  const getPlatformUrl = (platformName: string): string | null => {
    if (platformName === 'Spotify') {
      return (release.spotify_url && release.spotify_url.trim() !== '') 
        ? release.spotify_url 
        : artistData.platforms.spotify || null
    }
    
    if (platformName === 'SoundCloud') {
      return (release.soundcloud_url && release.soundcloud_url.trim() !== '') 
        ? release.soundcloud_url 
        : artistData.platforms.soundcloud || null
    }
    
    if (platformName === 'Apple Music') {
      // Create Apple Music search URL with release title and artist name
      const searchQuery = encodeURIComponent(`${release.title} SERGIK`)
      return `https://music.apple.com/search?term=${searchQuery}`
    }
    
    if (platformName === 'Amazon Music') {
      return 'https://music.amazon.com/artists/B09B2LNNSF/sergik'
    }
    
    if (platformName === 'TIDAL') {
      return 'https://tidal.com/artist/27288636'
    }
    
    if (platformName === 'DEEZER') {
      return 'https://www.deezer.com/us/artist/140080312'
    }
    
    if (platformName === 'Pandora') {
      return 'https://www.pandora.com/artist/sergik/ARz95KfVdbj3P5Z'
    }
    
    if (platformName === 'Beatport') {
      return 'https://www.beatport.com/artist/sergik/1002796'
    }
    
    if (platformName === 'YouTube Music') {
      return 'https://music.youtube.com/channel/UCBWcROfNv8PeY6KdrnNM_pw'
    }
    
    if (platformName === 'Shazam') {
      return 'https://www.shazam.com/artist/sergik/1577778284'
    }
    
    if (platformName === 'YouTube') {
      return artistData.platforms.youtube || null
    }
    
    if (platformName === 'Instagram') {
      return artistData.platforms.instagram || null
    }
    
    if (platformName === 'Linktree') {
      return artistData.platforms.linktree || null
    }
    
    return null
  }

  const listedPlatforms = (release.platforms || []).filter(
    (platform, index, self) => self.indexOf(platform) === index
  )

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
              // Filter out known invalid Spotify CDN URLs
              const invalidCdnPatterns = ['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']
              const isInvalid = invalidCdnPatterns.some(pattern => data.imageUrl.includes(pattern))
              if (!isInvalid) {
                setImageUrl(data.imageUrl)
              }
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
    <div className="bg-gray-900/50 rounded-lg overflow-hidden hover:bg-gray-800/50 transition-colors touch-manipulation">
      <div className="aspect-square bg-gray-800 relative">
        {imageUrl && !imageUrl.includes('image-cdn-fa.spotifycdn.com') && !imageUrl.includes('image-cdn-ak.spotifycdn.com') ? (
          <Image
            src={imageUrl}
            alt={release.title}
            fill
            className="object-cover"
            unoptimized={shouldUnoptimizeImage(imageUrl)}
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            sizes="(max-width: 1024px) 50vw, 33vw"
            onError={(e) => {
              console.warn(`Failed to load image for ${release.title}:`, imageUrl)
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
      <div className="p-2.5 sm:p-6">
        <div className="flex items-start justify-between mb-1.5 sm:mb-2 gap-1.5 sm:gap-2">
          <h3 className="text-sm sm:text-xl font-semibold flex-1 min-w-0 line-clamp-2">{release.title}</h3>
          <span className="text-[10px] sm:text-xs text-gray-400 bg-gray-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex-shrink-0">
            {release.type}
          </span>
        </div>
        <p className="text-gray-400 text-xs sm:text-sm mb-3 sm:mb-4">{release.year}</p>
        
        {/* Streaming Platform Icons */}
        <div className="mb-3 sm:mb-4">
          <div className="flex flex-wrap gap-1.5 sm:gap-3">
            {listedPlatforms.map((platformName) => {
              const config = platformConfig[platformName as keyof typeof platformConfig]
              const platformUrl = getPlatformUrl(platformName)
              
              // Skip if no config or no URL available
              if (!config || !platformUrl) return null
              
              const IconComponent = config.icon
              
              // Special handling for SoundCloud - show embed button instead of direct link
              if (platformName === 'SoundCloud' && release.soundcloud_url && release.soundcloud_url.trim() !== '') {
                return (
                  <button
                    key={platformName}
                    onClick={() => setShowSoundCloud(!showSoundCloud)}
                    className={`p-2 sm:p-3 rounded-lg transition-all touch-manipulation min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center border border-gray-700 ${config.color} ${config.bgColor} ${showSoundCloud ? 'bg-orange-500/20 border-orange-500/50' : ''}`}
                    title={`${showSoundCloud ? 'Hide' : 'Play on'} ${config.name} - ${config.description}`}
                    aria-label={`${showSoundCloud ? 'Hide' : 'Play on'} ${config.name} - ${config.description}`}
                  >
                    <IconComponent className="text-base sm:text-xl" />
                  </button>
                )
              }
              
              return (
                <Link
                  key={platformName}
                  href={platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-2 sm:p-3 rounded-lg transition-all touch-manipulation min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center border border-gray-700 ${config.color} ${config.bgColor}`}
                  title={`${config.name} - ${config.description}`}
                  aria-label={`${config.name} - ${config.description}`}
                >
                  <IconComponent className="text-base sm:text-xl" />
                </Link>
              )
            })}
          </div>
        </div>

        {/* SoundCloud Embed */}
        {showSoundCloud && release.soundcloud_url && release.soundcloud_url.trim() !== '' && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <SoundCloudEmbed
              url={release.soundcloud_url}
              height={200}
              visual={true}
              showArtwork={true}
              showComments={false}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Export memoized version - safe, backward compatible
export default memo(ReleaseCard, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.release.id === nextProps.release.id &&
    prevProps.release.image === nextProps.release.image &&
    prevProps.release.title === nextProps.release.title &&
    prevProps.release.year === nextProps.release.year
  )
})
