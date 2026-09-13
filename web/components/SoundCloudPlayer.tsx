'use client'

import { useState, useRef, useEffect } from 'react'
import { FaPlay, FaPause, FaHeart, FaShare, FaComment } from 'react-icons/fa'
import Image from 'next/image'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'

interface SoundCloudPlayerProps {
  src: string
  title: string
  artist?: string
  artwork?: string
  likes?: number
  plays?: number
  duration?: number
  priority?: boolean // For LCP optimization
}

export default function SoundCloudPlayer({
  src,
  title,
  artist = 'SERGIK',
  artwork,
  likes = 0,
  plays = 0,
  duration,
  priority = false
}: SoundCloudPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(duration || 0)
  const [isLiked, setIsLiked] = useState(false)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Resolve audio URL when src changes
  useEffect(() => {
    resolveAudioUrl(src).then(url => {
      setResolvedUrl(url)
    }).catch(err => {
      console.error('Failed to resolve audio URL:', err)
      setResolvedUrl(src) // Fallback to original
    })
  }, [src])

  // Generate fake waveform data (in real SoundCloud, this comes from audio analysis)
  useEffect(() => {
    const generateWaveform = () => {
      const bars = 200 // Number of waveform bars
      const data: number[] = []
      for (let i = 0; i < bars; i++) {
        data.push(Math.random() * 0.3 + 0.1) // Random heights between 0.1 and 0.4
      }
      setWaveformData(data)
    }
    generateWaveform()
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !resolvedUrl) return

    // Update src when resolved URL changes
    audio.src = resolvedUrl
    audio.load()

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => {
      setAudioDuration(audio.duration || duration || 0)
    }

    const handleError = () => {
      const isDevelopment = process.env.NODE_ENV === 'development'
      
      // In production, don't fall back to local paths (they don't exist)
      // In development, allow fallback to local path
      if (isDevelopment && resolvedUrl.startsWith('http') && src !== resolvedUrl) {
        if (isDevelopment) console.log('Falling back to local path:', src)
        audio.src = src
        audio.load()
      } else {
        if (isDevelopment) console.error('Failed to load audio from Supabase:', resolvedUrl)
      }
    }

    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [resolvedUrl, src, duration])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch((err) => {
        // Ignore AbortError - it's expected when play() is interrupted by pause()
        if (err.name !== 'AbortError') {
          // Error handled silently
        }
      })
    }
    setIsPlaying(!isPlaying)
  }

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !audioDuration) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const newTime = percentage * audioDuration

    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const currentProgress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0
  const currentBarIndex = Math.floor((currentTime / audioDuration) * waveformData.length)

  return (
    <div className="bg-[#1a1a1a] rounded-lg border border-gray-800 overflow-hidden">
      <audio
        ref={audioRef}
        preload="metadata"
      />

      {/* Artwork and Play Button Section */}
      <div className="flex items-center gap-4 p-4">
        <button
          onClick={togglePlay}
          className="bg-[#ff5500] hover:bg-[#ff6600] text-white rounded-full p-3 flex-shrink-0 transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <FaPause className="w-4 h-4" />
          ) : (
            <FaPlay className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {artwork && (
          <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
            <Image
              src={resolveImageUrl(artwork)}
              alt={title}
              fill
              className="object-cover"
              sizes="48px"
              priority={priority}
              unoptimized={shouldUnoptimizeImage(resolveImageUrl(artwork))}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm truncate">{title}</div>
          <div className="text-gray-400 text-xs truncate">{artist}</div>
        </div>

        <div className="text-gray-400 text-xs flex-shrink-0">
          {formatTime(currentTime)} / {formatTime(audioDuration)}
        </div>
      </div>

      {/* Waveform Section */}
      <div
        className="relative h-20 bg-[#0f0f0f] cursor-pointer group"
        onClick={handleWaveformClick}
      >
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <div className="w-full h-full flex items-center justify-center gap-[2px]">
            {waveformData.map((height, index) => {
              const isPast = index < currentBarIndex
              const barHeight = height * 100
              
              return (
                // eslint-disable-next-line react/forbid-dom-props
                <div
                  key={index}
                  className={`transition-all duration-75 ${
                    isPast
                      ? 'bg-[#ff5500]'
                      : 'bg-gray-600 group-hover:bg-gray-500'
                  }`}
                  style={{
                    width: `${100 / waveformData.length}%`,
                    height: `${barHeight}%`,
                    minHeight: '4px',
                  } as React.CSSProperties}
                />
              )
            })}
          </div>
        </div>
        
        {/* Progress indicator line */}
        {/* eslint-disable-next-line react/forbid-dom-props */}
        <div
          className="absolute top-0 left-0 h-full bg-[#ff5500] opacity-20 pointer-events-none"
          style={{ width: `${currentProgress}%` } as React.CSSProperties}
        />
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsLiked(!isLiked)}
            className={`flex items-center gap-2 text-sm transition-colors ${
              isLiked
                ? 'text-[#ff5500] hover:text-[#ff6600]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <FaHeart className={isLiked ? 'fill-current' : ''} />
            <span>{likes + (isLiked ? 1 : 0)}</span>
          </button>

          <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
            <FaComment />
            <span>Comment</span>
          </button>

          <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
            <FaShare />
            <span>Share</span>
          </button>
        </div>

        <div className="text-xs text-gray-500">
          {plays > 0 && `${plays.toLocaleString()} plays`}
        </div>
      </div>
    </div>
  )
}

