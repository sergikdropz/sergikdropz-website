'use client'

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

function fisherYatesShuffle<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
  album?: string
  folder?: string
  // Audio analysis fields (from Supabase)
  bpm?: number
  key_signature?: string
  energy_level?: number
  danceability?: number
  frequency_bands?: any
  waveform_data?: number[] // Pre-computed waveform peaks from Supabase
  // Sonic DNA analysis (from Supabase)
  sonic_dna?: any
  musicbrainz_id?: string
  musicbrainz_data?: any
}

interface MusicPlayerContextType {
  currentTrack: Track | null
  queue: Track[]
  isPlaying: boolean
  currentIndex: number
  currentSource: { type: 'folder' | 'playlist' | null; id: string | null } | null
  setCurrentTrack: (track: Track | null) => void
  setQueue: (queue: Track[]) => void
  setIsPlaying: (isPlaying: boolean) => void
  setCurrentIndex: (index: number) => void
  setCurrentSource: (source: { type: 'folder' | 'playlist' | null; id: string | null } | null) => void
  playTrack: (track: Track, queue?: Track[], source?: { type: 'folder' | 'playlist' | null; id: string | null }) => void
  playQueue: (queue: Track[], startIndex?: number, source?: { type: 'folder' | 'playlist' | null; id: string | null }) => void
  addToQueue: (track: Track) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  nextTrack: () => void
  previousTrack: () => void
  shuffleQueue: () => void
  handleShuffle: (shuffledQueue: Track[]) => void
  handleQueueChange: (newQueue: Track[]) => void
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined)

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [originalQueue, setOriginalQueue] = useState<Track[]>([])
  const [isShuffled, setIsShuffled] = useState(false)
  const [currentSource, setCurrentSource] = useState<{ type: 'folder' | 'playlist' | null; id: string | null } | null>(null)

  // Persist state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('musicPlayerState')
      if (saved) {
        try {
          const state = JSON.parse(saved)
          if (state.currentTrack) setCurrentTrack(state.currentTrack)
          if (state.queue && state.queue.length > 0) {
            setQueue(state.queue)
            setCurrentIndex(state.currentIndex || 0)
          }
        } catch (e) {
          console.error('Failed to load music player state:', e)
        }
      }
    }
  }, [])

  // Save state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && (currentTrack || queue.length > 0)) {
      localStorage.setItem('musicPlayerState', JSON.stringify({
        currentTrack,
        queue,
        currentIndex
      }))
    }
  }, [currentTrack, queue, currentIndex])

  const playTrack = useCallback((track: Track, trackQueue?: Track[], source?: { type: 'folder' | 'playlist' | null; id: string | null }) => {
    if (trackQueue && trackQueue.length > 0) {
      const index = trackQueue.findIndex(t => t.id === track.id)
      setQueue(trackQueue)
      setCurrentIndex(index >= 0 ? index : 0)
      setCurrentTrack(trackQueue[index >= 0 ? index : 0])
    } else {
      setQueue([track])
      setCurrentIndex(0)
      setCurrentTrack(track)
    }
    setCurrentSource(source || null)
    setIsPlaying(true)

    // Fire-and-forget play tracking
    if (track.id) {
      fetch('/api/music-library/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: track.id,
          source: source?.type || 'library',
        }),
      }).catch(() => {})
    }
  }, [])

  const playQueue = useCallback((trackQueue: Track[], startIndex: number = 0, source?: { type: 'folder' | 'playlist' | null; id: string | null }) => {
    if (trackQueue.length > 0) {
      setQueue(trackQueue)
      setCurrentIndex(startIndex)
      setCurrentTrack(trackQueue[startIndex])
      setCurrentSource(source || null)
      setIsPlaying(true)
    }
  }, [])

  const addToQueue = useCallback((track: Track) => {
    setQueue(prev => [...prev, track])
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => {
      if (prev.length <= 1) {
        setCurrentTrack(null)
        setCurrentIndex(0)
        setIsPlaying(false)
        return []
      }
      
      const newQueue = prev.filter((_, i) => i !== index)
      let newIndex = currentIndex
      
      if (index < currentIndex) {
        newIndex = currentIndex - 1
      } else if (index === currentIndex) {
        if (newQueue.length > 0) {
          newIndex = Math.min(currentIndex, newQueue.length - 1)
          setCurrentTrack(newQueue[newIndex])
        } else {
          setCurrentTrack(null)
          setIsPlaying(false)
          newIndex = 0
        }
      }
      
      setCurrentIndex(newIndex)
      return newQueue
    })
  }, [currentIndex])

  const clearQueue = useCallback(() => {
    setQueue([])
    setCurrentTrack(null)
    setCurrentIndex(0)
    setCurrentSource(null)
    setIsPlaying(false)
  }, [])

  const nextTrack = useCallback(() => {
    setQueue(prev => {
      if (prev.length === 0) return prev
      
      if (currentIndex < prev.length - 1) {
        const nextIndex = currentIndex + 1
        setCurrentIndex(nextIndex)
        setCurrentTrack(prev[nextIndex])
      } else {
        // Loop back to start
        setCurrentIndex(0)
        setCurrentTrack(prev[0])
      }
      return prev
    })
  }, [currentIndex])

  const previousTrack = useCallback(() => {
    setQueue(prev => {
      if (prev.length === 0) return prev
      
      if (currentIndex > 0) {
        const prevIndex = currentIndex - 1
        setCurrentIndex(prevIndex)
        setCurrentTrack(prev[prevIndex])
      } else {
        // Go to end
        const lastIndex = prev.length - 1
        setCurrentIndex(lastIndex)
        setCurrentTrack(prev[lastIndex])
      }
      return prev
    })
  }, [currentIndex])

  const shuffleQueue = useCallback(() => {
    setQueue(prev => {
      if (prev.length <= 1) return prev
      
      if (!isShuffled) {
        setOriginalQueue([...prev])
        const shuffled = fisherYatesShuffle(prev)
        const currentTrackId = currentTrack?.id
        if (currentTrackId) {
          const newIndex = shuffled.findIndex(t => t.id === currentTrackId)
          if (newIndex >= 0) {
            setCurrentIndex(newIndex)
          }
        }
        setIsShuffled(true)
        return shuffled
      } else {
        const restored = originalQueue.length > 0 ? originalQueue : prev
        const currentTrackId = currentTrack?.id
        if (currentTrackId) {
          const newIndex = restored.findIndex(t => t.id === currentTrackId)
          if (newIndex >= 0) {
            setCurrentIndex(newIndex)
          }
        }
        setIsShuffled(false)
        return restored
      }
    })
  }, [isShuffled, originalQueue, currentTrack])

  const handleShuffle = useCallback((shuffledQueue: Track[]) => {
    setQueue(shuffledQueue)
    if (currentTrack) {
      const newIndex = shuffledQueue.findIndex(t => t.id === currentTrack.id)
      if (newIndex >= 0) {
        setCurrentIndex(newIndex)
      } else if (shuffledQueue.length > 0) {
        setCurrentIndex(0)
        setCurrentTrack(shuffledQueue[0])
      }
    }
  }, [currentTrack])

  const handleQueueChange = useCallback((newQueue: Track[]) => {
    setQueue(newQueue)
    if (currentTrack) {
      const newIndex = newQueue.findIndex(t => t.id === currentTrack.id)
      if (newIndex >= 0) {
        setCurrentIndex(newIndex)
      } else if (newQueue.length > 0) {
        setCurrentIndex(0)
        setCurrentTrack(newQueue[0])
      } else {
        setCurrentTrack(null)
        setCurrentIndex(0)
        setIsPlaying(false)
      }
    }
  }, [currentTrack])

  return (
    <MusicPlayerContext.Provider
      value={{
        currentTrack,
        queue,
        isPlaying,
        currentIndex,
        currentSource,
        setCurrentTrack,
        setQueue,
        setIsPlaying,
        setCurrentIndex,
        setCurrentSource,
        playTrack,
        playQueue,
        addToQueue,
        removeFromQueue,
        clearQueue,
        nextTrack,
        previousTrack,
        shuffleQueue,
        handleShuffle,
        handleQueueChange,
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext)
  if (context === undefined) {
    // In production, return a safe default instead of throwing
    // This prevents the app from crashing if context is temporarily unavailable
    if (process.env.NODE_ENV === 'production') {
      console.warn('useMusicPlayer called outside MusicPlayerProvider, returning default values')
      return {
        currentTrack: null,
        queue: [],
        isPlaying: false,
        currentIndex: 0,
        currentSource: null,
        setCurrentTrack: () => {},
        setQueue: () => {},
        setIsPlaying: () => {},
        setCurrentIndex: () => {},
        setCurrentSource: () => {},
        playTrack: () => {},
        playQueue: () => {},
        addToQueue: () => {},
        removeFromQueue: () => {},
        clearQueue: () => {},
        nextTrack: () => {},
        previousTrack: () => {},
        shuffleQueue: () => {},
        handleShuffle: () => {},
        handleQueueChange: () => {},
      }
    }
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider')
  }
  return context
}

