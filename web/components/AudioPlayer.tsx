'use client'

import { useState, useRef, useEffect } from 'react'
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute } from 'react-icons/fa'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'

interface AudioPlayerProps {
  src: string
  title: string
  autoPlay?: boolean
}

export default function AudioPlayer({ src, title, autoPlay = false }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
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

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !resolvedUrl) return

    // Update src when resolved URL changes
    audio.src = resolvedUrl
    audio.load()

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)

    const handleError = () => {
      const isDevelopment = process.env.NODE_ENV === 'development'
      
      // In production, don't fall back to local paths (they don't exist)
      // In development, allow fallback to local path
      if (isDevelopment && resolvedUrl.startsWith('http') && src !== resolvedUrl) {
        console.log('Falling back to local path:', src)
        audio.src = src
        audio.load()
      } else {
        console.error('Failed to load audio from Supabase:', resolvedUrl)
      }
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('error', handleError)
    }
  }, [resolvedUrl, src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch((err) => {
        // Ignore AbortError - it's expected when play() is interrupted by pause()
        if (err.name !== 'AbortError') {
          console.error('Audio play failed:', err)
        }
      })
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return

    const newTime = parseFloat(e.target.value)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return

    const newVolume = parseFloat(e.target.value)
    audio.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isMuted) {
      audio.volume = volume || 0.5
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <audio
        ref={audioRef}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
      />
      
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="bg-white text-black rounded-full p-3 hover:bg-gray-200 transition-colors flex-shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <FaPause /> : <FaPlay />}
        </button>

        <div className="flex-1">
          <p className="text-sm font-medium text-white mb-1">{title}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-gray-400">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  )
}

