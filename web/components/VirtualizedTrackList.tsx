'use client'

import { useState, useMemo } from 'react'
// @ts-expect-error - react-window types may be outdated
import { FixedSizeList as List } from 'react-window'
import { useTracks, useSonicDna, useWaveform } from '@/hooks/useMusicData'
import Image from 'next/image'
import { FaPlay, FaPause, FaMusic, FaWaveSquare } from 'react-icons/fa'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { displayTrackBpm, displayTrackGenre, displayTrackKey } from '@/lib/audio/track-display'

interface VirtualizedTrackListProps {
  folderId?: string
  currentTrackId?: string
  onTrackSelect: (track: any) => void
  isPlaying?: boolean
  className?: string
}

interface TrackRowProps {
  index: number
  style: React.CSSProperties
  data: {
    tracks: any[]
    currentTrackId?: string
    onTrackSelect: (track: any) => void
    isPlaying?: boolean
  }
}

function TrackRow({ index, style, data }: TrackRowProps) {
  const { tracks, currentTrackId, onTrackSelect, isPlaying } = data
  const track = tracks[index]

  // Hooks must be called unconditionally — Rule of Hooks.
  // Use safe optional access so they still work when track is undefined.
  const trackId = track?.id ?? ''
  const isCurrentTrack = !!trackId && trackId === currentTrackId
  // Only fetch heavy DNA/waveform for the selected (playing) track — never for the whole list.
  const { data: sonicDna } = useSonicDna(trackId, isCurrentTrack)
  const { data: waveform } = useWaveform(trackId, isCurrentTrack)

  if (!track) return null

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const dnaTrack = { ...track, sonic_dna: sonicDna || track.sonic_dna }
  const genre = displayTrackGenre(dnaTrack)
  const key = displayTrackKey(dnaTrack)
  const bpm = displayTrackBpm(dnaTrack)

  return (
    <div
      style={style}
      className={`flex items-center gap-4 p-3 border-b border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer group ${
        isCurrentTrack ? 'bg-blue-900/20 border-l-4 border-blue-500' : ''
      }`}
      onClick={() => onTrackSelect(track)}
    >
      {/* Track Number / Play Button */}
      <div className="flex items-center justify-center w-8 h-8 flex-shrink-0">
        {isCurrentTrack && isPlaying ? (
          <FaWaveSquare className="text-blue-400 text-sm animate-pulse" />
        ) : (
          <span className="text-gray-400 text-sm group-hover:hidden">
            {index + 1}
          </span>
        )}
        <FaPlay className="text-white text-xs hidden group-hover:block ml-0.5" />
      </div>

      {/* Artwork */}
      <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-gray-800">
        {track.artwork ? (
          <Image
            src={track.artwork}
            alt={track.title}
            fill
            className="object-cover"
            priority={index < 8}
            fetchPriority={index < 4 ? 'high' : 'auto'}
            unoptimized={shouldUnoptimizeImage(track.artwork)}
            sizes="48px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FaMusic className="text-gray-600 text-lg" />
          </div>
        )}
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className={`font-medium truncate ${isCurrentTrack ? 'text-blue-400' : 'text-white'}`}>
            {track.title}
          </h4>
          {genre && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {genre}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 truncate">{track.artist}</p>
      </div>

      {/* Metadata */}
      <div className="hidden md:flex items-center gap-4 text-sm text-gray-400 flex-shrink-0">
        {bpm && (
          <span className="text-center min-w-[3rem]">{bpm} BPM</span>
        )}
        {key && (
          <span className="text-center min-w-[2rem]">{key}</span>
        )}
        <span className="text-center min-w-[3rem]">{formatDuration(track.duration)}</span>
      </div>

      {/* Mobile metadata - simplified */}
      <div className="flex md:hidden items-center gap-2 text-xs text-gray-400 flex-shrink-0">
        {bpm && <span>{bpm}</span>}
        <span>{formatDuration(track.duration)}</span>
      </div>
    </div>
  )
}

export default function VirtualizedTrackList({
  folderId,
  currentTrackId,
  onTrackSelect,
  isPlaying,
  className = ''
}: VirtualizedTrackListProps) {
  const { data: tracks = [], isLoading, error } = useTracks(folderId)

  // Memoize the item data to prevent unnecessary re-renders
  const itemData = useMemo(() => ({
    tracks,
    currentTrackId,
    onTrackSelect,
    isPlaying,
  }), [tracks, currentTrackId, onTrackSelect, isPlaying])

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-gray-400">Loading tracks...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-red-400">Error loading tracks</div>
      </div>
    )
  }

  if (!tracks.length) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-gray-400">No tracks found</div>
      </div>
    )
  }

  return (
    <div className={`h-full ${className}`}>
      <List
        height={600} // Adjust based on container height
        itemCount={tracks.length}
        itemSize={80} // Height of each track row
        itemData={itemData}
        overscanCount={5} // Render 5 extra items outside visible area
      >
        {TrackRow}
      </List>
    </div>
  )
}