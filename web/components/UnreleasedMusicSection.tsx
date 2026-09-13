'use client'

import { useState, useEffect } from 'react'
import SoundCloudPlayer from './SoundCloudPlayer'
import { FaMusic } from 'react-icons/fa'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'

interface UnreleasedTrack {
  id: string
  title: string
  filename: string
  description?: string
  uploadDate: string
  duration?: number
  genre?: string
  artwork?: string
  likes?: number
  plays?: number
  isPrivate?: boolean
}

interface UnreleasedMusicSectionProps {
  tracks: UnreleasedTrack[]
}

export default function UnreleasedMusicSection({ 
  tracks 
}: UnreleasedMusicSectionProps) {
  const publicTracks = tracks.filter(t => !t.isPrivate)
  const [resolvedTracks, setResolvedTracks] = useState<Array<UnreleasedTrack & { resolvedSrc?: string }>>([])

  // Resolve all audio URLs to Supabase
  useEffect(() => {
    const resolveTracks = async () => {
      const resolved = await Promise.all(
        publicTracks.map(async (track) => {
          const localPath = `/audio/unreleased/${track.filename}`
          try {
            const resolvedUrl = await resolveAudioUrl(localPath)
            return { ...track, resolvedSrc: resolvedUrl }
          } catch (error) {
            console.error(`Failed to resolve ${localPath}:`, error)
            return { ...track, resolvedSrc: localPath } // Fallback to local path
          }
        })
      )
      setResolvedTracks(resolved)
    }
    resolveTracks()
  }, [publicTracks])

  if (publicTracks.length === 0) {
    return null
  }

  return (
    <div className="mt-20 pt-20 border-t border-gray-800">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FaMusic className="text-[#ff5500] text-2xl" />
          <h2 className="text-3xl md:text-4xl font-bold">
            Unreleased Music
          </h2>
        </div>
        <p className="text-gray-400">
          Exclusive tracks and works in progress
        </p>
      </div>

      <div className="space-y-4">
        {resolvedTracks.length > 0 ? (
          resolvedTracks.map((track, index) => (
            <SoundCloudPlayer
              key={track.id}
              src={track.resolvedSrc || `/audio/unreleased/${track.filename}`}
              title={track.title}
              artist="SERGIK"
              artwork={track.artwork}
              duration={track.duration}
              likes={track.likes || 0}
              plays={track.plays || 0}
              priority={index === 0} // Prioritize first track artwork for LCP
            />
          ))
        ) : (
          <div className="text-gray-400 text-center py-8">Loading tracks...</div>
        )}
      </div>
    </div>
  )
}

