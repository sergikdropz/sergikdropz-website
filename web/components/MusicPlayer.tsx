'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { 
  FaPlay, FaPause, FaStepForward, FaStepBackward, 
  FaVolumeUp, FaVolumeMute, FaRandom, FaRedo,
  FaChevronDown, FaChevronUp, FaTimes, FaShare,
  FaPlus, FaList, FaCompress, FaExpand,
  FaGripVertical, FaTrash, FaCog
} from 'react-icons/fa'
import Image from 'next/image'
import { useVirtualizer } from '@tanstack/react-virtual'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { generatePeakData, detectBPM } from '@/utils/audioWorkerClient'
import { analyzeFrequencyBands, detectTransients } from '@/utils/audioAnalysis'
import { preloadTracks } from '@/utils/serviceWorker'
import { throttle, rafThrottle } from '@/utils/performance'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { trackTrackPlay } from '@/lib/analytics'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import React from 'react'

// Auto DJ transition mode type
type AutoDJTransitionMode = 'crossfade' | 'filter-eq' | 'cutout-filter'

// Memoized Queue Item Component
interface QueueItemProps {
  track: Track
  index: number
  isCurrent: boolean
  onRemove: (index: number) => void
  isAutoDJNext?: boolean
}

const QueueItem = React.memo(({ track, index, isCurrent, onRemove, isAutoDJNext }: QueueItemProps) => {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
        isCurrent
          ? 'bg-blue-900/30 border-l-2 border-blue-500'
          : 'hover:bg-gray-800'
      }`}
    >
      <FaGripVertical className="text-gray-500 text-xs" />
      {track.artwork && (
        <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0">
          <Image
            src={track.artwork}
            alt={track.title}
            fill
            className="object-cover"
            unoptimized={shouldUnoptimizeImage(track.artwork)}
            sizes="(max-width: 640px) 32px, 32px"
            loading="lazy"
            quality={75}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{track.title}</p>
        <p className="text-xs text-gray-400 truncate">{track.artist}</p>
        {isAutoDJNext && (
          <div className="text-[9px] text-emerald-300 uppercase tracking-wider mt-0.5">
            Auto DJ next
          </div>
        )}
      </div>
      {isCurrent && (
        <span className="text-blue-400 text-xs">▶</span>
      )}
      <button
        onClick={() => onRemove(index)}
        className="text-gray-400 hover:text-red-400 transition-colors p-1"
        title="Remove from queue"
      >
        <FaTrash className="text-xs" />
      </button>
    </div>
  )
})

QueueItem.displayName = 'QueueItem'

// Lazy load expanded controls
const ExpandedPlayerControls = dynamic(
  () => import('./ExpandedPlayerControls'),
  {
    loading: () => (
      <div className="container mx-auto px-4 pb-3 border-t border-gray-800 pt-3">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-400 text-sm">Loading controls...</div>
        </div>
      </div>
    ),
    ssr: false,
  }
)

// Hide DJ mode until completed (set to true when ready)
const DJ_MODE_ENABLED = false

/**
 * iOS and Android suspend Web Audio's AudioContext when the screen locks. Our analyzer
 * routes the media element through MediaElementSource → destination, so the audible path
 * stops with the context. Keeping output on HTMLMediaElement preserves background playback.
 */
function prefersMediaElementBackgroundPlayback(): boolean {
  if (typeof navigator === 'undefined') return false
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData?.mobile === true) return true
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1)
  return isIOS || /Android/i.test(ua)
}

function buildLockScreenArtwork(artwork?: string) {
  if (!artwork) return []
  const src = resolveImageUrl(artwork)
  return [
    { src, sizes: '96x96', type: 'image/jpeg' },
    { src, sizes: '128x128', type: 'image/jpeg' },
    { src, sizes: '192x192', type: 'image/jpeg' },
    { src, sizes: '256x256', type: 'image/jpeg' },
    { src, sizes: '384x384', type: 'image/jpeg' },
    { src, sizes: '512x512', type: 'image/jpeg' },
  ]
}

// Lazy load DJ mixer mode
const DJMixerMode = dynamic(
  () => import('./DJMixerMode'),
  {
    loading: () => (
      <div className="container mx-auto px-4 pb-3 border-t border-gray-800 pt-3">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-400 text-sm">Loading DJ mixer...</div>
        </div>
      </div>
    ),
    ssr: false,
  }
)

interface Track {
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
  beat_grid_offset?: number
  // Sonic DNA analysis (from Supabase)
  sonic_dna?: any
  musicbrainz_id?: string
  musicbrainz_data?: any
}

interface MusicPlayerProps {
  currentTrack: Track | null
  queue: Track[]
  currentSource?: { type: 'folder' | 'playlist' | null; id: string | null } | null
  getTracksFromSource?: (source: { type: 'folder' | 'playlist' | null; id: string | null } | null) => Promise<Track[]>
  onTrackEnd: () => void
  onNext: () => void
  onPrevious: () => void
  isPlaying?: boolean
  onPlayStateChange?: (isPlaying: boolean) => void
  onShuffle?: (shuffledQueue: Track[]) => void
  onQueueChange?: (queue: Track[]) => void
  onRemoveFromQueue?: (index: number) => void
}

interface PlayerSettings {
  volume: number
  isMuted: boolean
  isShuffled: boolean
  repeatMode: 'off' | 'all' | 'one'
  playbackRate: number
  crossfadeDuration: number
  eqPreset: 'flat' | 'bass' | 'treble' | 'vocal'
  bufferSize: 'small' | 'medium' | 'large' | 'auto'
  streamQuality: 'standard' | 'HD' | 'UHD' | 'auto'
  /** On phones/tablets: keep audio on HTMLMediaElement so lock-screen / background playback works. */
  prioritizeBackgroundPlayback: boolean
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
const EQ_PRESETS = [
  { value: 'flat', label: 'Flat' },
  { value: 'bass', label: 'Bass Boost' },
  { value: 'treble', label: 'Treble' },
  { value: 'vocal', label: 'Vocal' },
] as const

function getTempoPercentage(rate: number): number {
  return (rate - 1) * 100
}

function getAdjustedBPM(originalBPM: number | null, rate: number): number | null {
  if (originalBPM === null) return null
  return Math.round(originalBPM * rate * 10) / 10
}

function rateToTempoValue(rate: number): number {
  return (rate - 1) * 100
}

function tempoValueToRate(tempoValue: number): number {
  return 1 + (tempoValue / 100)
}

export default function MusicPlayer({
  currentTrack,
  queue,
  currentSource,
  getTracksFromSource,
  onTrackEnd,
  onNext,
  onPrevious,
  isPlaying: externalIsPlaying,
  onPlayStateChange,
  onShuffle,
  onQueueChange,
  onRemoveFromQueue
}: MusicPlayerProps) {
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin') ?? false
  // DJ mode: visible in admin for testing; set DJ_MODE_ENABLED true to show on frontend
  const djModeAvailable = DJ_MODE_ENABLED || isAdminRoute
  const [internalIsPlaying, setInternalIsPlaying] = useState(false)
  const isPlaying = externalIsPlaying !== undefined ? externalIsPlaying : internalIsPlaying
  const setIsPlaying = (value: boolean) => {
    setInternalIsPlaying(value)
    onPlayStateChange?.(value)
  }
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const resolvedUrlCacheRef = useRef<Map<string, string>>(new Map())
  const [bufferedProgress, setBufferedProgress] = useState(0)
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null)
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isQueueExpanded, setIsQueueExpanded] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isKeyboardShortcutsExpanded, setIsKeyboardShortcutsExpanded] = useState(false)
  const [isWaveformSettingsExpanded, setIsWaveformSettingsExpanded] = useState(false)
  const [expandedMode, setExpandedMode] = useState<'controls' | 'dj'>('controls')
  const [autoDJConfig, setAutoDJConfig] = useState<{
    enabled: boolean
    mode: 'queue'
    transitionMode: AutoDJTransitionMode
    phraseBars: 8 | 4 | 2
    addToQueue: boolean
  }>({
    enabled: false,
    mode: 'queue',
    transitionMode: 'crossfade',
    phraseBars: 8,
    addToQueue: true,
  })
  const [autoDJLibrary, setAutoDJLibrary] = useState<Track[]>([])
  const autoDJIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoDJLastAddedRef = useRef<string | null>(null)
  const autoDJPendingRef = useRef<string | null>(null)
  const autoDJCrossfadeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [autoDJStatusMessage, setAutoDJStatusMessage] = useState('')
  const [autoDJPendingTrackId, setAutoDJPendingTrackId] = useState<string | null>(null)
  const [autoDJLeadIn, setAutoDJLeadIn] = useState(0.5)
  const [autoDJAlignPhase, setAutoDJAlignPhase] = useState(false)
  const [isAutoDJSettingsExpanded, setIsAutoDJSettingsExpanded] = useState(false)
  const [isTrackListExpanded, setIsTrackListExpanded] = useState(false)
  const clearAutoDJCrossfadeTimeout = useCallback(() => {
    if (autoDJCrossfadeTimeoutRef.current) {
      clearTimeout(autoDJCrossfadeTimeoutRef.current)
      autoDJCrossfadeTimeoutRef.current = null
    }
  }, [])

  const [allSourceTracks, setAllSourceTracks] = useState<Track[]>([])
  const primeQueue = useCallback(() => {
    if (!onQueueChange) return
    const pool = autoDJLibrary.length > 0
      ? autoDJLibrary
      : allSourceTracks.length > 0
        ? allSourceTracks
        : []
    if (pool.length === 0) {
      setAutoDJStatusMessage('No library tracks to prime')
      return
    }
    const remaining = pool.filter((track) => !queue.some((q) => q.id === track.id))
    const selection = remaining.slice(0, 3)
    if (selection.length === 0) {
      setAutoDJStatusMessage('Queue already contains library tracks')
      return
    }
    onQueueChange([...queue, ...selection])
    setAutoDJStatusMessage(`Primed ${selection.length} track${selection.length > 1 ? 's' : ''}`)
  }, [autoDJLibrary, allSourceTracks, queue, onQueueChange])

  // Update body data attribute when in DJ mode (for hiding header)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isExpanded && expandedMode === 'dj') {
        document.body.setAttribute('data-dj-mode', 'true')
      } else {
        document.body.removeAttribute('data-dj-mode')
      }
    }
  }, [isExpanded, expandedMode])
  const [isLoadingSourceTracks, setIsLoadingSourceTracks] = useState(false)
  const [isMiniMode, setIsMiniMode] = useState(false)
  const [showTrackDetails, setShowTrackDetails] = useState(false)
  const [isVolumeHovered, setIsVolumeHovered] = useState(false)
  const [waveformData, setWaveformData] = useState<{ 
    positive: number; 
    negative: number; 
    color: string;
    elementType?: 'kick' | 'snare' | 'hihat' | 'other';
    elementConfidence?: number;
  }[]>([])
  const [precomputedPeaks, setPrecomputedPeaks] = useState<number[] | null>(null)
  const [waveformMode, setWaveformMode] = useState<'colorful' | 'simple' | 'classic'>('colorful')
  const [waveformZoom, setWaveformZoom] = useState(1) // CDJ-style: 0.01x-32x range, 1 = full track, <1 = zoomed out, >1 = zoomed in (logarithmic scale)
  const [waveformOffset, setWaveformOffset] = useState(0) // For panning when zoomed
  const [waveformFollow, setWaveformFollow] = useState(false) // Follow mode - keeps playhead centered
  const [waveformMirror, setWaveformMirror] = useState(false) // Mirror mode - shows mirrored waveform (default false for single waveform)
  const [waveformSpeed, setWaveformSpeed] = useState(1.0) // Waveform animation speed (0.25x to 4x)
  const [waveformHorizontalZoom, setWaveformHorizontalZoom] = useState(0.5) // Horizontal zoom (0.1x to 8x) - default 0.5x for slower movement
  // Beat grid state
  const [beatGridEnabled, setBeatGridEnabled] = useState(true)
  const [beatGridOffsetSec, setBeatGridOffsetSec] = useState(0) // 0..beatDuration
  const [beatGridBeatsPerBar, setBeatGridBeatsPerBar] = useState(4)
  const [originalQueue, setOriginalQueue] = useState<Track[]>([])
  const [crossfadeActive, setCrossfadeActive] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false)
  const [detectedBPM, setDetectedBPM] = useState<number | null>(null)
  const [isDetectingBPM, setIsDetectingBPM] = useState(false)
  const bpmCacheRef = useRef<Map<string, number | null>>(new Map())
  const [tapTempoTaps, setTapTempoTaps] = useState<number[]>([])
  const tapTempoTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const volumeHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loggedErrorsRef = useRef<Set<string>>(new Set()) // Track URLs that have already logged errors
  const [tapTempoBPM, setTapTempoBPM] = useState<number | null>(null)
  const [connectionQuality, setConnectionQuality] = useState<'slow' | 'medium' | 'fast'>('fast')
  const [networkEffectiveType, setNetworkEffectiveType] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(true)
  const processedWaveformTrackRef = useRef<string | null>(null)
  const onQueueChangeRef = useRef(onQueueChange)
  const updatedQueueTrackRef = useRef<Set<string>>(new Set())
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressBarRef = useRef<HTMLInputElement>(null)
  const nextAudioRef = useRef<HTMLAudioElement>(null)
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const queueContainerRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const [audioContextReady, setAudioContextReady] = useState(false)
  const frequencyDataArrayRef = useRef<Float32Array | null>(null)
  const timeDataArrayRef = useRef<Float32Array | null>(null)
  const previousSpectrumRef = useRef<Float32Array | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const trackedPlayRef = useRef<string | null>(null) // Track which track we've already tracked a play for

  const defaultSettings: PlayerSettings = {
    volume: 1,
    isMuted: false,
    isShuffled: false,
    repeatMode: 'off',
    playbackRate: 1,
    crossfadeDuration: 0,
    eqPreset: 'flat',
    bufferSize: 'auto',
    streamQuality: 'auto',
    prioritizeBackgroundPlayback: true,
  }

  const loadSettings = (): PlayerSettings => {
    if (typeof window === 'undefined') return defaultSettings
    const saved = localStorage.getItem('musicPlayerSettings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return { ...defaultSettings, ...parsed }
      } catch {
        return defaultSettings
      }
    }
    return defaultSettings
  }

  const [settings, setSettings] = useState<PlayerSettings>(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const teardownWebAudioOutput = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect()
    } catch {
      // noop
    }
    sourceNodeRef.current = null
    try {
      analyserRef.current?.disconnect()
    } catch {
      // noop
    }
    analyserRef.current = null
    frequencyDataArrayRef.current = null
    timeDataArrayRef.current = null
    previousSpectrumRef.current = null
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    setAudioContextReady(false)
  }, [])

  const prioritizeBackgroundPlaybackRef = useRef<boolean | null>(null)

  // Mobile: switching back to background-safe output tears down Web Audio and reloads the media element.
  useEffect(() => {
    const mobile = prefersMediaElementBackgroundPlayback()
    const prev = prioritizeBackgroundPlaybackRef.current
    const next = settings.prioritizeBackgroundPlayback
    if (prev === null) {
      prioritizeBackgroundPlaybackRef.current = next
      return
    }
    prioritizeBackgroundPlaybackRef.current = next

    if (!mobile || !next || prev) return
    if (!sourceNodeRef.current && !audioContextRef.current) return

    const audio = audioRef.current
    const url = resolvedUrl
    if (!audio || !url) {
      teardownWebAudioOutput()
      return
    }

    const t = audio.currentTime
    const wasPlaying = !audio.paused
    teardownWebAudioOutput()
    audio.pause()
    audio.src = url
    audio.load()

    const onLoaded = () => {
      audio.removeEventListener('loadeddata', onLoaded)
      try {
        audio.currentTime = t
      } catch {
        // noop
      }
      if (wasPlaying) {
        void audio.play().catch(() => {})
      }
    }
    audio.addEventListener('loadeddata', onLoaded)
  }, [settings.prioritizeBackgroundPlayback, resolvedUrl, teardownWebAudioOutput])

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings: Partial<PlayerSettings>) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem('musicPlayerSettings', JSON.stringify(updated))
    }
  }, [settings])

  // Helper function to get energy in a frequency band
  const getBandEnergy = useCallback((frequencyData: Float32Array, lowFreq: number, highFreq: number, sampleRate: number): number => {
    const nyquist = sampleRate / 2
    const binSize = nyquist / frequencyData.length
    const lowBin = Math.floor(lowFreq / binSize)
    const highBin = Math.floor(highFreq / binSize)
    let energy = 0
    
    for (let i = lowBin; i <= highBin && i < frequencyData.length; i++) {
      energy += Math.abs(frequencyData[i])
    }
    
    return energy / Math.max(1, highBin - lowBin + 1)
  }, [])

  // Helper function to calculate energy in time domain
  const calculateEnergy = useCallback((timeData: Float32Array, start: number, length: number): number => {
    let energy = 0
    const end = Math.min(start + length, timeData.length)
    
    for (let i = start; i < end; i++) {
      energy += timeData[i] * timeData[i]
    }
    
    return Math.sqrt(energy / (end - start))
  }, [])

  // Keep ref in sync with onQueueChange
  useEffect(() => {
    onQueueChangeRef.current = onQueueChange
  }, [onQueueChange])

  // Fetch waveform from Supabase API
  const fetchWaveformFromSupabase = useCallback(async (filePath: string): Promise<number[] | null> => {
    try {
      // Extract local path from Supabase URL if needed
      let localPath = filePath
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // Extract path from Supabase Storage URL
        const match = filePath.match(/\/storage\/v1\/object\/public\/audio-files\/(.+)$/)
        if (match) {
          localPath = decodeURIComponent(match[1])
        }
      }
      
      const response = await fetch(`/api/audio/waveform?path=${encodeURIComponent(localPath)}`)
      if (!response.ok) {
        if (response.status === 404) {
          // Track not found or no waveform - this is OK, we'll generate
          return null
        }
        // For 500 errors, log but don't show to user - will fallback to generating
        if (response.status === 500) {
          const errorData = await response.json().catch(() => ({}))
          if (process.env.NODE_ENV === 'development') {
            console.warn('Waveform API error (will generate from audio):', errorData.error || 'Server error')
          }
          return null
        }
        return null
      }
      
      const data = await response.json()
      if (data.waveform_data && Array.isArray(data.waveform_data) && data.waveform_data.length > 0) {
        // Silently return waveform data
        return data.waveform_data
      }
      
      return null
    } catch (error) {
      // Silently fail - will generate from audio
      return null
    }
  }, [])

  // Fetch BPM from Supabase API
  const fetchBPMFromSupabase = useCallback(async (filePath: string): Promise<number | null> => {
    try {
      // Extract local path from Supabase URL if needed
      let localPath = filePath
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // Extract path from Supabase Storage URL
        const match = filePath.match(/\/storage\/v1\/object\/public\/audio-files\/(.+)$/)
        if (match) {
          localPath = decodeURIComponent(match[1])
        }
      }
      
      const response = await fetch(`/api/audio/bpm?path=${encodeURIComponent(localPath)}`)
      if (!response.ok) {
        // Silently handle 404s and other errors - we'll try other methods
        return null
      }
      
      const data = await response.json()
      if (data.bpm && typeof data.bpm === 'number' && data.bpm > 0) {
        // Silently return BPM
        return data.bpm
      }
      
      return null
    } catch (error) {
      // Silently fail - will try other methods
      return null
    }
  }, [])

  // Generate waveform from track data when track changes
  // Priority: 1) waveform_data from track, 2) fetch from Supabase, 3) generate from audio file, 4) default fallback
  // Create stable track key for dependencies (always a string, never undefined)
  const trackKey = currentTrack ? `${currentTrack.id}-${currentTrack.file}` : null
  const trackWaveformData = currentTrack?.waveform_data
  
  useEffect(() => {
    if (!currentTrack || !resolvedUrl) {
      setPrecomputedPeaks(null)
      setWaveformData([])
      processedWaveformTrackRef.current = null
      return
    }
    
    // Check if we've already processed this track
    if (processedWaveformTrackRef.current === trackKey) {
      // Already processed this track, skip
      return
    }
    
    // Mark this track as being processed
    processedWaveformTrackRef.current = trackKey
    
    // Capture current queue at effect time (not as dependency)
    const currentQueue = queue
    
    // Helper to convert peak array to waveform display format
    const convertPeaksToWaveform = (peaks: number[]): { positive: number; negative: number; color: string }[] => {
      if (!peaks || peaks.length === 0) return []
      
      const data: { positive: number; negative: number; color: string }[] = []
      const maxPeak = Math.max(...peaks, 0.01)
      
      for (let i = 0; i < peaks.length; i++) {
        const normalized = peaks[i] / maxPeak
        const positive = Math.max(0.1, Math.min(0.95, 0.3 + normalized * 0.65))
        const negative = Math.max(0.1, Math.min(0.95, 0.2 + normalized * 0.5))
        
        const position = i / peaks.length
        const r = Math.floor(255 * (1 - position))
        const g = Math.floor(255 * position)
        const b = Math.floor(128 + 127 * position)
        
        data.push({
          positive,
          negative,
          color: `rgb(${r}, ${g}, ${b})`
        })
      }
      
      return data
    }
    
    // Helper to generate default waveform (only as last resort)
    const generateDefaultWaveform = () => {
      const bars = 2000
      const data: { positive: number; negative: number; color: string }[] = []
      
      for (let i = 0; i < bars; i++) {
        const position = i / bars
        const baseHeight = 0.3 + Math.sin(position * Math.PI * 12) * 0.15 + Math.sin(position * Math.PI * 24) * 0.08
        const positive = Math.max(0.1, Math.min(0.95, baseHeight))
        const negative = Math.max(0.1, Math.min(0.95, baseHeight * 0.7))
        
        const r = Math.floor(255 * (1 - position))
        const g = Math.floor(255 * position)
        const b = Math.floor(128 + 127 * position)
        
        data.push({
          positive,
          negative,
          color: `rgb(${r}, ${g}, ${b})`
        })
      }
      
      return data
    }
    
    // Priority 1: Use waveform_data from track if available
    if (trackWaveformData && Array.isArray(trackWaveformData) && trackWaveformData.length > 0) {
      const waveform = convertPeaksToWaveform(trackWaveformData)
      setPrecomputedPeaks(trackWaveformData)
      setWaveformData(waveform)
      return
    }
    
    // Priority 2: Fetch from Supabase database
    fetchWaveformFromSupabase(currentTrack.file)
      .then(waveformPeaks => {
        if (waveformPeaks && waveformPeaks.length > 0) {
          const waveform = convertPeaksToWaveform(waveformPeaks)
          setPrecomputedPeaks(waveformPeaks)
          setWaveformData(waveform)
          
          // Update the track in context with waveform_data for future use (only once per track)
          if (onQueueChangeRef.current && currentTrack && !updatedQueueTrackRef.current.has(currentTrack.id)) {
            updatedQueueTrackRef.current.add(currentTrack.id)
            // Use a small delay to avoid immediate re-render issues
            setTimeout(() => {
              if (onQueueChangeRef.current) {
                const updatedTrack = { ...currentTrack, waveform_data: waveformPeaks }
                // Use captured queue from effect time
                const updatedQueue = currentQueue.map(t => t.id === currentTrack.id ? updatedTrack : t)
                onQueueChangeRef.current(updatedQueue)
              }
            }, 0)
          }
        } else {
          // No waveform in Supabase - generate from audio file
          generatePeakData(resolvedUrl, 2000)
            .then(peakData => {
              if (!peakData || !peakData.data || peakData.data.length === 0) {
                throw new Error('Invalid peak data')
              }
              
              setPrecomputedPeaks(peakData.data)
              const waveform = convertPeaksToWaveform(peakData.data)
              
              if (waveform.length > 0) {
                setWaveformData(waveform)
              }
            })
            .catch(err => {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to generate peaks from audio, using default waveform:', err)
              }
              // Only show default as last resort
              setWaveformData(generateDefaultWaveform())
            })
        }
      })
      .catch(err => {
        console.error('Error fetching waveform from Supabase:', err)
        // Fallback to generating from audio
        generatePeakData(resolvedUrl, 2000)
          .then(peakData => {
            if (peakData?.data?.length > 0) {
              setPrecomputedPeaks(peakData.data)
              const waveform = convertPeaksToWaveform(peakData.data)
              if (waveform.length > 0) {
                setWaveformData(waveform)
              } else {
                setWaveformData(generateDefaultWaveform())
              }
            } else {
              setWaveformData(generateDefaultWaveform())
            }
          })
          .catch(() => {
            // Last resort: default waveform
            setWaveformData(generateDefaultWaveform())
          })
      })
  }, [trackKey, trackWaveformData, resolvedUrl, fetchWaveformFromSupabase])

  // Ultra high-definition real-time waveform analysis with transient detection
  // Helper function for better color interpolation (RGB to RGB with gamma correction)
  const interpolateColor = useCallback((color1: string, color2: string, factor: number): string => {
    const parseRgb = (rgb: string): [number, number, number] => {
      const match = rgb.match(/\d+/g)
      if (match && match.length >= 3) {
        return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])]
      }
      return [255, 255, 255]
    }
    
    const [r1, g1, b1] = parseRgb(color1)
    const [r2, g2, b2] = parseRgb(color2)
    
    // Gamma-corrected interpolation for smoother color transitions
    const gamma = 2.2
    const r1g = Math.pow(r1 / 255, gamma)
    const g1g = Math.pow(g1 / 255, gamma)
    const b1g = Math.pow(b1 / 255, gamma)
    const r2g = Math.pow(r2 / 255, gamma)
    const g2g = Math.pow(g2 / 255, gamma)
    const b2g = Math.pow(b2 / 255, gamma)
    
    const r = Math.pow(r1g + (r2g - r1g) * factor, 1 / gamma) * 255
    const g = Math.pow(g1g + (g2g - g1g) * factor, 1 / gamma) * 255
    const b = Math.pow(b1g + (b2g - b1g) * factor, 1 / gamma) * 255
    
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
  }, [])

  // Only run when player is expanded, visible, and playing
  // Preserves initial waveform when conditions aren't met
  useEffect(() => {
    if (!analyserRef.current || !frequencyDataArrayRef.current || !timeDataArrayRef.current) {
      return
    }
    
    // Don't run waveform updates if player is minimized, not expanded, not playing, or not visible
    // But preserve the initial waveform - don't clear it
    if (isMiniMode || !isExpanded || !isPlaying || !isVisible) {
      // Cancel any ongoing animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      // Don't clear waveform - keep the initial waveform visible
      return
    }
    
    // Peak detection for transients (kicks, claps, hats)
    let previousPeaks: number[] = []
    let envelopeFollower: number[] = []
    let lastUpdateTime = 0
    // Exponential smoothing - stores previous smoothed waveform for better interpolation
    let previousSmoothedWaveform: Array<{ positive: number; negative: number; color: string; elementType?: 'kick' | 'snare' | 'hihat' | 'other'; elementConfidence?: number }> | null = null
    const smoothingFactor = 0.3 // 0-1, lower = more smoothing (slower response)
    
    const updateWaveform = (currentTime: number = performance.now()) => {
      // Check conditions again in case they changed
      if (!analyserRef.current || !frequencyDataArrayRef.current || !timeDataArrayRef.current || isMiniMode || !isExpanded || !isPlaying || !isVisible) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        return
      }
      
      // Apply speed adjustment - throttle updates based on speed
      // Slower default update rate for better visibility
      const speedMultiplier = waveformSpeed
      const baseFrameRate = 30 // Reduced from 60 to 30 FPS for slower movement
      const targetFrameRate = baseFrameRate * speedMultiplier
      const minFrameInterval = 1000 / targetFrameRate // Minimum milliseconds between updates
      
      const timeSinceLastUpdate = currentTime - lastUpdateTime
      if (timeSinceLastUpdate < minFrameInterval) {
        // Skip this frame if not enough time has passed
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
        return
      }
      
      lastUpdateTime = currentTime
      
      // Get both time-domain (waveform shape) and frequency-domain (colors) data using Float32Array for precision
      if (timeDataArrayRef.current && frequencyDataArrayRef.current) {
        // TypeScript workaround for Float32Array generic type compatibility
        analyserRef.current.getFloatTimeDomainData(timeDataArrayRef.current as any)
        analyserRef.current.getFloatFrequencyData(frequencyDataArrayRef.current as any)
      }
      
      const baseBars = 200 // Sufficient resolution for visual fidelity without excessive React re-renders
      const bars = Math.max(8, Math.floor(baseBars * waveformHorizontalZoom))
      const timeData = timeDataArrayRef.current
      const frequencyData = frequencyDataArrayRef.current
      const previousSpectrum = previousSpectrumRef.current
      const timeDataLength = timeData.length
      const frequencyDataLength = frequencyData.length
      const data: Array<{ positive: number; negative: number; color: string; elementType?: 'kick' | 'snare' | 'hihat' | 'other'; elementConfidence?: number }> = []
      
      // Get audio context for sample rate
      const audioContext = audioContextRef.current
      const sampleRate = audioContext?.sampleRate || 44100
      const nyquist = sampleRate / 2
      
      // Update previous spectrum for next frame
      if (previousSpectrumRef.current) {
        previousSpectrumRef.current.set(frequencyData)
      }
      
      // Calculate RMS and peak values for transient detection
      const samplesPerBar = Math.ceil(timeDataLength / bars)
      const currentPeaks: number[] = []
      const currentEnvelope: number[] = []
      let previousEnergy = 0
      
      // Analyze frequency bands using utility function
      const frequencyBands = analyzeFrequencyBands(frequencyData, sampleRate)
      const kicksEnergy = frequencyBands.kicks
      const snaresEnergy = frequencyBands.snares
      const hihatsEnergy = frequencyBands.hihats
      const cymbalsEnergy = frequencyBands.cymbals
      
      // Detect transients using utility function
      const transientInfo = detectTransients(
        frequencyData,
        previousSpectrum,
        timeData
      )
      
      // Process waveform data with ultra high resolution and accurate transient detection
      for (let i = 0; i < bars; i++) {
        const position = i / bars // 0 to 1
        
        // Get samples for this bar
        const startSample = Math.floor(i * samplesPerBar)
        const endSample = Math.min(startSample + samplesPerBar, timeDataLength)
        
        // Calculate peak and RMS for this segment using Float32Array (values are -1 to 1)
        let peak = 0
        let rms = 0
        let sampleCount = 0
        
        for (let j = startSample; j < endSample; j++) {
          const sample = Math.abs(timeData[j]) // Already -1 to 1 range
          peak = Math.max(peak, sample)
          rms += sample * sample
          sampleCount++
        }
        
        rms = Math.sqrt(rms / sampleCount) // RMS value
        
        // Calculate energy change for transient detection
        const currentEnergy = calculateEnergy(timeData, startSample, samplesPerBar)
        const energyChange = currentEnergy - previousEnergy
        previousEnergy = currentEnergy
        
        // Enhanced envelope following with adaptive smoothing based on content
        const isHighEnergy = peak > 0.7 || rms > 0.5
        const attackTime = isHighEnergy ? 0.002 : 0.001 // Slower attack for high energy
        const releaseTime = isHighEnergy ? 0.2 : 0.15 // Slower release for high energy content
        const previousEnvelope = envelopeFollower[i] || 0
        
        let envelope = previousEnvelope
        if (peak > previousEnvelope) {
          // Attack phase (transient detected) - adaptive smoothing
          const attackRate = attackTime * 30
          envelope = previousEnvelope + (peak - previousEnvelope) * attackRate
        } else {
          // Release phase - adaptive smoothing for smoother movement
          const releaseRate = releaseTime * 30
          envelope = previousEnvelope + (peak - previousEnvelope) * releaseRate
        }
        envelopeFollower[i] = envelope
        
        // Improved transient detection using multiple factors
        const transientRatio = peak / (rms + 0.001) // Ratio indicates transient
        const hasEnergyChange = transientInfo.energyChange > 0.2 // Significant energy increase
        const hasSpectralFlux = transientInfo.spectralFlux > 0.15 // Spectral flux indicates onset
        const isTransient = transientRatio > 1.8 && (hasEnergyChange || hasSpectralFlux || transientInfo.isTransient)
        
        // Determine element type based on frequency band analysis
        const totalEnergy = kicksEnergy + snaresEnergy + hihatsEnergy + cymbalsEnergy
        let elementType: 'kick' | 'snare' | 'hihat' | 'other' = 'other'
        let elementConfidence = 0
        
        if (totalEnergy > 0) {
          if (kicksEnergy > snaresEnergy && kicksEnergy > hihatsEnergy && kicksEnergy > cymbalsEnergy) {
            elementType = 'kick'
            elementConfidence = kicksEnergy / totalEnergy
          } else if (snaresEnergy > hihatsEnergy && snaresEnergy > cymbalsEnergy) {
            elementType = 'snare'
            elementConfidence = snaresEnergy / totalEnergy
          } else if (hihatsEnergy > cymbalsEnergy) {
            elementType = 'hihat'
            elementConfidence = hihatsEnergy / totalEnergy
          }
        }
        
        // Combine peak and RMS, emphasizing transients - enhanced for more contrast
        const amplitude = isTransient 
          ? peak * 0.9 + rms * 0.1 // Even stronger emphasis on peak for transients
          : peak * 0.2 + rms * 0.8 // Emphasize RMS for sustained sounds
        
        // Boost amplitude significantly for detected transients to show more contrast
        const boostedAmplitude = isTransient && elementConfidence > 0.3
          ? amplitude * 1.5 // Increase contrast by 50% for transients
          : amplitude
        
        // Calculate positive and negative amplitudes with enhanced contrast
        // Expanded range: 0.15 to 0.98 (from 0.1 to 0.98)
        const positive = Math.max(0.15, Math.min(0.98, 0.2 + boostedAmplitude * 0.78))
        const negative = Math.max(0.15, Math.min(0.98, 0.2 + boostedAmplitude * 0.78))
        
        // Use frequency data for color mapping with logarithmic distribution
        const freqIndex = Math.floor(Math.pow(position, 1.5) * frequencyDataLength)
        const energy = Math.abs(frequencyData[Math.min(freqIndex, frequencyDataLength - 1)]) || 0
        const normalizedEnergy = Math.min(1, energy) // Float32Array values are already normalized
        
        // Map frequency to color based on actual frequency bands and detected element type
        const frequency = (freqIndex / frequencyDataLength) * nyquist
        
        let r, g, b
        
        // Use detected element type to override color if confidence is high enough
        // Lowered threshold from 0.5 to 0.3 for more color coding
        if (isTransient && elementConfidence > 0.3) {
          switch (elementType) {
            case 'kick':
              // Kicks: Red - vibrant red
              r = 255
              g = Math.floor(50 + elementConfidence * 50) // Slight variation
              b = Math.floor(30 + elementConfidence * 30)
              break
            case 'snare':
              // Snares/Claps: Green - vibrant green
              r = Math.floor(50 + elementConfidence * 50)
              g = 255
              b = Math.floor(50 + elementConfidence * 50)
              break
            case 'hihat':
              // Hi-hats: Blue/Teal - vibrant cyan/teal
              r = Math.floor(30 + elementConfidence * 30)
              g = Math.floor(200 + elementConfidence * 55)
              b = 255
              break
            default:
              // Fall back to frequency-based coloring
              if (frequency < 60) {
                r = 255
                g = Math.floor(100 + (frequency / 60) * 50)
                b = 0
              } else if (frequency < 250) {
                const t = (frequency - 60) / 190
                r = 255
                g = Math.floor(150 + t * 105)
                b = 0
              } else if (frequency < 500) {
                const t = (frequency - 250) / 250
                r = Math.floor(255 * (1 - t))
                g = 255
                b = 0
              } else if (frequency < 2000) {
                const t = (frequency - 500) / 1500
                r = 0
                g = 255
                b = Math.floor(255 * t)
              } else if (frequency < 4000) {
                const t = (frequency - 2000) / 2000
                r = 0
                g = Math.floor(255 * (1 - t))
                b = 255
              } else if (frequency < 6000) {
                r = 0
                g = 0
                b = 255
              } else {
                const t = Math.min(1, (frequency - 6000) / 14000)
                r = Math.floor(128 * t)
                g = 0
                b = 255
              }
          }
        } else {
          // Frequency-based coloring for non-transients or low confidence
          if (frequency < 60) {
            r = 255
            g = Math.floor(100 + (frequency / 60) * 50)
            b = 0
          } else if (frequency < 250) {
            const t = (frequency - 60) / 190
            r = 255
            g = Math.floor(150 + t * 105)
            b = 0
          } else if (frequency < 500) {
            const t = (frequency - 250) / 250
            r = Math.floor(255 * (1 - t))
            g = 255
            b = 0
          } else if (frequency < 2000) {
            const t = (frequency - 500) / 1500
            r = 0
            g = 255
            b = Math.floor(255 * t)
          } else if (frequency < 4000) {
            const t = (frequency - 2000) / 2000
            r = 0
            g = Math.floor(255 * (1 - t))
            b = 255
          } else if (frequency < 6000) {
            r = 0
            g = 0
            b = 255
          } else {
            const t = Math.min(1, (frequency - 6000) / 14000)
            r = Math.floor(128 * t)
            g = 0
            b = 255
          }
        }
        
        // Enhance color intensity based on energy, transient detection, and element confidence
        const baseIntensity = Math.min(1, normalizedEnergy * 2)
        let intensity = baseIntensity
        
        if (isTransient) {
          // Much brighter for transients - increase visibility
          intensity = Math.min(1, baseIntensity * 1.8)
          if (elementConfidence > 0.5) {
            intensity = Math.min(1, intensity * 1.3) // Even brighter for high confidence
          }
        }
        
        // Apply intensity to colors
        r = Math.floor(r * intensity)
        g = Math.floor(g * intensity)
        b = Math.floor(b * intensity)
        
        // Ensure minimum visibility
        r = Math.max(50, r)
        g = Math.max(50, g)
        b = Math.max(50, b)
        
        data.push({
          positive,
          negative,
          color: `rgb(${r}, ${g}, ${b})`,
          elementType,
          elementConfidence
        })
        
        currentPeaks.push(peak)
      }
      
      previousPeaks = currentPeaks
      // Only update waveform if we have valid data and conditions are still met
      if (data.length > 0 && !isMiniMode && isExpanded && isPlaying && isVisible) {
        // Use exponential smoothing for better visual quality and smoother movement
        let smoothedData: Array<{ positive: number; negative: number; color: string; elementType?: 'kick' | 'snare' | 'hihat' | 'other'; elementConfidence?: number }>
        
        if (previousSmoothedWaveform && previousSmoothedWaveform.length === data.length) {
          // Exponential smoothing: blend current frame with previous smoothed frame
          smoothedData = data.map((current, index) => {
            const previous = previousSmoothedWaveform![index]
            
            // Smooth amplitude values
            const smoothedPositive = previous.positive + (current.positive - previous.positive) * (1 - smoothingFactor)
            const smoothedNegative = previous.negative + (current.negative - previous.negative) * (1 - smoothingFactor)
            
            // Smooth colors with gamma-corrected interpolation for better visual quality
            let smoothedColor: string
            try {
              smoothedColor = interpolateColor(previous.color, current.color, smoothingFactor)
            } catch (e) {
              // Fallback if color interpolation fails
              smoothedColor = current.color
            }
            
            return {
              positive: smoothedPositive,
              negative: smoothedNegative,
              color: smoothedColor,
              elementType: current.elementType || previous.elementType,
              elementConfidence: current.elementConfidence || previous.elementConfidence
            }
          })
        } else {
          // First frame or length mismatch - use current data
          smoothedData = data
        }
        
        previousSmoothedWaveform = smoothedData
        setWaveformData(smoothedData)
      }
      animationFrameRef.current = requestAnimationFrame(updateWaveform)
    }
    
    updateWaveform()
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [getBandEnergy, calculateEnergy, isMiniMode, isExpanded, isPlaying, isVisible, currentTrack?.id, waveformSpeed, waveformHorizontalZoom])

  // Intersection Observer to detect when player is visible
  useEffect(() => {
    if (!playerRef.current || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true) // Default to visible if observer not supported
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting)
        })
      },
      {
        threshold: 0.1, // Trigger when 10% visible
        rootMargin: '0px',
      }
    )

    observer.observe(playerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  // Detect network quality
  useEffect(() => {
    if (typeof window === 'undefined' || !('connection' in navigator)) return

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    
    if (connection) {
      const updateConnection = () => {
        const effectiveType = connection.effectiveType || '4g'
        setNetworkEffectiveType(effectiveType)
        
        // Map to quality levels
        if (effectiveType === 'slow-2g' || effectiveType === '2g') {
          setConnectionQuality('slow')
        } else if (effectiveType === '3g') {
          setConnectionQuality('medium')
        } else {
          setConnectionQuality('fast')
        }
      }
      
      updateConnection()
      connection.addEventListener('change', updateConnection)
      
      return () => {
        connection.removeEventListener('change', updateConnection)
      }
    }
  }, [])

  // The current track should always buffer aggressively.
  // On slow connections with small buffer settings, use 'metadata' to avoid
  // wasting bandwidth, otherwise 'auto' lets the browser stream-ahead fully.
  const getPreloadStrategy = useCallback((): 'none' | 'metadata' | 'auto' => {
    if (connectionQuality === 'slow' && settings.bufferSize === 'small') {
      return 'metadata'
    }
    return 'auto'
  }, [settings.bufferSize, connectionQuality])

  // Store original queue when shuffle is enabled
  useEffect(() => {
    if (!settings.isShuffled && queue.length > 0) {
      setOriginalQueue([...queue])
    }
  }, [queue, settings.isShuffled])

  // Resolve audio URL when track changes
  useEffect(() => {
    if (!currentTrack) {
      setResolvedUrl(null)
      setIsLoading(false)
      setError(null)
      return
    }

    // Check cache first
    const cached = resolvedUrlCacheRef.current.get(currentTrack.file)
    if (cached) {
      setResolvedUrl(cached)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    setRetryCount(0)
    loggedErrorsRef.current.clear()

    resolveAudioUrl(currentTrack.file).then(url => {
      setResolvedUrl(url)
      setIsLoading(false)
      resolvedUrlCacheRef.current.set(currentTrack.file, url)
    }).catch(err => {
      console.error('Failed to resolve audio URL:', err)
      setResolvedUrl(currentTrack.file)
      setIsLoading(false)
    })
  }, [currentTrack])

  // Batch resolve URLs for next tracks in queue
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id)
    if (currentIndex === -1) return
    
    const nextTracks = queue.slice(currentIndex + 1, currentIndex + 6)
    const tracksToResolve = nextTracks
      .map(track => track.file)
      .filter(file => file && !resolvedUrlCacheRef.current.has(file))
    
    if (tracksToResolve.length > 0) {
      Promise.all(tracksToResolve.map(file => resolveAudioUrl(file)))
        .then(urls => {
          tracksToResolve.forEach((file, idx) => {
            if (urls[idx]) {
              resolvedUrlCacheRef.current.set(file, urls[idx])
            }
          })
        })
        .catch(err => {
          console.debug('Failed to batch resolve URLs:', err)
        })
    }
  }, [currentTrack, queue])

  // Preload next track for seamless playback - SAFE ADDITION
  useEffect(() => {
    if (!currentTrack || !queue.length || !nextAudioRef.current) return
    
    // Find current index in queue
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id)
    if (currentIndex === -1) return
    
    const nextIndex = currentIndex + 1
    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex]
      // Preload next track in background
      resolveAudioUrl(nextTrack.file)
        .then(url => {
          if (nextAudioRef.current && url) {
            nextAudioRef.current.src = url
            nextAudioRef.current.preload = 'auto' // Preload next track
          }
        })
        .catch(err => {
          // Silently fail - this is just optimization
          console.debug('Failed to preload next track:', err)
        })
    } else {
      // Clear next audio if no next track
      if (nextAudioRef.current) {
        nextAudioRef.current.src = ''
        nextAudioRef.current.preload = 'none'
      }
    }
  }, [currentTrack, queue]) // Safe: Only depends on track/queue changes

  // Preload next tracks in queue using Service Worker
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    
    // Find current index in queue
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id)
    if (currentIndex === -1) return
    
    // Increase from 2-3 to 5 tracks for preloading
    const tracksToPreload = queue
      .slice(currentIndex + 1, currentIndex + 6) // Changed from +4 to +6
      .map(track => track.file)
      .filter(Boolean)
    
    if (tracksToPreload.length > 0) {
      // Resolve all URLs first (use cache if available)
      const cache = resolvedUrlCacheRef.current
      const urlsToResolve = tracksToPreload.filter(file => !cache.has(file))
      const cachedUrls = tracksToPreload
        .filter(file => cache.has(file))
        .map(file => cache.get(file)!)
      
      if (urlsToResolve.length > 0) {
        Promise.all(urlsToResolve.map(file => resolveAudioUrl(file)))
          .then(urls => {
            urlsToResolve.forEach((file, idx) => {
              if (urls[idx]) {
                resolvedUrlCacheRef.current.set(file, urls[idx])
              }
            })
            const allUrls = [...cachedUrls, ...urls.filter(Boolean)]
            preloadTracks(allUrls as string[])
          })
          .catch(err => {
            console.debug('Failed to preload tracks via service worker:', err)
          })
      } else if (cachedUrls.length > 0) {
        preloadTracks(cachedUrls as string[])
      }
    }
  }, [currentTrack, queue])

  // Setup audio analysis - must be accessible from both useEffect and togglePlay
  // This should only be called after user interaction (e.g., when playing)
  const setupAudioAnalysis = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (
      prefersMediaElementBackgroundPlayback() &&
      settingsRef.current.prioritizeBackgroundPlayback
    ) {
      return
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      
      const audioContext = audioContextRef.current
      
      // Resume AudioContext if suspended (required after user interaction)
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume()
        } catch (resumeError: any) {
          // If resume fails, it's likely because we're not in a user gesture context
          // This is okay - it will be resumed when user actually plays
          if (resumeError.name !== 'InvalidStateError') {
            if (process.env.NODE_ENV === 'development') {
              console.warn('AudioContext resume failed (will retry on play):', resumeError)
            }
          }
          return // Exit early if we can't resume
        }
      }
      
      // Only create source node if it doesn't exist
      // You can only create one MediaElementSourceNode per audio element
      if (!sourceNodeRef.current) {
        try {
          const source = audioContext.createMediaElementSource(audio)
          sourceNodeRef.current = source
        } catch (error: any) {
          // If source already exists, the audio element was already connected
          // This is okay - we'll reuse the existing connections
          if (error.name !== 'InvalidStateError') {
            throw error
          }
        }
      }
      
      // Disconnect existing analyser connections
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect()
        } catch (e) {
          // Already disconnected
        }
      }
      
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 8192 // 4096 frequency bins (~5.4 Hz/bin at 44.1kHz) — sufficient for transient detection
      analyser.smoothingTimeConstant = 0
      
      // Connect source to analyser (only if source exists)
      if (sourceNodeRef.current) {
        // Disconnect source from any existing connections first
        try {
          sourceNodeRef.current.disconnect()
        } catch (e) {
          // Not connected or already disconnected
        }
        
        sourceNodeRef.current.connect(analyser)
      }
      
      // Connect analyser to destination (for now, EQ will modify this)
      analyser.connect(audioContext.destination)
      
      analyserRef.current = analyser
      frequencyDataArrayRef.current = new Float32Array(analyser.frequencyBinCount)
      timeDataArrayRef.current = new Float32Array(analyser.fftSize)
      previousSpectrumRef.current = new Float32Array(analyser.frequencyBinCount)
      
      // Trigger re-render so EQ component sees the new refs
      setAudioContextReady(true)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error setting up audio analysis:', error)
      }
    }
  }, [])

  // Media Session API for background playback and lock screen controls
  useEffect(() => {
    if (!currentTrack || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    const mediaSession = (navigator as any).mediaSession
    
    // Set metadata for lock screen/notification controls
    mediaSession.metadata = new (window as any).MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || currentTrack.folder || 'SERGIK',
      artwork: buildLockScreenArtwork(currentTrack.artwork),
    })

    // Handle play action from lock screen/notification
    mediaSession.setActionHandler('play', () => {
      if (audioRef.current && !isPlaying) {
        audioRef.current.play().catch(() => {})
        setIsPlaying(true)
      }
    })

    // Handle pause action
    mediaSession.setActionHandler('pause', () => {
      if (audioRef.current && isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      }
    })

    // Handle next track
    mediaSession.setActionHandler('nexttrack', () => {
      if (queue.length > 1) {
        onNext()
      }
    })

    // Handle previous track
    mediaSession.setActionHandler('previoustrack', () => {
      if (queue.length > 1) {
        onPrevious()
      }
    })

    // Handle seek backward
    mediaSession.setActionHandler('seekbackward', (details: any) => {
      if (audioRef.current) {
        const skipTime = details.seekOffset || 10
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - skipTime)
      }
    })

    // Handle seek forward
    mediaSession.setActionHandler('seekforward', (details: any) => {
      if (audioRef.current && duration) {
        const skipTime = details.seekOffset || 10
        audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + skipTime)
      }
    })

    try {
      mediaSession.setActionHandler('seekto', (details: { seekTime?: number } | undefined) => {
        if (
          audioRef.current &&
          duration > 0 &&
          details &&
          typeof details.seekTime === 'number' &&
          Number.isFinite(details.seekTime)
        ) {
          audioRef.current.currentTime = Math.max(0, Math.min(duration, details.seekTime))
        }
      })
    } catch {
      // seekto not supported in this browser
    }

    // Update playback state
    mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    // Update position state for lock screen progress
    const updatePositionState = () => {
      if (audioRef.current && duration > 0 && 'setPositionState' in mediaSession) {
        try {
          mediaSession.setPositionState({
            duration: duration,
            playbackRate: settings.playbackRate,
            position: currentTime
          })
        } catch (e) {
          // Some browsers don't support setPositionState
        }
      }
    }

    // Update position periodically
    const positionInterval = setInterval(updatePositionState, 1000)
    updatePositionState()

    return () => {
      clearInterval(positionInterval)
      if (mediaSession.metadata) {
        mediaSession.metadata = null
      }
      const clear = (action: string) => {
        try {
          mediaSession.setActionHandler(action as MediaSessionAction, null)
        } catch {
          // noop
        }
      }
      clear('play')
      clear('pause')
      clear('nexttrack')
      clear('previoustrack')
      clear('seekbackward')
      clear('seekforward')
      clear('seekto')
    }
  }, [currentTrack, isPlaying, currentTime, duration, settings.playbackRate, queue.length, onNext, onPrevious])

  // If the browser pauses the element when the screen locks, resume when visible again.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const audio = audioRef.current
      if (!audio || !isPlaying) return
      if (audio.paused) {
        audio.play().catch(() => {})
      }
      const ctx = audioContextRef.current
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isPlaying])

  // Audio element setup and event handlers - only when track changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack || !resolvedUrl) return

    const handleError = (e: Event) => {
      const audio = e.target as HTMLAudioElement
      const isDevelopment = process.env.NODE_ENV === 'development'
      
      // Only log error once per URL to reduce console spam
      const errorKey = resolvedUrl || currentTrack?.file || 'unknown'
      const hasLogged = loggedErrorsRef.current.has(errorKey)
      
      // Check for 544 error (Supabase Storage file not found or timeout)
      const is544Error = audio?.error?.code === 2 || // MEDIA_ERR_NETWORK
        (resolvedUrl?.includes('supabase.co') && audio?.networkState === 3) // NO_SOURCE
      
      if (!hasLogged) {
        loggedErrorsRef.current.add(errorKey)
        
        if (isDevelopment) {
          if (is544Error) {
            console.warn(`Audio file not found or timeout (544): ${resolvedUrl}`)
            console.warn('This usually means the file doesn\'t exist in Supabase Storage or the file is too large.')
          } else {
            console.error('Audio loading error:', e)
          }
        }
      }
      
      // Retry mechanism
      if (retryCount < 2) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          
          // In production, only retry Supabase URL (no local fallback)
          if (!isDevelopment) {
            audio.load()
          } else {
            // In development, try local path as fallback
            // In production, never fall back to local paths - only retry Supabase URL
            if (isDevelopment && resolvedUrl && (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) && currentTrack.file !== resolvedUrl) {
              audio.src = currentTrack.file
              audio.load()
            } else if (resolvedUrl === currentTrack.file) {
              audio.load()
            } else if (isDevelopment) {
              // Only in development: fall back to local path
              audio.src = currentTrack.file
              audio.load()
            } else {
              // Production: Don't fall back, just retry Supabase URL
              audio.load()
            }
          }
        }, 500 * (retryCount + 1))
      } else {
        // After retries failed, show appropriate error message
        let errorMsg = ''
        if (is544Error) {
          errorMsg = isDevelopment 
            ? `File not found in Supabase Storage: ${resolvedUrl?.split('/').pop() || 'unknown file'}`
            : 'Audio file not found in Supabase Storage. Please ensure the file is uploaded.'
        } else {
          errorMsg = isDevelopment 
            ? 'Failed to load audio. Please check if the file exists.'
            : 'Failed to load audio from Supabase. Please ensure the file is uploaded to Supabase Storage.'
        }
        setError(errorMsg)
        setIsPlaying(false)
      }
    }

    const handleLoadStart = () => {
      setIsBuffering(true)
      setIsLoading(true)
    }

    const handleCanPlay = () => {
      setIsBuffering(false)
      setIsLoading(false)
      setError(null)
      // Don't setup audio analysis here - wait for user interaction
      // AudioContext will be created when user actually plays audio
    }

    const handleWaiting = () => {
      setIsBuffering(true)
    }

    let stallRecoveryTimer: NodeJS.Timeout | null = null
    const handleStalled = () => {
      if (!isPlaying || audio.paused) return
      // If stalled for 3 seconds, attempt recovery by nudging currentTime
      stallRecoveryTimer = setTimeout(() => {
        if (audio.paused || !isPlaying) return
        const t = audio.currentTime
        audio.load()
        const onReloaded = () => {
          audio.removeEventListener('loadeddata', onReloaded)
          try { audio.currentTime = t } catch {}
          audio.play().catch(() => {})
        }
        audio.addEventListener('loadeddata', onReloaded)
      }, 3000)
    }

    const handlePlaying = () => {
      if (stallRecoveryTimer) {
        clearTimeout(stallRecoveryTimer)
        stallRecoveryTimer = null
      }
      setIsBuffering(false)
      // AudioContext should already be set up from togglePlay, but ensure it's ready
      if (!audioContextRef.current || !sourceNodeRef.current) {
        setupAudioAnalysis().catch(err => {
          // Silently handle errors - AudioContext may not be available yet
          if (err.name !== 'NotAllowedError' && err.name !== 'InvalidStateError') {
            console.error('Failed to setup audio analysis on play:', err)
          }
        })
      }
      
      // Track play event when audio actually starts playing
      // Only track on public frontend routes, NOT admin routes
      if (currentTrack && trackedPlayRef.current !== currentTrack.id && !isAdminRoute) {
        trackedPlayRef.current = currentTrack.id
        trackTrackPlay(currentTrack.id, currentTrack.title)
      }
    }



    // Set preload strategy based on buffer size setting
    audio.preload = getPreloadStrategy()
    
    // Only set src and load when track actually changes
    audio.src = resolvedUrl
    audio.load()
    
    // Reset audio context ready state when track changes
    setAudioContextReady(false)
    
    // Reset tracked play ref when track changes
    trackedPlayRef.current = null
    
    // Throttle time updates to reduce re-renders (update max 10 times per second)
    const updateTime = throttle(() => {
      setCurrentTime(audio.currentTime)
    }, 100)
    
    const updateDuration = () => setDuration(audio.duration)
    const handleEnded = () => {
      if (settings.repeatMode === 'one') {
        audio.currentTime = 0
        audio.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('Audio play failed on repeat:', err)
          }
        })
        return
      }

      // Gapless playback: if nextAudioRef is loaded, start it immediately
      // while the context propagates the track change
      const nextAudio = nextAudioRef.current
      if (nextAudio && nextAudio.src && nextAudio.readyState >= 2) {
        nextAudio.volume = settings.isMuted ? 0 : settings.volume
        nextAudio.playbackRate = settings.playbackRate
        nextAudio.play().catch(() => {})
      }

      onTrackEnd()
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('stalled', handleStalled)
    audio.addEventListener('playing', handlePlaying)

    return () => {
      if (stallRecoveryTimer) clearTimeout(stallRecoveryTimer)
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('stalled', handleStalled)
      audio.removeEventListener('playing', handlePlaying)
    }
  }, [currentTrack, resolvedUrl, retryCount, getPreloadStrategy, setupAudioAnalysis])

  // Track buffering progress and adjust buffer dynamically
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !resolvedUrl) return

    const updateBuffered = () => {
      if (audio.buffered.length > 0 && audio.duration > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1)
        const bufferedPercent = (bufferedEnd / audio.duration) * 100
        setBufferedProgress(bufferedPercent)
        
        // If buffering is low and we're playing, try to increase buffer (auto mode only)
        if (isPlaying && bufferedPercent < 10 && settings.bufferSize === 'auto' && connectionQuality === 'fast') {
          // Switch to auto preload if we're running low
          if (audio.preload !== 'auto') {
            audio.preload = 'auto'
          }
        }
      }
    }

    audio.addEventListener('progress', updateBuffered)
    
    return () => {
      audio.removeEventListener('progress', updateBuffered)
    }
  }, [resolvedUrl, isPlaying, settings.bufferSize, connectionQuality])

  // Update volume and playback rate separately - don't reload audio
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    
    audio.volume = settings.isMuted ? 0 : settings.volume
    audio.playbackRate = settings.playbackRate
  }, [settings.volume, settings.isMuted, settings.playbackRate])

  // Crossfade: overlap current (fade-out) with next (fade-in) using nextAudioRef
  const startCrossfade = useCallback((nextTrack: Track) => {
    if (settings.crossfadeDuration === 0 || !audioRef.current) {
      onNext()
      return
    }

    const currentAudio = audioRef.current
    const nextAudio = nextAudioRef.current
    const userVolume = settings.isMuted ? 0 : settings.volume

    setCrossfadeActive(true)

    // Start the next track at zero volume if it's preloaded
    if (nextAudio && nextAudio.src && nextAudio.readyState >= 2) {
      nextAudio.volume = 0
      nextAudio.playbackRate = settings.playbackRate
      nextAudio.play().catch(() => {})
    }

    const fadeDuration = settings.crossfadeDuration * 1000
    const fadeSteps = 30
    const stepDuration = fadeDuration / fadeSteps
    let step = 0

    fadeIntervalRef.current = setInterval(() => {
      step++
      const progress = step / fadeSteps
      // Equal-power crossfade curve for constant perceived loudness
      const outGain = Math.cos(progress * Math.PI * 0.5)
      const inGain = Math.sin(progress * Math.PI * 0.5)

      currentAudio.volume = outGain * userVolume
      if (nextAudio && !nextAudio.paused) {
        nextAudio.volume = inGain * userVolume
      }

      if (step >= fadeSteps) {
        if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current)
        }
        currentAudio.pause()
        onNext()
        setCrossfadeActive(false)
      }
    }, stepDuration)
  }, [settings.crossfadeDuration, settings.volume, settings.isMuted, settings.playbackRate, onNext])

  // Playback control
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying && !isLoading && !error) {
      audio.play().catch((err) => {
        // Ignore AbortError - it's expected when play() is interrupted by pause()
        if (err.name !== 'AbortError') {
          console.error('Audio play failed:', err)
          setIsPlaying(false)
          setError('Playback failed')
        }
      })
    } else {
      audio.pause()
    }
  }, [isPlaying, isLoading, error])

  // Seek function
  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const newTime = Math.max(0, Math.min(duration, audio.currentTime + seconds))
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  // Touch gestures for mobile
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartXRef.current = e.touches[0].clientX
        touchStartYRef.current = e.touches[0].clientY
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartXRef.current === null || touchStartYRef.current === null || e.touches.length !== 1) return

      const touchX = e.touches[0].clientX
      const touchY = e.touches[0].clientY
      const deltaX = touchX - touchStartXRef.current
      const deltaY = touchY - touchStartYRef.current

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
        e.preventDefault()
        const seekSeconds = Math.floor(deltaX / 5)
        seek(seekSeconds)
        touchStartXRef.current = null
        touchStartYRef.current = null
      }
    }

    const handleTouchEnd = () => {
      touchStartXRef.current = null
      touchStartYRef.current = null
    }

    player.addEventListener('touchstart', handleTouchStart, { passive: false })
    player.addEventListener('touchmove', handleTouchMove, { passive: false })
    player.addEventListener('touchend', handleTouchEnd)

    return () => {
      player.removeEventListener('touchstart', handleTouchStart)
      player.removeEventListener('touchmove', handleTouchMove)
      player.removeEventListener('touchend', handleTouchEnd)
    }
  }, [seek])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (
        (e.target instanceof HTMLInputElement) ||
        (e.target instanceof HTMLTextAreaElement) ||
        (e.target instanceof HTMLButtonElement)
      ) {
        return
      }

      if (!currentTrack) return

      const audio = audioRef.current
      if (!audio) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seek(-10)
          break
        case 'ArrowRight':
          e.preventDefault()
          seek(10)
          break
        case 'ArrowUp':
          e.preventDefault()
          adjustVolume(0.05)
          break
        case 'ArrowDown':
          e.preventDefault()
          adjustVolume(-0.05)
          break
        case 'm':
        case 'M':
          e.preventDefault()
          toggleMute()
          break
        case 's':
        case 'S':
          e.preventDefault()
          toggleShuffle()
          break
        case 'r':
        case 'R':
          e.preventDefault()
          cycleRepeatMode()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentTrack, isPlaying, settings])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      // Setup AudioContext when user clicks play (user interaction required)
      if (!audioContextRef.current || !sourceNodeRef.current) {
        try {
          await setupAudioAnalysis()
        } catch (err: any) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('AudioContext setup failed, continuing without analysis:', err)
          }
          // Continue to play even if AudioContext setup fails
        }
      }
      
      audio.play().catch((err) => {
        // Ignore AbortError - it's expected when play() is interrupted by pause()
        if (err.name !== 'AbortError') {
          console.error('Audio play failed:', err)
          setError('Playback failed')
        }
      })
      setIsPlaying(true)
    }
  }


  const [isSeeking, setIsSeeking] = useState(false)
  
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const newTime = parseFloat(e.target.value)
    // Update immediately for smooth mobile experience
    setCurrentTime(newTime)
    audio.currentTime = newTime
  }
  
  const handleSeekStart = () => {
    setIsSeeking(true)
  }
  
  const handleSeekEnd = () => {
    setIsSeeking(false)
  }

  const adjustVolume = (delta: number) => {
    const newVolume = Math.max(0, Math.min(1, settings.volume + delta))
    saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const toggleMute = () => {
    const newMuted = !settings.isMuted
    saveSettings({ isMuted: newMuted })
    if (audioRef.current) {
      audioRef.current.volume = newMuted ? 0 : settings.volume
    }
  }

  const toggleShuffle = () => {
    if (queue.length <= 1) return

    const newShuffled = !settings.isShuffled
    saveSettings({ isShuffled: newShuffled })

    if (newShuffled) {
      // Shuffle the queue
      const shuffled = [...queue]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      onShuffle?.(shuffled)
      onQueueChange?.(shuffled)
    } else {
      // Restore original queue
      if (originalQueue.length > 0) {
        onShuffle?.(originalQueue)
        onQueueChange?.(originalQueue)
      }
    }
  }

  const cycleRepeatMode = () => {
    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one']
    const currentIndex = modes.indexOf(settings.repeatMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    saveSettings({ repeatMode: nextMode })
  }

  const changePlaybackRate = (rate: number) => {
    saveSettings({ playbackRate: rate })
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleProgressHover = (e: React.MouseEvent<HTMLInputElement>) => {
    if (!progressBarRef.current || !duration) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const time = percentage * duration
    setSeekPreviewTime(time)
  }

  const handleProgressLeave = () => {
    setSeekPreviewTime(null)
  }

  const getCurrentQueueIndex = () => {
    if (!currentTrack) return -1
    return queue.findIndex(t => t.id === currentTrack.id)
  }

  const currentQueueIndex = useMemo(() => getCurrentQueueIndex(), [currentTrack, queue])

  // Fetch all tracks from source when queue opens
  useEffect(() => {
    if (isQueueOpen && getTracksFromSource && currentSource) {
      setIsLoadingSourceTracks(true)
      getTracksFromSource(currentSource)
        .then(tracks => {
          setAllSourceTracks(tracks)
          setIsLoadingSourceTracks(false)
        })
        .catch(error => {
          console.error('Error fetching source tracks:', error)
          setAllSourceTracks([])
          setIsLoadingSourceTracks(false)
        })
    } else if (isQueueOpen && getTracksFromSource && !currentSource) {
      // No source, fetch "All Tracks"
      setIsLoadingSourceTracks(true)
      getTracksFromSource(null)
        .then(tracks => {
          setAllSourceTracks(tracks)
          setIsLoadingSourceTracks(false)
        })
        .catch(error => {
          console.error('Error fetching all tracks:', error)
          setAllSourceTracks([])
          setIsLoadingSourceTracks(false)
        })
    } else if (!isQueueOpen) {
      // Clear when queue closes
      setAllSourceTracks([])
    }
  }, [isQueueOpen, currentSource, getTracksFromSource])

  useEffect(() => {
    if (!autoDJConfig.enabled || autoDJLibrary.length > 0 || !getTracksFromSource) return
    let cancelled = false
    getTracksFromSource(null)
      .then((tracks) => {
        if (!cancelled && tracks.length > 0) {
          setAutoDJLibrary(tracks)
        }
      })
      .catch((error) => {
        console.error('Failed to load Auto DJ library:', error)
      })
    return () => {
      cancelled = true
    }
  }, [autoDJConfig.enabled, autoDJLibrary.length, getTracksFromSource])

  const phraseDuration = useMemo(() => {
    const bpm = detectedBPM || currentTrack?.bpm || 120
    const beatDuration = bpm > 0 ? 60 / bpm : 4
    return beatDuration * autoDJConfig.phraseBars
  }, [autoDJConfig.phraseBars, detectedBPM, currentTrack?.bpm])

  const pickAutoDJTrack = useCallback((): Track | null => {
    const pool = allSourceTracks.length > 0
      ? allSourceTracks
      : autoDJLibrary.length > 0
        ? autoDJLibrary
        : queue
    if (pool.length === 0) return null
    const usedIds = new Set(queue.map((track) => track.id))
    const candidates = pool.filter((track) => track.id !== currentTrack?.id && !usedIds.has(track.id))
    if (candidates.length === 0) {
      return pool.find((track) => track.id !== currentTrack?.id) || null
    }
    return candidates[Math.floor(Math.random() * candidates.length)]
  }, [allSourceTracks, autoDJLibrary, queue, currentTrack])

  // Refs for fast-changing values so Auto DJ interval doesn't churn on every timeupdate
  const autoDJCurrentTimeRef = useRef(currentTime)
  const autoDJDurationRef = useRef(duration)
  const autoDJQueueRef = useRef(queue)
  const autoDJCurrentTrackRef = useRef(currentTrack)
  const autoDJPhraseDurationRef = useRef(phraseDuration)
  autoDJCurrentTimeRef.current = currentTime
  autoDJDurationRef.current = duration
  autoDJQueueRef.current = queue
  autoDJCurrentTrackRef.current = currentTrack
  autoDJPhraseDurationRef.current = phraseDuration

  useEffect(() => {
    if (!autoDJConfig.enabled || !onQueueChange) {
      if (autoDJIntervalRef.current) {
        clearInterval(autoDJIntervalRef.current)
        autoDJIntervalRef.current = null
      }
      autoDJLastAddedRef.current = null
      autoDJPendingRef.current = null
      clearAutoDJCrossfadeTimeout()
      setAutoDJStatusMessage('')
      setAutoDJPendingTrackId(null)
      return
    }

    const tick = () => {
      const ct = autoDJCurrentTimeRef.current
      const dur = autoDJDurationRef.current
      const q = autoDJQueueRef.current
      const track = autoDJCurrentTrackRef.current
      const phrase = autoDJPhraseDurationRef.current

      if (!track || dur <= 0 || autoDJPendingRef.current) return
      const currentIndex = q.findIndex((t) => t.id === track.id)
      const isLastTrack = currentIndex >= q.length - 1
      if (!isLastTrack) return

      const remaining = dur - ct
      if (remaining > phrase * 1.25) return

      const candidate = pickAutoDJTrack()
      if (!candidate || q.some((t) => t.id === candidate.id)) return
      if (autoDJLastAddedRef.current === candidate.id) return

      autoDJLastAddedRef.current = candidate.id
      autoDJPendingRef.current = candidate.id
      setAutoDJPendingTrackId(candidate.id)
      setAutoDJStatusMessage(`Auto DJ queued “${candidate.title}”`)
      onQueueChange([...q, candidate])

      const beatWithinPhrase = ct % phrase
      const transitionLead = autoDJLeadIn > 0 ? autoDJLeadIn : (settings.crossfadeDuration || 0)
      const delaySeconds = autoDJAlignPhase 
        ? Math.max(0, phrase - beatWithinPhrase - transitionLead)
        : Math.max(0, Math.min(dur - ct - transitionLead, phrase - beatWithinPhrase - transitionLead))
      const delayMs = Math.max(0, delaySeconds * 1000)
      clearAutoDJCrossfadeTimeout()
      autoDJCrossfadeTimeoutRef.current = setTimeout(() => {
        if (!autoDJConfig.enabled) return
        const modeLabel = autoDJConfig.transitionMode === 'crossfade' ? 'crossfading' : 
                          autoDJConfig.transitionMode === 'filter-eq' ? 'filtering' : 'cutting'
        setAutoDJStatusMessage(`Auto DJ ${modeLabel} to "${candidate.title}"`)
        setAutoDJPendingTrackId(null)
        
        // Apply transition based on configured mode
        switch (autoDJConfig.transitionMode) {
          case 'crossfade':
            if (settings.crossfadeDuration > 0) {
              startCrossfade(candidate)
            } else {
              onNext()
            }
            break
          case 'filter-eq':
            if (settings.crossfadeDuration > 0) {
              startCrossfade(candidate)
            } else {
              onNext()
            }
            break
          case 'cutout-filter':
            onNext()
            break
          default:
            onNext()
        }
        autoDJPendingRef.current = null
      }, delayMs)
    }

    autoDJIntervalRef.current = setInterval(tick, 500)
    return () => {
      if (autoDJIntervalRef.current) {
        clearInterval(autoDJIntervalRef.current)
        autoDJIntervalRef.current = null
      }
      clearAutoDJCrossfadeTimeout()
    }
  }, [
    autoDJConfig.enabled,
    autoDJConfig.transitionMode,
    autoDJLeadIn,
    autoDJAlignPhase,
    onQueueChange,
    pickAutoDJTrack,
    settings.crossfadeDuration,
    startCrossfade,
    onNext,
    clearAutoDJCrossfadeTimeout
  ])

  const displayTracks = allSourceTracks.length > 0 ? allSourceTracks : queue
  const queueTrackIds = useMemo(() => new Set(queue.map(t => t.id)), [queue])
  const queueIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    queue.forEach((t, i) => m.set(t.id, i))
    return m
  }, [queue])

  // Virtual scrolling for queue - only create when queue is open AND track list is expanded
  const virtualizer = useVirtualizer({
    count: (isQueueOpen && isTrackListExpanded) ? displayTracks.length : 0,
    getScrollElement: () => queueContainerRef.current,
    estimateSize: () => 64, // ~64px per track row
    overscan: 5, // Render 5 extra items for smooth scrolling
  })

  // Safely get virtual items with error handling
  const virtualItems = useMemo(() => {
    if (!isQueueOpen || !isTrackListExpanded || displayTracks.length === 0 || !queueContainerRef.current) {
      return []
    }
    try {
      return virtualizer.getVirtualItems()
    } catch (error) {
      console.error('Error getting virtual items:', error)
      return []
    }
  }, [isQueueOpen, isTrackListExpanded, displayTracks.length, virtualizer])

  // Safely get total size with error handling
  const virtualizerTotalSize = useMemo(() => {
    if (!isQueueOpen || !isTrackListExpanded || displayTracks.length === 0) {
      return 0
    }
    try {
      return virtualizer.getTotalSize()
    } catch (error) {
      console.error('Error getting virtualizer total size:', error)
      return displayTracks.length * 64 // Fallback estimate
    }
  }, [isQueueOpen, isTrackListExpanded, displayTracks.length, virtualizer])

  const handleRemoveFromQueueClick = (index: number) => {
    if (onRemoveFromQueue) {
      onRemoveFromQueue(index)
    } else {
      // Fallback: remove from local queue
      const newQueue = queue.filter((_, i) => i !== index)
      onQueueChange?.(newQueue)
    }
  }

  const playbackRates = PLAYBACK_RATES
  const eqPresets = EQ_PRESETS

  // Extract BPM from multiple sources with improved patterns
  const extractBPM = useCallback((track: Track | null): number | null => {
    if (!track) return null
    
    // 1. Check if track has BPM property
    if (track.bpm && track.bpm > 0) {
      return track.bpm
    }
    
    // 2. Extract from title with multiple patterns
    const titlePatterns = [
      /(\d+)\s*bpm/i,                    // "120bpm" or "120 bpm"
      /(\d+)\s*BPM/i,                    // "120 BPM"
      /bpm[:\s]+(\d+)/i,                 // "BPM: 120" or "BPM 120"
      /\((\d+)\s*bpm\)/i,                // "(120bpm)"
      /\[(\d+)\s*bpm\]/i,                // "[120bpm]"
      /-(\d+)\s*bpm/i,                   // "-120bpm"
      /\s(\d{2,3})\s*bpm/i,              // "Track 120 bpm" (2-3 digits before bpm)
    ]
    
    for (const pattern of titlePatterns) {
      const match = track.title.match(pattern)
      if (match) {
        const bpm = parseInt(match[1], 10)
        // Validate BPM is in reasonable range (30-300 BPM)
        if (bpm >= 30 && bpm <= 300) {
          return bpm
        }
      }
    }
    
    return null
  }, [])

  // Detect BPM from audio file if not found in metadata
  // Priority: 1) Cache, 2) Supabase database (PRIMARY SOURCE - Sonic DNA), 3) Track.bpm property, 4) Extract from title/metadata, 5) Audio analysis
  useEffect(() => {
    if (!currentTrack) {
      setDetectedBPM(null)
      return
    }

    // Check cache first
    if (bpmCacheRef.current) {
      const cachedBPM = bpmCacheRef.current.get(currentTrack.id)
      if (cachedBPM !== undefined) {
        setDetectedBPM(cachedBPM)
        return
      }
    }

    // Priority 1: Fetch from Supabase database (Sonic DNA database) - PRIMARY SOURCE OF TRUTH
    // This ensures we always use the correct BPM from the database, not random/incorrect values
    if (currentTrack.file) {
      // Capture current queue at effect time (not as dependency)
      const currentQueue = queue
      
      fetchBPMFromSupabase(currentTrack.file)
        .then(bpm => {
          if (bpm && bpm > 0) {
            setDetectedBPM(bpm)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, bpm)
            }
            // Update the track in context with BPM for future use
            if (onQueueChangeRef.current && currentTrack && !updatedQueueTrackRef.current.has(currentTrack.id)) {
              updatedQueueTrackRef.current.add(currentTrack.id)
              setTimeout(() => {
                if (onQueueChangeRef.current) {
                  const updatedTrack = { ...currentTrack, bpm: bpm }
                  // Use captured queue from effect time
                  const updatedQueue = currentQueue.map(t => t.id === currentTrack.id ? updatedTrack : t)
                  onQueueChangeRef.current(updatedQueue)
                }
              }, 0)
            }
            return
          }
          
          // If not found in database, try other methods
          // Priority 2: Try track.bpm property (fallback if database doesn't have it)
          if (currentTrack.bpm && currentTrack.bpm > 0) {
            setDetectedBPM(currentTrack.bpm)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, currentTrack.bpm)
            }
            return
          }
          
          // Priority 3: Extract from title/metadata
          const extractedBPM = extractBPM(currentTrack)
          if (extractedBPM) {
            setDetectedBPM(extractedBPM)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, extractedBPM)
            }
            return
          }

          // Priority 4: If not found and we have a resolved URL, try audio analysis (async, don't block)
          if (!resolvedUrl) {
            setDetectedBPM(null)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, null)
            }
            return
          }

          setIsDetectingBPM(true)
          detectBPM(resolvedUrl)
            .then(analyzedBPM => {
              if (analyzedBPM) {
                setDetectedBPM(analyzedBPM)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, analyzedBPM)
                }
              } else {
                setDetectedBPM(null)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, null)
                }
              }
              setIsDetectingBPM(false)
            })
            .catch(() => {
              setDetectedBPM(null)
              if (bpmCacheRef.current) {
                bpmCacheRef.current.set(currentTrack.id, null)
              }
              setIsDetectingBPM(false)
            })
        })
        .catch(() => {
          // Database fetch failed, try other methods
          // Priority 2: Try track.bpm property (fallback if database fetch failed)
          if (currentTrack.bpm && currentTrack.bpm > 0) {
            setDetectedBPM(currentTrack.bpm)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, currentTrack.bpm)
            }
            return
          }
          
          // Priority 3: Extract from title/metadata
          const extractedBPM = extractBPM(currentTrack)
          if (extractedBPM) {
            setDetectedBPM(extractedBPM)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, extractedBPM)
            }
            return
          }

          if (!resolvedUrl) {
            setDetectedBPM(null)
            if (bpmCacheRef.current) {
              bpmCacheRef.current.set(currentTrack.id, null)
            }
            return
          }

          setIsDetectingBPM(true)
          detectBPM(resolvedUrl)
            .then(analyzedBPM => {
              if (analyzedBPM) {
                setDetectedBPM(analyzedBPM)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, analyzedBPM)
                }
              } else {
                setDetectedBPM(null)
                if (bpmCacheRef.current) {
                  bpmCacheRef.current.set(currentTrack.id, null)
                }
              }
              setIsDetectingBPM(false)
            })
            .catch(() => {
              setDetectedBPM(null)
              if (bpmCacheRef.current) {
                bpmCacheRef.current.set(currentTrack.id, null)
              }
              setIsDetectingBPM(false)
            })
        })
      return
    }
    
    // Fallback if no file path: try extract from title/metadata
    const extractedBPM = extractBPM(currentTrack)
    if (extractedBPM) {
      setDetectedBPM(extractedBPM)
      if (bpmCacheRef.current) {
        bpmCacheRef.current.set(currentTrack.id, extractedBPM)
      }
      return
    }

    // Last resort: audio analysis if we have a resolved URL
    if (!resolvedUrl) {
      setDetectedBPM(null)
      if (bpmCacheRef.current) {
        bpmCacheRef.current.set(currentTrack.id, null)
      }
      return
    }

    setIsDetectingBPM(true)
    detectBPM(resolvedUrl)
      .then(bpm => {
        if (bpm) {
          setDetectedBPM(bpm)
          if (bpmCacheRef.current) {
            bpmCacheRef.current.set(currentTrack.id, bpm)
          }
        } else {
          setDetectedBPM(null)
          if (bpmCacheRef.current) {
            bpmCacheRef.current.set(currentTrack.id, null)
          }
        }
        setIsDetectingBPM(false)
      })
      .catch(() => {
        setDetectedBPM(null)
        if (bpmCacheRef.current) {
          bpmCacheRef.current.set(currentTrack.id, null)
        }
        setIsDetectingBPM(false)
      })
  }, [currentTrack, currentTrack?.id, currentTrack?.bpm, currentTrack?.file, resolvedUrl, extractBPM, fetchBPMFromSupabase])

  // Tap Tempo Handler
  const handleTapTempo = useCallback(() => {
    const now = Date.now()
    const newTaps = [...tapTempoTaps, now]
    
    // Keep only last 8 taps
    const recentTaps = newTaps.slice(-8)
    setTapTempoTaps(recentTaps)
    
    // Clear existing timeout
    if (tapTempoTimeoutRef.current) {
      clearTimeout(tapTempoTimeoutRef.current)
    }
    
    // Calculate BPM if we have at least 2 taps
    if (recentTaps.length >= 2) {
      // Calculate intervals between taps
      const intervals: number[] = []
      for (let i = 1; i < recentTaps.length; i++) {
        const interval = (recentTaps[i] - recentTaps[i - 1]) / 1000 // Convert to seconds
        // Only consider reasonable intervals (0.2s to 2.0s = 30-300 BPM)
        if (interval >= 0.2 && interval <= 2.0) {
          intervals.push(interval)
        }
      }
      
      if (intervals.length > 0) {
        // Calculate average interval
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const bpm = Math.round(60 / avgInterval)
        
        // Validate BPM range
        if (bpm >= 30 && bpm <= 300) {
          setTapTempoBPM(bpm)
          // Update detected BPM with tap tempo result
          setDetectedBPM(bpm)
          // Cache it
          if (currentTrack && bpmCacheRef.current) {
            bpmCacheRef.current.set(currentTrack.id, bpm)
          }
        }
      }
    }
    
    // Reset taps after 2 seconds of inactivity
    tapTempoTimeoutRef.current = setTimeout(() => {
      setTapTempoTaps([])
      setTapTempoBPM(null)
    }, 2000)
  }, [tapTempoTaps, currentTrack])
  
  // Cleanup tap tempo timeout on unmount
  useEffect(() => {
    return () => {
      if (tapTempoTimeoutRef.current) {
        clearTimeout(tapTempoTimeoutRef.current)
      }
    }
  }, [])

  // Cleanup volume hover timeout on unmount
  useEffect(() => {
    return () => {
      if (volumeHoverTimeoutRef.current) {
        clearTimeout(volumeHoverTimeoutRef.current)
        volumeHoverTimeoutRef.current = null
      }
    }
  }, [])
  
  // Reset tap tempo when track changes
  useEffect(() => {
    setTapTempoTaps([])
    setTapTempoBPM(null)
    if (tapTempoTimeoutRef.current) {
      clearTimeout(tapTempoTimeoutRef.current)
    }
  }, [currentTrack?.id])

  // Handle BPM update (manual edit)
  const handleBPMUpdate = useCallback(async (newBPM: number) => {
    if (!currentTrack?.id) {
      throw new Error('No track selected')
    }

    // Check if track has a database ID (UUID format)
    // If not, it's a local file and we can't update the database
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentTrack.id)
    
    if (!isUUID) {
      // Track is from local library, just update local state
      if (process.env.NODE_ENV === 'development') {
        console.warn('Track is not in database, updating local state only')
      }
      setDetectedBPM(newBPM)
      bpmCacheRef.current.set(currentTrack.id, newBPM)
      if (currentTrack) {
        currentTrack.bpm = newBPM
      }
      return
    }

    try {
      const response = await fetch('/api/audio/update-bpm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackId: currentTrack.id,
          bpm: newBPM,
        }),
      })

      if (!response.ok) {
        // Try to parse error response
        let errorMessage = 'Failed to update BPM'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response isn't JSON, use status text
          errorMessage = response.status === 404 
            ? 'API route not found. Please restart the dev server.'
            : `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      
      // Update local state
      setDetectedBPM(newBPM)
      bpmCacheRef.current.set(currentTrack.id, newBPM)
      
      // Update current track if it's in the context
      if (currentTrack) {
        currentTrack.bpm = newBPM
      }
    } catch (error: any) {
      console.error('Error updating BPM:', error)
      throw error
    }
  }, [currentTrack])

  // Cleanup audio context on unmount - MUST be before early return to maintain hook order
  useEffect(() => {
    return () => {
      // Cleanup audio context
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Ignore errors during cleanup
        })
        audioContextRef.current = null
      }
      
      // Cleanup analyser
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect()
        } catch (e) {
          // Ignore errors
        }
        analyserRef.current = null
      }
      
      // Cleanup source node
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect()
        } catch (e) {
          // Ignore errors
        }
        sourceNodeRef.current = null
      }
      
      // Cancel animation frames
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      
      // Clear intervals
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current)
        fadeIntervalRef.current = null
      }
      
      if (tapTempoTimeoutRef.current) {
        clearTimeout(tapTempoTimeoutRef.current)
        tapTempoTimeoutRef.current = null
      }
    }
  }, [])

  // Calculate tempo percentage from playback rate

  // Handle tempo slider change
  const handleTempoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tempoValue = parseFloat(e.target.value)
    const newRate = tempoValueToRate(tempoValue)
    changePlaybackRate(newRate)
  }

  // CDJ-style logarithmic zoom conversion with negative zoom out
  // CDJs use exponential zoom: visible portion = 1 / (2^zoomLevel)
  // We'll use a simpler logarithmic scale: zoomLevel 0.01-32, where 1 = full track
  const zoomToVisibleRatio = useCallback((zoomLevel: number): number => {
    // CDJ-style: zoom 1 = 100% visible, zoom 32 = ~3% visible (very zoomed in)
    // Negative zoom out: zoom < 1 shows more than 100% (zoomed out beyond full track)
    // Using exponential scale: visibleRatio = 1 / (zoomLevel^1.5) for smooth CDJ-like feel
    if (zoomLevel <= 0) return 100.0 // Safety: max zoom out at 100x (10000% visible)
    if (zoomLevel < 0.01) return 100.0 // Cap at very small zoom levels
    if (zoomLevel < 1) {
      // Negative zoom out: show more than 100% of track
      // zoom 0.5 = 200% visible, zoom 0.25 = 400% visible, zoom 0.01 = ~10000% visible
      return 1.0 / Math.pow(zoomLevel, 1.5)
    }
    if (zoomLevel === 1) return 1.0
    // Positive zoom in: show less than 100% of track
    return 1.0 / Math.pow(zoomLevel, 1.5)
  }, [])

  const visibleRatioToZoom = useCallback((ratio: number): number => {
    // Inverse of zoomToVisibleRatio
    if (ratio >= 1.0) return 1
    return Math.pow(1.0 / ratio, 1 / 1.5)
  }, [])

  // Waveform zoom and pan handlers - CDJ-style with negative zoom out
  const handleWaveformZoom = useCallback((delta: number) => {
    setWaveformZoom(prev => {
      // CDJ-style exponential zoom steps
      // Each step multiplies/divides by ~1.5x for smooth CDJ-like feel
      const zoomStep = 1.5
      let newZoom: number
      
      if (delta > 0) {
        // Zoom in: multiply
        newZoom = prev * zoomStep
      } else {
        // Zoom out: divide
        newZoom = prev / zoomStep
      }
      
      // CDJ zoom range: 0.01x (zoomed out 100x) to 32x (very zoomed in)
      newZoom = Math.max(0.01, Math.min(32, newZoom))
      
      // Reset offset if zooming out to 1x or below (full track or more)
      if (newZoom <= 1) {
        setWaveformOffset(0)
      }
      
      return newZoom
    })
  }, [])

  const handleWaveformPan = useCallback((delta: number) => {
    if (waveformZoom <= 1) return // No panning when zoomed out (1x or below)
    
    setWaveformOffset(prev => {
      // CDJ-style: calculate max offset based on visible ratio
      const visibleRatio = zoomToVisibleRatio(waveformZoom)
      const visibleCount = Math.floor(waveformData.length * visibleRatio)
      const maxOffset = Math.max(0, waveformData.length - visibleCount)
      return Math.max(0, Math.min(maxOffset, prev + delta))
    })
  }, [waveformZoom, waveformData.length, zoomToVisibleRatio])

  // Handle wheel events for waveform zoom/pan with passive: false
  useEffect(() => {
    const container = waveformContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // CDJ-style zoom with Ctrl/Cmd + scroll
        handleWaveformZoom(e.deltaY > 0 ? -1 : 1)
      } else {
        // Pan with scroll when zoomed (CDJ-style)
        if (waveformZoom > 1) {
          handleWaveformPan(e.deltaY > 0 ? waveformData.length * 0.05 : -waveformData.length * 0.05)
        }
      }
    }

    // Add event listener with passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [waveformZoom, waveformData.length, handleWaveformZoom, handleWaveformPan])

  // Calculate visible range based on zoom and offset - CDJ-style with negative zoom out
  const getVisibleWaveformRange = useCallback(() => {
    // CDJ-style: use logarithmic zoom to determine visible portion
    const visibleRatio = zoomToVisibleRatio(waveformZoom)
    const visibleCount = Math.max(8, Math.floor(waveformData.length * visibleRatio)) // Ensure minimum of 8 bars visible
    
    if (waveformZoom <= 1) {
      // At 1x or below (zoomed out), show full track or more, no offset needed
      return { start: 0, end: waveformData.length, visibleCount: Math.min(visibleCount, waveformData.length) }
    }
    
    // When zoomed in (>1x), calculate start position based on offset
    const start = Math.floor(waveformOffset)
    const end = Math.min(start + visibleCount, waveformData.length)
    
    return { start, end, visibleCount }
  }, [waveformZoom, waveformOffset, waveformData.length, zoomToVisibleRatio])

  // Calculate grid lines based on zoom level
  const getGridLines = useCallback(() => {
    const { start, end, visibleCount } = getVisibleWaveformRange()
    const lines: Array<{ position: number; type: 'major' | 'minor' }> = []
    
    if (visibleCount < 4) return lines // Too zoomed in, no grid
    
    // Major grid every 8 bars - this is the main sectioning
    const majorInterval = 8
    const firstMajor = Math.ceil(start / majorInterval) * majorInterval
    
    for (let i = firstMajor; i < end; i += majorInterval) {
      if (i >= start && i < end) {
        const position = ((i - start) / visibleCount) * 100
        lines.push({ position, type: 'major' })
      }
    }
    
    // Only add minor subdivisions if zoomed in enough (4x or more) and visible count is reasonable
    // Minor lines every 2 bars within each 8-bar section
    if (waveformZoom >= 4 && visibleCount >= 16) {
      const minorInterval = 2
      const firstMinor = Math.ceil(start / minorInterval) * minorInterval
      
      for (let i = firstMinor; i < end; i += minorInterval) {
        // Skip if it's already a major line
        if (i % majorInterval === 0) continue
        
        if (i >= start && i < end) {
          const position = ((i - start) / visibleCount) * 100
          lines.push({ position, type: 'minor' })
        }
      }
    }
    
    return lines
  }, [getVisibleWaveformRange, waveformZoom])

  // Reset waveform to full view when minimized or not expanded
  useEffect(() => {
    if (isMiniMode || !isExpanded) {
      setWaveformZoom(1)
      setWaveformOffset(0)
      setWaveformFollow(false)
      // Use colorful mode as default, full mirrored waveform when minimized/collapsed
      if (isMiniMode) {
        setWaveformMode('colorful')
        setWaveformMirror(false)
      } else if (!isExpanded) {
        // When controls are collapsed, reload full waveform in colorful mode with mirrored view
        setWaveformMode('colorful')
        setWaveformMirror(true) // Full waveform (mirrored) when collapsed
        // Reload the initial waveform from precomputed peaks if available
        if (precomputedPeaks && precomputedPeaks.length > 0) {
          const convertPeaksToWaveform = (peaks: number[]): { positive: number; negative: number; color: string }[] => {
            if (!peaks || peaks.length === 0) return []
            const data: { positive: number; negative: number; color: string }[] = []
            const maxPeak = Math.max(...peaks, 0.01)
            for (let i = 0; i < peaks.length; i++) {
              const normalized = peaks[i] / maxPeak
              const positive = Math.max(0.1, Math.min(0.95, 0.3 + normalized * 0.65))
              const negative = Math.max(0.1, Math.min(0.95, 0.2 + normalized * 0.5))
              const position = i / peaks.length
              const r = Math.floor(255 * (1 - position))
              const g = Math.floor(255 * position)
              const b = Math.floor(128 + 127 * position)
              data.push({
                positive,
                negative,
                color: `rgb(${r}, ${g}, ${b})`
              })
            }
            return data
          }
          const reloadedWaveform = convertPeaksToWaveform(precomputedPeaks)
          setWaveformData(reloadedWaveform)
        }
      }
    } else {
      // When expanded, use colorful mode with single view
      setWaveformMode('colorful')
      setWaveformMirror(false) // Single waveform (not mirrored) when expanded
    }
  }, [isMiniMode, isExpanded, precomputedPeaks])

  // Auto-pan waveform when follow mode is enabled
  useEffect(() => {
    if (!waveformFollow || waveformZoom <= 1 || !isPlaying || !duration || waveformData.length === 0) {
      return
    }

    // Calculate the playhead position in terms of waveform bar index
    const playheadIndex = (currentTime / duration) * waveformData.length
    
    // Calculate how many bars are visible using CDJ-style zoom
    const visibleRatio = zoomToVisibleRatio(waveformZoom)
    const visibleCount = Math.floor(waveformData.length * visibleRatio)
    
    // Center the playhead - it should be at 50% of the visible area (CDJ-style)
    // So the offset should position the playhead at the center (50% of visibleCount)
    const centerPosition = visibleCount / 2
    const maxOffset = Math.max(0, waveformData.length - visibleCount)
    const targetOffset = Math.max(0, Math.min(
      playheadIndex - centerPosition,
      maxOffset
    ))
    
    setWaveformOffset(targetOffset)
  }, [waveformFollow, waveformZoom, currentTime, duration, waveformData.length, isPlaying, zoomToVisibleRatio])

  if (!currentTrack) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-md border-t border-gray-800 p-4 z-[9999]">
        <p className="text-gray-400 text-center">No track selected</p>
      </div>
    )
  }

  const currentProgress = duration > 0 ? (currentTime / duration) * 100 : 0
  const currentBarIndex = duration > 0 && waveformData.length > 0 
    ? Math.floor((currentTime / duration) * waveformData.length) 
    : 0
  const centerY = 50 // Center line for waveform

  // Beat grid helpers
  const bpmForGrid = detectedBPM
  const beatDurationSec = bpmForGrid ? 60 / bpmForGrid : null
  const setBeatHere = () => {
    if (!beatDurationSec) return
    // Places a beat line exactly at the current playhead time
    const offset = ((currentTime % beatDurationSec) + beatDurationSec) % beatDurationSec
    setBeatGridOffsetSec(offset)
  }


  return (
    <div 
      ref={playerRef}
      className={`fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-md border-t border-gray-800 z-[9999] transition-all ${
        isMiniMode ? 'h-16' : 'max-h-[90vh]'
      }`}
    >
      <div className={isMiniMode ? '' : 'max-h-[90vh] overflow-y-auto'}>
      <audio 
        ref={audioRef} 
        preload="metadata" 
        crossOrigin="anonymous"
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
      />
      <audio 
        ref={nextAudioRef} 
        preload="none" 
        crossOrigin="anonymous"
        playsInline
        webkit-playsinline="true"
      />
      
      {/* Mini Mode Bar */}
      {isMiniMode && (
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center gap-3">
            {currentTrack.artwork && (
              <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0">
                <Image
                  src={currentTrack.artwork}
                  alt={currentTrack.title}
                  fill
                  className="object-cover"
                  unoptimized={shouldUnoptimizeImage(currentTrack.artwork)}
                  sizes="40px"
                  priority={true}
                  quality={75}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{currentTrack.title}</p>
              <p className="text-gray-400 text-xs truncate">{currentTrack.artist}</p>
            </div>
            {/* Progress Bar - Between track info and controls */}
            <div className="flex-1 min-w-0 max-w-[200px] sm:max-w-[300px] md:max-w-[400px] flex items-center gap-1.5 px-2">
              <span className="text-[10px] text-gray-500 w-10 text-right flex-shrink-0">{formatTime(currentTime)}</span>
              <div className="flex-1 relative min-w-0">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer touch-manipulation"
                  title="Seek through track"
                  aria-label="Seek through track"
                  style={{
                    background: `linear-gradient(to right, #fff 0%, #fff ${currentProgress}%, #374151 ${currentProgress}%, #374151 100%)`
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-10 flex-shrink-0">{formatTime(duration)}</span>
            </div>
            {/* Playback Controls - Shuffle, Previous, Play, Next, Repeat */}
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggleShuffle}
              className={`p-1.5 rounded transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                settings.isShuffled ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
              }`}
              title="Shuffle"
              disabled={queue.length <= 1}
              aria-label="Shuffle"
            >
              <FaRandom className="w-3 h-3" />
            </button>
            <button
              onClick={onPrevious}
              className="p-1.5 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
              disabled={queue.length <= 1}
              title="Previous"
              aria-label="Previous track"
            >
              <FaStepBackward className="w-3 h-3" />
            </button>
            <button
              onClick={togglePlay}
              className="bg-white text-black rounded-full p-2 hover:bg-gray-200 transition-colors flex-shrink-0 disabled:opacity-50 touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              disabled={isLoading || !!error}
            >
              {isPlaying ? <FaPause className="w-3 h-3" /> : <FaPlay className="w-3 h-3 ml-0.5" />}
            </button>
            <button
              onClick={onNext}
              className="p-1.5 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
              disabled={queue.length <= 1}
              title="Next"
              aria-label="Next track"
            >
              <FaStepForward className="w-3 h-3" />
            </button>
            <button
              onClick={cycleRepeatMode}
              className={`p-1.5 rounded transition-colors relative touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                settings.repeatMode !== 'off' ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
              }`}
              title={`Repeat: ${settings.repeatMode}`}
              aria-label={`Repeat: ${settings.repeatMode}`}
            >
              <FaRedo className="w-3 h-3" />
              {settings.repeatMode === 'one' && (
                <span className="absolute -top-0.5 -right-0.5 text-[6px] bg-blue-500 rounded-full w-2.5 h-2.5 flex items-center justify-center">1</span>
              )}
              {settings.repeatMode === 'all' && (
                <span className="absolute -top-0.5 -right-0.5 text-[6px]">∞</span>
              )}
            </button>
          </div>
          {/* Mobile: Just show play button */}
          <button
            onClick={togglePlay}
            className="sm:hidden bg-white text-black rounded-full p-2 hover:bg-gray-200 transition-colors flex-shrink-0 disabled:opacity-50 touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={isLoading || !!error}
          >
            {isPlaying ? <FaPause className="w-3 h-3" /> : <FaPlay className="w-3 h-3 ml-0.5" />}
          </button>
          {/* Volume Control - Vertical slider appears on hover */}
          <div 
            className="relative hidden md:flex items-center flex-shrink-0"
            onMouseEnter={() => {
              // Clear any pending timeout
              if (volumeHoverTimeoutRef.current) {
                clearTimeout(volumeHoverTimeoutRef.current)
                volumeHoverTimeoutRef.current = null
              }
              setIsVolumeHovered(true)
            }}
            onMouseLeave={() => {
              // Set timeout to hide slider after 2 seconds
              if (volumeHoverTimeoutRef.current) {
                clearTimeout(volumeHoverTimeoutRef.current)
              }
              volumeHoverTimeoutRef.current = setTimeout(() => {
                setIsVolumeHovered(false)
                volumeHoverTimeoutRef.current = null
              }, 2000)
            }}
          >
            <button
              onClick={toggleMute}
              className="text-gray-400 hover:text-white transition-colors p-1 sm:p-1.5 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
              title={settings.isMuted ? 'Unmute' : 'Mute'}
              aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
            >
              {settings.isMuted ? <FaVolumeMute className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <FaVolumeUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
            {/* Vertical slider - hidden by default, appears on hover, stays visible when hovering over slider */}
            <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 transition-opacity duration-200 z-50 ${isVolumeHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
              <div className="bg-gray-800/40 rounded-lg p-2 shadow-lg flex items-center justify-center">
                <div className="relative" style={{ width: '24px', height: '96px' }}>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.isMuted ? 0 : settings.volume}
                    onChange={(e) => {
                      const newVolume = parseFloat(e.target.value)
                      saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                      if (audioRef.current) {
                        audioRef.current.volume = newVolume
                      }
                    }}
                    className="absolute w-24 h-1 bg-transparent appearance-none cursor-pointer touch-manipulation"
                    style={{
                      transform: 'rotate(-90deg)',
                      transformOrigin: 'center',
                      left: '50%',
                      top: '50%',
                      marginLeft: '-48px',
                      marginTop: '-2px',
                      background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`
                    }}
                    title="Adjust volume"
                    aria-label="Adjust volume"
                  />
                </div>
              </div>
            </div>
          </div>
            <button
              onClick={() => setIsMiniMode(false)}
              className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
              title="Expand player"
            >
              <FaExpand className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Full Player */}
      {!isMiniMode && expandedMode !== 'dj' && (
        <>
          {/* Main Controls */}
          <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
              {/* Artwork - Clickable for details */}
              {currentTrack.artwork && (
                <button
                  onClick={() => setShowTrackDetails(!showTrackDetails)}
                  className="relative w-12 h-12 sm:w-14 sm:h-14 rounded overflow-hidden flex-shrink-0 hover:opacity-80 transition-opacity touch-manipulation min-h-[48px] min-w-[48px]"
                  title="View track details"
                  aria-label="View track details"
                >
                  <Image
                    src={currentTrack.artwork}
                    alt={currentTrack.title}
                    fill
                    className="object-cover"
                    unoptimized={shouldUnoptimizeImage(currentTrack.artwork)}
                    sizes="(max-width: 640px) 48px, 56px"
                    priority={true}
                    quality={85}
                  />
                </button>
              )}

              {/* Track Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-xs sm:text-sm truncate">
                  {currentTrack.title}
                </p>
                <p className="text-gray-400 text-[10px] sm:text-xs truncate">
                  {currentTrack.artist}
                </p>
                {(currentTrack.album || currentTrack.folder) && (
                  <p className="text-gray-500 text-[10px] sm:text-xs truncate hidden sm:block">
                    {currentTrack.album || currentTrack.folder}
                  </p>
                )}
              </div>

              {/* Loading/Error States */}
              {isLoading && (
                <div className="text-xs text-gray-400">Loading...</div>
              )}
              {isBuffering && (
                <div className="text-xs text-yellow-400">
                  Buffering... {bufferedProgress > 0 && `${Math.round(bufferedProgress)}%`}
                </div>
              )}
              {error && (
                <div className="text-xs text-red-400">
                  {error}
                  {retryCount < 3 && <span className="ml-2">Retrying...</span>}
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                
                {/* Desktop: Always show all controls */}
                <div className="hidden md:flex items-center gap-2">
                  <button
                    onClick={toggleShuffle}
                    className={`p-2 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${
                      settings.isShuffled ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Shuffle"
                    disabled={queue.length <= 1}
                  >
                    <FaRandom />
                  </button>
                  <button
                    onClick={onPrevious}
                    className="p-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    disabled={queue.length <= 1}
                    title="Previous"
                  >
                    <FaStepBackward />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="bg-white text-black rounded-full p-3 hover:bg-gray-200 transition-colors flex-shrink-0 disabled:opacity-50 touch-manipulation min-h-[48px] min-w-[48px] flex items-center justify-center"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    disabled={isLoading || !!error}
                  >
                    {isPlaying ? <FaPause /> : <FaPlay />}
                  </button>
                  <button
                    onClick={onNext}
                    className="p-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    disabled={queue.length <= 1}
                    title="Next"
                  >
                    <FaStepForward />
                  </button>
                  <button
                    onClick={cycleRepeatMode}
                    className={`p-2 rounded transition-colors relative touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${
                      settings.repeatMode !== 'off' ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                    }`}
                    title={`Repeat: ${settings.repeatMode}`}
                  >
                    <FaRedo />
                    {settings.repeatMode === 'one' && (
                      <span className="absolute -top-1 -right-1 text-[8px] bg-blue-500 rounded-full w-3 h-3 flex items-center justify-center">1</span>
                    )}
                    {settings.repeatMode === 'all' && (
                      <span className="absolute -top-1 -right-1 text-[8px]">∞</span>
                    )}
                  </button>
                </div>

                {/* Mobile: Previous, Play, and Next buttons always visible */}
                <div className="md:hidden flex items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={onPrevious}
                    className="p-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    disabled={queue.length <= 1}
                    title="Previous"
                    aria-label="Previous track"
                  >
                    <FaStepBackward className="w-4 h-4" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="bg-white text-black rounded-full p-2.5 sm:p-3 hover:bg-gray-200 transition-colors flex-shrink-0 disabled:opacity-50 touch-manipulation min-h-[48px] min-w-[48px] flex items-center justify-center"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    disabled={isLoading || !!error}
                  >
                    {isPlaying ? <FaPause className="w-4 h-4" /> : <FaPlay className="w-4 h-4 ml-0.5" />}
                  </button>
                  <button
                    onClick={onNext}
                    className="p-2 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    disabled={queue.length <= 1}
                    title="Next"
                    aria-label="Next track"
                  >
                    <FaStepForward className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress Bar - Mobile - Hidden on desktop */}
              <div className="flex-1 min-w-0 hidden px-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-xs text-gray-400 w-10 sm:w-12 text-right font-mono tabular-nums">{formatTime(currentTime)}</span>
                  <div className="flex-1 relative group">
                    {/* Larger touch area overlay for easier interaction */}
                    <div className="absolute inset-0 -my-2 z-10 touch-none" />
                    <input
                      ref={progressBarRef}
                      type="range"
                      min="0"
                      max={duration || 0}
                      value={currentTime}
                      onChange={handleSeek}
                      onMouseDown={handleSeekStart}
                      onMouseUp={handleSeekEnd}
                      onTouchStart={handleSeekStart}
                      onTouchEnd={handleSeekEnd}
                      className="w-full h-4 sm:h-5 bg-gray-700 rounded-full appearance-none cursor-pointer touch-manipulation active:cursor-grabbing relative z-20 transition-all"
                      title="Seek through track"
                      aria-label="Seek through track"
                      style={{
                        background: `linear-gradient(to right, #fff 0%, #fff ${currentProgress}%, #4b5563 ${currentProgress}%, #4b5563 100%)`,
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                      }}
                    />
                    {/* Visual feedback indicator when seeking */}
                    {isSeeking && (
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-xl pointer-events-none z-30 animate-pulse"
                        style={{ left: `calc(${currentProgress}% - 12px)` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] sm:text-xs text-gray-400 w-10 sm:w-12 font-mono tabular-nums">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Progress Bar - Desktop - Hidden on mobile */}
              <div className="flex-1 min-w-0 hidden md:flex">
                <div className="flex items-center gap-2 relative w-full">
                  <span className="text-xs text-gray-400 w-10 text-right hidden lg:block">{formatTime(currentTime)}</span>
                  <div className="flex-1 relative">
                    <input
                      ref={progressBarRef}
                      type="range"
                      min="0"
                      max={duration || 0}
                      value={currentTime}
                      onChange={handleSeek}
                      onMouseMove={handleProgressHover}
                      onMouseLeave={handleProgressLeave}
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      title="Seek through track"
                      aria-label="Seek through track"
                    />
                    {seekPreviewTime !== null && (
                      <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800/40 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-10">
                        {formatTime(seekPreviewTime)}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 w-10 hidden lg:block">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Volume - Vertical slider appears on hover, visible when waveform is NOT visible */}
              {!isExpanded && (
                <div 
                  className="relative hidden md:flex items-center flex-shrink-0"
                  onMouseEnter={() => {
                    // Clear any pending timeout
                    if (volumeHoverTimeoutRef.current) {
                      clearTimeout(volumeHoverTimeoutRef.current)
                      volumeHoverTimeoutRef.current = null
                    }
                    setIsVolumeHovered(true)
                  }}
                  onMouseLeave={() => {
                    // Set timeout to hide slider after 2 seconds
                    if (volumeHoverTimeoutRef.current) {
                      clearTimeout(volumeHoverTimeoutRef.current)
                    }
                    volumeHoverTimeoutRef.current = setTimeout(() => {
                      setIsVolumeHovered(false)
                      volumeHoverTimeoutRef.current = null
                    }, 2000)
                  }}
                >
                  <button
                    onClick={toggleMute}
                    className="text-gray-400 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title={settings.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {settings.isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                  </button>
                  {/* Vertical slider - hidden by default, appears on hover, stays visible when hovering over slider */}
                  <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 transition-opacity duration-200 z-50 ${isVolumeHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    <div className="bg-gray-800/40 rounded-lg p-2 shadow-lg flex items-center justify-center">
                      <div className="relative" style={{ width: '24px', height: '96px' }}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={settings.isMuted ? 0 : settings.volume}
                          onChange={(e) => {
                            const newVolume = parseFloat(e.target.value)
                            saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                            if (audioRef.current) {
                              audioRef.current.volume = newVolume
                            }
                          }}
                          className="absolute w-24 h-1 bg-transparent appearance-none cursor-pointer touch-manipulation"
                          style={{
                            transform: 'rotate(-90deg)',
                            transformOrigin: 'center',
                            left: '50%',
                            top: '50%',
                            marginLeft: '-48px',
                            marginTop: '-2px',
                            background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`
                          }}
                          title="Adjust volume"
                          aria-label="Adjust volume"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Queue Toggle */}
              <button
                onClick={() => {
                  const nextOpen = !isQueueOpen
                  setIsQueueOpen(nextOpen)
                  if (!nextOpen) {
                    setIsQueueExpanded(false)
                    setIsAutoDJSettingsExpanded(false)
                    setIsTrackListExpanded(false)
                  }
                }}
                className="flex p-2 text-gray-400 hover:text-white transition-colors relative touch-manipulation min-h-[44px] min-w-[44px] items-center justify-center"
                title="Queue"
              >
                <FaList />
                {queue.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {queue.length}
                  </span>
                )}
              </button>

              {/* Settings */}
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`p-2 text-gray-400 hover:text-white transition-colors flex items-center justify-center touch-manipulation min-h-[44px] min-w-[44px] ${
                  isSettingsOpen ? 'text-white' : ''
                }`}
                title="Settings"
              >
                <FaCog />
              </button>

              {/* DJ Mode Toggle - Visible in admin; frontend when DJ_MODE_ENABLED */}
              {djModeAvailable && (
                <button
                  onClick={() => {
                    if (!isExpanded) {
                      setIsExpanded(true)
                    }
                    setExpandedMode(m => m === 'controls' ? 'dj' : 'controls')
                  }}
                  className={`p-2 text-gray-400 hover:text-white transition-colors hidden lg:flex items-center justify-center touch-manipulation min-h-[44px] min-w-[44px] ${
                    (expandedMode as string) === 'dj' ? 'text-white bg-blue-600/30' : ''
                  }`}
                  title={expandedMode === 'controls' ? 'Switch to DJ Mode' : 'Switch to Controls'}
                  aria-label="Toggle DJ Mode"
                >
                  {expandedMode === 'controls' ? '🎛️' : '⚙️'}
                </button>
              )}

              {/* Expand/Collapse */}
              <button
                onClick={() => {
                  setIsExpanded(!isExpanded)
                  if (isExpanded) {
                    setIsSettingsOpen(false)
                  }
                }}
                className="p-2 text-gray-400 hover:text-white transition-colors hidden lg:flex items-center justify-center touch-manipulation min-h-[44px] min-w-[44px]"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <FaChevronDown /> : <FaChevronUp />}
              </button>

              {/* Mini Mode */}
              <button
                onClick={() => {
                  setIsMiniMode(true)
                  setIsSettingsOpen(false)
                }}
                className="hidden sm:flex p-2 text-gray-400 hover:text-white transition-colors items-center justify-center touch-manipulation min-h-[44px] min-w-[44px]"
                title="Minimize"
              >
                <FaCompress />
              </button>
            </div>
          </div>

        {/* Queue Panel - positioned above the player (waveform area) */}
        {isQueueOpen && (
          <div className={`fixed left-0 right-0 bg-black/95 border-t border-gray-800 pt-3 pb-3 z-50 shadow-2xl ${
            isMiniMode ? 'bottom-16' : 'bottom-[220px] sm:bottom-[230px] md:bottom-[250px]'
          }`}>
            <div className="container mx-auto px-4">
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">
                    {allSourceTracks.length > 0
                      ? `Playlist (${allSourceTracks.length} tracks, ${queue.length} in queue)`
                      : `Queue (${queue.length})`}
                  </h3>
                  {autoDJStatusMessage && (
                    <p className="text-[10px] text-emerald-300">{autoDJStatusMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleShuffle}
                    className={`p-2 rounded transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                      settings.isShuffled ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Shuffle"
                    disabled={queue.length <= 1}
                    aria-label="Shuffle queue"
                  >
                    <FaRandom className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cycleRepeatMode}
                    className={`p-2 rounded transition-colors relative touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                      settings.repeatMode !== 'off' ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                    }`}
                    title={`Repeat: ${settings.repeatMode}`}
                    aria-label={`Repeat: ${settings.repeatMode}`}
                  >
                    <FaRedo className="w-3.5 h-3.5" />
                    {settings.repeatMode === 'one' && (
                      <span className="absolute -top-1 -right-1 text-[8px] bg-blue-500 rounded-full w-3 h-3 flex items-center justify-center">1</span>
                    )}
                    {settings.repeatMode === 'all' && (
                      <span className="absolute -top-1 -right-1 text-[8px]">∞</span>
                    )}
                  </button>
                  <button
                    onClick={() => setIsQueueOpen(false)}
                    className="text-gray-400 hover:text-white transition-colors p-2 touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Close queue"
                    aria-label="Close queue"
                  >
                    <FaTimes className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Collapsible Auto DJ Settings */}
              <div className="mt-3 bg-gray-900/70 border border-gray-800 rounded-lg text-[11px] text-gray-300">
                <button
                  onClick={() => setIsAutoDJSettingsExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-gray-400">Auto DJ Settings</span>
                    {autoDJConfig.enabled && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-emerald-600/30 text-emerald-400 rounded">ON</span>
                    )}
                  </div>
                  <FaChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isAutoDJSettingsExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isAutoDJSettingsExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-gray-800/50">
                    <div className="flex items-center justify-between pt-3">
                      <span className="text-gray-400">Auto DJ</span>
                      <label className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">Enabled</span>
                        <input
                          type="checkbox"
                          checked={autoDJConfig.enabled}
                          onChange={(e) => {
                            setAutoDJConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                            if (!e.target.checked) {
                              setAutoDJStatusMessage('')
                            }
                          }}
                          className="h-4 w-4 accent-blue-500"
                        />
                      </label>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Lead-in offset</span>
                        <span>{autoDJLeadIn.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.25"
                        value={autoDJLeadIn}
                        onChange={(e) => setAutoDJLeadIn(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoDJAlignPhase}
                        onChange={(e) => setAutoDJAlignPhase(e.target.checked)}
                        className="h-4 w-4 accent-blue-500"
                      />
                      Align to waveform phase
                    </label>
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">Phrase length</div>
                      <div className="grid grid-cols-3 gap-2">
                        {[8, 4, 2].map((bars) => (
                          <button
                            key={bars}
                            onClick={() => setAutoDJConfig((prev) => ({ ...prev, phraseBars: bars as 8 | 4 | 2 }))}
                            className={`px-2 py-1 rounded text-[11px] ${
                              autoDJConfig.phraseBars === bars ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300'
                            }`}
                          >
                            {bars} bars
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">Mix style</div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['crossfade', 'filter-eq', 'cutout-filter'] as AutoDJTransitionMode[]).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setAutoDJConfig((prev) => ({ ...prev, transitionMode: mode }))}
                            className={`px-2 py-1 rounded text-[11px] ${
                              autoDJConfig.transitionMode === mode ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300'
                            }`}
                          >
                            {mode === 'crossfade' ? 'Smooth' : mode === 'filter-eq' ? 'Filter' : 'Cut'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={primeQueue}
                      className="w-full px-3 py-2 rounded text-xs font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors"
                    >
                      Prime queue
                    </button>
                  </div>
                )}
              </div>
              {/* Collapsible Queue Track List */}
              <div className="mt-3 bg-gray-900/70 border border-gray-800 rounded-lg">
                <button
                  onClick={() => setIsTrackListExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors rounded-lg"
                >
                  <span className="text-xs uppercase tracking-[0.2em] text-gray-400">
                    Tracks ({displayTracks.length})
                  </span>
                  <FaChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isTrackListExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isTrackListExpanded && (
                <div 
                  ref={queueContainerRef}
                  className="overflow-y-auto max-h-[50vh] border-t border-gray-800/50"
                >
                  {isLoadingSourceTracks ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-gray-400 text-sm">Loading tracks...</div>
                    </div>
                  ) : displayTracks.length > 0 ? (
                    <div className="divide-y divide-gray-800/30">
                      {displayTracks.map((track, index) => {
                        const isInQueue = queueTrackIds.has(track.id)
                        const queueIndex = queueIndexMap.get(track.id) ?? -1
                        return (
                          <div key={track.id} className="relative">
                            <QueueItem
                              track={track}
                              index={queueIndex >= 0 ? queueIndex : index}
                              isCurrent={queueIndex === currentQueueIndex}
                              onRemove={queueIndex >= 0 ? handleRemoveFromQueueClick : () => {}}
                              isAutoDJNext={autoDJPendingTrackId === track.id}
                            />
                            {!isInQueue && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
                                Not in queue
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-gray-400 text-sm">No tracks available</div>
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
        )}

          {/* Settings Panel */}
          {isSettingsOpen && (
            <div className="container mx-auto px-4 pb-3 border-t border-gray-800 pt-3 bg-black/90 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Settings</h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Close settings"
                >
                  <FaTimes />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stream Quality Settings */}
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">
                    Stream Quality: {settings.streamQuality === 'auto' 
                      ? `Auto (${connectionQuality === 'slow' ? 'Standard' : connectionQuality === 'medium' ? 'HD' : 'UHD'})`
                      : settings.streamQuality}
                    {networkEffectiveType && (
                      <span className="ml-2 text-[10px] text-gray-500">
                        ({networkEffectiveType})
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2 mb-2">
                    {(['standard', 'HD', 'UHD', 'auto'] as const).map((quality) => (
                      <button
                        key={quality}
                        onClick={() => saveSettings({ streamQuality: quality })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          settings.streamQuality === quality
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title={
                          quality === 'standard' ? 'Standard quality (faster loading, less buffering)' :
                          quality === 'HD' ? 'HD quality (balanced quality and performance)' :
                          quality === 'UHD' ? 'UHD quality (best audio, may require more buffering)' :
                          'Auto (adapts to connection)'
                        }
                      >
                        {quality}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {settings.streamQuality === 'standard' && 'Standard quality for faster streaming and reduced buffering. Best for slow connections.'}
                    {settings.streamQuality === 'HD' && 'HD quality with balanced performance. Good for most connections.'}
                    {settings.streamQuality === 'UHD' && 'Ultra HD quality for the best audio experience. May require more buffering on slow connections.'}
                    {settings.streamQuality === 'auto' && `Automatically adjusts quality based on your connection (currently: ${connectionQuality === 'slow' ? 'Standard' : connectionQuality === 'medium' ? 'HD' : 'UHD'})`}
                  </p>
                </div>

                {/* Buffer Size Settings */}
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">
                    Buffer Size: {settings.bufferSize === 'auto' 
                      ? `Auto (${connectionQuality === 'slow' ? 'Small' : connectionQuality === 'medium' ? 'Medium' : 'Large'})`
                      : settings.bufferSize.charAt(0).toUpperCase() + settings.bufferSize.slice(1)}
                    {networkEffectiveType && (
                      <span className="ml-2 text-[10px] text-gray-500">
                        ({networkEffectiveType})
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2 mb-2">
                    {(['small', 'medium', 'large', 'auto'] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => saveSettings({ bufferSize: size })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          settings.bufferSize === size
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title={
                          size === 'small' ? 'Small buffer (saves bandwidth)' :
                          size === 'medium' ? 'Medium buffer (balanced)' :
                          size === 'large' ? 'Large buffer (smooth playback)' :
                          'Auto (adapts to connection)'
                        }
                      >
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {settings.bufferSize === 'small' && 'Minimal buffering, may cause interruptions on slow connections'}
                    {settings.bufferSize === 'medium' && 'Balanced buffering for most connections'}
                    {settings.bufferSize === 'large' && 'Maximum buffering for smooth playback'}
                    {settings.bufferSize === 'auto' && `Automatically adjusts based on your connection (currently: ${connectionQuality})`}
                  </p>
                </div>

                {prefersMediaElementBackgroundPlayback() && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400 mb-2 block">
                      Background and lock screen playback
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => saveSettings({ prioritizeBackgroundPlayback: true })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          settings.prioritizeBackgroundPlayback
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title="Keep audio on the native player so music continues when the screen is off"
                      >
                        On (recommended)
                      </button>
                      <button
                        type="button"
                        onClick={() => saveSettings({ prioritizeBackgroundPlayback: false })}
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
                          !settings.prioritizeBackgroundPlayback
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800/40 text-gray-300 hover:bg-gray-700/40'
                        }`}
                        title="Enable live spectrum analysis; playback may stop when the screen locks"
                      >
                        Live analyzer
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {settings.prioritizeBackgroundPlayback
                        ? 'Best for listening with the screen off. The real-time spectrum in the expanded player will stay static or use stored waveform data only.'
                        : 'Routes audio through Web Audio for the live spectrum. On many phones, music pauses when the screen locks.'}
                    </p>
                  </div>
                )}

                {/* Keyboard Shortcuts */}
                <div>
                  <button
                    onClick={() => setIsKeyboardShortcutsExpanded(!isKeyboardShortcutsExpanded)}
                    className="flex items-center justify-between w-full text-left mb-2 group"
                    aria-expanded={isKeyboardShortcutsExpanded ? 'true' : 'false'}
                    aria-label="Toggle keyboard shortcuts"
                  >
                    <label className="text-xs text-gray-400 cursor-pointer group-hover:text-gray-300 transition-colors">
                      Keyboard Shortcuts
                    </label>
                    <FaChevronDown
                      className={`text-gray-400 text-xs transition-transform duration-200 ${
                        isKeyboardShortcutsExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isKeyboardShortcutsExpanded && (
                    <div className="bg-gray-800/40 rounded-lg p-3 space-y-1.5 text-xs text-gray-300">
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">Space</kbd>
                        <span>Play/Pause</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">←</kbd>
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">→</kbd>
                        </div>
                        <span>Seek</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">↑</kbd>
                          <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">↓</kbd>
                        </div>
                        <span>Volume</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">M</kbd>
                        <span>Mute</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">S</kbd>
                        <span>Shuffle</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">R</kbd>
                        <span>Repeat</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">Del</kbd>
                        <span>Remove</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs border border-gray-600">Esc</kbd>
                        <span>Clear search</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Waveform Settings */}
                <div>
                  <button
                    onClick={() => setIsWaveformSettingsExpanded(!isWaveformSettingsExpanded)}
                    className="flex items-center justify-between w-full text-left mb-2 group"
                    aria-expanded={isWaveformSettingsExpanded ? 'true' : 'false'}
                    aria-label="Toggle waveform settings"
                  >
                    <label className="text-xs text-gray-400 cursor-pointer group-hover:text-gray-300 transition-colors">
                      Waveform Settings
                    </label>
                    <FaChevronDown
                      className={`text-gray-400 text-xs transition-transform duration-200 ${
                        isWaveformSettingsExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isWaveformSettingsExpanded && (
                    <div className="bg-gray-800/40 rounded-lg p-3 space-y-3 text-xs">
                      {/* Waveform Mode */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Waveform Style</label>
                        <div className="flex gap-2">
                          {(['colorful', 'simple', 'classic'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setWaveformMode(mode)}
                              className={`px-3 py-1.5 rounded text-xs transition-colors ${
                                waveformMode === mode
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                              }`}
                              title={
                                mode === 'colorful' ? 'Colorful waveform with frequency colors' :
                                mode === 'simple' ? 'Simple waveform' :
                                'Classic waveform style'
                              }
                            >
                              {mode === 'colorful' ? '🎨 Colorful' : mode === 'simple' ? '📊 Simple' : '🌊 Classic'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mirror Mode */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Mirror Mode</label>
                        <button
                          onClick={() => setWaveformMirror(prev => !prev)}
                          className={`w-full px-3 py-1.5 rounded text-xs transition-colors ${
                            waveformMirror 
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                          }`}
                          title={waveformMirror ? "Disable mirror mode (show single waveform)" : "Enable mirror mode (show mirrored waveform)"}
                        >
                          {waveformMirror ? '🪞 Mirror Enabled' : '📊 Single Waveform'}
                        </button>
                      </div>

                      {/* Zoom Controls */}
                      <div>
                        <label className="text-gray-300 mb-2 block">
                          Zoom: {waveformZoom < 0.1 
                            ? `${waveformZoom.toFixed(3)}x` 
                            : waveformZoom < 1 
                              ? `${waveformZoom.toFixed(2)}x` 
                              : waveformZoom === 1 
                                ? '1x' 
                                : `${waveformZoom.toFixed(1)}x`}
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleWaveformZoom(-1)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom out"
                            disabled={waveformZoom <= 0.01}
                          >
                            −
                          </button>
                          <button
                            onClick={() => setWaveformZoom(1)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                            title="Reset zoom"
                          >
                            Reset
                          </button>
                          <button
                            onClick={() => handleWaveformZoom(1)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom in"
                            disabled={waveformZoom >= 32}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Speed Control */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Speed: {waveformSpeed.toFixed(2)}x</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setWaveformSpeed(prev => Math.max(0.25, prev - 0.25))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Decrease speed"
                            disabled={waveformSpeed <= 0.25}
                          >
                            −
                          </button>
                          <button
                            onClick={() => setWaveformSpeed(1.0)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                            title="Reset to 1x"
                          >
                            Reset
                          </button>
                          <button
                            onClick={() => setWaveformSpeed(prev => Math.min(4.0, prev + 0.25))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Increase speed"
                            disabled={waveformSpeed >= 4.0}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Horizontal Zoom */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Horizontal Zoom: {waveformHorizontalZoom.toFixed(2)}x</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setWaveformHorizontalZoom(prev => Math.max(0.1, prev - 0.1))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom out horizontally"
                            disabled={waveformHorizontalZoom <= 0.1}
                          >
                            −
                          </button>
                          <button
                            onClick={() => setWaveformHorizontalZoom(1.0)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                            title="Reset horizontal zoom"
                          >
                            Reset
                          </button>
                          <button
                            onClick={() => setWaveformHorizontalZoom(prev => Math.min(8.0, prev + 0.1))}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom in horizontally"
                            disabled={waveformHorizontalZoom >= 8.0}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Follow Mode */}
                      {waveformZoom > 1 && (
                        <div>
                          <label className="text-gray-300 mb-2 block">Follow Mode</label>
                          <button
                            onClick={() => setWaveformFollow(prev => !prev)}
                            className={`w-full px-3 py-1.5 rounded text-xs transition-colors ${
                              waveformFollow 
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                            }`}
                            title={waveformFollow ? "Disable follow mode" : "Enable follow mode - keep playhead centered"}
                          >
                            {waveformFollow ? '📍 Follow Enabled' : '📍 Follow Disabled'}
                          </button>
                          {!waveformFollow && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => handleWaveformPan(-waveformData.length * 0.1)}
                                className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                                title="Pan left"
                              >
                                ← Pan Left
                              </button>
                              <button
                                onClick={() => handleWaveformPan(waveformData.length * 0.1)}
                                className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                                title="Pan right"
                              >
                                Pan Right →
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Beat Grid */}
                      <div>
                        <label className="text-gray-300 mb-2 block">
                          Beat Grid {bpmForGrid ? `(${bpmForGrid.toFixed(0)} BPM)` : '(no BPM)'}
                        </label>

                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setBeatGridEnabled(v => !v)}
                            className={`px-3 py-1.5 rounded text-xs transition-colors ${
                              beatGridEnabled ? 'bg-blue-600 text-white' : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                            }`}
                            disabled={!bpmForGrid}
                            title="Toggle beat grid"
                          >
                            {beatGridEnabled ? 'Beat Grid: ON' : 'Beat Grid: OFF'}
                          </button>

                          <button
                            onClick={setBeatHere}
                            className="px-3 py-1.5 rounded text-xs bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 transition-colors disabled:opacity-40"
                            disabled={!bpmForGrid}
                            title="Snap grid so a beat line lands on the current playhead"
                          >
                            Set Beat Here
                          </button>

                          <button
                            onClick={() => setBeatGridOffsetSec(0)}
                            className="px-3 py-1.5 rounded text-xs bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 transition-colors disabled:opacity-40"
                            disabled={!bpmForGrid}
                            title="Reset beat grid offset"
                          >
                            Reset
                          </button>

                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[10px] text-gray-500">Beats/Bar</span>
                            <select
                              value={beatGridBeatsPerBar}
                              onChange={(e) => setBeatGridBeatsPerBar(parseInt(e.target.value, 10))}
                              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1"
                            >
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                            </select>
                          </div>
                        </div>

                        {bpmForGrid && (
                          <div className="text-[10px] text-gray-500 mt-1">
                            Offset: {beatGridOffsetSec.toFixed(3)}s
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Waveform - Always visible across full width at bottom (Rekordbox style) - Hidden in DJ mode */}
          {(expandedMode as string) !== 'dj' && (
          <div className="w-full bg-black/90 border-t border-gray-700">
            <div 
              ref={waveformContainerRef}
              className="relative h-20 sm:h-24 md:h-32 cursor-pointer touch-manipulation overflow-hidden"
              onClick={(e) => {
                if (!audioRef.current || !duration) return
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = x / rect.width
                
                // Adjust for zoom and offset
                const { start, visibleCount } = getVisibleWaveformRange()
                const clickedIndex = Math.floor(start + (percentage * visibleCount))
                const newTime = (clickedIndex / waveformData.length) * duration
                
                audioRef.current.currentTime = newTime
                setCurrentTime(newTime)
              }}
              onTouchStart={(e) => {
                if (!audioRef.current || !duration) return
                const touch = e.touches[0]
                const rect = e.currentTarget.getBoundingClientRect()
                const x = touch.clientX - rect.left
                const percentage = x / rect.width
                
                // Adjust for zoom and offset
                const { start, visibleCount } = getVisibleWaveformRange()
                const clickedIndex = Math.floor(start + (percentage * visibleCount))
                const newTime = (clickedIndex / waveformData.length) * duration
                
                audioRef.current.currentTime = newTime
                setCurrentTime(newTime)
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center px-2">
                {waveformData.length > 0 ? (
                  <svg 
                    className="w-full h-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    shapeRendering="geometricPrecision"
                    style={{ imageRendering: 'auto' }}
                  >
                    {/* Beat Grid overlay */}
                    {beatGridEnabled && bpmForGrid && beatDurationSec && duration > 0 && waveformData.length > 0 && (() => {
                      const { start, end } = getVisibleWaveformRange()
                      const visibleCount = Math.max(1, end - start)

                      const startTimeSec = (start / waveformData.length) * duration
                      const endTimeSec = (end / waveformData.length) * duration
                      const spanSec = Math.max(0.0001, endTimeSec - startTimeSec)

                      // Find first beat index n such that beatTime >= startTimeSec
                      // beatTime = beatGridOffsetSec + n * beatDurationSec
                      const n0 = Math.ceil((startTimeSec - beatGridOffsetSec) / beatDurationSec)

                      const lines: JSX.Element[] = []
                      for (let n = n0; ; n++) {
                        const t = beatGridOffsetSec + n * beatDurationSec
                        if (t >= endTimeSec) break

                        const x = ((t - startTimeSec) / spanSec) * 100
                        
                        // Determine line type: beat, bar (4 beats), or 8-bar (32 beats)
                        const is8BarLine = (n % (beatGridBeatsPerBar * 8)) === 0
                        const isBarLine = (n % beatGridBeatsPerBar) === 0 && !is8BarLine
                        const isBeatLine = !isBarLine && !is8BarLine

                        // Only render if it's a visible line type
                        if (is8BarLine || isBarLine || isBeatLine) {
                          let stroke = 'rgba(255,255,255,0.30)' // 30% transparent for beat lines
                          let strokeWidth = 0.3
                          
                          if (is8BarLine) {
                            // Most prominent: 8-bar lines (every 32 beats with 4/4 time)
                            stroke = 'rgba(255, 200, 0, 0.50)' // Yellow/orange, more visible
                            strokeWidth = 1.2
                          } else if (isBarLine) {
                            // Medium: bar lines (every 4 beats)
                            stroke = 'rgba(255,255,255,0.30)' // 30% transparent for bar lines too
                            strokeWidth = 0.6
                          }
                          // else: beat lines use default (30% transparent, thinnest)

                          lines.push(
                            <line
                              key={`beat-${n}`}
                              x1={x}
                              x2={x}
                              y1={0}
                              y2={100}
                              stroke={stroke}
                              strokeWidth={strokeWidth}
                              vectorEffect="non-scaling-stroke"
                            />
                          )
                        }
                      }

                      return <>{lines}</>
                    })()}

                    {/* Waveform bars */}
                    {(() => {
                      const { start, end } = getVisibleWaveformRange()
                      let visibleData = waveformData.slice(start, end)
                      
                      // Ensure at least 8 bars are visible - duplicate/interpolate if needed
                      if (visibleData.length < 8 && waveformData.length > 0) {
                        const needed = 8 - visibleData.length
                        const lastBar = visibleData[visibleData.length - 1] || waveformData[waveformData.length - 1]
                        // Duplicate the last bar to reach minimum
                        for (let i = 0; i < needed; i++) {
                          visibleData.push({ ...lastBar })
                        }
                      }
                      
                      const barWidth = 100 / Math.max(8, visibleData.length) // Ensure minimum of 8 bars
                      
                      if (waveformMode === 'classic') {
                        // Classic continuous waveform using SVG path with smooth curves
                        const pastPoints: Array<{ x: number; y: number; color: string }> = []
                        const futurePoints: Array<{ x: number; y: number; color: string }> = []
                        
                        visibleData.forEach((bar, index) => {
                          const actualIndex = start + index
                          const isPast = actualIndex < currentBarIndex
                          const x = (index / Math.max(1, visibleData.length)) * 100
                          
                          const positive = isNaN(bar.positive) || bar.positive === undefined ? 0 : Math.max(0, Math.min(1, bar.positive))
                          const negative = isNaN(bar.negative) || bar.negative === undefined ? 0 : Math.max(0, Math.min(1, bar.negative))
                          
                          // Use the bar's color for gradient
                          const color = bar.color || 'rgb(255, 100, 0)'
                          
                          if (waveformMirror) {
                            // Mirrored mode: show both positive and negative
                            const topY = 50 - (positive * 40)
                            const bottomY = 50 + (negative * 40)
                            
                            if (isPast) {
                              pastPoints.push({ x, y: topY, color })
                              pastPoints.push({ x, y: bottomY, color })
                            } else {
                              futurePoints.push({ x, y: topY, color })
                              futurePoints.push({ x, y: bottomY, color })
                            }
                          } else {
                            // Single mode: show only positive side, bottom-aligned
                            const singleY = 100 - (positive * 80) // Scale to use full height, bottom-aligned
                            
                            if (isPast) {
                              pastPoints.push({ x, y: singleY, color })
                            } else {
                              futurePoints.push({ x, y: singleY, color })
                            }
                          }
                        })
                        
                        // Build path strings for continuous waveform
                        const buildPath = (points: Array<{ x: number; y: number }>) => {
                          if (points.length === 0) return ''
                          
                          // Create a smooth continuous waveform
                          let path = `M ${points[0].x} ${points[0].y}`
                          
                          for (let i = 1; i < points.length; i += 2) {
                            const topPoint = points[i - 1]
                            const bottomPoint = points[i] || topPoint
                            
                            if (i === 1) {
                              path += ` L ${topPoint.x} ${topPoint.y}`
                            } else {
                              // Use quadratic curves for smooth transitions
                              const prevTop = points[i - 3]
                              const midX = (prevTop.x + topPoint.x) / 2
                              path += ` Q ${prevTop.x} ${prevTop.y} ${midX} ${prevTop.y}`
                              path += ` L ${topPoint.x} ${topPoint.y}`
                            }
                            
                            // Draw line to bottom
                            path += ` L ${bottomPoint.x} ${bottomPoint.y}`
                          }
                          
                          return path
                        }
                        
                        // Build smooth continuous path with curves
                        const buildSmoothPath = (points: Array<{ x: number; y: number; color: string }>) => {
                          if (points.length === 0) return { path: '', colors: [] }
                          
                          if (waveformMirror) {
                            // Mirrored mode: build both top and bottom paths
                            let topPath = ''
                            let bottomPath = ''
                            const colors: string[] = []
                            
                            for (let i = 0; i < points.length; i += 2) {
                              const topPoint = points[i]
                              const bottomPoint = points[i + 1] || topPoint
                              colors.push(topPoint.color)
                              
                              if (i === 0) {
                                topPath = `M ${topPoint.x} ${topPoint.y}`
                                bottomPath = `M ${bottomPoint.x} ${bottomPoint.y}`
                              } else {
                                const prevTop = points[i - 2]
                                // Use smooth curves for transitions
                                const cp1x = prevTop.x + (topPoint.x - prevTop.x) * 0.5
                                const cp2x = topPoint.x - (topPoint.x - prevTop.x) * 0.5
                                topPath += ` C ${cp1x} ${prevTop.y}, ${cp2x} ${topPoint.y}, ${topPoint.x} ${topPoint.y}`
                                bottomPath += ` L ${bottomPoint.x} ${bottomPoint.y}`
                              }
                            }
                            
                            // Connect bottom back to top to close the shape
                            if (points.length >= 2) {
                              const lastTop = points[points.length - 2]
                              const firstTop = points[0]
                              bottomPath += ` L ${lastTop.x} ${lastTop.y}`
                              bottomPath += ` L ${firstTop.x} ${firstTop.y} Z`
                            }
                            
                            return { topPath, bottomPath, colors }
                          } else {
                            // Single mode: build smooth path from points to bottom
                            let path = ''
                            const colors: string[] = []
                            
                            for (let i = 0; i < points.length; i++) {
                              const point = points[i]
                              colors.push(point.color)
                              
                              if (i === 0) {
                                path = `M ${point.x} ${point.y}`
                              } else {
                                const prevPoint = points[i - 1]
                                // Use smooth curves for transitions
                                const cp1x = prevPoint.x + (point.x - prevPoint.x) * 0.5
                                const cp2x = point.x - (point.x - prevPoint.x) * 0.5
                                path += ` C ${cp1x} ${prevPoint.y}, ${cp2x} ${point.y}, ${point.x} ${point.y}`
                              }
                            }
                            
                            // Connect to bottom to create filled area
                            if (points.length > 0) {
                              const lastPoint = points[points.length - 1]
                              const firstPoint = points[0]
                              path += ` L ${lastPoint.x} 100`
                              path += ` L ${firstPoint.x} 100 Z`
                            }
                            
                            return { path, colors }
                          }
                        }
                        
                        const pastPath = buildSmoothPath(pastPoints)
                        const futurePath = buildSmoothPath(futurePoints)
                        
                        // Create gradient definitions for colorful waveform
                        const gradientId = `waveform-gradient-${start}-${end}`
                        
                        return (
                          <g key="classic-waveform">
                            {/* Define gradient for past waveform */}
                            <defs>
                              <linearGradient id={`${gradientId}-past`} x1="0%" y1="0%" x2="100%" y2="0%">
                                {pastPath.colors && pastPath.colors.map((color, idx) => {
                                  const offset = (idx / Math.max(1, pastPath.colors.length - 1)) * 100
                                  return <stop key={idx} offset={`${offset}%`} stopColor={color} />
                                })}
                              </linearGradient>
                              <linearGradient id={`${gradientId}-future`} x1="0%" y1="0%" x2="100%" y2="0%">
                                {futurePath.colors && futurePath.colors.map((color, idx) => {
                                  const offset = (idx / Math.max(1, futurePath.colors.length - 1)) * 100
                                  return <stop key={idx} offset={`${offset}%`} stopColor={color} stopOpacity="0.5" />
                                })}
                              </linearGradient>
                            </defs>
                            
                            {/* Past waveform - brighter with gradient */}
                            {waveformMirror ? (
                              <>
                                {pastPath.topPath && (
                                  <path
                                    d={pastPath.topPath}
                                    fill="none"
                                    stroke={`url(#${gradientId}-past)`}
                                    strokeWidth="0.5"
                                    opacity="0.9"
                                  />
                                )}
                                {pastPath.bottomPath && (
                                  <path
                                    d={pastPath.bottomPath}
                                    fill="none"
                                    stroke={`url(#${gradientId}-past)`}
                                    strokeWidth="0.5"
                                    opacity="0.9"
                                  />
                                )}
                              </>
                            ) : (
                              pastPath.path && (
                                <path
                                  d={pastPath.path}
                                  fill={`url(#${gradientId}-past)`}
                                  fillOpacity="0.3"
                                  stroke={`url(#${gradientId}-past)`}
                                  strokeWidth="0.5"
                                  opacity="0.9"
                                />
                              )
                            )}
                            
                            {/* Future waveform - dimmer with gradient */}
                            {waveformMirror ? (
                              <>
                                {futurePath.topPath && (
                                  <path
                                    d={futurePath.topPath}
                                    fill="none"
                                    stroke={`url(#${gradientId}-future)`}
                                    strokeWidth="0.5"
                                    opacity="0.5"
                                  />
                                )}
                                {futurePath.bottomPath && (
                                  <path
                                    d={futurePath.bottomPath}
                                    fill="none"
                                    stroke={`url(#${gradientId}-future)`}
                                    strokeWidth="0.5"
                                    opacity="0.5"
                                  />
                                )}
                              </>
                            ) : (
                              futurePath.path && (
                                <path
                                  d={futurePath.path}
                                  fill={`url(#${gradientId}-future)`}
                                  fillOpacity="0.15"
                                  stroke={`url(#${gradientId}-future)`}
                                  strokeWidth="0.5"
                                  opacity="0.5"
                                />
                              )
                            )}
                          </g>
                        )
                      }
                      
                      return visibleData.map((bar, index) => {
                        const actualIndex = start + index
                        const isPast = actualIndex < currentBarIndex
                        const x = (index / Math.max(1, visibleData.length)) * 100
                        
                        // Ensure values are valid numbers
                        const positive = isNaN(bar.positive) || bar.positive === undefined ? 0 : Math.max(0, Math.min(1, bar.positive))
                        const negative = isNaN(bar.negative) || bar.negative === undefined ? 0 : Math.max(0, Math.min(1, bar.negative))
                        
                        // Enhance contrast for detected elements
                        const contrastMultiplier = bar.elementType && bar.elementConfidence && bar.elementConfidence > 0.3 ? 1.3 : 1.0
                        const positiveHeight = positive * 40 * contrastMultiplier
                        const negativeHeight = negative * 40 * contrastMultiplier
                        
                        // Ensure minimum height for visibility
                        const minHeight = 2
                        const finalPositiveHeight = Math.max(minHeight, positiveHeight)
                        const finalNegativeHeight = Math.max(minHeight, negativeHeight)
                        
                        if (waveformMode === 'simple') {
                          // Simple SoundCloud-style waveform - more visible
                          if (waveformMirror) {
                            // Mirrored mode: show both positive and negative
                            const height = Math.max(minHeight, (positive + negative) * 40 * contrastMultiplier)
                            return (
                              <rect
                                key={actualIndex}
                                x={x}
                                y={50 - height / 2}
                                width={barWidth * 0.9}
                                height={height}
                                fill={isPast ? '#ff5500' : '#888'}  // Brighter future color
                                opacity={isPast ? 1.0 : 0.7}  // Increased opacity
                                className="transition-opacity duration-75"
                                shapeRendering="geometricPrecision"
                                rx={barWidth * 0.05}
                              />
                            )
                          } else {
                            // Single mode: show only positive, bottom-aligned
                            const height = Math.max(minHeight, positive * 80 * contrastMultiplier) // Use full height
                            return (
                              <rect
                                key={actualIndex}
                                x={x}
                                y={100 - height}
                                width={barWidth * 0.9}
                                height={height}
                                fill={isPast ? '#ff5500' : '#888'}
                                opacity={isPast ? 1.0 : 0.7}
                                className="transition-opacity duration-75"
                                shapeRendering="geometricPrecision"
                                rx={barWidth * 0.05}
                              />
                            )
                          }
                        } else {
                          // Colorful mode (current style) - more visible
                          const rgbMatch = bar.color.match(/\d+/g)
                          const r = rgbMatch ? rgbMatch[0] : '255'
                          const g = rgbMatch ? rgbMatch[1] : '255'
                          const b = rgbMatch ? rgbMatch[2] : '255'
                          const pastColor = bar.color
                          const futureColor = `rgba(${r}, ${g}, ${b}, 0.5)`  // Increased from 0.3 to 0.5
                          
                          if (waveformMirror) {
                            // Mirrored mode: show both positive and negative
                            return (
                              <g key={actualIndex}>
                                <rect
                                  x={x}
                                  y={50 - finalPositiveHeight}
                                  width={barWidth * 0.9}
                                  height={finalPositiveHeight}
                                  fill={isPast ? pastColor : futureColor}
                                  opacity={isPast ? 1.0 : 0.7}  // Increased from 0.9/0.5 to 1.0/0.7
                                  className="transition-opacity duration-75"
                                  shapeRendering="geometricPrecision"
                                  rx={barWidth * 0.05}
                                />
                                <rect
                                  x={x}
                                  y={50}
                                  width={barWidth * 0.9}
                                  height={finalNegativeHeight}
                                  fill={isPast ? pastColor : futureColor}
                                  opacity={isPast ? 1.0 : 0.7}  // Increased from 0.9/0.5 to 1.0/0.7
                                  className="transition-opacity duration-75"
                                  shapeRendering="geometricPrecision"
                                  rx={barWidth * 0.05}
                                />
                              </g>
                            )
                          } else {
                            // Single mode: show only positive, bottom-aligned
                            const singleHeight = Math.max(minHeight, positive * 80 * contrastMultiplier) // Use full height
                            return (
                              <rect
                                key={actualIndex}
                                x={x}
                                y={100 - singleHeight}
                                width={barWidth * 0.9}
                                height={singleHeight}
                                fill={isPast ? pastColor : futureColor}
                                opacity={isPast ? 1.0 : 0.7}
                                className="transition-opacity duration-75"
                                shapeRendering="geometricPrecision"
                                rx={barWidth * 0.05}
                              />
                            )
                          }
                        }
                      })
                    })()}
                  </svg>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                    Loading waveform...
                  </div>
                )}
              </div>
              
              {/* Progress overlay */}
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-blue-500/10 to-blue-500/20 pointer-events-none"
                style={{ 
                  width: waveformZoom <= 1 
                    ? `${currentProgress}%` 
                    : `${(() => {
                        const { start, visibleCount } = getVisibleWaveformRange()
                        const playheadIndex = (currentTime / duration) * waveformData.length
                        if (playheadIndex < start || playheadIndex > start + visibleCount) return 0
                        return ((playheadIndex - start) / visibleCount) * 100
                      })()}%`
                } as React.CSSProperties}
              />
              
              {/* Playhead line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-10"
                style={{ 
                  left: `${(() => {
                    // When follow mode is on and zoomed, always center the playhead
                    if (waveformFollow && waveformZoom > 1) {
                      return '50%' // Always centered
                    }
                    
                    if (waveformZoom <= 1) return currentProgress
                    
                    const { start, visibleCount } = getVisibleWaveformRange()
                    const playheadIndex = (currentTime / duration) * waveformData.length
                    if (playheadIndex < start || playheadIndex > start + visibleCount) return -1 // Off screen
                    return ((playheadIndex - start) / visibleCount) * 100
                  })()}%`
                } as React.CSSProperties}
              >
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
              </div>
            </div>
          </div>
          )}

          {/* Mobile Controls Panel */}
          {isMobileControlsOpen && (
            <div className="md:hidden container mx-auto px-3 sm:px-4 pb-3 border-t border-gray-800 pt-3">
              <div className="flex items-center justify-center gap-3 sm:gap-4 mb-3">
                <button
                  onClick={onPrevious}
                  className="p-2.5 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                  disabled={queue.length <= 1}
                  title="Previous"
                >
                  <FaStepBackward className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleShuffle}
                  className={`p-2.5 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    settings.isShuffled ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Shuffle"
                  disabled={queue.length <= 1}
                >
                  <FaRandom className="w-4 h-4" />
                </button>
                <button
                  onClick={onNext}
                  className="p-2.5 text-white hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                  disabled={queue.length <= 1}
                  title="Next"
                >
                  <FaStepForward className="w-4 h-4" />
                </button>
                <button
                  onClick={cycleRepeatMode}
                  className={`p-2.5 rounded transition-colors relative touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    settings.repeatMode !== 'off' ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                  }`}
                  title={`Repeat: ${settings.repeatMode}`}
                >
                  <FaRedo className="w-4 h-4" />
                  {settings.repeatMode === 'one' && (
                    <span className="absolute -top-1 -right-1 text-[8px] bg-blue-500 rounded-full w-3 h-3 flex items-center justify-center">1</span>
                  )}
                  {settings.repeatMode === 'all' && (
                    <span className="absolute -top-1 -right-1 text-[8px]">∞</span>
                  )}
                </button>
              </div>
              {/* Volume Control - Hidden when waveform is visible, hidden on mobile (volume controlled via device) */}
              {!isExpanded && (
                <div className="hidden md:flex group relative items-center justify-center flex-shrink-0">
                  <button
                    onClick={toggleMute}
                    className="text-gray-400 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title={settings.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {settings.isMuted ? <FaVolumeMute className="w-5 h-5" /> : <FaVolumeUp className="w-5 h-5" />}
                  </button>
                  {/* Horizontal slider - appears on hover/tap */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto active:pointer-events-auto z-50">
                    <div className="bg-gray-800 rounded-lg p-2 shadow-lg">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={settings.isMuted ? 0 : settings.volume}
                        onChange={(e) => {
                          const newVolume = parseFloat(e.target.value)
                          saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                          if (audioRef.current) {
                            audioRef.current.volume = newVolume
                          }
                        }}
                        className="w-32 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer touch-manipulation"
                        style={{
                          background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`
                        }}
                        title="Adjust volume"
                        aria-label="Adjust volume"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Track Details Modal */}
      {showTrackDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowTrackDetails(false)}
        >
          <div className="bg-black/90 rounded-lg p-6 max-w-md w-full border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Track Details</h3>
              <button
                onClick={() => setShowTrackDetails(false)}
                className="text-gray-400 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Close track details"
                aria-label="Close track details"
              >
                <FaTimes />
              </button>
            </div>
            {currentTrack.artwork && (
              <div className="relative w-full h-64 rounded-lg overflow-hidden mb-4">
                <Image
                  src={currentTrack.artwork}
                  alt={currentTrack.title}
                  fill
                  className="object-cover"
                  unoptimized={shouldUnoptimizeImage(currentTrack.artwork)}
                  sizes="400px"
                  quality={90}
                />
              </div>
            )}
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-400">Title</p>
                <p className="text-white font-medium">{currentTrack.title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Artist</p>
                <p className="text-white">{currentTrack.artist}</p>
              </div>
              {currentTrack.album && (
                <div>
                  <p className="text-xs text-gray-400">Album</p>
                  <p className="text-white">{currentTrack.album}</p>
                </div>
              )}
              {currentTrack.folder && (
                <div>
                  <p className="text-xs text-gray-400">Folder</p>
                  <p className="text-white">{currentTrack.folder}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Duration</p>
                <p className="text-white">{formatTime(currentTrack.duration)}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors text-sm flex items-center justify-center gap-2"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: currentTrack.title,
                      text: `Listen to ${currentTrack.title} by ${currentTrack.artist}`,
                    }).catch(() => {})
                  }
                }}
              >
                <FaShare />
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Controls - Must be outside the conditional to show in DJ mode */}
      {!isMiniMode && isExpanded && (
        <div className="border-t border-gray-800">
          {expandedMode === 'controls' || !djModeAvailable ? (
            <ExpandedPlayerControls
              currentTrack={currentTrack}
              settings={settings}
              detectedBPM={detectedBPM}
              isDetectingBPM={isDetectingBPM}
              tapTempoTaps={tapTempoTaps}
              tapTempoBPM={tapTempoBPM}
              audioContext={audioContextRef.current}
              sourceNode={sourceNodeRef.current}
              analyserNode={analyserRef.current}
              audioContextReady={audioContextReady}
              connectionQuality={connectionQuality}
              networkEffectiveType={networkEffectiveType}
              onTapTempo={handleTapTempo}
              onTempoChange={handleTempoChange}
              onChangePlaybackRate={changePlaybackRate}
              onSaveSettings={saveSettings}
              getTempoPercentage={getTempoPercentage}
              getAdjustedBPM={getAdjustedBPM}
              rateToTempoValue={rateToTempoValue}
              onBPMUpdate={handleBPMUpdate}
            />
          ) : (
            <DJMixerMode
              currentTrack={currentTrack}
              queue={queue}
              onQueueChange={onQueueChange}
              autoDJConfig={autoDJConfig}
              onExit={() => setExpandedMode('controls')}
            />
          )}
        </div>
      )}
      </div>
    </div>
  )
}
