// @ts-nocheck
'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import PopupMenuDragHeader from '@/components/ui/PopupMenuDragHeader'
import { 
  FaPlay, FaPause, FaStepForward, FaStepBackward, 
  FaVolumeUp, FaVolumeMute, FaRandom, FaRedo, FaDice,
  FaChevronDown, FaChevronUp, FaTimes, FaShare,
  FaPlus,
  FaGripVertical, FaTrash, FaCog
} from 'react-icons/fa'
import Image from 'next/image'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import {
  isUploadedFolderArtwork,
  stripArtworkCacheBust,
  subscribeCatalogSync,
} from '@/lib/catalog-sync'
import { generatePeakData, detectBPM } from '@/utils/audioWorkerClient'
import { analyzeFrequencyBands, detectTransients } from '@/utils/audioAnalysis'
import { preloadTracks } from '@/utils/serviceWorker'
import { throttle, rafThrottle } from '@/utils/performance'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { trackTrackPlay } from '@/lib/analytics'
import {
  catalogScopeLabel,
  pickRandomUnusedTracks,
} from '@/lib/audio/catalog-random'
import {
  expandPeakValley,
  multiBandRgbColor,
  normalizeFftBands,
  normalizeWaveformColorMode,
  normalizeWaveformLayerLayout,
  nearestBarZoomStep,
  stepVisibleBars,
  WAVEFORM_BAR_ZOOM_STEPS,
  WAVEFORM_COLOR_MODES,
  WAVEFORM_LAYER_LAYOUTS,
  zoomToVisibleRatio as zoomLevelToVisibleRatio,
  type WaveformColorMode,
  type WaveformLayerLayout,
  type WaveformSample,
} from '@/lib/audio/waveform-view'
import { profileFromSonicDna } from '@/lib/audio/waveform-intelligence'
import { alignBeatGridFromPeaks, setDownbeatAt } from '@/lib/audio/beat-grid'
import {
  eqBiasFromDna,
  pickBestDnaTrack,
  quantizeToDnaGrid,
  rankDnaTracks,
  resolvePlaybackBpm,
  secondsToNextPhraseBoundary,
} from '@/lib/audio/sonic-dna-mix'
import {
  buildMixPlan,
  MixEngine,
  buildMixIntelligence,
  applyTechniqueToIntelligence,
  applyEnergyCurveToIntelligence,
  resolveEffectiveMixStyle,
  resolveEffectiveMixTechniques,
  solveAlignmentState,
  computeMixDeckRates,
  suggestLeadInSec,
  resolveMixGridOffset,
  isUnsetOffset,
  readDnaBeatPhaseSec,
  toPhaseOnlyOffsetSec,
  applyDeckTempo,
  configureKeyLock,
  formantCompensationGains,
  rampDeckTempo,
  clampTempoRate,
  formatMixQuality,
  snapshotMixQuality,
  pushMixQualityHistory,
  readMixQualityHistory,
  resolveHoldBeatmatch,
  buildGridOnsetBundle,
  isGridLocked,
  readGridLockScore,
  withGridLockOnDna,
  withGridAnalysisOnDna,
  AUTO_GRID_LOCK_SCORE,
  alignMixOverlayToBeatGrid,
  resolvePhraseMixSettings,
  PLAN_FREEZE_SEC,
  prearmLeadSec,
  pairBpmCompatible,
  shouldApplyQualityGate,
  buildSkipBlendPlan,
  buildMixPairHint,
  formatMixPairHintLine,
  filterOpenness,
  type MixPlan,
  type PhraseBars,
  type DeckId,
  type MixIntelligence,
  type MixQualitySnapshot,
  type MixQualityHistoryEntry,
  type MixQualityGrade,
} from '@/lib/audio/mix-engine'
import {
  recordTapTempo,
} from '@/lib/audio/beat-count'
import {
  DEFAULT_AUTO_DJ_CONFIG,
  parseAutoDJConfig,
  readAutoDJConfigFromStorage,
  resolveIncomingRateForStrategy,
  writeAutoDJConfigToStorage,
  serializeAutoDJPayload,
  type AutoDJConfig,
} from '@/lib/audio/auto-dj-preferences'
import { peaksOrEnvelopesToWaveformSamples } from '@/lib/audio/waveform-dsp-envelope'
import { waveformAnalysisUrls, vaultRelativePath, storedWaveformLikelyStale, looksLikeSyntheticPeaks, canAnalyzeAudioWaveform, isAudioContextUnavailableError, staticWaveformJsonUrl, waveformLookupPath } from '@/lib/audio/waveform-playback-alignment'
import { alternateAudioExtensionUrl, normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'
import {
  getPlaybackWaveformCache,
  setPlaybackWaveformCache,
} from '@/lib/audio/waveform-playback-cache'
import { buildWaveformTapeCache } from '@/lib/audio/waveform-tape-cache'
import { loadWaveformSamplesForTrack } from '@/lib/audio/waveform-track-loader'
import { displayTrackBpm, displayTrackGenre, displayTrackKey } from '@/lib/audio/track-display'
import type {
  WaveformGhostTape,
  WaveformHotCue,
  WaveformMixOverlay,
} from '@/lib/audio/waveform-overlays'
import {
  dispatchPlayerSettings,
  PLAYER_TRANSPORT_EVENT,
  type PlayerTransportCommand,
} from '@/lib/audio/player-transport'
import {
  SONIC_DNA_WAVEFORM_EVENT,
  type SonicDnaWaveformEventDetail,
} from '@/components/music/SonicDnaReportModal'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import React from 'react'
import { createPortal } from 'react-dom'
import {
  useMusicPlayer,
  readMusicPlayerState,
  patchMusicPlayerState,
  DEFAULT_PLAYER_CHROME,
} from '@/contexts/MusicPlayerContext'
import AutoDJHeaderButton from '@/components/music/AutoDJHeaderButton'
import DjIcon from '@/components/music/DjIcon'
import {
  PlaybackTransportScrubber,
  type PlaybackTransportScrubberHandle,
} from '@/components/music/PlaybackTransportScrubber'

const WaveformStage = dynamic(() => import('@/components/waveform/WaveformStage'), {
  ssr: false,
  loading: () => null,
})
const SonicDnaReportModal = dynamic(() => import('@/components/music/SonicDnaReportModal'), {
  ssr: false,
  loading: () => null,
})
const AutoDJSettingsPanel = dynamic(() => import('@/components/music/AutoDJSettingsPanel'), {
  ssr: false,
  loading: () => null,
})
const MixQualityHud = dynamic(() => import('@/components/music/MixQualityHud'), {
  ssr: false,
  loading: () => null,
})

// Auto DJ transition mode type (legacy sync for DJMixerMode)
type AutoDJTransitionMode = AutoDJConfig['transitionMode']

const DEFAULT_AUTO_DJ = DEFAULT_AUTO_DJ_CONFIG

// Memoized Queue Item Component
interface QueueItemProps {
  track: Track
  index: number
  isCurrent: boolean
  onRemove: (index: number) => void
  isAutoDJNext?: boolean
  reorderEnabled?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

const QueueItem = React.memo(
  ({
    track,
    index,
    isCurrent,
    onRemove,
    isAutoDJNext,
    reorderEnabled = false,
    isDragOver = false,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  }: QueueItemProps) => {
  const art = coverArtUrl(track.artwork)
  return (
    <div
      draggable={reorderEnabled}
      onDragStart={reorderEnabled ? onDragStart : undefined}
      onDragOver={reorderEnabled ? onDragOver : undefined}
      onDrop={reorderEnabled ? onDrop : undefined}
      onDragEnd={reorderEnabled ? onDragEnd : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
        isDragOver ? 'border-t-2 border-t-purple-400' : ''
      } ${
        isCurrent
          ? 'bg-blue-900/30 border-l-2 border-blue-500'
          : 'hover:bg-gray-800'
      } ${reorderEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <FaGripVertical
        className={`text-xs shrink-0 ${reorderEnabled ? 'text-gray-400' : 'text-gray-600'}`}
        aria-hidden
      />
      {art && (
        <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0">
          <Image
            src={art}
            alt={track.album || track.title}
            fill
            className="object-cover"
            unoptimized={shouldUnoptimizeImage(art)}
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
        onMouseDown={(e) => e.stopPropagation()}
        className="text-gray-400 hover:text-red-400 transition-colors p-1"
        title="Remove from queue"
      >
        <FaTrash className="text-xs" />
      </button>
    </div>
  )
},
)

QueueItem.displayName = 'QueueItem'

const QUEUE_DRAG_MIME = 'application/x-sergik-queue-index'

/** Reorder the upcoming slice of the queue (tracks after the current index). */
function reorderUpcomingQueue(
  queue: Track[],
  currentQueueIndex: number,
  fromDisplayIdx: number,
  toDisplayIdx: number,
): Track[] {
  const base = currentQueueIndex >= 0 ? currentQueueIndex + 1 : 0
  const upcoming = queue.slice(base)
  if (
    fromDisplayIdx < 0 ||
    toDisplayIdx < 0 ||
    fromDisplayIdx >= upcoming.length ||
    toDisplayIdx >= upcoming.length ||
    fromDisplayIdx === toDisplayIdx
  ) {
    return queue
  }
  const nextUpcoming = [...upcoming]
  const [moved] = nextUpcoming.splice(fromDisplayIdx, 1)
  nextUpcoming.splice(toDisplayIdx, 0, moved)
  return [...queue.slice(0, base), ...nextUpcoming]
}

function WaveformMenuItem({
  label,
  active,
  disabled,
  onSelect,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-blue-600/25 text-white' : 'text-gray-200 hover:bg-gray-800'
      }`}
    >
      <span>{label}</span>
      {active && <span className="text-blue-400" aria-hidden="true">✓</span>}
    </button>
  )
}

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

function coverArtUrl(artwork?: string | null, bust?: number): string | undefined {
  if (!artwork) return undefined
  const src = resolveImageUrl(artwork)
  if (!src) return undefined
  if (!isUploadedFolderArtwork(src) && !src.includes('/images/audio/artwork/')) return src
  const base = stripArtworkCacheBust(src)
  const existing = artwork.match(/[?&]v=([^&]+)/)?.[1]
  if (bust) return `${base}?v=${bust}`
  if (existing) return `${base}?v=${existing}`
  return base
}

/** Prefer the playing track’s art; fall back to another track from the same album/folder. */
function albumCoverUrl(
  track?: { artwork?: string; album?: string; folder?: string } | null,
  queue: { artwork?: string; album?: string; folder?: string }[] = [],
  bust?: number,
): string | undefined {
  if (!track) return undefined
  const own = coverArtUrl(track.artwork, bust)
  if (own) return own
  if (track.album) {
    const sibling = queue.find((t) => t.album === track.album && t.artwork)
    const fromAlbum = coverArtUrl(sibling?.artwork, bust)
    if (fromAlbum) return fromAlbum
  }
  if (track.folder) {
    const sibling = queue.find((t) => t.folder === track.folder && t.artwork)
    return coverArtUrl(sibling?.artwork, bust)
  }
  return undefined
}

function buildLockScreenArtwork(artwork?: string) {
  const src = coverArtUrl(artwork)
  if (!src) return []
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
  artwork?: string | null
  album?: string
  folder?: string
  folderId?: string
  audioFileId?: string
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
  sonic_dna_status?: string | null
  display_order?: number
  track_number?: number
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
  /** Random picks from catalog / folder / playlist — not queue-order shuffle. */
  catalogRandom: boolean
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
/**
 * Smoothing time constant for mix filter sweeps. Roughly one animation frame, so
 * the audio thread interpolates between the per-frame targets the mix loop sends
 * instead of stepping to each one.
 */
/** Playback lead required before the waveform decode may re-fetch the file. */
const WAVEFORM_DECODE_BUFFER_LEAD_SEC = 12
/** Give up waiting for that lead rather than never drawing band detail. */
const WAVEFORM_DECODE_MAX_WAIT_MS = 20_000
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
  const [isAdminSession, setIsAdminSession] = useState(isAdminRoute)
  useEffect(() => {
    if (isAdminRoute) {
      setIsAdminSession(true)
      return
    }
    let cancelled = false
    void fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setIsAdminSession(Boolean(d?.authenticated && d?.isAdmin))
      })
      .catch(() => {
        if (!cancelled) setIsAdminSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAdminRoute])
  const canEditOrigBpm = isAdminRoute || isAdminSession
  const {
    waveformHost,
    seekTargetSec,
    seekNonce,
    reportPlaybackPosition,
    isQueuePanelOpen,
    setIsQueuePanelOpen,
    queuePanelHost,
    playTrack,
    seekTo,
    adoptPlayingTrack,
    isAutoDJEnabled,
    setIsAutoDJEnabled,
    autoDJSettingsMenu,
    closeAutoDJSettingsMenu,
    setPlayerChrome,
  } = useMusicPlayer()
  const isQueueOpen = isQueuePanelOpen
  const setIsQueueOpen = setIsQueuePanelOpen
  const queueDockHostRef = useRef<HTMLElement | null>(null)
  if (typeof document !== 'undefined') {
    if (queuePanelHost && document.contains(queuePanelHost)) {
      queueDockHostRef.current = queuePanelHost
    } else if (queueDockHostRef.current && !document.contains(queueDockHostRef.current)) {
      queueDockHostRef.current = null
    }
  }
  const queueDockHost =
    typeof document !== 'undefined' && queuePanelHost && document.contains(queuePanelHost)
      ? queuePanelHost
      : queueDockHostRef.current
  const isQueueDocked = Boolean(queueDockHost)
  const isWaveformDocked = Boolean(waveformHost)
  const [coverBust, setCoverBust] = useState(() => Date.now())
  useEffect(() => {
    return subscribeCatalogSync((event) => {
      if (!Object.prototype.hasOwnProperty.call(event.patch, 'artwork')) return
      setCoverBust(Date.now())
    })
  }, [])
  const coverSrc = useMemo(
    () => albumCoverUrl(currentTrack, queue, coverBust),
    [currentTrack, queue, coverBust],
  )
  const waveformIntelligenceProfile = useMemo(
    () => profileFromSonicDna(currentTrack?.sonic_dna),
    [currentTrack?.sonic_dna]
  )
  const coverUnoptimized = coverSrc ? shouldUnoptimizeImage(coverSrc) : true
  const coverAlt = currentTrack?.album || currentTrack?.title || 'Album artwork'
  // DJ mode: visible in admin for testing; set DJ_MODE_ENABLED true to show on frontend
  const djModeAvailable = DJ_MODE_ENABLED || isAdminRoute
  const [internalIsPlaying, setInternalIsPlaying] = useState(false)
  const isPlaying = externalIsPlaying !== undefined ? externalIsPlaying : internalIsPlaying
  const setIsPlaying = (value: boolean) => {
    setInternalIsPlaying(value)
    onPlayStateChange?.(value)
  }
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = readMusicPlayerState()?.currentTime
    return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : 0
  })
  /** Live playhead for engine logic — updated on timeupdate without React commits. */
  const playbackTimeRef = useRef(currentTime)
  const autoDJCurrentTimeRef = useRef(currentTime)
  const transportMiniMobileRef = useRef<PlaybackTransportScrubberHandle>(null)
  const transportMiniDesktopRef = useRef<PlaybackTransportScrubberHandle>(null)
  const transportExpandedRef = useRef<PlaybackTransportScrubberHandle>(null)
  const [duration, setDuration] = useState(() => {
    const track = readMusicPlayerState()?.currentTrack
    const d = track?.duration
    return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const resolvedUrlCacheRef = useRef<Map<string, string>>(new Map())
  const [bufferedProgress, setBufferedProgress] = useState(0)
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null)
  const [isQueueExpanded, setIsQueueExpanded] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = readMusicPlayerState()?.chrome?.isExpanded
    return typeof saved === 'boolean' ? saved : DEFAULT_PLAYER_CHROME.isExpanded
  })
  const [isKeyboardShortcutsExpanded, setIsKeyboardShortcutsExpanded] = useState(false)
  const [isWaveformSettingsExpanded, setIsWaveformSettingsExpanded] = useState(false)
  const [expandedMode, setExpandedMode] = useState<'controls' | 'dj'>('controls')
  const [autoDJConfig, setAutoDJConfig] = useState<AutoDJConfig>(() => {
    const saved = readAutoDJConfigFromStorage()
    return {
      ...saved,
      enabled: DEFAULT_AUTO_DJ.enabled,
    }
  })
  const autoDJConfigRef = useRef(autoDJConfig)
  autoDJConfigRef.current = autoDJConfig
  const [autoDJLibrary, setAutoDJLibrary] = useState<Track[]>([])
  const playedTrackIdsRef = useRef<Set<string>>(new Set())
  const catalogRandomFillKeyRef = useRef('')
  const autoDJIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoDJLastAddedRef = useRef<string | null>(null)
  const autoDJPendingRef = useRef<string | null>(null)
  /** Freeze OUT plan once within ~4s so ticks cannot snap earlier. */
  const autoDJFrozenPlanRef = useRef<{
    outgoingId: string
    incomingId: string
    plan: MixPlan
  } | null>(null)
  const autoDJCrossfadeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  /** rAF loop — fires the mix when live currentTime crosses the OUT marker. */
  const autoDJOutRafRef = useRef<number | null>(null)
  /** rAF — skip blend waits for the next outgoing beat. */
  const skipBlendRafRef = useRef<number | null>(null)
  const skipToNextRef = useRef<() => void>(() => {})
  /** Seconds until the last planned mix point; drives how often we replan. */
  const autoDJPlanDelayRef = useRef<number | null>(null)
  const autoDJPlanScanRef = useRef(0)
  const [autoDJStatusMessage, setAutoDJStatusMessage] = useState('')
  const [lastMixQuality, setLastMixQuality] = useState<MixQualitySnapshot | null>(null)
  const lastMixQualityRef = useRef<MixQualitySnapshot | null>(null)
  lastMixQualityRef.current = lastMixQuality
  const [mixQualityHistory, setMixQualityHistory] = useState<MixQualityHistoryEntry[]>([])
  useEffect(() => {
    setMixQualityHistory(readMixQualityHistory())
  }, [])
  const [autoDJPendingTrackId, setAutoDJPendingTrackId] = useState<string | null>(null)
  const [autoDJLeadIn, setAutoDJLeadIn] = useState(() => readAutoDJConfigFromStorage().leadIn)
  const autoDJLeadInRef = useRef(autoDJLeadIn)
  autoDJLeadInRef.current = autoDJLeadIn
  const [autoDJSuggestedLeadIn, setAutoDJSuggestedLeadIn] = useState(0)
  const [fanUserId, setFanUserId] = useState<string | null>(null)
  const [autoDJCloudLoaded, setAutoDJCloudLoaded] = useState(false)
  const [autoDJSaving, setAutoDJSaving] = useState(false)
  const [autoDJDirty, setAutoDJDirty] = useState(false)
  const [isTrackListExpanded, setIsTrackListExpanded] = useState(false)
  const clearAutoDJOutWatch = useCallback(() => {
    if (autoDJOutRafRef.current != null) {
      cancelAnimationFrame(autoDJOutRafRef.current)
      autoDJOutRafRef.current = null
    }
  }, [])

  const clearSkipBlendWatch = useCallback(() => {
    if (skipBlendRafRef.current != null) {
      cancelAnimationFrame(skipBlendRafRef.current)
      skipBlendRafRef.current = null
    }
  }, [])

  const clearAutoDJCrossfadeTimeout = useCallback(() => {
    if (autoDJCrossfadeTimeoutRef.current) {
      clearTimeout(autoDJCrossfadeTimeoutRef.current)
      autoDJCrossfadeTimeoutRef.current = null
    }
    clearAutoDJOutWatch()
  }, [clearAutoDJOutWatch])

  const resetAutoDJToDefaults = useCallback(() => {
    setIsAutoDJEnabled(DEFAULT_AUTO_DJ.enabled)
    setAutoDJConfig({ ...DEFAULT_AUTO_DJ })
    setAutoDJLeadIn(DEFAULT_AUTO_DJ.leadIn)
    writeAutoDJConfigToStorage({ ...DEFAULT_AUTO_DJ, leadIn: DEFAULT_AUTO_DJ.leadIn })
    setAutoDJDirty(true)
    setAutoDJStatusMessage('Restored default Auto DJ settings')
    clearAutoDJCrossfadeTimeout()
  }, [clearAutoDJCrossfadeTimeout, setIsAutoDJEnabled])

  const patchAutoDJConfig = useCallback((patch: Partial<AutoDJConfig>) => {
    setAutoDJConfig((prev) => {
      const next = parseAutoDJConfig({ ...prev, ...patch })
      writeAutoDJConfigToStorage({ ...next, leadIn: autoDJLeadIn })
      return next
    })
    setAutoDJDirty(true)
  }, [autoDJLeadIn])

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setFanUserId(d?.authenticated && d.user?.id ? d.user.id : null)
      })
      .catch(() => {
        if (!cancelled) setFanUserId(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!fanUserId || autoDJCloudLoaded) return
    let cancelled = false
    fetch('/api/fan/auto-dj-settings', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.settings) return
        const cloud = parseAutoDJConfig(d.settings)
        setAutoDJConfig((prev) => ({
          ...cloud,
          enabled: prev.enabled,
        }))
        setAutoDJLeadIn(cloud.leadIn)
        writeAutoDJConfigToStorage(cloud)
        setAutoDJDirty(false)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAutoDJCloudLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [fanUserId, autoDJCloudLoaded])

  useEffect(() => {
    writeAutoDJConfigToStorage(serializeAutoDJPayload(autoDJConfig, autoDJLeadIn))
  }, [autoDJConfig, autoDJLeadIn])

  const saveAutoDJToAccount = useCallback(async () => {
    const payload = serializeAutoDJPayload(autoDJConfig, autoDJLeadIn)
    writeAutoDJConfigToStorage(payload)
    if (!fanUserId) {
      setAutoDJStatusMessage('Settings saved on this device')
      setAutoDJDirty(false)
      return
    }
    setAutoDJSaving(true)
    try {
      const res = await fetch('/api/fan/auto-dj-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body?.code === 'MIGRATION_REQUIRED') {
          setAutoDJStatusMessage('Cloud save pending DB migration — saved locally')
        } else {
          setAutoDJStatusMessage('Could not save to account — stored locally')
        }
        return
      }
      setAutoDJStatusMessage('Auto DJ settings saved to your account')
      setAutoDJDirty(false)
    } catch {
      setAutoDJStatusMessage('Could not save to account — stored locally')
    } finally {
      setAutoDJSaving(false)
    }
  }, [autoDJConfig, autoDJLeadIn, fanUserId])

  const prevAutoDJEnabledRef = useRef(isAutoDJEnabled)
  useEffect(() => {
    setAutoDJConfig((prev) =>
      prev.enabled === isAutoDJEnabled ? prev : { ...prev, enabled: isAutoDJEnabled },
    )
    if (prevAutoDJEnabledRef.current && !isAutoDJEnabled) {
      setAutoDJStatusMessage((msg) =>
        msg === 'Restored default Auto DJ settings' ? msg : '',
      )
      setWaveformMixOverlay(null)
      setWaveformGhostTape(null)
      // Symmetric EQ/filter chain — restore live deck strip to saved gains.
      const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
      const liveEq = deckUiRef.current[liveDeck].eqGains
      mixEngineRef.current?.setDeckEqGains(liveDeck, liveEq, { instant: true })
    }
    prevAutoDJEnabledRef.current = isAutoDJEnabled
  }, [isAutoDJEnabled])

  useEffect(() => {
    if (!autoDJSettingsMenu) return
    const openedAt = performance.now()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAutoDJSettingsMenu()
    }
    const onPointer = (e: PointerEvent) => {
      // Ignore the opening gesture (and Playwright's leftover pointer events).
      if (performance.now() - openedAt < 400) return
      if (e.button === 2) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-auto-dj-settings-menu]')) return
      if (target?.closest('[aria-label="Enable Auto DJ"], [aria-label="Disable Auto DJ"]')) return
      closeAutoDJSettingsMenu()
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointer)
    }, 400)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [autoDJSettingsMenu, closeAutoDJSettingsMenu])

  const [allSourceTracks, setAllSourceTracks] = useState<Track[]>([])

  const defaultSettings: PlayerSettings = {
    volume: 1,
    isMuted: false,
    isShuffled: false,
    catalogRandom: true,
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

  const primeQueue = useCallback(() => {
    if (!onQueueChange) return
    const pool = autoDJConfig.enabled && autoDJLibrary.length > 0
      ? autoDJLibrary
      : allSourceTracks.length > 0
        ? allSourceTracks
        : autoDJLibrary
    if (pool.length === 0) {
      setAutoDJStatusMessage('No library tracks to prime')
      return
    }
    const exclude = new Set(queue.map((track) => track.id))
    playedTrackIdsRef.current.forEach((id) => exclude.add(id))
    const primeCount = Math.max(1, Math.min(autoDJConfig.lookahead, 8))
    const useRandom = settings.catalogRandom || !autoDJConfig.enabled
    const remaining = pool.filter((track) => !exclude.has(track.id))
    const selection = useRandom
      ? pickRandomUnusedTracks(pool, exclude, primeCount, {
          allowReshuffle: true,
          keepExcluded: currentTrack ? [currentTrack.id] : [],
        })
      : remaining.slice(0, primeCount)
    if (selection.length === 0) {
      setAutoDJStatusMessage('Queue already contains library tracks')
      return
    }
    onQueueChange([...queue, ...selection])
    const scope = catalogScopeLabel(currentSource)
    setAutoDJStatusMessage(
      `Primed ${selection.length} ${useRandom ? 'random ' : ''}track${selection.length > 1 ? 's' : ''} from ${scope}`,
    )
  }, [
    autoDJLibrary,
    allSourceTracks,
    queue,
    onQueueChange,
    autoDJConfig.lookahead,
    autoDJConfig.enabled,
    settings.catalogRandom,
    currentTrack,
    currentSource,
  ])

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
  const [isMiniMode, setIsMiniMode] = useState(() => {
    const saved = readMusicPlayerState()?.chrome?.isMiniMode
    return typeof saved === 'boolean' ? saved : DEFAULT_PLAYER_CHROME.isMiniMode
  })
  const [isWaveformCollapsed, setIsWaveformCollapsed] = useState(() => {
    const saved = readMusicPlayerState()?.chrome?.isWaveformCollapsed
    return typeof saved === 'boolean' ? saved : DEFAULT_PLAYER_CHROME.isWaveformCollapsed
  })
  useEffect(() => {
    setPlayerChrome({ isMiniMode, isExpanded, isWaveformCollapsed })
    patchMusicPlayerState({ chrome: { isMiniMode, isExpanded, isWaveformCollapsed } })
  }, [isMiniMode, isExpanded, isWaveformCollapsed, setPlayerChrome])
  const [showTrackDetails, setShowTrackDetails] = useState(false)
  const [waveformData, setWaveformData] = useState<WaveformSample[]>([])
  const [precomputedPeaks, setPrecomputedPeaks] = useState<number[] | null>(null)
  const [waveformMode, setWaveformMode] = useState<WaveformColorMode>(() => {
    if (typeof window === 'undefined') return 'energy'
    try {
      const stored = localStorage.getItem('sergik.waveformColorMode')
      // Prefer MiniMeters multi-band energy (matches reference look). Soft-migrate
      // prior Ableton "channel" / spectral defaults that rendered as a teal slab.
      if (!stored || stored === 'gradient' || stored === 'classic' || stored === 'channel') {
        return 'energy'
      }
      return normalizeWaveformColorMode(stored)
    } catch {
      return 'energy'
    }
  })
  const [waveformLayerLayout, setWaveformLayerLayout] = useState<WaveformLayerLayout>(() => {
    if (typeof window === 'undefined') return 'merged'
    try {
      return normalizeWaveformLayerLayout(localStorage.getItem('sergik.waveformLayerLayout'))
    } catch {
      return 'merged'
    }
  })
  /** 0 = full track; otherwise bars visible (4/8/16… ladder). */
  const [waveformVisibleBars, setWaveformVisibleBars] = useState(0)
  const [waveformOffset, setWaveformOffset] = useState(0) // For panning when zoomed
  const [waveformFollow, setWaveformFollow] = useState(true) // Follow mode - keep playhead centered when zoomed (CDJ)
  // Derived: 1 = full overview; >1 = zoomed bar window (keeps legacy checks working)
  const waveformZoom = waveformVisibleBars > 0 ? Math.max(1.05, 128 / waveformVisibleBars) : 1
  const [waveformMirror, setWaveformMirror] = useState(true) // Mirrored colorful view at 1x (matches waveform menu defaults)
  const [waveformSpeed, setWaveformSpeed] = useState(1.0) // Waveform animation speed (0.25x to 4x)
  const [waveformHorizontalZoom, setWaveformHorizontalZoom] = useState(0.5) // Horizontal zoom (0.1x to 8x) - default 0.5x for slower movement
  const [waveformMenu, setWaveformMenu] = useState<{
    x: number
    y: number
    deck: 'a' | 'b'
  } | null>(null)
  const waveformMenuRef = useRef<HTMLDivElement>(null)
  const waveformMenuClamp = useClampedFixedMenuPosition(
    !!waveformMenu,
    waveformMenu,
    { width: 224, height: 640 },
    { externalRef: waveformMenuRef },
  )
  const autoDJMenuClamp = useClampedFixedMenuPosition(
    !!autoDJSettingsMenu,
    autoDJSettingsMenu
      ? { x: autoDJSettingsMenu.x - 448, y: autoDJSettingsMenu.y }
      : null,
    { width: 448, height: 560 },
  )
  const [sonicDnaReportOpen, setSonicDnaReportOpen] = useState(false)
  const [sonicDnaReportTrack, setSonicDnaReportTrack] = useState<Track | null>(null)
  const sonicDnaReportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('sergik.waveformColorMode', waveformMode)
    } catch {
      /* ignore */
    }
  }, [waveformMode])

  useEffect(() => {
    try {
      localStorage.setItem('sergik.waveformLayerLayout', waveformLayerLayout)
    } catch {
      /* ignore */
    }
  }, [waveformLayerLayout])

  // Beat grid state — offsetSec is absolute downbeat time (see lib/audio/beat-grid)
  const [beatGridEnabled, setBeatGridEnabled] = useState(false)
  const [beatGridOffsetSec, setBeatGridOffsetSec] = useState(0)
  const beatGridOffsetSecRef = useRef(0)
  beatGridOffsetSecRef.current = beatGridOffsetSec
  const [beatGridBeatsPerBar, setBeatGridBeatsPerBar] = useState(4)
  const [beatGridLock, setBeatGridLock] = useState<number | null>(null)
  /** Admin/user verified grid — skip auto re-align and persist on sonic_dna. */
  const [beatGridLocked, setBeatGridLocked] = useState(false)
  const beatGridSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoAlignedTrackIdRef = useRef<string | null>(null)
  const [originalQueue, setOriginalQueue] = useState<Track[]>([])
  const [crossfadeActive, setCrossfadeActive] = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false)
  const [detectedBPM, setDetectedBPM] = useState<number | null>(null)
  const [isDetectingBPM, setIsDetectingBPM] = useState(false)
  const bpmCacheRef = useRef<Map<string, number | null>>(new Map())
  const tapTempoTimeoutRef = useRef<{ a: ReturnType<typeof setTimeout> | null; b: ReturnType<typeof setTimeout> | null }>({
    a: null,
    b: null,
  })
  const loggedErrorsRef = useRef<Set<string>>(new Set())
  type DeckUiSlice = {
    playbackRate: number
    tapTempoTaps: number[]
    tapTempoBPM: number | null
    tapTempoSectionBpms: number[]
    eqGains: { low: number; mid: number; high: number }
    detectedBpm: number | null
  }
  const defaultDeckUiSlice = (): DeckUiSlice => ({
    playbackRate: 1,
    tapTempoTaps: [],
    tapTempoBPM: null,
    tapTempoSectionBpms: [],
    eqGains: { low: 0, mid: 0, high: 0 },
    detectedBpm: null,
  })
  const [deckUi, setDeckUi] = useState<{ a: DeckUiSlice; b: DeckUiSlice }>({
    a: defaultDeckUiSlice(),
    b: defaultDeckUiSlice(),
  })
  const deckUiRef = useRef(deckUi)
  deckUiRef.current = deckUi
  const [mixVisualProgress, setMixVisualProgress] = useState<number | null>(null)
  const mixProgressPendingRef = useRef<number | null>(null)
  const mixUiSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mixUiPendingRef = useRef<{
    progress?: number | null
    deckRates: Partial<Record<DeckId, number>>
    deckEq: Partial<Record<DeckId, { low: number; mid: number; high: number }>>
    deckFilters: Partial<Record<DeckId, { hpfHz: number; lpfHz: number }>>
  }>({ deckRates: {}, deckEq: {}, deckFilters: {} })
  const [deckFilterUi, setDeckFilterUi] = useState<{
    a: { hpfHz: number; lpfHz: number }
    b: { hpfHz: number; lpfHz: number }
  }>({
    a: { hpfHz: 20, lpfHz: 20000 },
    b: { hpfHz: 20, lpfHz: 20000 },
  })
  const [autoDJOutCountdown, setAutoDJOutCountdown] = useState<number | null>(null)
  const [mixQualityFlash, setMixQualityFlash] = useState<{
    grade: MixQualityGrade
    until: number
  } | null>(null)
  const postHandoffTempoUntilRef = useRef(0)
  const MIX_UI_SYNC_MS = 50
  const [connectionQuality, setConnectionQuality] = useState<'slow' | 'medium' | 'fast'>('fast')
  const [networkEffectiveType, setNetworkEffectiveType] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(true)
  const processedWaveformTrackRef = useRef<string | null>(null)
  /** Static track envelope (peaks) — never replaced by live oscilloscope data. */
  const trackWaveformBaseRef = useRef<typeof waveformData>([])
  const onQueueChangeRef = useRef(onQueueChange)
  const updatedQueueTrackRef = useRef<Set<string>>(new Set())
  const queueRef = useRef(queue)
  queueRef.current = queue
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const nextAudioRef = useRef<HTMLAudioElement>(null)
  /** Always points at the live transport element (follows deck after mixes). */
  const liveAudioRef = useRef<HTMLAudioElement | null>(null)
  /** Which <audio> is the live playhead after a deck-swap mix. */
  const playbackDeckRef = useRef<'main' | 'next'>('main')
  /** Skip audio.src reload once after deck-swap handoff. */
  const skipSrcReloadRef = useRef(false)
  /** Guards React effects from cold-loading main during deck-swap settle. */
  type DeckHandoffState = {
    trackId: string
    deck: 'main' | 'next'
    incomingTargetRate: number
    untilMs: number
  }
  const deckHandoffRef = useRef<DeckHandoffState | null>(null)
  const HANDOFF_GUARD_MS = 700
  const isDeckHandoffActive = useCallback((trackId?: string | null) => {
    const h = deckHandoffRef.current
    if (!h) return false
    if (Date.now() > h.untilMs) {
      deckHandoffRef.current = null
      return false
    }
    if (trackId != null && h.trackId !== trackId) return false
    return true
  }, [])
  const armDeckHandoff = useCallback(
    (track: Track, deck: 'main' | 'next', incomingTargetRate: number) => {
      deckHandoffRef.current = {
        trackId: track.id,
        deck,
        incomingTargetRate,
        untilMs: Date.now() + HANDOFF_GUARD_MS,
      }
      skipSrcReloadRef.current = true
    },
    [],
  )
  const phraseMixLockRef = useRef(false)
  const mixEngineRef = useRef<MixEngine | null>(null)
  const lastMixPlanRef = useRef<MixPlan | null>(null)
  const cuedIdleTrackIdRef = useRef<string | null>(null)
  /** Track id whose idle decoder was silently warmed before OUT. */
  const autoDJIdleWarmedRef = useRef<string | null>(null)
  const [autoDJCuedTrackId, setAutoDJCuedTrackId] = useState<string | null>(null)
  const setCuedIdleTrackId = useCallback((id: string | null) => {
    cuedIdleTrackIdRef.current = id
    setAutoDJCuedTrackId(id)
  }, [])
  const precueIdleForQueueSuccessorRef = useRef<
    ((liveTrack: Track, trackQueue: Track[]) => Promise<void>) | null
  >(null)
  /** Debounce id for N+2 waveform/grid prefetch during Auto DJ. */
  const mixLookahead2IdRef = useRef<string | null>(null)
  const rateEaseRafRef = useRef<number | null>(null)
  const rateEaseLockRef = useRef(false)
  const lastTempoCompRateRef = useRef(1)
  const tempoRampCancelRef = useRef<(() => void) | null>(null)

  const getPlaybackAudio = useCallback((): HTMLAudioElement | null => {
    const live =
      playbackDeckRef.current === 'next' ? nextAudioRef.current : audioRef.current
    liveAudioRef.current = live
    return live
  }, [])

  const getIdleAudio = useCallback((): HTMLAudioElement | null => {
    return playbackDeckRef.current === 'next' ? audioRef.current : nextAudioRef.current
  }, [])

  const detectedBPMRef = useRef(detectedBPM)
  detectedBPMRef.current = detectedBPM

  /** Live deck tempo — feeds MixEngine beatmatch (ExpandedPlayerControls slider). */
  const getOutgoingPlaybackRate = useCallback((): number => {
    const live = getPlaybackAudio()
    const rate = live?.playbackRate
    if (typeof rate === 'number' && rate > 0) return rate
    const pref = settingsRef.current.playbackRate
    return typeof pref === 'number' && pref > 0 ? pref : 1
  }, [getPlaybackAudio])

  const toMixTrackRef = useCallback((track: Track) => {
    const cachedOffset = mixGridOffsetCacheRef.current.get(track.id)
    return {
      id: track.id,
      file: track.file,
      title: track.title,
      bpm:
        resolvePlaybackBpm(track, detectedBPMRef.current) ??
        track.bpm ??
        detectedBPMRef.current ??
        null,
      beat_grid_offset:
        typeof cachedOffset === 'number' ? cachedOffset : track.beat_grid_offset,
      duration: track.duration ?? null,
      sonic_dna: track.sonic_dna,
      energy_level: track.energy_level ?? null,
    }
  }, [])

  /** Hot cues mirror — filled after `waveformHotCues` state is declared. */
  const waveformHotCuesRef = useRef<WaveformHotCue[]>([])

  /** Memo of the inputs each track's grid offset was last derived from. */
  const mixGridOffsetSigRef = useRef<Map<string, { sig: string; offset: number }>>(new Map())

  const cacheMixGridOffset = useCallback(
    (
      track: Track,
      peaks: Array<number | { positive?: number; negative?: number; rms?: number }>,
      durationSec: number,
    ) => {
      if (isGridLocked(track.sonic_dna)) {
        const lockedOff =
          typeof track.beat_grid_offset === 'number' && Number.isFinite(track.beat_grid_offset)
            ? Math.max(0, track.beat_grid_offset)
            : 0
        mixGridOffsetCacheRef.current.set(track.id, lockedOff)
        return lockedOff
      }
      // The Auto DJ tick calls this ten times a second, but onset detection over
      // the full peak array only yields a new answer when the tape or duration
      // changes — so key on those and reuse the result in between.
      const sig = `${peaks.length}:${Math.round(durationSec * 100)}`
      const memo = mixGridOffsetSigRef.current.get(track.id)
      if (memo && memo.sig === sig) return memo.offset

      const ref = toMixTrackRef(track)
      const offset = resolveMixGridOffset(ref, { peaks, durationSec })
      mixGridOffsetCacheRef.current.set(track.id, offset)
      mixGridOffsetSigRef.current.set(track.id, { sig, offset })
      return offset
    },
    [toMixTrackRef],
  )

  const withMixGrid = useCallback(
    (track: Track) => {
      const ref = toMixTrackRef(track)
      const cached = mixGridOffsetCacheRef.current.get(track.id)
      const ghost = ghostSamplesRef.current
      let waveformPeaks: Array<number | { positive?: number; negative?: number; rms?: number }> | undefined
      let waveformDurationSec: number | undefined
      if (ghost?.trackId === track.id) {
        waveformPeaks = ghost.samples
        waveformDurationSec = ghost.durationSec
      } else if (
        trackWaveformBaseRef.current.length >= 64 &&
        autoDJCurrentTrackRef.current?.id === track.id
      ) {
        waveformPeaks = trackWaveformBaseRef.current
        waveformDurationSec =
          autoDJDurationRef.current > 0
            ? autoDJDurationRef.current
            : track.duration ?? undefined
      }
      const hotCues =
        autoDJCurrentTrackRef.current?.id === track.id
          ? waveformHotCuesRef.current.map((c) => ({ timeSec: c.timeSec, label: c.label }))
          : undefined
      return {
        ...ref,
        beat_grid_offset: (() => {
          if (isGridLocked(track.sonic_dna)) {
            const locked =
              typeof track.beat_grid_offset === 'number' && Number.isFinite(track.beat_grid_offset)
                ? Math.max(0, track.beat_grid_offset)
                : typeof ref.beat_grid_offset === 'number'
                  ? ref.beat_grid_offset
                  : 0
            return locked
          }
          // Prefer persisted UI grid over peak-cache when both exist.
          if (
            typeof track.beat_grid_offset === 'number' &&
            Number.isFinite(track.beat_grid_offset) &&
            track.beat_grid_offset >= 0
          ) {
            return track.beat_grid_offset
          }
          return cached != null ? cached : ref.beat_grid_offset
        })(),
        waveformPeaks,
        waveformDurationSec,
        hotCues,
      }
    },
    [toMixTrackRef],
  )

  const buildMixIntelligenceForPair = useCallback(
    (outTrack: Track, inTrack: Track, style: MixPlan['style'], incomingTargetRate?: number) => {
      const outRef = withMixGrid(outTrack)
      const inRef = withMixGrid(inTrack)
      const autoDjOn = autoDJConfigRef.current.enabled
      const techniques = autoDjOn
        ? (['standard'] as const)
        : resolveEffectiveMixTechniques(
            autoDJConfigRef.current.mixTechniques,
            outRef,
            inRef,
          )
      let intel = buildMixIntelligence({
        outgoing: outRef,
        incoming: inRef,
        style,
        outgoingRate: getOutgoingPlaybackRate(),
        incomingTargetRate: incomingTargetRate ?? settingsRef.current.playbackRate,
      })
      intel = applyTechniqueToIntelligence(
        intel,
        techniques,
        autoDjOn ? 'crossfade' : autoDJConfigRef.current.mixStyle,
      )
      intel = applyEnergyCurveToIntelligence(
        intel,
        autoDjOn ? 'hold' : autoDJConfigRef.current.energyCurve,
      )
      if (autoDjOn) {
        intel = {
          ...intel,
          incomingDelay: 0,
          energyScale: 1,
          echoSend: style === 'cut' ? intel.echoSend : 0,
          lowDuckDb: style === 'crossfade' ? 0 : intel.lowDuckDb,
          filterIntensity: style === 'crossfade' ? 0 : intel.filterIntensity,
        }
      }
      return intel
    },
    [withMixGrid, getOutgoingPlaybackRate],
  )

  const computeMixIncomingRate = useCallback(
    (outTrack: Track | null | undefined, inTrack: Track) => {
      const outBpm =
        (outTrack && resolvePlaybackBpm(outTrack, detectedBPMRef.current)) ??
        outTrack?.bpm ??
        detectedBPMRef.current ??
        120
      const inBpm = resolvePlaybackBpm(inTrack, null) ?? inTrack.bpm ?? 120
      return computeMixDeckRates({
        outgoingBpm: outBpm,
        incomingBpm: inBpm,
        outgoingPlaybackRate: getOutgoingPlaybackRate(),
        incomingTargetRate: settingsRef.current.playbackRate,
      }).incomingRate
    },
    [getOutgoingPlaybackRate]
  )

  const applyFormantForRate = useCallback((rate: number) => {
    const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
    const engine = mixEngineRef.current
    if (!engine) return
    const gainMul = mixIntelRef.current?.incomingStretch.formantGain ?? 1
    const prev = formantCompensationGains(lastTempoCompRateRef.current)
    const next = formantCompensationGains(rate)
    const cur = engine.getDeckEqGains(liveDeck)
    const updated = {
      low: cur.low - prev.low * gainMul + next.low * gainMul,
      mid: cur.mid - prev.mid * gainMul + next.mid * gainMul,
      high: cur.high - prev.high * gainMul + next.high * gainMul,
    }
    engine.setDeckEqGains(liveDeck, updated, { instant: false })
    setDeckUi((prevUi) => ({
      ...prevUi,
      [liveDeck]: { ...prevUi[liveDeck], eqGains: updated },
    }))
    lastTempoCompRateRef.current = rate
  }, [])

  const applyDeckStripEq = useCallback(
    (
      deck: DeckId,
      gains: { low: number; mid: number; high: number },
      opts?: { instant?: boolean },
    ) => {
      mixEngineRef.current?.setDeckEqGains(deck, gains, opts)
      setDeckUi((prev) => ({
        ...prev,
        [deck]: { ...prev[deck], eqGains: gains },
      }))
    },
    [],
  )

  const applyLiveDeckTempo = useCallback(
    (rate: number, instant = true) => {
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      const live = getPlaybackAudio()
      const clamped = clampTempoRate(rate)
      if (live) {
        configureKeyLock(live, true)
        applyDeckTempo(live, clamped, { keyLock: true, instant })
      }
      mixEngineRef.current?.setDeckPlaybackRate(liveDeck, clamped, { instant })
      setDeckUi((prev) => ({
        ...prev,
        [liveDeck]: { ...prev[liveDeck], playbackRate: clamped },
      }))
      applyFormantForRate(clamped)
    },
    [getPlaybackAudio, applyFormantForRate],
  )

  const flushMixUiSync = useCallback(() => {
    mixUiSyncTimerRef.current = null
    const pending = mixUiPendingRef.current
    if (pending.progress !== undefined) {
      setMixVisualProgress(pending.progress)
      setWaveformMixOverlay((prev) =>
        prev?.active ? { ...prev, blendProgress: pending.progress ?? null } : prev,
      )
    }
    const hasRates = pending.deckRates.a != null || pending.deckRates.b != null
    const hasEq = pending.deckEq.a != null || pending.deckEq.b != null
    if (hasRates || hasEq) {
      setDeckUi((prev) => ({
        a: {
          ...prev.a,
          ...(pending.deckRates.a != null ? { playbackRate: pending.deckRates.a } : {}),
          ...(pending.deckEq.a != null ? { eqGains: pending.deckEq.a } : {}),
        },
        b: {
          ...prev.b,
          ...(pending.deckRates.b != null ? { playbackRate: pending.deckRates.b } : {}),
          ...(pending.deckEq.b != null ? { eqGains: pending.deckEq.b } : {}),
        },
      }))
    }
    const hasFilters = pending.deckFilters.a != null || pending.deckFilters.b != null
    if (hasFilters) {
      setDeckFilterUi((prev) => ({
        a: pending.deckFilters.a ?? prev.a,
        b: pending.deckFilters.b ?? prev.b,
      }))
    }
    mixUiPendingRef.current = { deckRates: {}, deckEq: {}, deckFilters: {} }
  }, [])

  const scheduleMixUiSync = useCallback(() => {
    if (mixUiSyncTimerRef.current != null) return
    mixUiSyncTimerRef.current = window.setTimeout(flushMixUiSync, MIX_UI_SYNC_MS)
  }, [flushMixUiSync])

  const pushMixVisualProgress = useCallback(
    (raw: number) => {
      mixUiPendingRef.current.progress = Math.max(0, Math.min(1, raw))
      scheduleMixUiSync()
    },
    [scheduleMixUiSync],
  )

  const clearMixVisualProgress = useCallback(() => {
    if (mixUiSyncTimerRef.current != null) {
      clearTimeout(mixUiSyncTimerRef.current)
      mixUiSyncTimerRef.current = null
    }
    mixUiPendingRef.current = { deckRates: {}, deckEq: {}, deckFilters: {} }
    setMixVisualProgress(null)
    setWaveformMixOverlay((prev) =>
      prev?.active ? { ...prev, blendProgress: null } : prev,
    )
  }, [])

  const getDeckStripEq = useCallback((deck: DeckId) => {
    const engine = mixEngineRef.current
    if (engine) return engine.getDeckEqGains(deck)
    return deckUiRef.current[deck].eqGains
  }, [])

  /** Bump when the live media element changes so WaveformStage re-arms its clock. */
  const [waveformMediaSyncKey, setWaveformMediaSyncKey] = useState('main')
  const [waveformMixOverlay, setWaveformMixOverlay] = useState<WaveformMixOverlay | null>(null)
  const [waveformGhostTape, setWaveformGhostTape] = useState<WaveformGhostTape | null>(null)
  type DeckWaveformPack = {
    trackId: string
    samples: WaveformSample[]
    durationSec: number
  }
  const [deckWaveformCache, setDeckWaveformCache] = useState<{
    a?: DeckWaveformPack
    b?: DeckWaveformPack
  }>({})
  const [waveformHotCues, setWaveformHotCues] = useState<WaveformHotCue[]>([])
  waveformHotCuesRef.current = waveformHotCues
  const ghostSamplesRef = useRef<{
    trackId: string
    samples: import('@/lib/audio/waveform-view').WaveformSample[]
    durationSec: number
    sonicDna?: unknown
  } | null>(null)
  /** Cached peak-aligned grid offsets for mix planning */
  const mixGridOffsetCacheRef = useRef<Map<string, number>>(new Map())
  const mixIntelRef = useRef<MixIntelligence | null>(null)

  const ensureMixEngine = useCallback((): MixEngine | null => {
    const main = audioRef.current
    const next = nextAudioRef.current
    if (!main || !next) return null
    if (!mixEngineRef.current) {
      const engine = new MixEngine(main, next)
      engine.subscribe((ev) => {
        if (ev.type !== 'mix-quality') return
        const snap = snapshotMixQuality({
          samples: ev.samples,
          phaseRmsSec: ev.phaseRmsSec,
          kickResidualRmsMs: ev.kickResidualRmsMs,
        })
        if (snap) {
          setLastMixQuality(snap)
          setMixQualityFlash({ grade: snap.grade, until: Date.now() + 8000 })
          const plan = ev.plan
          const q = autoDJQueueRef.current
          const outT = q.find((t) => t.id === plan.outgoingTrackId)?.title
          const inT = q.find((t) => t.id === plan.incomingTrackId)?.title
          const hist = pushMixQualityHistory(snap, {
            outgoingTitle: outT,
            incomingTitle: inT,
            syncMode: autoDJConfigRef.current.syncMode,
            reason: plan.reason,
          })
          setMixQualityHistory(hist)
        }
        const suffix = formatMixQuality({
          phaseRmsSec: ev.phaseRmsSec,
          kickResidualRmsMs: ev.kickResidualRmsMs,
          grade: snap?.grade,
        })
        if (!suffix) return
        setAutoDJStatusMessage((prev) => {
          const base = prev.replace(
            /\s*·\s*sync\s+\d+ms\s*\/\s*kick\s+\d+ms(?:\s+\w+)?\s*$/i,
            '',
          )
          return `${base}${suffix}`
        })
      })
      mixEngineRef.current = engine
    }
    mixEngineRef.current.setKeyLock(true)
    mixEngineRef.current.setActiveDeck(playbackDeckRef.current === 'next' ? 'b' : 'a')
    return mixEngineRef.current
  }, [])

  const attachEngineGraph = useCallback(() => {
    const ctx = audioContextRef.current
    const source = sourceNodeRef.current
    if (!ctx || !source) return false
    const engine = ensureMixEngine()
    if (!engine) return false
    engine.adoptExternalSourceA(source)
    const ok = engine.attachGraph(ctx)
    const an = analyserRef.current
    if (an && ok) {
      try {
        an.disconnect()
      } catch {
        /* ignore */
      }
      engine.connectDeckAnalyser('a', an)
    }
    return ok
  }, [ensureMixEngine])

  useEffect(() => {
    if (audioRef.current) configureKeyLock(audioRef.current, true)
    if (nextAudioRef.current) configureKeyLock(nextAudioRef.current, true)
  }, [])

  useEffect(() => {
    if (seekTargetSec == null || !Number.isFinite(seekTargetSec)) return
    const audio = getPlaybackAudio()
    if (!audio) return
    const apply = () => {
      try {
        audio.currentTime = seekTargetSec
        setCurrentTime(seekTargetSec)
        reportPlaybackPosition(seekTargetSec)
      } catch {
        /* ignore */
      }
    }
    apply()
    audio.addEventListener('loadedmetadata', apply)
    audio.addEventListener('canplay', apply)
    const timer = window.setTimeout(apply, 250)
    return () => {
      audio.removeEventListener('loadedmetadata', apply)
      audio.removeEventListener('canplay', apply)
      window.clearTimeout(timer)
    }
  }, [seekNonce, seekTargetSec, currentTrack, reportPlaybackPosition, getPlaybackAudio])

  // Flush position on tab hide / unload so reload restores the last playhead
  useEffect(() => {
    const flush = () => {
      const audio = getPlaybackAudio()
      if (!audio || !Number.isFinite(audio.currentTime)) return
      reportPlaybackPosition(audio.currentTime)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [reportPlaybackPosition, getPlaybackAudio])
  /** Used by player-chrome touch seek to ignore events over the waveform. */
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const waveformVisibleBarsRef = useRef(0)
  const waveformOffsetRef = useRef(0)
  const waveformDataLengthRef = useRef(0)
  const waveformGestureRef = useRef(false)
  const waveformPanEnabledRef = useRef(false)
  const waveformFlushRafRef = useRef<number | null>(null)
  const pendingWaveformBarsRef = useRef<number | null>(null)
  const pendingWaveformOffsetRef = useRef<number | null>(null)
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

  const snapPlaybackTime = useCallback((t: number) => {
    const safe = Number.isFinite(t) ? Math.max(0, t) : 0
    playbackTimeRef.current = safe
    setCurrentTime(safe)
    transportMiniMobileRef.current?.update(safe, duration)
    transportMiniDesktopRef.current?.update(safe, duration)
    transportExpandedRef.current?.update(safe, duration)
  }, [duration])

  const pushTransportTime = useCallback((timeSec: number, durationSec: number) => {
    const safe = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0
    playbackTimeRef.current = safe
    autoDJCurrentTimeRef.current = safe
    transportMiniMobileRef.current?.update(safe, durationSec)
    transportMiniDesktopRef.current?.update(safe, durationSec)
    transportExpandedRef.current?.update(safe, durationSec)
  }, [])

  // Hot cues per track (local)
  useEffect(() => {
    if (!currentTrack?.id || typeof window === 'undefined') {
      setWaveformHotCues([])
      return
    }
    try {
      const raw = localStorage.getItem('sergik-hotcues-v1')
      const all = raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {}
      const map = all[currentTrack.id] || {}
      const cues: WaveformHotCue[] = Object.entries(map)
        .filter(([, t]) => typeof t === 'number' && Number.isFinite(t))
        .map(([slot, timeSec]) => ({
          id: `${currentTrack.id}-${slot}`,
          timeSec,
          label: slot,
          color: 'rgba(167, 139, 250, 0.95)',
        }))
        .sort((a, b) => a.timeSec - b.timeSec)
      setWaveformHotCues(cues)
    } catch {
      setWaveformHotCues([])
    }
  }, [currentTrack?.id])

  const persistHotCue = useCallback(
    (slot: 1 | 2 | 3 | 4, timeSec: number) => {
      if (!currentTrack?.id || typeof window === 'undefined') return
      try {
        const raw = localStorage.getItem('sergik-hotcues-v1')
        const all = raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {}
        const map = { ...(all[currentTrack.id] || {}) }
        map[String(slot)] = timeSec
        all[currentTrack.id] = map
        localStorage.setItem('sergik-hotcues-v1', JSON.stringify(all))
        setWaveformHotCues(
          Object.entries(map)
            .map(([s, t]) => ({
              id: `${currentTrack.id}-${s}`,
              timeSec: t,
              label: s,
              color: 'rgba(167, 139, 250, 0.95)',
            }))
            .sort((a, b) => a.timeSec - b.timeSec)
        )
      } catch {
        /* ignore */
      }
    },
    [currentTrack?.id]
  )

  const jumpHotCue = useCallback(
    (slot: 1 | 2 | 3 | 4) => {
      const cue = waveformHotCues.find((c) => c.label === String(slot))
      if (!cue) return
      const audio = getPlaybackAudio()
      if (!audio) return
      try {
        audio.currentTime = cue.timeSec
      } catch {
        /* ignore */
      }
      snapPlaybackTime(cue.timeSec)
    },
    [waveformHotCues, getPlaybackAudio, snapPlaybackTime]
  )

  // Ghost incoming tape while dual-deck mix is active (throttle React updates)
  useEffect(() => {
    if (!crossfadeActive) {
      setWaveformGhostTape(null)
      return
    }
    let raf = 0
    let cached: ReturnType<typeof buildWaveformTapeCache> = null
    let cachedTrackId: string | null = null
    let lastPush = 0
    const tick = (now: number) => {
      const ghost = ghostSamplesRef.current
      const idle = getIdleAudio()
      if (ghost?.samples.length && idle && now - lastPush > 80) {
        lastPush = now
        if (!cached || cachedTrackId !== ghost.trackId) {
          cached = buildWaveformTapeCache({
            samples: ghost.samples,
            durationSec: ghost.durationSec,
            colorMode: waveformMode,
            intelligenceProfile: profileFromSonicDna(ghost.sonicDna),
            targetCount: 2400,
          })
          cachedTrackId = ghost.trackId
        }
        if (cached) {
          setWaveformGhostTape({
            timed: cached.timed,
            durationSec: ghost.durationSec,
            timeSec: idle.currentTime || 0,
            opacity: 0.4,
          })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [crossfadeActive, getIdleAudio, waveformMode])

  const clearFadeInterval = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current)
      fadeIntervalRef.current = null
    }
  }, [])

  const restoreMainVolume = useCallback(() => {
    const vol = settingsRef.current.isMuted ? 0 : settingsRef.current.volume
    try {
      mixEngineRef.current?.setMasterVolume(vol)
    } catch {
      /* ignore */
    }
    if (
      phraseMixLockRef.current ||
      mixEngineRef.current?.isMixing() ||
      isDeckHandoffActive()
    ) {
      return
    }
    if (playbackDeckRef.current === 'next') return
    const audio = getPlaybackAudio()
    if (!audio) return
    try {
      audio.volume = vol
    } catch {
      /* ignore */
    }
  }, [getPlaybackAudio, isDeckHandoffActive])

  const trackIntroOffsetSec = useCallback((track: Track) => {
    const o = Number((track as Track & { beat_grid_offset?: number }).beat_grid_offset)
    if (Number.isFinite(o) && o >= 0 && o < 45) return o
    return 0
  }, [])

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
      dispatchPlayerSettings({
        isShuffled: updated.isShuffled,
        repeatMode: updated.repeatMode,
      })
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
  const fetchWaveformFromSupabase = useCallback(async (filePath: string, trackId?: string): Promise<number[] | null> => {
    try {
      const params = new URLSearchParams()
      const lookupPath = waveformLookupPath(filePath)
      if (lookupPath) params.set('path', lookupPath)
      if (trackId) params.set('trackId', trackId)
      if (!params.toString()) return null

      const response = await fetch(`/api/audio/waveform?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 404) return null
        if (response.status === 500 && process.env.NODE_ENV === 'development') {
          const errorData = await response.json().catch(() => ({}))
          console.warn('Waveform API error (will generate from audio):', errorData.error || 'Server error')
        }
        return null
      }

      const data = await response.json()
      if (data.waveform_data && Array.isArray(data.waveform_data) && data.waveform_data.length > 0) {
        return data.waveform_data
      }

      return null
    } catch {
      return null
    }
  }, [])

  // Fetch BPM from Supabase API
  const fetchBPMFromSupabase = useCallback(async (filePath: string, trackId?: string): Promise<number | null> => {
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
      
      const params = new URLSearchParams()
      if (localPath) params.set('path', localPath)
      if (trackId) params.set('trackId', trackId)
      const response = await fetch(`/api/audio/bpm?${params.toString()}`, { cache: 'no-store' })
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

  const commitTrackWaveform = useCallback((data: typeof waveformData, peaks?: number[] | null) => {
    trackWaveformBaseRef.current = data
    setWaveformData(data)
    if (peaks !== undefined) setPrecomputedPeaks(peaks)
  }, [])

  // Generate waveform from the same file the <audio> element plays.
  // Defer network decode until playing or waveform chrome is visible (avoid cold-path contention).
  const trackKey = currentTrack ? `${currentTrack.id}-${currentTrack.file}` : null
  const waveformNetworkAllowed = isPlaying || isExpanded || isWaveformDocked
  
  useEffect(() => {
    if (!currentTrack || !resolvedUrl) {
      trackWaveformBaseRef.current = []
      setPrecomputedPeaks(null)
      setWaveformData([])
      processedWaveformTrackRef.current = null
      return
    }

    // Fast path: paint inline peaks without network; wait for play/expand for heavy fetch/decode
    const inlineOnly =
      !waveformNetworkAllowed &&
      Array.isArray(currentTrack.waveform_data) &&
      (currentTrack.waveform_data as number[]).length > 0
    if (!waveformNetworkAllowed && !inlineOnly) {
      return
    }
    if (inlineOnly && !waveformNetworkAllowed) {
      const peaks = currentTrack.waveform_data as number[]
      const waveform = peaksOrEnvelopesToWaveformSamples(peaks, null)
      if (waveform.length) {
        commitTrackWaveform(waveform, peaks)
        processedWaveformTrackRef.current = trackKey
      }
      return
    }

    let cancelled = false
    const convertPeaksToWaveform = (
      peaks: number[],
      envelopes?: { peak: number; rms: number; low: number; mid: number; high: number }[] | null
    ) => peaksOrEnvelopesToWaveformSamples(peaks, envelopes)

    // Whether what we painted already carries per-band envelope detail. Plain
    // peaks still render, but only envelopes drive the multi-band coloring.
    let appliedEnvelopeDetail = false

    const applyPeaks = (
      peaks: number[],
      envelopes?: { peak: number; rms: number; low: number; mid: number; high: number }[] | null,
    ) => {
      if (cancelled || !peaks.length) return false
      const waveform = convertPeaksToWaveform(peaks, envelopes)
      if (!waveform.length) return false
      commitTrackWaveform(waveform, peaks)
      processedWaveformTrackRef.current = trackKey
      if (envelopes?.length) appliedEnvelopeDetail = true
      return true
    }

    /**
     * The decode path re-downloads the entire file that the media element is
     * already streaming. Hold it until playback has a comfortable buffer so the
     * two requests don't compete for bandwidth mid-track.
     */
    const waitForComfortableBuffer = async () => {
      const el = audioRef.current
      if (!el) return
      const deadline = Date.now() + WAVEFORM_DECODE_MAX_WAIT_MS
      while (!cancelled && Date.now() < deadline) {
        if (el.paused) return
        let secondsAhead = 0
        try {
          const ranges = el.buffered
          for (let i = 0; i < ranges.length; i += 1) {
            if (ranges.start(i) <= el.currentTime && el.currentTime <= ranges.end(i)) {
              secondsAhead = ranges.end(i) - el.currentTime
              break
            }
          }
        } catch {
          return
        }
        if (el.readyState >= 3 && secondsAhead >= WAVEFORM_DECODE_BUFFER_LEAD_SEC) return
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // Instant placeholder: static precomputed tape (deployed) → track/API peaks
    const showStoredPlaceholder = async () => {
      const storageRel =
        vaultRelativePath(resolvedUrl) ||
        vaultRelativePath(currentTrack.file) ||
        null
      const skipStaticTape =
        Boolean(storageRel) &&
        storedWaveformLikelyStale(currentTrack.file || '', resolvedUrl)
      if (storageRel && !skipStaticTape) {
        const jsonPath = staticWaveformJsonUrl(storageRel)
        try {
          const res = await fetch(jsonPath, { cache: 'force-cache' })
          if (res.ok) {
            const body = await res.json()
            // Compact deploy format: { d: number[], e: [peak,rms,low,mid,high][] }
            // Legacy: { data, envelopes: [{peak,rms,low,mid,high}] }
            const data: number[] | undefined = Array.isArray(body?.d)
              ? body.d
              : Array.isArray(body?.data)
                ? body.data
                : undefined
            let envelopes:
              | { peak: number; rms: number; low: number; mid: number; high: number }[]
              | undefined
            if (Array.isArray(body?.e) && body.e.length > 0 && Array.isArray(body.e[0])) {
              envelopes = body.e.map((row: number[]) => ({
                peak: row[0] ?? 0,
                rms: row[1] ?? 0,
                low: row[2] ?? 0,
                mid: row[3] ?? 0,
                high: row[4] ?? 0,
              }))
            } else if (Array.isArray(body?.envelopes) && body.envelopes.length > 0) {
              envelopes = body.envelopes
            }
            if (envelopes?.length) {
              if (applyPeaks(data || [], envelopes)) return
            }
            if (data?.length) {
              if (applyPeaks(data)) return
            }
          }
        } catch {
          // continue
        }
      }

      const inline = currentTrack.waveform_data
      if (inline && Array.isArray(inline) && inline.length > 0) {
        applyPeaks(inline)
        return
      }
      try {
        const peaks = await fetchWaveformFromSupabase(currentTrack.file, currentTrack.id)
        if (peaks?.length) applyPeaks(peaks)
      } catch {
        // ignore — decode path below is authoritative
      }
    }

    const loadFromPlayback = async () => {
      if (!canAnalyzeAudioWaveform()) return

      const candidates = waveformAnalysisUrls(resolvedUrl, currentTrack.file)
      for (const url of candidates) {
        if (cancelled) return
        const cached = getPlaybackWaveformCache(url)
        if (cached?.data?.length) {
          if (applyPeaks(cached.data, cached.envelopes)) return
        }
      }

      for (const url of candidates) {
        if (cancelled) return
        try {
          const peakData = await generatePeakData(url, 2000)
          if (!peakData?.data?.length) continue
          setPlaybackWaveformCache(url, peakData)
          setPlaybackWaveformCache(resolvedUrl, peakData)
          if (applyPeaks(peakData.data, peakData.envelopes)) return
        } catch (err) {
          if (isAudioContextUnavailableError(err)) return
          if (process.env.NODE_ENV === 'development') {
            console.warn('Waveform decode failed for', url, err)
          }
        }
      }
    }

    void (async () => {
      // Don't mark processed until we have paint data — Strict Mode cancel must retry.
      if (processedWaveformTrackRef.current === trackKey && trackWaveformBaseRef.current.length >= 64) {
        return
      }

      const fileHint = currentTrack.file || ''
      const inlinePeaks = Array.isArray(currentTrack.waveform_data)
        ? (currentTrack.waveform_data as number[])
        : []
      // Prefer decode from the same bytes we play when stored tape is WAV-vs-MP3 stale
      // or a synthetic sine fallback — otherwise grid/kick alignment drifts.
      const preferPlayback =
        Boolean(resolvedUrl) &&
        (storedWaveformLikelyStale(fileHint, resolvedUrl) ||
          (inlinePeaks.length > 0 && looksLikeSyntheticPeaks(inlinePeaks)))

      if (preferPlayback) {
        await loadFromPlayback()
        if (!cancelled && trackWaveformBaseRef.current.length < 64) {
          await showStoredPlaceholder()
        }
      } else {
        await showStoredPlaceholder()
        if (cancelled) return
        const havePaintableTape = trackWaveformBaseRef.current.length >= 64
        // Stored peaks are authoritative on this branch — `preferPlayback` above
        // already claimed the stale/synthetic cases — so decoding again would
        // pull the whole file down a second time for an identical tape.
        if (havePaintableTape && appliedEnvelopeDetail) return
        if (havePaintableTape) await waitForComfortableBuffer()
        if (cancelled) return
        await loadFromPlayback()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    trackKey,
    resolvedUrl,
    fetchWaveformFromSupabase,
    commitTrackWaveform,
    currentTrack,
    waveformNetworkAllowed,
  ])

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
    if ((isMiniMode && !isWaveformDocked) || !isExpanded || !isPlaying || !isVisible) {
      // Cancel any ongoing animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      // Restore static track envelope so beat grid stays aligned after live coloring
      const base = trackWaveformBaseRef.current
      if (base.length > 0) {
        setWaveformData(base)
      }
      return
    }

    // Full-buffer peak tape (Ableton/MiniMeters): no live oscilloscope loop — zoom/pan only.
    if (trackWaveformBaseRef.current.length >= 64) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setWaveformData(trackWaveformBaseRef.current)
      return
    }
    
    // Peak detection for transients (kicks, claps, hats)
    let previousPeaks: number[] = []
    const envelopeFollower: number[] = []
    let lastUpdateTime = 0
    // Exponential smoothing - stores previous smoothed waveform for better interpolation
    let previousSmoothedWaveform: WaveformSample[] | null = null
    const smoothingFactor = 0.14 // snappy — preserve peak/valley contrast
    
    const updateWaveform = (currentTime: number = performance.now()) => {
      // Check conditions again in case they changed
      if (!analyserRef.current || !frequencyDataArrayRef.current || !timeDataArrayRef.current || (isMiniMode && !isWaveformDocked) || !isExpanded || !isPlaying || !isVisible) {
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

      const frequencyData = frequencyDataArrayRef.current
      const timeData = timeDataArrayRef.current
      const audioContext = audioContextRef.current
      const sampleRate = audioContext?.sampleRate || 44100
      
      const baseBars = 200 // Fallback oscilloscope only when no track peaks exist
      const bars = Math.max(8, Math.floor(baseBars * waveformHorizontalZoom))
      const previousSpectrum = previousSpectrumRef.current
      const timeDataLength = timeData.length
      const data: Array<{
        positive: number
        negative: number
        color: string
        elementType?: WaveformSample['elementType']
        elementConfidence?: number
        bands?: { low: number; mid: number; high: number }
      }> = []
      
      // Update previous spectrum for next frame
      if (previousSpectrumRef.current && frequencyData) {
        previousSpectrumRef.current.set(frequencyData)
      }

      if (!frequencyData || !timeData || timeDataLength <= 0) {
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
        return
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

      // MiniMeters-style Low / Mid / High crossovers (~250 Hz / ~2.5 kHz)
      const rawLow = getBandEnergy(frequencyData, 20, 250, sampleRate)
      const rawMid = getBandEnergy(frequencyData, 250, 2500, sampleRate)
      const rawHigh = getBandEnergy(frequencyData, 2500, 16000, sampleRate)
      const frameBands = normalizeFftBands(rawLow, rawMid, rawHigh)
      
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
        let elementType: NonNullable<WaveformSample['elementType']> = 'other'
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
        
        // Combine peak and RMS — MiniMeters-like: peaks dominate shape, valleys dig deep
        const amplitude = isTransient 
          ? peak * 0.95 + rms * 0.05
          : peak * 0.55 + rms * 0.45
        
        const boostedAmplitude = isTransient && elementConfidence > 0.25
          ? amplitude * 1.75
          : amplitude * 1.15
        
        // Near-zero valleys, near-full peaks (critical MiniMeters silhouette contrast)
        const shaped = expandPeakValley(boostedAmplitude, {
          power: isTransient ? 1.35 : 1.9,
          gain: isTransient ? 1.7 : 1.45,
          floor: 0.01,
        })
        const positive = shaped
        const negative = expandPeakValley(boostedAmplitude * (isTransient ? 0.92 : 0.78), {
          power: isTransient ? 1.35 : 1.9,
          gain: isTransient ? 1.6 : 1.35,
          floor: 0.01,
        })
        
        // Per-slice band emphasis: weight frame bands by local amplitude + element type
        // so kicks go red-hot, hats cyan, and balanced hits white (MiniMeters Multi-Band)
        let sliceBands = { ...frameBands }
        if (isTransient && elementConfidence > 0.25) {
          switch (elementType) {
            case 'kick':
              sliceBands = {
                low: Math.max(frameBands.low, shaped),
                mid: frameBands.mid * 0.22,
                high: frameBands.high * 0.1,
              }
              break
            case 'snare':
              sliceBands = {
                low: frameBands.low * 0.28,
                mid: Math.max(frameBands.mid, shaped),
                high: Math.max(frameBands.high, shaped * 0.75),
              }
              break
            case 'hihat':
              sliceBands = {
                low: frameBands.low * 0.08,
                mid: frameBands.mid * 0.22,
                high: Math.max(frameBands.high, shaped),
              }
              break
            default:
              sliceBands = {
                low: Math.max(frameBands.low, shaped * 0.35),
                mid: Math.max(frameBands.mid, shaped),
                high: Math.max(frameBands.high, shaped * 0.55),
              }
          }
        } else {
          // Scale frame bands by local envelope so quiet slices go near-black
          const ampScale = Math.max(0.05, Math.min(1.55, shaped * 1.5))
          sliceBands = {
            low: frameBands.low * ampScale,
            mid: frameBands.mid * ampScale,
            high: frameBands.high * ampScale,
          }
        }

        // Extra punch on strong transients (white-hot / cyan spike)
        if (isTransient) {
          const punch = 1 + Math.min(1.0, elementConfidence * 1.0 + shaped * 0.4)
          sliceBands = {
            low: Math.min(1, sliceBands.low * punch),
            mid: Math.min(1, sliceBands.mid * punch),
            high: Math.min(1, sliceBands.high * punch),
          }
        }

        const color = multiBandRgbColor(sliceBands, {
          contrast: 2.15,
          saturation: 1.8,
          floor: 0.015,
        })
        
        data.push({
          positive,
          negative,
          color,
          elementType,
          elementConfidence,
          bands: sliceBands,
        })
        
        currentPeaks.push(peak)
      }
      
      previousPeaks = currentPeaks
      // Only update waveform if we have valid data and conditions are still met
      if (data.length > 0 && !(isMiniMode && !isWaveformDocked) && isExpanded && isPlaying && isVisible) {
        // Use exponential smoothing for better visual quality and smoother movement
        let smoothedData: WaveformSample[]
        
        if (previousSmoothedWaveform && previousSmoothedWaveform.length === data.length) {
          // Exponential smoothing: blend current frame with previous smoothed frame
          smoothedData = data.map((current, index) => {
            const previous = previousSmoothedWaveform![index]
            
            // Smooth amplitudes lightly; keep peaks sharp (MiniMeters contrast)
            const blend = 1 - smoothingFactor
            const peakHold = current.positive > previous.positive ? 0.92 : blend
            const smoothedPositive = previous.positive + (current.positive - previous.positive) * peakHold
            const smoothedNegative = previous.negative + (current.negative - previous.negative) * blend

            const prevBands = previous.bands || { low: 0.15, mid: 0.15, high: 0.15 }
            const curBands = current.bands || { low: 0.15, mid: 0.15, high: 0.15 }
            const bands = {
              low: prevBands.low + (curBands.low - prevBands.low) * blend,
              mid: prevBands.mid + (curBands.mid - prevBands.mid) * blend,
              high: prevBands.high + (curBands.high - prevBands.high) * blend,
            }
            
            return {
              positive: smoothedPositive,
              negative: smoothedNegative,
              color: multiBandRgbColor(bands, { contrast: 2.15, saturation: 1.8, floor: 0.015 }),
              elementType: current.elementType || previous.elementType,
              elementConfidence: current.elementConfidence || previous.elementConfidence,
              bands,
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
  }, [getBandEnergy, calculateEnergy, isMiniMode, isWaveformDocked, isExpanded, isPlaying, isVisible, currentTrack?.id, waveformSpeed, waveformHorizontalZoom])

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

    // Sync normalize to media-proxy when possible — skip async resolve round-trip
    const syncNormalized = normalizeVaultAudioUrl(currentTrack.file)
    if (
      syncNormalized.startsWith('/api/audio/media/') ||
      syncNormalized.startsWith('http://') ||
      syncNormalized.startsWith('https://')
    ) {
      setResolvedUrl(syncNormalized)
      setIsLoading(false)
      resolvedUrlCacheRef.current.set(currentTrack.file, syncNormalized)
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

  // Batch resolve URLs for next tracks in queue (sync for media-proxy paths — no HEAD)
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id)
    if (currentIndex === -1) return
    
    const nextTracks = queue.slice(currentIndex + 1, currentIndex + 3)
    const tracksToResolve = nextTracks
      .map(track => track.file)
      .filter(file => file && !resolvedUrlCacheRef.current.has(file))
    
    if (tracksToResolve.length === 0) return

    const asyncNeeded: string[] = []
    for (const file of tracksToResolve) {
      const sync = normalizeVaultAudioUrl(file)
      if (
        sync.startsWith('/api/audio/media/') ||
        sync.startsWith('http://') ||
        sync.startsWith('https://')
      ) {
        resolvedUrlCacheRef.current.set(file, sync)
      } else {
        asyncNeeded.push(file)
      }
    }

    if (asyncNeeded.length === 0) return

    Promise.all(asyncNeeded.map(file => resolveAudioUrl(file)))
      .then(urls => {
        asyncNeeded.forEach((file, idx) => {
          if (urls[idx]) {
            resolvedUrlCacheRef.current.set(file, urls[idx])
          }
        })
      })
      .catch(err => {
        console.debug('Failed to batch resolve URLs:', err)
      })
  }, [currentTrack, queue])

  // Preload next track onto the IDLE deck only (never clobber live after deck-swap)
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    if (phraseMixLockRef.current) return

    const currentIndex = queue.findIndex((track) => track.id === currentTrack.id)
    if (currentIndex === -1) return

    const idleEl = getIdleAudio()
    if (!idleEl) return

    const nextIndex = currentIndex + 1
    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex]
      // Don't overwrite an already-cued Auto DJ idle load
      if (cuedIdleTrackIdRef.current === nextTrack.id) return

      const syncUrl = normalizeVaultAudioUrl(nextTrack.file)
      const applyIdleSrc = (url: string) => {
        if (!url || phraseMixLockRef.current) return
        const idle = getIdleAudio()
        if (!idle) return
        if (idle.src === url || (idle.src && url && idle.src.includes(url.split('?')[0].slice(-40)))) {
          return
        }
        idle.src = url
        idle.preload = 'auto'
        try {
          idle.volume = 0
        } catch {
          /* ignore */
        }
        resolvedUrlCacheRef.current.set(nextTrack.file, url)
      }

      if (
        syncUrl.startsWith('/api/audio/media/') ||
        syncUrl.startsWith('http://') ||
        syncUrl.startsWith('https://')
      ) {
        applyIdleSrc(syncUrl)
        return
      }

      resolveAudioUrl(nextTrack.file)
        .then(applyIdleSrc)
        .catch((err) => {
          console.debug('Failed to preload next track:', err)
        })
    }
  }, [currentTrack, queue, getIdleAudio])

  // Preload next tracks in queue using Service Worker (keep shallow — deep preload
  // was HEADing/GETting 5 R2 objects and starving the live play request).
  useEffect(() => {
    if (!currentTrack || !queue.length) return
    
    // Find current index in queue
    const currentIndex = queue.findIndex(track => track.id === currentTrack.id)
    if (currentIndex === -1) return
    
    const tracksToPreload = queue
      .slice(currentIndex + 1, currentIndex + 2)
      .map(track => track.file)
      .filter(Boolean)
    
    if (tracksToPreload.length > 0) {
      // Resolve all URLs first (use cache if available)
      const cache = resolvedUrlCacheRef.current
      const resolved = tracksToPreload.map((file) => {
        const cached = cache.get(file)
        if (cached) return cached
        const sync = normalizeVaultAudioUrl(file)
        if (
          sync.startsWith('/api/audio/media/') ||
          sync.startsWith('http://') ||
          sync.startsWith('https://')
        ) {
          cache.set(file, sync)
          return sync
        }
        return null
      })
      const needAsync = tracksToPreload.filter((_, i) => !resolved[i])
      const finish = (urls: string[]) => {
        if (urls.length) preloadTracks(urls)
      }
      if (needAsync.length === 0) {
        finish(resolved.filter(Boolean) as string[])
        return
      }
      Promise.all(needAsync.map((file) => resolveAudioUrl(file)))
        .then((urls) => {
          needAsync.forEach((file, idx) => {
            if (urls[idx]) cache.set(file, urls[idx])
          })
          finish([
            ...(resolved.filter(Boolean) as string[]),
            ...urls.filter(Boolean),
          ])
        })
        .catch((err) => {
          console.debug('Failed to preload tracks via service worker:', err)
        })
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
      
      analyserRef.current = analyser
      frequencyDataArrayRef.current = new Float32Array(analyser.frequencyBinCount)
      timeDataArrayRef.current = new Float32Array(analyser.fftSize)
      previousSpectrumRef.current = new Float32Array(analyser.frequencyBinCount)

      attachEngineGraph()
      setAudioContextReady(true)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error setting up audio analysis:', error)
      }
    }
  }, [attachEngineGraph])

  /** Wire both decks through MixEngine (symmetric EQ/filter/gain chains). */
  const ensureDualDeckGraph = useCallback(async () => {
    try {
      await setupAudioAnalysis()
    } catch {
      /* play without analysis if needed */
    }
    attachEngineGraph()
    return mixEngineRef.current
  }, [setupAudioAnalysis, attachEngineGraph])

  // Media Session API for background playback and lock screen controls
  useEffect(() => {
    if (!currentTrack || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    const mediaSession = (navigator as any).mediaSession
    
    // Set metadata for lock screen/notification controls
    mediaSession.metadata = new (window as any).MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || currentTrack.folder || 'SERGIK',
      artwork: buildLockScreenArtwork(coverSrc || currentTrack.artwork),
    })

    // Handle play action from lock screen/notification
    mediaSession.setActionHandler('play', () => {
      const live = getPlaybackAudio()
      if (live && !isPlaying) {
        live.play().catch(() => {})
        setIsPlaying(true)
      }
    })

    // Handle pause action
    mediaSession.setActionHandler('pause', () => {
      const live = getPlaybackAudio()
      if (live && isPlaying) {
        live.pause()
        setIsPlaying(false)
      }
    })

    // Handle next track
    mediaSession.setActionHandler('nexttrack', () => {
      if (queue.length > 1) {
        skipToNextRef.current()
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
      const live = getPlaybackAudio()
      if (live) {
        const skipTime = details.seekOffset || 10
        live.currentTime = Math.max(0, live.currentTime - skipTime)
      }
    })

    // Handle seek forward
    mediaSession.setActionHandler('seekforward', (details: any) => {
      const live = getPlaybackAudio()
      if (live && duration) {
        const skipTime = details.seekOffset || 10
        live.currentTime = Math.min(duration, live.currentTime + skipTime)
      }
    })

    try {
      mediaSession.setActionHandler('seekto', (details: { seekTime?: number } | undefined) => {
        const live = getPlaybackAudio()
        if (
          live &&
          duration > 0 &&
          details &&
          typeof details.seekTime === 'number' &&
          Number.isFinite(details.seekTime)
        ) {
          live.currentTime = Math.max(0, Math.min(duration, details.seekTime))
        }
      })
    } catch {
      // seekto not supported in this browser
    }

    // Update playback state
    mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    // Position updates read the live element — not React `currentTime`, which
    // would tear this effect down ~10×/sec and re-register every handler.
    const updatePositionState = () => {
      const live = getPlaybackAudio()
      const position =
        live && Number.isFinite(live.currentTime) ? live.currentTime : autoDJCurrentTimeRef.current
      const liveDuration =
        live && Number.isFinite(live.duration) && live.duration > 0 ? live.duration : duration
      if (live && liveDuration > 0 && 'setPositionState' in mediaSession) {
        try {
          mediaSession.setPositionState({
            duration: liveDuration,
            playbackRate: settingsRef.current.playbackRate,
            position,
          })
        } catch {
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
  }, [currentTrack, coverSrc, isPlaying, duration, queue.length, onNext, onPrevious, getPlaybackAudio])

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
          
          const alt =
            (resolvedUrl && alternateAudioExtensionUrl(resolvedUrl)) ||
            (currentTrack.file && alternateAudioExtensionUrl(currentTrack.file))
          // Prefer .mp3↔.wav on same-origin / media proxy (R2 may only have one form).
          const altIsSameOrigin =
            Boolean(alt) &&
            !alt!.startsWith('http://') &&
            !alt!.startsWith('https://')
          if (alt && audio.src !== alt && altIsSameOrigin) {
            audio.src = alt
            setResolvedUrl(alt)
            if (currentTrack.file) {
              resolvedUrlCacheRef.current.set(currentTrack.file, alt)
            }
            audio.load()
          } else if (
            isDevelopment &&
            resolvedUrl &&
            (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) &&
            currentTrack.file !== resolvedUrl
          ) {
            audio.src = currentTrack.file
            audio.load()
          } else if (resolvedUrl === currentTrack.file) {
            audio.load()
          } else if (isDevelopment) {
            audio.src = currentTrack.file
            audio.load()
          } else {
            audio.load()
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
      // Retry play first — `load()` resets the buffer and often makes a
      // bandwidth-contended stall worse when waveform/preload fetches are live.
      stallRecoveryTimer = setTimeout(() => {
        if (audio.paused || !isPlaying) return
        audio.play().catch(() => {
          const t = audio.currentTime
          audio.load()
          const onReloaded = () => {
            audio.removeEventListener('loadeddata', onReloaded)
            try {
              audio.currentTime = t
            } catch {
              /* ignore */
            }
            audio.play().catch(() => {})
          }
          audio.addEventListener('loadeddata', onReloaded)
        })
      }, 4000)
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

    // Mixer handoff: incoming deck already playing — do not reload main src
    if (
      skipSrcReloadRef.current ||
      isDeckHandoffActive(currentTrack?.id) ||
      mixEngineRef.current?.isMixing()
    ) {
      skipSrcReloadRef.current = false
      const live =
        playbackDeckRef.current === 'next' ? nextAudioRef.current : audioRef.current
      liveAudioRef.current = live
      if (live) {
        // Don't touch gains/volume here — MixEngine faders already own the handoff.
        // Volume snaps after mix were a common end-glitch source.
        const vol = settingsRef.current.isMuted ? 0 : settingsRef.current.volume
        try {
          mixEngineRef.current?.setMasterVolume(vol)
        } catch {
          /* ignore */
        }
        const t = live.currentTime || 0
        const d = Number.isFinite(live.duration) ? live.duration : 0
        playbackTimeRef.current = t
        setDuration(d)
        setCurrentTime(t)
        pushTransportTime(t, d)
        setIsLoading(false)
        setIsBuffering(false)
        setError(null)
      }
    } else {
      // Cold load — reset to main deck; silence/pause idle so it can't fight
      playbackDeckRef.current = 'main'
      liveAudioRef.current = audio
      setWaveformMediaSyncKey(`main:${currentTrack?.id ?? 'none'}`)
      setCuedIdleTrackId(null)
      mixEngineRef.current?.setActiveDeck('a')
      mixEngineRef.current?.silenceIdle({ instant: true })
      try {
        mixEngineRef.current?.setMasterVolume(
          settingsRef.current.isMuted ? 0 : settingsRef.current.volume,
        )
      } catch {
        /* ignore */
      }
      const idle = nextAudioRef.current
      if (idle && !phraseMixLockRef.current) {
        try {
          idle.pause()
          idle.volume = 0
        } catch {
          /* ignore */
        }
      }
      // Only set src and load when track actually changes
      audio.src = resolvedUrl
      audio.load()
      // Reset audio context ready state when track changes
      setAudioContextReady(false)
    }
    
    // Reset tracked play ref when track changes
    trackedPlayRef.current = null

    const liveEl =
      playbackDeckRef.current === 'next' && nextAudioRef.current
        ? nextAudioRef.current
        : audio
    
    // Imperative scrubber paint — avoids ~10 full MusicPlayer re-renders/sec.
    const updateTime = throttle(() => {
      pushTransportTime(liveEl.currentTime, liveEl.duration)
    }, 100)
    // Persist seek position less often so reload restores mini-bar progress
    const persistTime = throttle(() => {
      reportPlaybackPosition(liveEl.currentTime)
    }, 1000)
    const onTimeUpdate = () => {
      updateTime()
      persistTime()
    }
    
    const updateDuration = () => setDuration(liveEl.duration)
    const handleEnded = () => {
      // Never advance transport while a dual-deck mix is in progress
      if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return

      if (settings.repeatMode === 'one') {
        liveEl.currentTime = 0
        liveEl.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('Audio play failed on repeat:', err)
          }
        })
        return
      }

      if (autoDJConfigRef.current.enabled) {
        skipToNextRef.current()
        return
      }

      onTrackEnd()
    }

    liveEl.addEventListener('timeupdate', onTimeUpdate)
    liveEl.addEventListener('loadedmetadata', updateDuration)
    liveEl.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('stalled', handleStalled)
    audio.addEventListener('playing', handlePlaying)

    return () => {
      if (stallRecoveryTimer) clearTimeout(stallRecoveryTimer)
      liveEl.removeEventListener('timeupdate', onTimeUpdate)
      liveEl.removeEventListener('loadedmetadata', updateDuration)
      liveEl.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('stalled', handleStalled)
      audio.removeEventListener('playing', handlePlaying)
    }
  }, [currentTrack, resolvedUrl, retryCount, getPreloadStrategy, setupAudioAnalysis, reportPlaybackPosition, pushTransportTime, isDeckHandoffActive])

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

  const easeLivePlaybackRate = useCallback(
    (fromRate: number, toRate: number, durationMs = 1400) => {
      if (rateEaseRafRef.current != null) {
        cancelAnimationFrame(rateEaseRafRef.current)
        rateEaseRafRef.current = null
      }
      if (tempoRampCancelRef.current) {
        tempoRampCancelRef.current()
        tempoRampCancelRef.current = null
      }
      const live = getPlaybackAudio()
      if (!live) return
      if (Math.abs(fromRate - toRate) < 0.004) {
        rateEaseLockRef.current = false
        applyLiveDeckTempo(toRate, true)
        return
      }
      rateEaseLockRef.current = true
      postHandoffTempoUntilRef.current = Date.now() + durationMs + 64
      tempoRampCancelRef.current = rampDeckTempo(live, fromRate, toRate, durationMs, {
        keyLock: true,
        onFormant: applyFormantForRate,
        onTick: () => {
          /* ramp handles element rate */
        },
      })
      window.setTimeout(() => {
        rateEaseLockRef.current = false
        tempoRampCancelRef.current = null
        applyLiveDeckTempo(toRate, true)
      }, durationMs + 32)
    },
    [getPlaybackAudio, applyLiveDeckTempo, applyFormantForRate]
  )

  // Update volume and playback rate separately - don't reload audio
  useEffect(() => {
    const vol = settings.isMuted ? 0 : settings.volume
    try {
      mixEngineRef.current?.setMasterVolume(vol)
    } catch {
      /* ignore */
    }
    const audio = getPlaybackAudio()
    if (!audio || phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return

    if (playbackDeckRef.current === 'main') {
      audio.volume = vol
    }
    const handoff = deckHandoffRef.current
    const handoffTempoGuard =
      handoff &&
      handoff.trackId === currentTrack?.id &&
      Date.now() < handoff.untilMs
    if (handoffTempoGuard) {
      if (rateEaseLockRef.current) return
      const liveRate =
        Number.isFinite(audio.playbackRate) && audio.playbackRate > 0
          ? audio.playbackRate
          : handoff.incomingTargetRate
      if (Math.abs(liveRate - handoff.incomingTargetRate) > 0.004) {
        easeLivePlaybackRate(liveRate, handoff.incomingTargetRate, 850)
      }
      return
    }
    if (Date.now() < postHandoffTempoUntilRef.current) return
    if (!rateEaseLockRef.current) {
      applyLiveDeckTempo(settings.playbackRate, true)
    }
  }, [settings.volume, settings.isMuted, settings.playbackRate, getPlaybackAudio, applyLiveDeckTempo, currentTrack?.id, easeLivePlaybackRate])

  const handleMixDeckEq = useCallback(
    (deck: DeckId, gains: { low: number; mid: number; high: number }) => {
      mixUiPendingRef.current.deckEq[deck] = gains
      scheduleMixUiSync()
    },
    [scheduleMixUiSync],
  )

  const handleMixDeckRate = useCallback(
    (deck: DeckId, rate: number) => {
      const clamped = clampTempoRate(rate)
      mixUiPendingRef.current.deckRates[deck] = clamped
      scheduleMixUiSync()
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      if (deck === liveDeck) applyFormantForRate(clamped)
    },
    [scheduleMixUiSync, applyFormantForRate],
  )

  const syncPostHandoffEq = useCallback((deck: DeckId) => {
    const userEq = deckUiRef.current[deck].eqGains
    mixEngineRef.current?.setDeckEqGains(deck, userEq, { instant: false })
  }, [])

  const handleDeckEqGains = useCallback(
    (deck: 'a' | 'b', gains: { low: number; mid: number; high: number }) => {
      applyDeckStripEq(deck, gains, { instant: true })
    },
    [applyDeckStripEq],
  )

  const handleMixDeckFilter = useCallback(
    (deck: DeckId, state: { hpfHz: number; lpfHz: number }) => {
      mixUiPendingRef.current.deckFilters[deck] = state
      scheduleMixUiSync()
    },
    [scheduleMixUiSync],
  )

  // Crossfade / phrase mix via MixEngine (rAF equal-power + deck swap)
  const startPhraseMix = useCallback(
    async (
      nextTrack: Track,
      mixSec: number,
      incomingRate = 1,
      plan?: MixPlan | null,
      /** Rate the incoming deck settles on; defaults to the user's tempo slider. */
      opts?: { incomingTargetRate?: number },
    ) => {
      const main = audioRef.current
      const next = nextAudioRef.current
      if (!main || !next) {
        const qFallback = queueRef.current.some((t) => t.id === nextTrack.id)
          ? queueRef.current
          : [...queueRef.current, nextTrack]
        playTrack(nextTrack, qFallback)
        seekTo(trackIntroOffsetSec(nextTrack))
        return
      }

      if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return

      clearSkipBlendWatch()

      const engine = ensureMixEngine()
      if (!engine) {
        playTrack(nextTrack, queueRef.current)
        return
      }
      await ensureDualDeckGraph()
      engine.setMasterVolume(settingsRef.current.isMuted ? 0 : settingsRef.current.volume)
      if (currentTrack) {
        engine.setActiveTrack(withMixGrid(currentTrack))
      }

      phraseMixLockRef.current = true
      autoDJPendingRef.current = null
      autoDJIdleWarmedRef.current = null
      setAutoDJPendingTrackId(null)
      clearFadeInterval()
      clearAutoDJCrossfadeTimeout()
      setCrossfadeActive(true)
      setMixVisualProgress(0)
      setWaveformMixOverlay((prev) =>
        prev?.active ? { ...prev, blendProgress: 0 } : prev,
      )

      const q = queueRef.current.some((t) => t.id === nextTrack.id)
        ? queueRef.current
        : [...queueRef.current, nextTrack]
      const introSec = plan?.incomingStartSec ?? trackIntroOffsetSec(nextTrack)
      const live = getPlaybackAudio() || main
      const remain =
        (Number.isFinite(live.duration) ? live.duration : 0) -
        (Number.isFinite(live.currentTime) ? live.currentTime : 0)
      const autoDjDoctrine =
        autoDJConfigRef.current.enabled &&
        (plan?.blendFromOut !== false || plan?.phrase1Lock !== false || plan?.exactOverlap === true)
      const remainBlend = remain - 0.05
      const mixDurationSec = autoDjDoctrine && plan?.mixDurationSec
        ? remainBlend >= plan.mixDurationSec * 0.95
          ? plan.mixDurationSec
          : Math.max(0.8, Math.min(plan.mixDurationSec, remainBlend, 48))
        : Math.max(0.8, Math.min(mixSec, remain - 0.15, 48))
      const beatmatchRate = computeMixIncomingRate(currentTrack, nextTrack)

      const mixStyle = resolveEffectiveMixStyle(
        autoDJConfig.mixStyle,
        autoDJConfig.mixTechniques,
        autoDJConfig.transitionMode,
      )

      const resolvedPlan: MixPlan =
        plan && plan.incomingTrackId === nextTrack.id
          ? {
              ...plan,
              mixDurationSec,
              incomingStartSec: introSec,
              rateRatio: incomingRate || plan.rateRatio || beatmatchRate,
              style: plan.style ?? mixStyle,
            }
          : {
              outgoingTrackId: currentTrack?.id || 'out',
              incomingTrackId: nextTrack.id,
              startAtOutgoingSec: live.currentTime || 0,
              incomingStartSec: introSec,
              mixDurationSec,
              rateRatio: incomingRate || beatmatchRate,
              style: mixStyle,
              curve: 'equal-power',
              outPhraseBars: autoDJConfig.outPhraseBars,
              inPhraseBars: autoDJConfig.inPhraseBars,
              overlapBars: autoDJConfig.overlapBars,
              phraseBars: autoDJConfig.overlapBars,
              reason: 'Manual/phrase mix',
            }
      lastMixPlanRef.current = resolvedPlan

      const abortToHardCut = () => {
        engine.stopMix()
        restoreMainVolume()
        setCrossfadeActive(false)
        clearMixVisualProgress()
        phraseMixLockRef.current = false
        mixIntelRef.current = null
        setCuedIdleTrackId(null)
        playbackDeckRef.current = 'main'
        skipSrcReloadRef.current = false
        playTrack(nextTrack, q)
        seekTo(introSec)
      }

      try {
        let url = resolvedUrlCacheRef.current.get(nextTrack.file) || null
        if (!url) {
          url = await resolveAudioUrl(nextTrack.file)
          if (url) resolvedUrlCacheRef.current.set(nextTrack.file, url)
        }
        if (!url) {
          abortToHardCut()
          return
        }

        setAutoDJStatusMessage(
          `Mixing ${resolvedPlan.overlapBars}-bar overlap → “${nextTrack.title}”`,
        )
        {
          const bpm =
            resolvePlaybackBpm(currentTrack, detectedBPMRef.current) ??
            currentTrack?.bpm ??
            detectedBPMRef.current ??
            120
          const aligned = alignMixOverlayToBeatGrid({
            mixOutSec: resolvedPlan.startAtOutgoingSec,
            mixDurationSec: resolvedPlan.mixDurationSec,
            bpm,
            offsetSec: beatGridOffsetSecRef.current,
            overlapBars: resolvedPlan.overlapBars,
          })
          setWaveformMixOverlay({
            active: true,
            mixOutSec: aligned.mixOutSec,
            mixStartSec: aligned.mixStartSec,
            mixEndSec: aligned.mixEndSec,
          })
        }
        // Ensure ghost samples ready
        if (ghostSamplesRef.current?.trackId !== nextTrack.id) {
          void loadWaveformSamplesForTrack(nextTrack, url).then((packed) => {
            if (!packed) return
            cacheMixGridOffset(nextTrack, packed.samples, packed.durationSec || nextTrack.duration || 180)
            ghostSamplesRef.current = {
              trackId: nextTrack.id,
              samples: packed.samples,
              durationSec: packed.durationSec || nextTrack.duration || 180,
              sonicDna: nextTrack.sonic_dna,
            }
            const idleDeck: 'a' | 'b' = playbackDeckRef.current === 'next' ? 'a' : 'b'
            setDeckWaveformCache((prev) => ({
              ...prev,
              [idleDeck]: {
                trackId: nextTrack.id,
                samples: packed.samples,
                durationSec: packed.durationSec || nextTrack.duration || 180,
              },
            }))
          })
        }

        const mixIntel = buildMixIntelligenceForPair(
          currentTrack ?? ({ id: 'out', file: '', title: '' } as Track),
          nextTrack,
          resolvedPlan.style,
          opts?.incomingTargetRate ?? settingsRef.current.playbackRate,
        )
        mixIntelRef.current = mixIntel

        const outDeckId = engine.getActiveDeck()
        const inDeckId: DeckId = outDeckId === 'a' ? 'b' : 'a'
        const outgoingUserEq = getDeckStripEq(outDeckId)
        const incomingUserEq = getDeckStripEq(inDeckId)

        const ok = await engine.prepareAndTransition(
          resolvedPlan,
          withMixGrid(nextTrack),
          url,
          {
            incomingRate: resolvedPlan.rateRatio,
            incomingTargetRate: opts?.incomingTargetRate ?? settingsRef.current.playbackRate,
            masterVolume: settingsRef.current.isMuted ? 0 : settingsRef.current.volume,
            audioContext: audioContextRef.current,
            mixIntelligence: mixIntel,
            onProgress: pushMixVisualProgress,
            onDeckRate: handleMixDeckRate,
            onDeckEq: handleMixDeckEq,
            onDeckFilter: handleMixDeckFilter,
            outgoingEqBias: outgoingUserEq,
            incomingEqBias: incomingUserEq,
            keyLock: true,
          },
        )

        if (!ok) {
          abortToHardCut()
          return
        }

        // The engine swapped its own active deck when the fade completed. Deriving
        // the deck from the pre-mix playbackDeckRef here would undo that swap and
        // leave the outgoing deck live, so read the engine and follow it instead.
        engine.setMasterVolume(settingsRef.current.isMuted ? 0 : settingsRef.current.volume)

        // Mixer handoff — incoming stays on its deck; both channels remain "on"
        const handoffTarget = opts?.incomingTargetRate ?? settingsRef.current.playbackRate
        const nextDeck = engine.getActiveDeck() === 'b' ? 'next' : 'main'
        armDeckHandoff(nextTrack, nextDeck, handoffTarget)
        playbackDeckRef.current = nextDeck
        // Sync waveform clock to live deck immediately (don't wait for React commit)
        liveAudioRef.current =
          playbackDeckRef.current === 'next' ? nextAudioRef.current : audioRef.current
        setWaveformMediaSyncKey(
          `${playbackDeckRef.current}:${nextTrack.id}:${Math.round((liveAudioRef.current?.currentTime || 0) * 10)}`,
        )
        setCuedIdleTrackId(null)
        setCrossfadeActive(false)
        clearMixVisualProgress()
        phraseMixLockRef.current = false

        const liveAfter = getPlaybackAudio()
        if (liveAfter?.paused) {
          void liveAfter.play().catch(() => {})
        }
        // Engine already soft-opens filters after handoff settle — avoid a second snap.

        adoptPlayingTrack(nextTrack, q)
        setResolvedUrl(url)
        const liveRate =
          liveAfter && Number.isFinite(liveAfter.playbackRate) && liveAfter.playbackRate > 0
            ? liveAfter.playbackRate
            : handoffTarget
        if (Math.abs(liveRate - handoffTarget) > 0.004) {
          easeLivePlaybackRate(liveRate, handoffTarget, autoDJConfigRef.current.enabled ? 900 : 650)
        }
        if (autoDJConfigRef.current.enabled) {
          // Former outgoing deck is idle — pre-cue N+2 after handoff settle so mix
          // planning and beatmatch rate are ready before the next OUT window.
          window.setTimeout(() => {
            void precueIdleForQueueSuccessorRef.current?.(nextTrack, q)
          }, 150)
        }
        mixIntelRef.current = null
        setWaveformMixOverlay(null)
        setWaveformGhostTape(null)
        ghostSamplesRef.current = null
        setAutoDJStatusMessage(`On air: “${nextTrack.title}”`)
        const activeEngineDeck = engine.getActiveDeck()
        window.setTimeout(() => {
          if (!isDeckHandoffActive(nextTrack.id)) return
          syncPostHandoffEq(activeEngineDeck)
        }, 280)
      } catch (err) {
        console.debug('Phrase mix failed:', err)
        abortToHardCut()
      }
    },
    [
      clearFadeInterval,
      clearAutoDJCrossfadeTimeout,
      clearSkipBlendWatch,
      restoreMainVolume,
      trackIntroOffsetSec,
      playTrack,
      seekTo,
      adoptPlayingTrack,
      getPlaybackAudio,
      ensureMixEngine,
      ensureDualDeckGraph,
      easeLivePlaybackRate,
      handleMixDeckEq,
      handleMixDeckRate,
      handleMixDeckFilter,
      cacheMixGridOffset,
      toMixTrackRef,
      applyFormantForRate,
      computeMixIncomingRate,
      buildMixIntelligenceForPair,
      armDeckHandoff,
      syncPostHandoffEq,
      isDeckHandoffActive,
      getDeckStripEq,
      pushMixVisualProgress,
      clearMixVisualProgress,
      currentTrack?.id,
      getOutgoingPlaybackRate,
      autoDJConfig.mixStyle,
      autoDJConfig.mixTechniques,
      autoDJConfig.outPhraseBars,
      autoDJConfig.inPhraseBars,
      autoDJConfig.overlapBars,
      autoDJConfig.energyCurve,
    ]
  )

  const startCrossfade = useCallback(
    (nextTrack: Track, durationOverride?: number) => {
      const fadeSec =
        typeof durationOverride === 'number' && durationOverride >= 0
          ? durationOverride
          : settings.crossfadeDuration
      if (fadeSec <= 0) {
        restoreMainVolume()
        const q = queueRef.current.some((t) => t.id === nextTrack.id)
          ? queueRef.current
          : [...queueRef.current, nextTrack]
        playTrack(nextTrack, q)
        seekTo(trackIntroOffsetSec(nextTrack))
        return
      }
      void startPhraseMix(nextTrack, fadeSec)
    },
    [
      settings.crossfadeDuration,
      startPhraseMix,
      restoreMainVolume,
      playTrack,
      seekTo,
      trackIntroOffsetSec,
    ]
  )

  const silenceCuedIdle = useCallback(() => {
    mixEngineRef.current?.silenceIdle({ instant: true })
    const idle = getIdleAudio()
    if (!idle) return
    try {
      idle.pause()
      idle.volume = 0
    } catch {
      /* ignore */
    }
  }, [getIdleAudio])

  const hardSkipToNext = useCallback(() => {
    clearSkipBlendWatch()
    clearAutoDJOutWatch()
    mixEngineRef.current?.stopMix()
    silenceCuedIdle()
    setCuedIdleTrackId(null)
    phraseMixLockRef.current = false
    skipSrcReloadRef.current = false
    deckHandoffRef.current = null
    onNext?.()
  }, [clearSkipBlendWatch, clearAutoDJOutWatch, silenceCuedIdle, onNext])

  /**
   * Skip / next: if Auto DJ has a cued incoming (or a next track), blend from
   * the next outgoing beat into parked phrase 1. Never cold-load the cued deck.
   */
  const handleSkipToNext = useCallback(() => {
    if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) return

    clearSkipBlendWatch()

    const q = queueRef.current
    if (q.length < 2) {
      onNext?.()
      return
    }
    const cur = autoDJCurrentTrackRef.current
    const idx = cur ? q.findIndex((t) => t.id === cur.id) : -1
    const next = (idx >= 0 ? q[idx + 1] : null) ?? q[0]
    if (!next || next.id === cur?.id) {
      onNext?.()
      return
    }

    const autoOn = autoDJConfigRef.current.enabled
    const fadeSec = settingsRef.current.crossfadeDuration
    if (!autoOn) {
      if (fadeSec > 0) {
        startCrossfade(next, fadeSec)
        return
      }
      hardSkipToNext()
      return
    }

    const live = getPlaybackAudio()
    const now = live && Number.isFinite(live.currentTime) ? live.currentTime : 0
    const duration =
      live && Number.isFinite(live.duration) && live.duration > 0 ? live.duration : 0
    const remain = duration > 0 ? duration - now : 48
    if (remain < 1.25) {
      hardSkipToNext()
      return
    }

    clearAutoDJOutWatch()
    autoDJPendingRef.current = null
    setAutoDJPendingTrackId(null)

    const cfg = autoDJConfigRef.current
    const phraseMix = resolvePhraseMixSettings(cfg, {
      qualityGate: shouldApplyQualityGate(lastMixQualityRef.current?.grade)
        ? lastMixQualityRef.current?.grade
        : null,
    })
    const outBpm =
      resolvePlaybackBpm(cur, detectedBPMRef.current) ??
      cur?.bpm ??
      detectedBPMRef.current ??
      120
    const mixStyle = resolveEffectiveMixStyle(
      cfg.mixStyle,
      cfg.mixTechniques,
      cfg.transitionMode,
    )
    const prior =
      autoDJFrozenPlanRef.current?.incomingId === next.id
        ? autoDJFrozenPlanRef.current.plan
        : lastMixPlanRef.current?.incomingTrackId === next.id
          ? lastMixPlanRef.current
          : null
    const rate = computeMixIncomingRate(cur, next)
    const plan = buildSkipBlendPlan({
      outgoingTrackId: cur?.id || 'out',
      incomingTrackId: next.id,
      nowSec: now,
      outgoingBpm: outBpm,
      outgoingOffsetSec: beatGridOffsetSecRef.current,
      incomingStartSec: prior?.incomingStartSec ?? trackIntroOffsetSec(next),
      overlapBars: phraseMix.overlapBars,
      rateRatio: rate,
      style: mixStyle,
      outPhraseBars: phraseMix.outPhraseBars,
      inPhraseBars: phraseMix.inPhraseBars,
      remainSec: remain,
      prior,
    })
    lastMixPlanRef.current = plan
    mixEngineRef.current?.silenceIdle({ instant: true })
    setAutoDJStatusMessage(`Skip blend → “${next.title}”`)

    const fireAt = plan.startAtOutgoingSec
    const handoffTarget = resolveIncomingRateForStrategy({
      strategy: phraseMix.bpmStrategy,
      beatmatchRate: rate,
      sliderRate: settingsRef.current.playbackRate,
    })

    const fire = () => {
      skipBlendRafRef.current = null
      void startPhraseMix(next, plan.mixDurationSec, rate, plan, {
        incomingTargetRate: handoffTarget,
      })
    }

    if (!live || fireAt <= now + 0.02 || fireAt >= duration - 0.05) {
      fire()
      return
    }

    clearSkipBlendWatch()
    const watch = () => {
      if (phraseMixLockRef.current || mixEngineRef.current?.isMixing()) {
        skipBlendRafRef.current = null
        return
      }
      const t = getPlaybackAudio()?.currentTime ?? 0
      if (t + 0.005 >= fireAt) {
        fire()
        return
      }
      skipBlendRafRef.current = requestAnimationFrame(watch)
    }
    skipBlendRafRef.current = requestAnimationFrame(watch)
  }, [
    onNext,
    startCrossfade,
    startPhraseMix,
    hardSkipToNext,
    getPlaybackAudio,
    computeMixIncomingRate,
    trackIntroOffsetSec,
    clearAutoDJOutWatch,
    clearSkipBlendWatch,
  ])

  skipToNextRef.current = handleSkipToNext

  // Playback control
  useEffect(() => {
    const audio = getPlaybackAudio()
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
    } else if (
      !phraseMixLockRef.current &&
      !mixEngineRef.current?.isMixing() &&
      !isDeckHandoffActive(currentTrack?.id)
    ) {
      audio.pause()
    }
  }, [isPlaying, isLoading, error, getPlaybackAudio, isDeckHandoffActive, currentTrack?.id])

  // Seek function
  const seek = useCallback((seconds: number) => {
    const audio = getPlaybackAudio()
    if (!audio) return
    const newTime = Math.max(0, Math.min(duration, audio.currentTime + seconds))
    audio.currentTime = newTime
    snapPlaybackTime(newTime)
  }, [duration, snapPlaybackTime, getPlaybackAudio])

  // Touch gestures for mobile
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const handleTouchStart = (e: TouchEvent) => {
      if (waveformContainerRef.current?.contains(e.target as Node)) return
      if (e.touches.length === 1) {
        touchStartXRef.current = e.touches[0].clientX
        touchStartYRef.current = e.touches[0].clientY
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (waveformContainerRef.current?.contains(e.target as Node)) return
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

      const audio = getPlaybackAudio()
      if (!audio) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft': {
          e.preventDefault()
          const bpm =
            resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack.bpm || 120
          const beat = 60 / Math.max(1, Number(bpm) || 120)
          if (e.altKey) seek(-(beat * 4 * (autoDJConfig.overlapBars || 8)))
          else if (e.shiftKey) seek(-(beat * 4))
          else seek(-beat)
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const bpm =
            resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack.bpm || 120
          const beat = 60 / Math.max(1, Number(bpm) || 120)
          if (e.altKey) seek(beat * 4 * (autoDJConfig.overlapBars || 8))
          else if (e.shiftKey) seek(beat * 4)
          else seek(beat)
          break
        }
        case 'ArrowUp':
          e.preventDefault()
          adjustVolume(0.05)
          break
        case 'ArrowDown':
          e.preventDefault()
          adjustVolume(-0.05)
          break
        case '1':
        case '2':
        case '3':
        case '4': {
          const slot = Number(e.key) as 1 | 2 | 3 | 4
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            persistHotCue(slot, audio.currentTime || 0)
          } else {
            jumpHotCue(slot)
          }
          break
        }
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
        case 'k':
        case 'K':
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault()
            const bpm =
              resolvePlaybackBpm(currentTrack, detectedBPM) ||
              detectedBPM ||
              currentTrack.bpm ||
              120
            const next = quantizeToDnaGrid({
              timeSec: audio.currentTime,
              bpm,
              offsetSec: beatGridOffsetSec,
              sonicDna: currentTrack?.sonic_dna,
              mode: 'kick',
            })
            audio.currentTime = next
            setCurrentTime(next)
          }
          break
        case 'p':
        case 'P':
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault()
            const bpm =
              resolvePlaybackBpm(currentTrack, detectedBPM) ||
              detectedBPM ||
              currentTrack.bpm ||
              120
            const next = quantizeToDnaGrid({
              timeSec: audio.currentTime,
              bpm,
              offsetSec: beatGridOffsetSec,
              sonicDna: currentTrack?.sonic_dna,
              mode: 'phrase',
            })
            audio.currentTime = next
            setCurrentTime(next)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentTrack, isPlaying, settings, seek, persistHotCue, jumpHotCue, detectedBPM, autoDJConfig.overlapBars, getPlaybackAudio, beatGridOffsetSec])

  const togglePlay = async () => {
    const audio = getPlaybackAudio()
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      // Setup AudioContext when user clicks play (user interaction required)
      if (!audioContextRef.current || !sourceNodeRef.current) {
        try {
          await ensureDualDeckGraph()
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


  const seekToTime = useCallback(
    (newTime: number) => {
      const audio = getPlaybackAudio()
      if (!audio) return
      audio.currentTime = newTime
      snapPlaybackTime(newTime)
    },
    [getPlaybackAudio, snapPlaybackTime],
  )

  const adjustVolume = (delta: number) => {
    const newVolume = Math.max(0, Math.min(1, settings.volume + delta))
    saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
    const live = getPlaybackAudio()
    if (live && !phraseMixLockRef.current) {
      live.volume = newVolume
    }
    mixEngineRef.current?.setMasterVolume(newVolume)
  }

  const toggleMute = () => {
    const newMuted = !settings.isMuted
    saveSettings({ isMuted: newMuted })
    const vol = newMuted ? 0 : settings.volume
    const live = getPlaybackAudio()
    if (live && !phraseMixLockRef.current) {
      live.volume = vol
    }
    mixEngineRef.current?.setMasterVolume(vol)
  }

  const toggleCatalogRandom = () => {
    const next = !settings.catalogRandom
    saveSettings({ catalogRandom: next })
    catalogRandomFillKeyRef.current = ''
    setAutoDJStatusMessage(
      next
        ? `Random from ${catalogScopeLabel(currentSource)} on`
        : 'Catalog random off — queue order unchanged',
    )
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

  const transportHandlersRef = useRef({
    togglePlay: async () => {},
    toggleShuffle: () => {},
    cycleRepeatMode: () => {},
    onPrevious: () => {},
    onNext: () => {},
  })
  transportHandlersRef.current = {
    togglePlay,
    toggleShuffle,
    cycleRepeatMode,
    onPrevious: () => onPrevious?.(),
    onNext: () => skipToNextRef.current(),
  }

  useEffect(() => {
    const onCommand = (ev: Event) => {
      const cmd = (ev as CustomEvent<{ cmd: PlayerTransportCommand }>).detail?.cmd
      if (!cmd) return
      const h = transportHandlersRef.current
      switch (cmd) {
        case 'togglePlay':
          void h.togglePlay()
          break
        case 'previous':
          h.onPrevious()
          break
        case 'next':
          h.onNext()
          break
        case 'toggleShuffle':
          h.toggleShuffle()
          break
        case 'cycleRepeat':
          h.cycleRepeatMode()
          break
      }
    }
    window.addEventListener(PLAYER_TRANSPORT_EVENT, onCommand)
    dispatchPlayerSettings({
      isShuffled: settingsRef.current.isShuffled,
      repeatMode: settingsRef.current.repeatMode,
    })
    return () => window.removeEventListener(PLAYER_TRANSPORT_EVENT, onCommand)
  }, [])

  const changeDeckPlaybackRate = useCallback(
    (deck: 'a' | 'b', rate: number) => {
      const clamped = clampTempoRate(rate)
      const el = deck === 'a' ? audioRef.current : nextAudioRef.current
      if (el) {
        configureKeyLock(el, true)
        applyDeckTempo(el, clamped, { keyLock: true, instant: false })
      }
      mixEngineRef.current?.setDeckPlaybackRate(deck, clamped, { instant: false })
      setDeckUi((prev) => ({
        ...prev,
        [deck]: { ...prev[deck], playbackRate: clamped },
      }))
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      const idleDeck: DeckId = liveDeck === 'a' ? 'b' : 'a'
      if (
        deck === idleDeck &&
        cuedIdleTrackIdRef.current &&
        !mixEngineRef.current?.isMixing()
      ) {
        mixEngineRef.current?.lockIdleTempo(clamped)
      }
      if (deck === liveDeck) {
        saveSettings({ playbackRate: clamped })
        applyFormantForRate(clamped)
      }
    },
    [applyFormantForRate, saveSettings],
  )

  const changePlaybackRate = (rate: number) => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    changeDeckPlaybackRate(liveDeck, rate)
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getCurrentQueueIndex = () => {
    if (!currentTrack) return -1
    return queue.findIndex(t => t.id === currentTrack.id)
  }

  const currentQueueIndex = useMemo(() => getCurrentQueueIndex(), [currentTrack, queue])

  const liveDeckId = waveformMediaSyncKey.startsWith('next') ? 'b' : 'a'

  const nextQueueTrack = useMemo(() => {
    const idx = currentQueueIndex
    return idx >= 0 && queue[idx + 1] ? queue[idx + 1] : null
  }, [currentQueueIndex, queue])

  /** Live deck = now playing; idle deck = up next from the queue (never the previous track). */
  const trackForQueueDeck = useCallback(
    (deck: 'a' | 'b'): Track | null => {
      if (deck === liveDeckId) return currentTrack ?? null
      return nextQueueTrack ?? null
    },
    [liveDeckId, currentTrack, nextQueueTrack],
  )

  const incomingDeckHot =
    isAutoDJEnabled &&
    !!nextQueueTrack &&
    (crossfadeActive ||
      autoDJCuedTrackId === nextQueueTrack.id ||
      autoDJPendingTrackId === nextQueueTrack.id)

  const autoDjDeckStatusLine = useMemo(() => {
    if (!isAutoDJEnabled) return null
    if (crossfadeActive && mixVisualProgress != null) {
      const bars = autoDJConfig.overlapBars
      return `Blending ${Math.round(mixVisualProgress * 100)}% · ${bars}-bar overlap`
    }
    if (autoDJOutCountdown != null && autoDJOutCountdown > 0) {
      const hint =
        currentTrack && nextQueueTrack
          ? formatMixPairHintLine(
              buildMixPairHint(
                {
                  bpm:
                    resolvePlaybackBpm(currentTrack, detectedBPM) ??
                    currentTrack.bpm ??
                    null,
                  sonic_dna: currentTrack.sonic_dna,
                  trackKey: displayTrackKey(currentTrack) || null,
                },
                {
                  bpm:
                    resolvePlaybackBpm(nextQueueTrack, null) ??
                    nextQueueTrack.bpm ??
                    null,
                  sonic_dna: nextQueueTrack.sonic_dna,
                  trackKey: displayTrackKey(nextQueueTrack) || null,
                },
              ),
            )
          : null
      return `OUT in ${autoDJOutCountdown.toFixed(1)}s${hint ? ` · ${hint}` : ''}`
    }
    return null
  }, [
    isAutoDJEnabled,
    crossfadeActive,
    mixVisualProgress,
    autoDJOutCountdown,
    autoDJConfig.overlapBars,
    currentTrack,
    nextQueueTrack,
    detectedBPM,
  ])

  const resolveTrackBpm = useCallback((track: Track | null | undefined) => {
    if (!track) return null
    const cached = bpmCacheRef.current.get(track.id)
    if (typeof cached === 'number') return cached
    return track.bpm ?? null
  }, [])

  const resolveTrackBeatGridOffset = useCallback(
    (track: Track | null | undefined): number => {
      if (!track) return 0
      const cached = mixGridOffsetCacheRef.current.get(track.id)
      if (
        typeof track.beat_grid_offset === 'number' &&
        Number.isFinite(track.beat_grid_offset) &&
        track.beat_grid_offset >= 0
      ) {
        return track.beat_grid_offset
      }
      if (typeof cached === 'number' && Number.isFinite(cached)) {
        return Math.max(0, cached)
      }
      const ref = toMixTrackRef(track)
      return typeof ref.beat_grid_offset === 'number' ? ref.beat_grid_offset : 0
    },
    [toMixTrackRef],
  )

  useEffect(() => {
    setDeckUi((prev) => ({
      ...prev,
      [liveDeckId]: { ...prev[liveDeckId], detectedBpm: detectedBPM },
    }))
  }, [detectedBPM, liveDeckId])

  useEffect(() => {
    const aRate = audioRef.current?.playbackRate
    const bRate = nextAudioRef.current?.playbackRate
    setDeckUi((prev) => ({
      ...prev,
      a: {
        ...prev.a,
        playbackRate:
          typeof aRate === 'number' && aRate > 0 ? aRate : prev.a.playbackRate,
      },
      b: {
        ...prev.b,
        playbackRate:
          typeof bRate === 'number' && bRate > 0 ? bRate : prev.b.playbackRate,
      },
    }))
  }, [waveformMediaSyncKey, currentTrack?.id, settings.playbackRate])

  useEffect(() => {
    if (!isExpanded || !audioContextReady) return
    const engine = mixEngineRef.current
    if (!engine) return
    setDeckUi((prev) => ({
      ...prev,
      a: { ...prev.a, eqGains: engine.getDeckEqGains('a') },
      b: { ...prev.b, eqGains: engine.getDeckEqGains('b') },
    }))
  }, [isExpanded, audioContextReady, waveformMediaSyncKey])

  const resolveDeckTrack = useCallback(
    (deck: 'a' | 'b'): Track | null => trackForQueueDeck(deck),
    [trackForQueueDeck],
  )

  const expandedDeckChannels = useMemo(() => {
    const deckATrack = trackForQueueDeck('a')
    const deckBTrack = trackForQueueDeck('b')

    const build = (
      deck: 'a' | 'b',
      track: Track | null | undefined,
      isLive: boolean,
    ) => {
      const trackCoverSrc = track ? albumCoverUrl(track, queue, coverBust) : undefined
      const liveDetectedBpm = isLive ? detectedBPM : null
      const liveTrackForHint = liveDeckId === 'a' ? deckATrack : deckBTrack
      const pairHint =
        !isLive &&
        isAutoDJEnabled &&
        track &&
        liveTrackForHint
          ? formatMixPairHintLine(
              buildMixPairHint(
                {
                  bpm:
                    resolvePlaybackBpm(liveTrackForHint, detectedBPM) ??
                    liveTrackForHint.bpm ??
                    null,
                  sonic_dna: liveTrackForHint.sonic_dna,
                  trackKey: displayTrackKey(liveTrackForHint) || null,
                },
                {
                  bpm: resolvePlaybackBpm(track, null) ?? track.bpm ?? null,
                  sonic_dna: track.sonic_dna,
                  trackKey: displayTrackKey(track) || null,
                },
              ),
            )
          : null
      const filters = deckFilterUi[deck]
      const qualityFlashActive =
        mixQualityFlash != null && Date.now() < mixQualityFlash.until
      return {
        deckLabel: deck === 'a' ? ('A' as const) : ('B' as const),
        trackTitle: track?.title,
        trackArtist: track?.artist,
        trackAlbum: track?.album || track?.folder,
        coverSrc: trackCoverSrc,
        coverAlt: track?.album || track?.title || `Deck ${deck === 'a' ? 'A' : 'B'}`,
        coverUnoptimized: trackCoverSrc ? shouldUnoptimizeImage(trackCoverSrc) : true,
        catalogBpm: track
          ? displayTrackBpm(track) ?? liveDetectedBpm ?? resolveTrackBpm(track)
          : null,
        trackGenre: track ? displayTrackGenre(track) || null : null,
        trackKey: track ? displayTrackKey(track) || null : null,
        detectedBPM: isLive
          ? detectedBPM
          : (deckUi[deck].detectedBpm ?? resolveTrackBpm(track)),
        isDetectingBPM: isLive && isDetectingBPM,
        playbackRate: deckUi[deck].playbackRate,
        tapTempoTaps: deckUi[deck].tapTempoTaps,
        tapTempoBPM: deckUi[deck].tapTempoBPM,
        tapTempoSectionsCompleted: deckUi[deck].tapTempoSectionBpms.length,
        eqGains: deckUi[deck].eqGains,
        isLive,
        isArmed: !isLive && incomingDeckHot,
        isMixing: crossfadeActive && mixVisualProgress != null,
        mixRole:
          crossfadeActive && mixVisualProgress != null
            ? isLive
              ? ('outgoing' as const)
              : ('incoming' as const)
            : null,
        mixProgress: crossfadeActive && mixVisualProgress != null ? mixVisualProgress : undefined,
        filterOpenness: filterOpenness(filters.hpfHz, filters.lpfHz),
        pairHint,
        mixQualityGrade:
          qualityFlashActive && isLive ? mixQualityFlash!.grade : null,
      }
    }

    return {
      a: build('a', deckATrack, liveDeckId === 'a'),
      b: build('b', deckBTrack, liveDeckId === 'b'),
    }
  }, [
    liveDeckId,
    currentTrack,
    nextQueueTrack,
    trackForQueueDeck,
    currentQueueIndex,
    queue,
    detectedBPM,
    isDetectingBPM,
    deckUi,
    resolveTrackBpm,
    incomingDeckHot,
    crossfadeActive,
    mixVisualProgress,
    isAutoDJEnabled,
    deckFilterUi,
    mixQualityFlash,
    coverBust,
  ])

  const syncDeckWaveformCache = useCallback((deck: 'a' | 'b', pack: DeckWaveformPack) => {
    setDeckWaveformCache((prev) => {
      if (prev[deck]?.trackId === pack.trackId) return prev
      return { ...prev, [deck]: pack }
    })
  }, [])

  const syncIdleDeckWaveformCache = useCallback(
    (trackId: string, samples: WaveformSample[], durationSec: number) => {
      const idleDeck: 'a' | 'b' = liveDeckId === 'a' ? 'b' : 'a'
      syncDeckWaveformCache(idleDeck, { trackId, samples, durationSec })
    },
    [liveDeckId, syncDeckWaveformCache],
  )

  /** Load the queue track after `liveTrack` onto the idle deck for the next mix. */
  const precueIdleForQueueSuccessor = useCallback(
    async (liveTrack: Track, trackQueue: Track[]) => {
      if (!autoDJConfigRef.current.enabled) return
      const liveIdx = trackQueue.findIndex((t) => t.id === liveTrack.id)
      const successor = liveIdx >= 0 ? trackQueue[liveIdx + 1] : null
      if (!successor || cuedIdleTrackIdRef.current === successor.id) return

      await ensureDualDeckGraph()
      const engine = ensureMixEngine()
      if (!engine || engine.isMixing()) return

      let url = resolvedUrlCacheRef.current.get(successor.file) || null
      if (!url) {
        url = await resolveAudioUrl(successor.file)
        if (url) resolvedUrlCacheRef.current.set(successor.file, url)
      }
      if (!url) return

      void loadWaveformSamplesForTrack(successor, url).then((packed) => {
        if (!packed) return
        cacheMixGridOffset(
          successor,
          packed.samples,
          packed.durationSec || successor.duration || 180,
        )
        ghostSamplesRef.current = {
          trackId: successor.id,
          samples: packed.samples,
          durationSec: packed.durationSec || successor.duration || 180,
          sonicDna: successor.sonic_dna,
        }
        syncIdleDeckWaveformCache(
          successor.id,
          packed.samples,
          packed.durationSec || successor.duration || 180,
        )
      })

      const outBpm =
        resolvePlaybackBpm(liveTrack, detectedBPMRef.current) ??
        liveTrack.bpm ??
        detectedBPMRef.current ??
        120
      const inBpm = resolvePlaybackBpm(successor, null) ?? successor.bpm ?? outBpm
      const mixDeckRates = computeMixDeckRates({
        outgoingBpm: outBpm,
        incomingBpm: inBpm,
        outgoingPlaybackRate: getOutgoingPlaybackRate(),
        incomingTargetRate:
          autoDJConfigRef.current.bpmStrategy === 'manual'
            ? settingsRef.current.playbackRate
            : 1,
      })
      const cueSec = trackIntroOffsetSec(successor)

      try {
        await engine.loadIdle(withMixGrid(successor), url, cueSec, mixDeckRates.incomingRate)
        setCuedIdleTrackId(successor.id)
        setAutoDJStatusMessage(`Pre-cued “${successor.title}” for next mix`)
      } catch (err) {
        console.debug('Post-handoff idle precue failed:', err)
      }
    },
    [
      ensureDualDeckGraph,
      ensureMixEngine,
      trackIntroOffsetSec,
      cacheMixGridOffset,
      syncIdleDeckWaveformCache,
      getOutgoingPlaybackRate,
    ],
  )
  precueIdleForQueueSuccessorRef.current = precueIdleForQueueSuccessor

  // Prefetch idle-deck waveforms — idle deck always mirrors queue up-next.
  useEffect(() => {
    if (isMiniMode || (expandedMode as string) === 'dj') return

    const idleTargets: { deck: 'a' | 'b'; track: Track | null | undefined }[] = [
      {
        deck: 'a',
        track: liveDeckId === 'a' ? null : nextQueueTrack,
      },
      {
        deck: 'b',
        track: liveDeckId === 'b' ? null : nextQueueTrack,
      },
    ]

    let cancelled = false
    for (const { deck, track } of idleTargets) {
      if (!track?.id) continue
      if (deckWaveformCache[deck]?.trackId === track.id) continue

      const ghost = ghostSamplesRef.current
      if (ghost?.trackId === track.id && ghost.samples.length > 0) {
        syncDeckWaveformCache(deck, {
          trackId: track.id,
          samples: ghost.samples,
          durationSec: ghost.durationSec || track.duration || 180,
        })
        continue
      }

      void (async () => {
        try {
          let url = resolvedUrlCacheRef.current.get(track.file) || null
          if (!url) url = await resolveAudioUrl(track.file)
          if (!url || cancelled) return
          resolvedUrlCacheRef.current.set(track.file, url)
          const packed = await loadWaveformSamplesForTrack(track, url)
          if (cancelled || !packed.samples.length) return
          syncDeckWaveformCache(deck, {
            trackId: track.id,
            samples: packed.samples,
            durationSec: packed.durationSec || track.duration || 180,
          })
        } catch {
          /* ignore */
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [
    isMiniMode,
    expandedMode,
    liveDeckId,
    nextQueueTrack,
    currentQueueIndex,
    queue,
    deckWaveformCache,
    syncDeckWaveformCache,
  ])

  // Mini/expand chrome must not collapse a docked vault queue panel.
  useEffect(() => {
    if (!isQueueOpen) {
      setIsQueueExpanded(false)
      setIsTrackListExpanded(false)
      return
    }
    if (isQueueDocked || !isMiniMode || isExpanded) {
      setIsTrackListExpanded(true)
    }
  }, [isQueueOpen, isMiniMode, isExpanded, isQueueDocked])

  // Load the selected folder / playlist / catalog for queue preview and random picks.
  useEffect(() => {
    if (!getTracksFromSource) return
    const needPool = isQueueOpen || settings.catalogRandom || autoDJConfig.enabled
    if (!needPool) {
      setAllSourceTracks([])
      return
    }
    let cancelled = false
    setIsLoadingSourceTracks(isQueueOpen)
    getTracksFromSource(currentSource ?? null)
      .then((tracks) => {
        if (cancelled) return
        setAllSourceTracks(tracks)
        setIsLoadingSourceTracks(false)
      })
      .catch((error) => {
        console.error('Error fetching source tracks:', error)
        if (!cancelled) {
          setAllSourceTracks([])
          setIsLoadingSourceTracks(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    isQueueOpen,
    currentSource,
    getTracksFromSource,
    settings.catalogRandom,
    autoDJConfig.enabled,
  ])

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
    const bpm =
      resolvePlaybackBpm(currentTrack, detectedBPM) ||
      detectedBPM ||
      currentTrack?.bpm ||
      120
    const beatDuration = bpm > 0 ? 60 / bpm : 0.5
    // Always honor the Auto DJ phrase-length control (beat-grid aligned).
    return beatDuration * 4 * autoDJConfig.overlapBars
  }, [autoDJConfig.overlapBars, detectedBPM, currentTrack])

  const autoDJPool = useMemo(() => {
    if (autoDJLibrary.length > 0) return autoDJLibrary
    if (allSourceTracks.length > 0) return allSourceTracks
    return queue
  }, [autoDJLibrary, allSourceTracks, queue])

  const catalogPool = useMemo(() => {
    if (allSourceTracks.length > 0) return allSourceTracks
    return queue
  }, [allSourceTracks, queue])

  useEffect(() => {
    playedTrackIdsRef.current.clear()
    if (currentTrack?.id) playedTrackIdsRef.current.add(currentTrack.id)
    catalogRandomFillKeyRef.current = ''
  }, [currentSource?.type, currentSource?.id])

  useEffect(() => {
    if (currentTrack?.id) playedTrackIdsRef.current.add(currentTrack.id)
  }, [currentTrack?.id])

  const catalogRandomLookahead = Math.max(1, Math.min(autoDJConfig.lookahead || 4, 8))

  useEffect(() => {
    if (autoDJConfig.enabled || !settings.catalogRandom || !onQueueChange) return
    if (!currentTrack || catalogPool.length === 0) return
    const idx =
      currentQueueIndex >= 0
        ? currentQueueIndex
        : queue.findIndex((track) => track.id === currentTrack.id)
    const upcoming = idx >= 0 ? queue.length - 1 - idx : 0
    if (upcoming >= catalogRandomLookahead) return
    const fillKey = `${currentTrack.id}:${idx}:${queue.length}`
    if (catalogRandomFillKeyRef.current === fillKey) return
    const needed = catalogRandomLookahead - Math.max(0, upcoming)
    const exclude = new Set(queue.map((track) => track.id))
    playedTrackIdsRef.current.forEach((id) => exclude.add(id))
    const picked = pickRandomUnusedTracks(catalogPool, exclude, needed, {
      allowReshuffle: true,
      keepExcluded: [currentTrack.id],
    })
    if (picked.length === 0) return
    catalogRandomFillKeyRef.current = fillKey
    onQueueChange([...queue, ...picked])
    setAutoDJStatusMessage(
      `Random from ${catalogScopeLabel(currentSource)} · queued “${picked[0]!.title}”`,
    )
  }, [
    autoDJConfig.enabled,
    settings.catalogRandom,
    onQueueChange,
    currentTrack,
    catalogPool,
    queue,
    currentQueueIndex,
    catalogRandomLookahead,
    currentSource,
  ])

  const pickAutoDJTrack = useCallback((): Track | null => {
    if (!currentTrack || autoDJPool.length === 0) return null
    const upcomingIds = new Set(
      (currentQueueIndex >= 0 ? queue.slice(currentQueueIndex) : queue).map((t) => t.id),
    )
    const outBpm =
      resolvePlaybackBpm(currentTrack, detectedBPM) ||
      detectedBPM ||
      currentTrack.bpm ||
      null
    const bpmOk = (t: Track) =>
      pairBpmCompatible(outBpm, resolvePlaybackBpm(t, null) ?? t.bpm ?? null)

    const harmonic = autoDJConfig.harmonicMatch
    if (harmonic !== 'off') {
      const ranked = rankDnaTracks(currentTrack, autoDJPool, {
        excludeIds: upcomingIds,
        limit: 12,
        minScore: 0.15,
      })
      const keyThreshold = harmonic === 'key-lock' ? 0.6 : 0.45
      const keyed = ranked.filter((r) => r.score.key >= keyThreshold)
      const pool = (keyed.length ? keyed : ranked).filter((r) => bpmOk(r.track as Track))
      const usePool = pool.length ? pool : keyed.length ? keyed : ranked
      if (usePool.length) {
        const pick = usePool[Math.floor(Math.random() * Math.min(3, usePool.length))]!
        return pick.track as Track
      }
    }
    const best = pickBestDnaTrack(currentTrack, autoDJPool, {
      excludeIds: upcomingIds,
      randomizeTop: 2,
      minScore: 0.12,
    })
    if (best && bpmOk(best as Track)) return best as Track
    if (best) return best as Track

    const soft = pickBestDnaTrack(currentTrack, autoDJPool, {
      excludeIds: new Set([currentTrack.id]),
      randomizeTop: 2,
    })
    return (soft as Track) || null
  }, [
    autoDJPool,
    queue,
    currentTrack,
    currentQueueIndex,
    autoDJConfig.harmonicMatch,
    detectedBPM,
  ])

  // Refs for fast-changing values so Auto DJ interval doesn't churn on every timeupdate
  const autoDJDurationRef = useRef(duration)
  const autoDJQueueRef = useRef(queue)
  const autoDJCurrentTrackRef = useRef(currentTrack)
  const autoDJPhraseDurationRef = useRef(phraseDuration)
  autoDJDurationRef.current = duration
  autoDJQueueRef.current = queue
  autoDJCurrentTrackRef.current = currentTrack
  autoDJPhraseDurationRef.current = phraseDuration

  // Drop stale transition locks when the playhead moves to a new track
  useEffect(() => {
    // A new track means the previous track's mix distance says nothing about
    // how often we should be replanning.
    autoDJPlanDelayRef.current = null
    autoDJPlanScanRef.current = 0
    // Keep MixEngine lock intact during an in-flight deck-swap handoff
    if (
      phraseMixLockRef.current ||
      skipSrcReloadRef.current ||
      isDeckHandoffActive(currentTrack?.id)
    ) {
      autoDJPendingRef.current = null
      setAutoDJPendingTrackId(null)
      return
    }
    autoDJPendingRef.current = null
    autoDJLastAddedRef.current = null
    setAutoDJPendingTrackId(null)
    clearAutoDJCrossfadeTimeout()
        setCuedIdleTrackId(null)
    clearFadeInterval()
    restoreMainVolume()
  }, [currentTrack?.id, clearAutoDJCrossfadeTimeout, clearFadeInterval, restoreMainVolume, isDeckHandoffActive])

  useEffect(() => {
    if (!autoDJConfig.enabled || !onQueueChange) {
      if (autoDJIntervalRef.current) {
        clearInterval(autoDJIntervalRef.current)
        autoDJIntervalRef.current = null
      }
      autoDJLastAddedRef.current = null
      autoDJPendingRef.current = null
      autoDJFrozenPlanRef.current = null
      autoDJIdleWarmedRef.current = null
      deckHandoffRef.current = null
      phraseMixLockRef.current = false
      setCuedIdleTrackId(null)
      clearAutoDJCrossfadeTimeout()
      clearFadeInterval()
      restoreMainVolume()
      setAutoDJStatusMessage('')
      setAutoDJPendingTrackId(null)
      return
    }

    const cueIdleEarly = async (nextTrack: Track, plan: MixPlan, mixStartRate: number) => {
      if (cuedIdleTrackIdRef.current === nextTrack.id) {
        if (!mixEngineRef.current?.isMixing()) {
          if (mixStartRate > 0) {
            mixEngineRef.current?.lockIdleTempo(mixStartRate)
            const idleDeck: DeckId = mixEngineRef.current.getActiveDeck() === 'a' ? 'b' : 'a'
            setDeckUi((prev) => ({
              ...prev,
              [idleDeck]: { ...prev[idleDeck], playbackRate: clampTempoRate(mixStartRate) },
            }))
          }
          mixEngineRef.current?.silenceIdle({ instant: true })
        }
        return
      }
      await ensureDualDeckGraph()
      const engine = ensureMixEngine()
      if (!engine || engine.isMixing()) return
      let url = resolvedUrlCacheRef.current.get(nextTrack.file) || null
      if (!url) {
        url = await resolveAudioUrl(nextTrack.file)
        if (url) resolvedUrlCacheRef.current.set(nextTrack.file, url)
      }
      if (!url) return
      // Preload incoming tape in parallel with audio cue
      void loadWaveformSamplesForTrack(nextTrack, url).then((packed) => {
        if (!packed) return
        cacheMixGridOffset(nextTrack, packed.samples, packed.durationSec || nextTrack.duration || 180)
        ghostSamplesRef.current = {
          trackId: nextTrack.id,
          samples: packed.samples,
          durationSec: packed.durationSec || nextTrack.duration || 180,
          sonicDna: nextTrack.sonic_dna,
        }
        syncIdleDeckWaveformCache(
          nextTrack.id,
          packed.samples,
          packed.durationSec || nextTrack.duration || 180,
        )
      })
      try {
        const cueSec =
          typeof plan.resolvedIncomingSec === 'number' && Number.isFinite(plan.resolvedIncomingSec)
            ? plan.resolvedIncomingSec
            : plan.incomingStartSec
        await engine.loadIdle(withMixGrid(nextTrack), url, cueSec, mixStartRate)
        autoDJIdleWarmedRef.current = null
        const idleDeck: DeckId = engine.getActiveDeck() === 'a' ? 'b' : 'a'
        setDeckUi((prev) => ({
          ...prev,
          [idleDeck]: {
            ...prev[idleDeck],
            playbackRate: clampTempoRate(mixStartRate),
            detectedBpm:
              resolvePlaybackBpm(nextTrack, null) ?? nextTrack.bpm ?? prev[idleDeck].detectedBpm,
          },
        }))
        setCuedIdleTrackId(nextTrack.id)
        const bpm =
          resolvePlaybackBpm(autoDJCurrentTrackRef.current, detectedBPMRef.current) ??
          autoDJCurrentTrackRef.current?.bpm ??
          detectedBPMRef.current ??
          120
        const aligned = alignMixOverlayToBeatGrid({
          mixOutSec: plan.mixOutMarkerSec ?? plan.startAtOutgoingSec,
          mixDurationSec: plan.mixDurationSec,
          bpm,
          offsetSec: beatGridOffsetSecRef.current,
          overlapBars: autoDJConfigRef.current.overlapBars,
        })
        setWaveformMixOverlay({
          active: true,
          mixOutSec: aligned.mixOutSec,
          mixStartSec: aligned.mixStartSec,
          mixEndSec: aligned.mixEndSec,
        })
        setAutoDJStatusMessage(`Cued “${nextTrack.title}” @ ${cueSec.toFixed(1)}s`)
      } catch (err) {
        console.debug('Early idle cue failed:', err)
      }
    }

    const tick = () => {
      if (phraseMixLockRef.current) {
        setAutoDJOutCountdown(null)
        return
      }

      const live = getPlaybackAudio()
      const ct = live && Number.isFinite(live.currentTime) ? live.currentTime : autoDJCurrentTimeRef.current
      const dur =
        live && Number.isFinite(live.duration) && live.duration > 0
          ? live.duration
          : autoDJDurationRef.current
      const q = autoDJQueueRef.current
      const track = autoDJCurrentTrackRef.current
      const phrase = autoDJPhraseDurationRef.current

      if (!track || dur <= 0 || !Number.isFinite(ct)) return
      const currentIndex = q.findIndex((t) => t.id === track.id)
      if (currentIndex < 0) return

      if (trackWaveformBaseRef.current.length >= 64) {
        cacheMixGridOffset(track, trackWaveformBaseRef.current, dur)
      }

      const upcomingCount = q.length - 1 - currentIndex

      // 1) Keep DNA-matched lookahead in the queue
      if (upcomingCount < autoDJConfig.lookahead) {
        const candidate = pickAutoDJTrack()
        if (
          candidate &&
          !q.some((t) => t.id === candidate.id) &&
          autoDJLastAddedRef.current !== candidate.id
        ) {
          autoDJLastAddedRef.current = candidate.id
          const nextQueue = [...q, candidate]
          queueRef.current = nextQueue
          autoDJQueueRef.current = nextQueue
          onQueueChange(nextQueue)
          setAutoDJStatusMessage(`Auto DJ queued “${candidate.title}” (DNA)`)
          return
        }
      }

      // 2) Outro phrase → intro phrase mix (DNA plan)
      if (autoDJPendingRef.current) return
      const nextTrackInQueue = q[currentIndex + 1]
      if (!nextTrackInQueue) {
        setAutoDJOutCountdown(null)
        return
      }

      if (!resolvedUrlCacheRef.current.get(nextTrackInQueue.file)) {
        void resolveAudioUrl(nextTrackInQueue.file).then((resolved) => {
          if (resolved) resolvedUrlCacheRef.current.set(nextTrackInQueue.file, resolved)
        })
      }

      if (
        autoDJFrozenPlanRef.current &&
        (autoDJFrozenPlanRef.current.outgoingId !== track.id ||
          autoDJFrozenPlanRef.current.incomingId !== nextTrackInQueue.id)
      ) {
        autoDJFrozenPlanRef.current = null
      }

      // N+2: warm waveform + grid for the track after next (debounced by id)
      const lookAhead2 = q[currentIndex + 2]
      if (lookAhead2 && mixLookahead2IdRef.current !== lookAhead2.id) {
        mixLookahead2IdRef.current = lookAhead2.id
        void (async () => {
          let url = resolvedUrlCacheRef.current.get(lookAhead2.file) || null
          if (!url) {
            url = await resolveAudioUrl(lookAhead2.file)
            if (url) resolvedUrlCacheRef.current.set(lookAhead2.file, url)
          }
          if (!url) return
          const packed = await loadWaveformSamplesForTrack(lookAhead2, url)
          if (!packed || mixLookahead2IdRef.current !== lookAhead2.id) return
          cacheMixGridOffset(
            lookAhead2,
            packed.samples,
            packed.durationSec || lookAhead2.duration || 180,
          )
        })()
      }

      // buildMixPlan runs phrase and cue-point math across the whole track, twice
      // per pass. Early in a track that work is discarded, so scan coarsely to
      // locate the mix point and tighten to every tick as the outro comes up.
      const lastDelay = autoDJPlanDelayRef.current
      const scanEvery =
        lastDelay == null || lastDelay <= phrase + 6 ? 1 : lastDelay > 60 ? 10 : 3
      autoDJPlanScanRef.current += 1
      if (autoDJPlanScanRef.current % scanEvery !== 0) return

      const outRate = getOutgoingPlaybackRate()
      const outBpm =
        resolvePlaybackBpm(track, detectedBPMRef.current) ??
        track.bpm ??
        detectedBPMRef.current ??
        120

      if (ghostSamplesRef.current?.trackId === nextTrackInQueue.id) {
        cacheMixGridOffset(
          nextTrackInQueue,
          ghostSamplesRef.current.samples,
          ghostSamplesRef.current.durationSec,
        )
      }

      const outRef = {
        ...withMixGrid(track),
        duration: dur,
        // Always plan against the waveform's live beatgrid (not a stale peak cache).
        beat_grid_offset: beatGridOffsetSecRef.current,
      }
      const inRef = withMixGrid(nextTrackInQueue)
      const outgoingGridOffset = beatGridOffsetSecRef.current
      const incomingGridOffset =
        typeof inRef.beat_grid_offset === 'number' ? inRef.beat_grid_offset : undefined

      const resolvedTechniques = resolveEffectiveMixTechniques(
        autoDJConfig.mixTechniques,
        outRef,
        inRef,
      )
      const engineStyle = resolveEffectiveMixStyle(
        autoDJConfig.mixStyle,
        resolvedTechniques,
        autoDJConfig.transitionMode,
      )

      const phraseMix = resolvePhraseMixSettings(autoDJConfig, {
        qualityGate: shouldApplyQualityGate(lastMixQualityRef.current?.grade)
          ? lastMixQualityRef.current?.grade
          : null,
      })

      const basePlan = buildMixPlan({
        outgoing: outRef,
        incoming: inRef,
        nowSec: ct,
        outPhraseBars: phraseMix.outPhraseBars,
        inPhraseBars: phraseMix.inPhraseBars,
        overlapBars: phraseMix.overlapBars,
        cuePriority: phraseMix.cuePriority,
        mixLengthBias: phraseMix.mixLengthBias,
        energyCurve: phraseMix.energyCurve,
        harmonicMatch: autoDJConfig.harmonicMatch,
        outgoingPlaybackRate: outRate,
        outgoingGridOffset,
        incomingGridOffset,
        style: engineStyle,
        autoStyle: false,
        leadInSec: 0,
        canonicalPhraseCues: phraseMix.canonicalPhraseCues,
        exactOverlap: phraseMix.exactOverlap,
      })
      if (!basePlan) return

      const suggestedLead = suggestLeadInSec({
        startAtOutgoingSec: basePlan.startAtOutgoingSec,
        nowSec: ct,
        bpm: outBpm,
        outPhraseBars: phraseMix.outPhraseBars,
      })
      if (Math.abs(suggestedLead - autoDJSuggestedLeadIn) > 0.04) {
        setAutoDJSuggestedLeadIn(suggestedLead)
      }
      const effectiveLeadIn = Math.max(autoDJLeadIn, suggestedLead)

      // Lead-in is prepare-only — rebuild only to stamp prepareLeadInSec (OUT unchanged).
      let plan =
        effectiveLeadIn > 0
          ? buildMixPlan({
              outgoing: outRef,
              incoming: inRef,
              nowSec: ct,
              outPhraseBars: phraseMix.outPhraseBars,
              inPhraseBars: phraseMix.inPhraseBars,
              overlapBars: phraseMix.overlapBars,
              cuePriority: phraseMix.cuePriority,
              mixLengthBias: phraseMix.mixLengthBias,
              energyCurve: phraseMix.energyCurve,
              harmonicMatch: autoDJConfig.harmonicMatch,
              outgoingPlaybackRate: outRate,
              outgoingGridOffset,
              incomingGridOffset,
              style: engineStyle,
              autoStyle: false,
              leadInSec: effectiveLeadIn,
              canonicalPhraseCues: phraseMix.canonicalPhraseCues,
              exactOverlap: phraseMix.exactOverlap,
            }) || basePlan
          : basePlan

      // Snap OUT/IN to the same beatgrid the waveform paints (live offset + BPM).
      const aligned = alignMixOverlayToBeatGrid({
        mixOutSec:
          typeof plan.mixOutMarkerSec === 'number' ? plan.mixOutMarkerSec : plan.startAtOutgoingSec,
        mixDurationSec: plan.mixDurationSec,
        bpm: outBpm,
        offsetSec: beatGridOffsetSecRef.current,
        overlapBars: autoDJConfig.overlapBars,
      })
      plan = {
        ...plan,
        startAtOutgoingSec: aligned.mixOutSec,
        mixOutMarkerSec: aligned.mixOutSec,
        mixDurationSec: aligned.mixDurationSec,
      }

      // Freeze once within 4s of OUT so later ticks cannot snap earlier.
      const frozen = autoDJFrozenPlanRef.current
      if (
        frozen &&
        frozen.outgoingId === track.id &&
        frozen.incomingId === nextTrackInQueue.id
      ) {
        const frozenStart = frozen.plan.startAtOutgoingSec
        if (plan.startAtOutgoingSec + 0.05 < frozenStart) {
          plan = {
            ...frozen.plan,
            prepareLeadInSec: effectiveLeadIn,
          }
        } else {
          autoDJFrozenPlanRef.current = {
            outgoingId: track.id,
            incomingId: nextTrackInQueue.id,
            plan,
          }
        }
      } else if (plan.startAtOutgoingSec - ct <= PLAN_FREEZE_SEC) {
        autoDJFrozenPlanRef.current = {
          outgoingId: track.id,
          incomingId: nextTrackInQueue.id,
          plan,
        }
      }

      setWaveformMixOverlay({
        active: true,
        mixOutSec: plan.mixOutMarkerSec ?? plan.startAtOutgoingSec,
        mixStartSec: plan.mixOutMarkerSec ?? plan.startAtOutgoingSec,
        mixEndSec:
          (plan.mixOutMarkerSec ?? plan.startAtOutgoingSec) + plan.mixDurationSec,
      })

      const mixDeckRates = computeMixDeckRates({
        outgoingBpm: outBpm,
        incomingBpm:
          resolvePlaybackBpm(nextTrackInQueue, null) ?? nextTrackInQueue.bpm ?? outBpm,
        outgoingPlaybackRate: outRate,
        incomingTargetRate:
          phraseMix.bpmStrategy === 'manual' ? settingsRef.current.playbackRate : 1,
      })
      // Pre-arm at beatmatch rate; mix end target is handoff (usually native 1.0).
      const cueArmRate = mixDeckRates.incomingRate
      const inBpmForGuard =
        resolvePlaybackBpm(nextTrackInQueue, null) ?? nextTrackInQueue.bpm ?? outBpm
      const { holdBeatmatch, safety } = resolveHoldBeatmatch({
        syncMode: phraseMix.syncMode,
        outgoingSonicDna: track.sonic_dna,
        incomingSonicDna: nextTrackInQueue.sonic_dna,
        outgoingBpm: outBpm,
        incomingBpm: inBpmForGuard,
        outgoingGridOffset,
        incomingGridOffset,
      })
      plan.holdBeatmatch = holdBeatmatch
      plan.masterTempoHandoff = true
      plan.phrase1Lock = true
      plan.blendFromOut = true

      const delaySeconds = plan.startAtOutgoingSec - ct
      autoDJPlanDelayRef.current = delaySeconds
      if (delaySeconds > 0 && delaySeconds <= 90) {
        setAutoDJOutCountdown(Math.round(delaySeconds * 10) / 10)
      } else {
        setAutoDJOutCountdown(null)
      }
      if (!safety.ok && safety.forceTempoSync && delaySeconds > 0 && delaySeconds <= 8) {
        setAutoDJStatusMessage((prev) =>
          prev.includes(safety.message) ? prev : `${safety.message} · TempoSync`,
        )
      }

      const prepareLead = Math.max(
        effectiveLeadIn,
        typeof plan.prepareLeadInSec === 'number' ? plan.prepareLeadInSec : 0,
        prearmLeadSec(outBpm),
      )

      const incomingPeaksReady =
        (ghostSamplesRef.current?.trackId === nextTrackInQueue.id &&
          (ghostSamplesRef.current.samples?.length ?? 0) >= 64) ||
        (Array.isArray(inRef.waveformPeaks) && inRef.waveformPeaks.length >= 64)

      if (!incomingPeaksReady && delaySeconds > 0.4) {
        // Peaks refine grid alignment only — never block audio cue or OUT fire.
        const url = resolvedUrlCacheRef.current.get(nextTrackInQueue.file) || null
        if (!url) {
          void resolveAudioUrl(nextTrackInQueue.file).then((resolved) => {
            if (resolved) resolvedUrlCacheRef.current.set(nextTrackInQueue.file, resolved)
          })
        } else if (ghostSamplesRef.current?.trackId !== nextTrackInQueue.id) {
          void loadWaveformSamplesForTrack(nextTrackInQueue, url).then((packed) => {
            if (!packed) return
            cacheMixGridOffset(
              nextTrackInQueue,
              packed.samples,
              packed.durationSec || nextTrackInQueue.duration || 180,
            )
            ghostSamplesRef.current = {
              trackId: nextTrackInQueue.id,
              samples: packed.samples,
              durationSec: packed.durationSec || nextTrackInQueue.duration || 180,
              sonicDna: nextTrackInQueue.sonic_dna,
            }
            syncIdleDeckWaveformCache(
              nextTrackInQueue.id,
              packed.samples,
              packed.durationSec || nextTrackInQueue.duration || 180,
            )
          })
        }
        if (delaySeconds <= prepareLead + 0.45) {
          void cueIdleEarly(nextTrackInQueue, plan, cueArmRate)
        }
      }

      if (
        delaySeconds > 0 &&
        delaySeconds <= prepareLead + 0.45 &&
        cuedIdleTrackIdRef.current === nextTrackInQueue.id
      ) {
        const idle = getIdleAudio()
        if (idle) {
          const inBpm =
            resolvePlaybackBpm(nextTrackInQueue, null) ?? nextTrackInQueue.bpm ?? outBpm
          // Media-time alignment: base BPM only (never bpm × rate).
          const align = solveAlignmentState({
            plannedIncomingSec: plan.incomingStartSec,
            outgoingTimeSec: ct,
            outgoingBpm: outBpm,
            outgoingOffsetSec: outgoingGridOffset,
            outgoingSonicDna: track.sonic_dna,
            outgoingPeaks: outRef.waveformPeaks,
            outgoingDurationSec: outRef.waveformDurationSec ?? dur,
            incomingBpm: inBpm,
            incomingOffsetSec: incomingGridOffset,
            incomingSonicDna: nextTrackInQueue.sonic_dna,
            incomingPeaks: inRef.waveformPeaks,
            incomingDurationSec: inRef.waveformDurationSec,
            phraseBars: 8,
            dnaConfidence: plan.dnaConfidence,
            phraseLock: plan.phraseLock,
            phrase1Lock: plan.phrase1Lock !== false,
          })
          plan.resolvedIncomingSec = align.incomingCueSec
          if (!mixEngineRef.current?.isMixing()) {
            mixEngineRef.current?.parkIdleAtCue(align.incomingCueSec, cueArmRate)
          }
        }
      }

      const beatSec = 60 / Math.max(60, outBpm)
      if (
        delaySeconds > 0 &&
        delaySeconds <= beatSec * 2.5 &&
        cuedIdleTrackIdRef.current === nextTrackInQueue.id &&
        autoDJIdleWarmedRef.current !== nextTrackInQueue.id &&
        !mixEngineRef.current?.isMixing()
      ) {
        autoDJIdleWarmedRef.current = nextTrackInQueue.id
        mixEngineRef.current?.warmIdle(cueArmRate)
      }

      const armWindowSec = Math.max(prepareLead + beatSec * 2, 3)

      // Pre-roll incoming on the idle deck before OUT so launch is instant at the marker.
      if (delaySeconds <= armWindowSec + phrase && delaySeconds > -0.25) {
        void cueIdleEarly(nextTrackInQueue, plan, cueArmRate)
      }

      if (delaySeconds > armWindowSec) return

      const targetOut = plan.startAtOutgoingSec

      const fireAutoDJMix = () => {
        const releasePending = () => {
          autoDJPendingRef.current = null
          setAutoDJPendingTrackId(null)
        }
        if (!autoDJConfigRef.current.enabled || phraseMixLockRef.current) {
          clearAutoDJOutWatch()
          clearAutoDJCrossfadeTimeout()
          releasePending()
          return
        }
        const liveQ = autoDJQueueRef.current
        const liveTrack = autoDJCurrentTrackRef.current
        if (!liveTrack || liveTrack.id !== track.id) {
          clearAutoDJOutWatch()
          clearAutoDJCrossfadeTimeout()
          releasePending()
          return
        }
        const stillNext = liveQ.find((t) => t.id === nextTrackInQueue.id)
        if (!stillNext) {
          clearAutoDJOutWatch()
          clearAutoDJCrossfadeTimeout()
          releasePending()
          return
        }

        const liveEl = getPlaybackAudio()
        const nowSec = liveEl?.currentTime ?? autoDJCurrentTimeRef.current
        const liveDur = liveEl?.duration && liveEl.duration > 0 ? liveEl.duration : dur
        const fireOutRate = getOutgoingPlaybackRate()
        const frozenPlan = autoDJFrozenPlanRef.current?.plan
        const outMarker = frozenPlan?.startAtOutgoingSec ?? targetOut

        // Tight tolerance — rAF watch should land on the marker, not a beat early.
        if (nowSec < outMarker - 0.012) {
          return
        }

        const idleEl = getIdleAudio()
        if (idleEl && idleEl.readyState < 2 && nowSec < outMarker + 0.12) {
          if (autoDJOutRafRef.current == null) {
            autoDJOutRafRef.current = requestAnimationFrame(() => {
              autoDJOutRafRef.current = null
              fireAutoDJMix()
            })
          }
          return
        }

        clearAutoDJOutWatch()
        clearAutoDJCrossfadeTimeout()
        setAutoDJOutCountdown(null)

        const fireOutRef = { ...withMixGrid(liveTrack), duration: liveDur }
        const fireInRef = withMixGrid(stillNext)
        const remainAfterOut = Math.max(0.5, liveDur - outMarker - 0.05)
        const fresh =
          frozenPlan && nowSec <= outMarker + beatSec * 0.75
            ? {
                ...frozenPlan,
                mixDurationSec:
                  frozenPlan.exactOverlap ||
                  (frozenPlan.phrase1Lock !== false && frozenPlan.style === 'crossfade')
                    ? remainAfterOut >= frozenPlan.mixDurationSec * 0.98
                      ? frozenPlan.mixDurationSec
                      : Math.min(frozenPlan.mixDurationSec, remainAfterOut)
                    : Math.min(frozenPlan.mixDurationSec, remainAfterOut),
              }
            : buildMixPlan({
                outgoing: fireOutRef,
                incoming: fireInRef,
                nowSec,
                outPhraseBars: phraseMix.outPhraseBars,
                inPhraseBars: phraseMix.inPhraseBars,
                overlapBars: phraseMix.overlapBars,
                cuePriority: phraseMix.cuePriority,
                mixLengthBias: phraseMix.mixLengthBias,
                energyCurve: phraseMix.energyCurve,
                harmonicMatch: autoDJConfig.harmonicMatch,
                outgoingPlaybackRate: fireOutRate,
                outgoingGridOffset:
                  typeof fireOutRef.beat_grid_offset === 'number'
                    ? fireOutRef.beat_grid_offset
                    : undefined,
                incomingGridOffset:
                  typeof fireInRef.beat_grid_offset === 'number'
                    ? fireInRef.beat_grid_offset
                    : undefined,
                style: plan.style,
                autoStyle: false,
                leadInSec: 0,
                canonicalPhraseCues: phraseMix.canonicalPhraseCues,
                exactOverlap: phraseMix.exactOverlap,
              }) ||
              lastMixPlanRef.current ||
              plan

        setAutoDJStatusMessage(`Auto DJ ${fresh.reason} → “${stillNext.title}”`)
        setAutoDJPendingTrackId(stillNext.id)
        autoDJFrozenPlanRef.current = null

        const mixDur =
          fresh.style === 'cut'
            ? Math.min(1.15, Math.max(0.65, fresh.mixDurationSec * 0.35))
            : fresh.mixDurationSec
        const handoffTarget = resolveIncomingRateForStrategy({
          strategy: phraseMix.bpmStrategy,
          beatmatchRate: fresh.rateRatio,
          sliderRate: settingsRef.current.playbackRate,
        })
        const fireOutBpm =
          resolvePlaybackBpm(liveTrack, detectedBPMRef.current) ??
          liveTrack.bpm ??
          detectedBPMRef.current ??
          120
        const fireInBpm =
          resolvePlaybackBpm(stillNext, null) ?? stillNext.bpm ?? fireOutBpm
        fresh.rateRatio = computeMixDeckRates({
          outgoingBpm: fireOutBpm,
          incomingBpm: fireInBpm,
          outgoingPlaybackRate: fireOutRate,
          incomingTargetRate: handoffTarget,
        }).incomingRate
        const { holdBeatmatch: fireHold } = resolveHoldBeatmatch({
          syncMode: phraseMix.syncMode,
          outgoingSonicDna: liveTrack.sonic_dna,
          incomingSonicDna: stillNext.sonic_dna,
          outgoingBpm: fireOutBpm,
          incomingBpm: fireInBpm,
          outgoingGridOffset:
            typeof fireOutRef.beat_grid_offset === 'number'
              ? fireOutRef.beat_grid_offset
              : undefined,
          incomingGridOffset:
            typeof fireInRef.beat_grid_offset === 'number'
              ? fireInRef.beat_grid_offset
              : undefined,
        })
        fresh.holdBeatmatch = fireHold
        fresh.masterTempoHandoff = true
        fresh.phrase1Lock = true
        fresh.blendFromOut = true
        void startPhraseMix(
          stillNext,
          mixDur,
          fresh.rateRatio,
          {
            ...fresh,
            mixDurationSec: mixDur,
          },
          { incomingTargetRate: handoffTarget },
        )
      }

      autoDJPendingRef.current = nextTrackInQueue.id
      setAutoDJPendingTrackId(nextTrackInQueue.id)
      lastMixPlanRef.current = plan

      if (delaySeconds <= 0) {
        fireAutoDJMix()
        return
      }

      clearAutoDJOutWatch()
      const watchOutMarker = () => {
        if (!autoDJConfigRef.current.enabled || phraseMixLockRef.current) {
          autoDJOutRafRef.current = null
          return
        }
        const liveEl = getPlaybackAudio()
        const nowSec = liveEl?.currentTime ?? autoDJCurrentTimeRef.current
        if (nowSec >= targetOut - 0.005) {
          autoDJOutRafRef.current = null
          fireAutoDJMix()
          return
        }
        autoDJOutRafRef.current = requestAnimationFrame(watchOutMarker)
      }
      autoDJOutRafRef.current = requestAnimationFrame(watchOutMarker)
    }

    autoDJIntervalRef.current = setInterval(tick, 100)
    tick()
    return () => {
      if (autoDJIntervalRef.current) {
        clearInterval(autoDJIntervalRef.current)
        autoDJIntervalRef.current = null
      }
      clearAutoDJCrossfadeTimeout()
    }
  }, [
    autoDJConfig.enabled,
    autoDJConfig.mixStyle,
    autoDJConfig.mixTechniques,
    autoDJConfig.outPhraseBars,
    autoDJConfig.inPhraseBars,
    autoDJConfig.overlapBars,
    autoDJConfig.cuePriority,
    autoDJConfig.mixLengthBias,
    autoDJConfig.energyCurve,
    autoDJConfig.harmonicMatch,
    autoDJConfig.bpmStrategy,
    autoDJConfig.syncMode,
    autoDJConfig.lookahead,
    autoDJLeadIn,
    onQueueChange,
    pickAutoDJTrack,
    startPhraseMix,
    playTrack,
    seekTo,
    trackIntroOffsetSec,
    clearAutoDJCrossfadeTimeout,
    clearFadeInterval,
    restoreMainVolume,
    detectedBPM,
    ensureMixEngine,
    ensureDualDeckGraph,
    getPlaybackAudio,
    getOutgoingPlaybackRate,
    toMixTrackRef,
    withMixGrid,
    getIdleAudio,
    cacheMixGridOffset,
    syncIdleDeckWaveformCache,
  ])

  const UPCOMING_PREVIEW = 8
  /** Tracks already queued after the current one (“assigned cues”). */
  const assignedUpcoming = useMemo(() => {
    if (currentQueueIndex >= 0) return queue.slice(currentQueueIndex + 1)
    if (!currentTrack) return queue
    return queue.filter((t) => t.id !== currentTrack.id)
  }, [queue, currentQueueIndex, currentTrack])

  /**
   * Up-next preview (not the full library):
   * - Assigned cues (queued after current) → next up to 8
   * - Else Auto DJ on → top DNA matches
   * - Else catalog random → empty until random fill lands in the queue
   * - Else shuffle off → next 8 in library/source order
   * - Else (queue-order shuffle on, no cues) → empty
   */
  const displayTracks = useMemo(() => {
    const pool = autoDJPool

    if (assignedUpcoming.length > 0) {
      return assignedUpcoming.slice(0, UPCOMING_PREVIEW)
    }

    if (autoDJConfig.enabled && currentTrack) {
      return rankDnaTracks(currentTrack, pool, {
        excludeIds: new Set([currentTrack.id]),
        limit: UPCOMING_PREVIEW,
        minScore: 0.08,
      }).map((x) => x.track as Track)
    }

    if (settings.catalogRandom || settings.isShuffled || !currentTrack) {
      return []
    }

    const idx = pool.findIndex((t) => t.id === currentTrack.id)
    if (idx >= 0) {
      return pool.slice(idx + 1, idx + 1 + UPCOMING_PREVIEW)
    }
    return pool.slice(0, UPCOMING_PREVIEW)
  }, [
    autoDJPool,
    queue,
    currentTrack,
    autoDJConfig.enabled,
    assignedUpcoming,
    settings.isShuffled,
    settings.catalogRandom,
  ])

  const upcomingListLabel =
    assignedUpcoming.length > 0
      ? 'Up next'
      : autoDJConfig.enabled
        ? 'Auto DJ matches'
        : settings.catalogRandom
          ? `Random from ${catalogScopeLabel(currentSource)}`
          : settings.isShuffled
            ? 'Up next'
            : 'Next in library'

  const queueTrackIds = useMemo(() => new Set(queue.map(t => t.id)), [queue])
  const queueIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    queue.forEach((t, i) => m.set(t.id, i))
    return m
  }, [queue])

  const handleRemoveFromQueueClick = (index: number) => {
    if (onRemoveFromQueue) {
      onRemoveFromQueue(index)
    } else {
      // Fallback: remove from local queue
      const newQueue = queue.filter((_, i) => i !== index)
      onQueueChange?.(newQueue)
    }
  }

  const [queueDragOverIndex, setQueueDragOverIndex] = useState<number | null>(null)
  const queueDragActiveRef = useRef(false)
  const canReorderQueue = assignedUpcoming.length > 1 && Boolean(onQueueChange)

  const handleQueueDragStart = useCallback((e: React.DragEvent, displayIndex: number, trackId: string) => {
    if (!canReorderQueue) return
    queueDragActiveRef.current = true
    e.dataTransfer.setData(QUEUE_DRAG_MIME, String(displayIndex))
    e.dataTransfer.setData('text/plain', trackId)
    e.dataTransfer.effectAllowed = 'move'
  }, [canReorderQueue])

  const handleQueueDragOver = useCallback((e: React.DragEvent, displayIndex: number) => {
    if (!canReorderQueue) return
    if (!e.dataTransfer.types.includes(QUEUE_DRAG_MIME) && !queueDragActiveRef.current) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setQueueDragOverIndex((prev) => (prev === displayIndex ? prev : displayIndex))
  }, [canReorderQueue])

  const handleQueueDrop = useCallback(
    (e: React.DragEvent, toDisplayIdx: number) => {
      if (!canReorderQueue || !onQueueChange) return
      const raw = e.dataTransfer.getData(QUEUE_DRAG_MIME)
      const fromDisplayIdx = parseInt(raw, 10)
      if (!Number.isFinite(fromDisplayIdx)) return
      e.preventDefault()
      e.stopPropagation()
      setQueueDragOverIndex(null)
      queueDragActiveRef.current = false
      const next = reorderUpcomingQueue(queue, currentQueueIndex, fromDisplayIdx, toDisplayIdx)
      const unchanged =
        next.length === queue.length && next.every((t, i) => t.id === queue[i]?.id)
      if (!unchanged) onQueueChange(next)
    },
    [canReorderQueue, onQueueChange, queue, currentQueueIndex],
  )

  const handleQueueDragEnd = useCallback(() => {
    queueDragActiveRef.current = false
    setQueueDragOverIndex(null)
  }, [])

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
      
      fetchBPMFromSupabase(currentTrack.file, currentTrack.id)
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

  const handleDeckTapTempo = useCallback(
    (deck: 'a' | 'b') => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

      setDeckUi((prev) => {
        const slice = prev[deck]
        const result = recordTapTempo(slice.tapTempoTaps, now, {
          sectionBpms: slice.tapTempoSectionBpms,
          sectionsCompleted: slice.tapTempoSectionBpms.length,
        })
        return {
          ...prev,
          [deck]: {
            ...slice,
            tapTempoTaps: result.taps,
            tapTempoSectionBpms: result.sectionBpms,
            tapTempoBPM: result.sectionsCompleted > 0 ? result.averageBpm : null,
          },
        }
      })

      const prevTimeout = tapTempoTimeoutRef.current?.[deck]
      if (prevTimeout) clearTimeout(prevTimeout)

      if (!tapTempoTimeoutRef.current) {
        tapTempoTimeoutRef.current = { a: null, b: null }
      }
      tapTempoTimeoutRef.current[deck] = setTimeout(() => {
        setDeckUi((prev) => ({
          ...prev,
          [deck]: {
            ...prev[deck],
            tapTempoTaps: [],
            tapTempoBPM: null,
            tapTempoSectionBpms: [],
          },
        }))
        if (tapTempoTimeoutRef.current) {
          tapTempoTimeoutRef.current[deck] = null
        }
      }, 5000)
    },
    [],
  )

  const handleTapTempo = useCallback(() => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    handleDeckTapTempo(liveDeck)
  }, [handleDeckTapTempo])
  
  // Cleanup tap tempo timeout on unmount
  useEffect(() => {
    return () => {
      const timeouts = tapTempoTimeoutRef.current
      if (!timeouts) return
      if (timeouts.a) clearTimeout(timeouts.a)
      if (timeouts.b) clearTimeout(timeouts.b)
    }
  }, [])

  // Reset tap tempo when live track changes
  useEffect(() => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    setDeckUi((prev) => ({
      ...prev,
      [liveDeck]: {
        ...prev[liveDeck],
        tapTempoTaps: [],
        tapTempoBPM: null,
        tapTempoSectionBpms: [],
      },
    }))
    const timeouts = tapTempoTimeoutRef.current
    if (timeouts?.[liveDeck]) {
      clearTimeout(timeouts[liveDeck]!)
      timeouts[liveDeck] = null
    }
  }, [currentTrack?.id])

  // Handle BPM update (manual edit — admin persists to library)
  const handleBPMUpdate = useCallback(
    async (newBPM: number, track: Track, syncLiveDetected = true) => {
      if (!track?.id) {
        throw new Error('No track selected')
      }

      const patchTrackBpm = (source: Track): Track => {
        const next: Track = { ...source, bpm: newBPM }
        if (next.sonic_dna && typeof next.sonic_dna === 'object') {
          const dna = { ...next.sonic_dna } as Record<string, unknown>
          if (dna.technical && typeof dna.technical === 'object') {
            dna.technical = { ...(dna.technical as object), bpm: newBPM }
          }
          if (dna.measured && typeof dna.measured === 'object') {
            dna.measured = { ...(dna.measured as object), bpm: newBPM }
          }
          const comprehensive = dna.comprehensive
          if (comprehensive && typeof comprehensive === 'object') {
            const comp = { ...(comprehensive as Record<string, unknown>) }
            if (comp.measured && typeof comp.measured === 'object') {
              comp.measured = { ...(comp.measured as object), bpm: newBPM }
            }
            dna.comprehensive = comp
          }
          next.sonic_dna = dna
        }
        return next
      }

      const applyLocalBpm = () => {
        bpmCacheRef.current.set(track.id, newBPM)
        if (syncLiveDetected && currentTrack?.id === track.id) {
          setDetectedBPM(newBPM)
        }
        if (onQueueChangeRef.current) {
          onQueueChangeRef.current(queue.map((t) => (t.id === track.id ? patchTrackBpm(t) : t)))
        }
        if (currentTrack?.id === track.id) {
          const patched = patchTrackBpm(currentTrack)
          currentTrack.bpm = patched.bpm
          currentTrack.sonic_dna = patched.sonic_dna
        }
      }

      if (!canEditOrigBpm) {
        applyLocalBpm()
        return
      }

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(track.id)

      if (!isUUID) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Track is not in database, updating local state only')
        }
        applyLocalBpm()
        return
      }

      try {
        const response = await fetch('/api/audio/update-bpm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackId: track.id,
            bpm: newBPM,
          }),
        })

        if (!response.ok) {
          let errorMessage = 'Failed to update BPM'
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch {
            errorMessage =
              response.status === 404
                ? 'API route not found. Please restart the dev server.'
                : `HTTP ${response.status}: ${response.statusText}`
          }
          throw new Error(errorMessage)
        }

        await response.json()
        applyLocalBpm()
      } catch (error: unknown) {
        console.error('Error updating BPM:', error)
        throw error
      }
    },
    [canEditOrigBpm, currentTrack, queue],
  )

  const handleDeckBPMUpdate = useCallback(
    async (deck: 'a' | 'b', newBPM: number) => {
      const track = resolveDeckTrack(deck)
      if (!track) {
        throw new Error('No track on this deck')
      }
      const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
      if (deck !== liveDeck) {
        setDeckUi((prev) => ({
          ...prev,
          [deck]: { ...prev[deck], detectedBpm: newBPM },
        }))
      }
      await handleBPMUpdate(newBPM, track, deck === liveDeck)
    },
    [handleBPMUpdate, resolveDeckTrack],
  )

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
      
      const timeouts = tapTempoTimeoutRef.current
      if (timeouts) {
        if (timeouts.a) clearTimeout(timeouts.a)
        if (timeouts.b) clearTimeout(timeouts.b)
      }
    }
  }, [])

  // Calculate tempo percentage from playback rate

  const handleDeckTempoChange = (deck: 'a' | 'b', tempoValue: number) => {
    changeDeckPlaybackRate(deck, tempoValueToRate(tempoValue))
  }

  const handleTempoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const liveDeck = playbackDeckRef.current === 'next' ? 'b' : 'a'
    handleDeckTempoChange(liveDeck, parseFloat(e.target.value))
  }

  // Musical zoom: visible window in bars (4/8/16…), 0 = full track overview
  const zoomToVisibleRatio = useCallback((zoomLevel: number): number => {
    return zoomLevelToVisibleRatio(zoomLevel)
  }, [])

  const waveformBpm =
    resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm || null
  const waveformBeatDurationSec = waveformBpm && waveformBpm > 0 ? 60 / waveformBpm : null
  const waveformBeatsPerBar = beatGridBeatsPerBar || 4
  const isWaveformBarZoomed = waveformVisibleBars > 0

  const persistBeatGridOffset = useCallback(
    (offset: number) => {
      if (!currentTrack?.id) return
      if (beatGridSaveTimeoutRef.current) clearTimeout(beatGridSaveTimeoutRef.current)
      beatGridSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch('/api/music-library/tracks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: currentTrack.id,
              beat_grid_offset: offset,
            }),
          })
        } catch (e) {
          console.warn('Failed to persist beat grid offset:', e)
        }
      }, 600)
    },
    [currentTrack?.id]
  )

  const persistGridLock = useCallback(
    async (
      locked: boolean,
      extras?: {
        kickOnsetSec?: number[]
        snareClapOnsetSec?: number[]
        gridLockScore?: number
      },
    ) => {
      if (!currentTrack?.id) return
      const nextDna = withGridLockOnDna(currentTrack.sonic_dna, locked, extras)
      try {
        await fetch('/api/music-library/tracks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentTrack.id,
            beat_grid_offset: beatGridOffsetSec,
            sonic_dna: nextDna,
          }),
        })
        currentTrack.sonic_dna = nextDna
        if (onQueueChange) {
          const nextQ = queue.map((t) =>
            t.id === currentTrack.id
              ? { ...t, sonic_dna: nextDna, beat_grid_offset: beatGridOffsetSec }
              : t,
          )
          onQueueChange(nextQ)
        }
      } catch (e) {
        console.warn('Failed to persist grid lock:', e)
      }
    },
    [currentTrack, beatGridOffsetSec, onQueueChange, queue],
  )

  const persistGridAnalysis = useCallback(
    async (extras: {
      kickOnsetSec?: number[]
      snareClapOnsetSec?: number[]
      gridLockScore?: number
      gridLocked?: boolean
      offsetSec?: number
    }) => {
      if (!currentTrack?.id) return
      const nextDna = withGridAnalysisOnDna(currentTrack.sonic_dna, extras)
      const offset =
        typeof extras.offsetSec === 'number' ? extras.offsetSec : beatGridOffsetSec
      try {
        await fetch('/api/music-library/tracks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentTrack.id,
            beat_grid_offset: offset,
            sonic_dna: nextDna,
          }),
        })
        currentTrack.sonic_dna = nextDna
        currentTrack.beat_grid_offset = offset
        if (onQueueChange) {
          const nextQ = queue.map((t) =>
            t.id === currentTrack.id
              ? { ...t, sonic_dna: nextDna, beat_grid_offset: offset }
              : t,
          )
          onQueueChange(nextQ)
        }
      } catch (e) {
        console.warn('Failed to persist grid analysis:', e)
      }
    },
    [currentTrack, beatGridOffsetSec, onQueueChange, queue],
  )

  // Restore beat **phase** when the track changes (phrase lattice always from t=0).
  useEffect(() => {
    if (!currentTrack) {
      setBeatGridOffsetSec(0)
      setBeatGridLock(null)
      setBeatGridLocked(false)
      return
    }
    const bpm =
      resolvePlaybackBpm(currentTrack, detectedBPM) ||
      detectedBPM ||
      currentTrack.bpm ||
      120
    const beatSec = 60 / (bpm > 0 ? bpm : 120)
    const stored = currentTrack.beat_grid_offset
    const dnaPhase = readDnaBeatPhaseSec(currentTrack.sonic_dna, beatSec)
    let offset = 0
    if (!isUnsetOffset(stored)) {
      offset = toPhaseOnlyOffsetSec(stored!, beatSec)
    } else if (dnaPhase != null) {
      offset = dnaPhase
    }
    // Fold legacy absolute kick offsets into phase and persist once.
    if (
      typeof stored === 'number' &&
      Number.isFinite(stored) &&
      stored >= beatSec
    ) {
      persistBeatGridOffset(offset)
    } else if (isUnsetOffset(stored) && dnaPhase != null) {
      persistBeatGridOffset(dnaPhase)
    }
    setBeatGridOffsetSec(offset)
    const locked = isGridLocked(currentTrack.sonic_dna)
    setBeatGridLocked(locked)
    const score = readGridLockScore(currentTrack.sonic_dna)
    setBeatGridLock(locked && score != null ? score : score)
    const bias = eqBiasFromDna(currentTrack.sonic_dna)
    queueMicrotask(() => {
      const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
      applyDeckStripEq(liveDeck, {
        low: bias.low * 0.5,
        mid: bias.mid * 0.35,
        high: bias.high * 0.35,
      })
    })
  }, [currentTrack?.id, persistBeatGridOffset, detectedBPM, applyDeckStripEq])

  const applyPeakVisualLock = useCallback(
    (offsetSec: number, bpm: number) => {
      const base =
        trackWaveformBaseRef.current.length > 0
          ? trackWaveformBaseRef.current
          : waveformData
      if (!base.length || duration <= 0 || !(bpm > 0)) return
      const bundle = buildGridOnsetBundle({
        sonicDna: currentTrack?.sonic_dna,
        peaks: base,
        durationSec: duration,
        bpm,
        offsetSec,
      })
      const onsets = [...bundle.kickOnsetSec, ...bundle.snareClapOnsetSec]
      if (onsets.length < 4) return
      const n = base.length
      const radius = Math.max(1, Math.round(n * 0.0015))
      const boost = 0.32
      const next = base.map((s) => ({ ...s }))
      for (const t of onsets) {
        if (!Number.isFinite(t) || t < 0 || t > duration) continue
        const center = Math.round((t / duration) * (n - 1))
        for (let d = -radius; d <= radius; d++) {
          const i = center + d
          if (i < 0 || i >= n) continue
          const w = 1 - Math.abs(d) / (radius + 1)
          const cur = next[i]!
          const p = Math.min(1, cur.positive + (1 - cur.positive) * boost * w)
          const neg = Math.min(1, cur.negative + (1 - cur.negative) * boost * w * 0.85)
          next[i] = { ...cur, positive: p, negative: neg }
        }
      }
      setWaveformData(next)
    },
    [currentTrack?.sonic_dna, waveformData, duration],
  )

  const alignBeatGridToWaveform = useCallback(() => {
    if (beatGridLocked) return null as { offsetSec: number; bpm: number; lock: number } | null
    const bpm = resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm
    if (!bpm || bpm <= 0) return null
    const peaks =
      trackWaveformBaseRef.current.length > 0
        ? trackWaveformBaseRef.current
        : waveformData
    if (!peaks.length || duration <= 0) return null
    const aligned = alignBeatGridFromPeaks({
      peaks,
      durationSec: duration,
      bpm,
      beatsPerBar: beatGridBeatsPerBar || 4,
      sonicDna: currentTrack?.sonic_dna,
      preferTransientOrigin: true,
    })
    if (!aligned) return null
    const beatSec = 60 / aligned.bpm
    const phase = toPhaseOnlyOffsetSec(aligned.offsetSec, beatSec)
    setBeatGridOffsetSec(phase)
    setBeatGridLock(aligned.lock)
    persistBeatGridOffset(phase)
    if (Math.abs(aligned.bpm - bpm) >= 0.05) {
      setDetectedBPM(aligned.bpm)
    }
    setBeatGridEnabled(true)
    applyPeakVisualLock(phase, aligned.bpm)

    const bundle = buildGridOnsetBundle({
      sonicDna: currentTrack?.sonic_dna,
      peaks,
      durationSec: duration,
      bpm: aligned.bpm,
      offsetSec: phase,
    })
    const shouldAutoLock =
      aligned.lock >= AUTO_GRID_LOCK_SCORE && (isAutoDJEnabled || aligned.lock >= 0.7)
    if (shouldAutoLock) {
      setBeatGridLocked(true)
      void persistGridLock(true, {
        kickOnsetSec: bundle.kickOnsetSec.length >= 4 ? bundle.kickOnsetSec : undefined,
        snareClapOnsetSec:
          bundle.snareClapOnsetSec.length >= 4 ? bundle.snareClapOnsetSec : undefined,
        gridLockScore: aligned.lock,
      })
    } else if (aligned.lock >= 0.4) {
      void persistGridAnalysis({
        kickOnsetSec: bundle.kickOnsetSec.length >= 4 ? bundle.kickOnsetSec : undefined,
        snareClapOnsetSec:
          bundle.snareClapOnsetSec.length >= 4 ? bundle.snareClapOnsetSec : undefined,
        gridLockScore: aligned.lock,
        offsetSec: phase,
      })
    }
    return { ...aligned, offsetSec: phase }
  }, [
    beatGridLocked,
    detectedBPM,
    currentTrack,
    waveformData,
    duration,
    beatGridBeatsPerBar,
    persistBeatGridOffset,
    applyPeakVisualLock,
    isAutoDJEnabled,
    persistGridLock,
    persistGridAnalysis,
  ])

  // Auto-align when peaks + duration settle (unlocked / weak grids only).
  useEffect(() => {
    if (!currentTrack?.id || beatGridLocked) return
    if (duration <= 0) return
    const peaks = trackWaveformBaseRef.current
    if (peaks.length < 64) return
    const bpm = resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm
    if (!bpm || bpm <= 0) return

    if (autoAlignedTrackIdRef.current === currentTrack.id) return

    const existingScore = readGridLockScore(currentTrack.sonic_dna)
    const storedOffset = currentTrack.beat_grid_offset
    const beatSec = 60 / bpm
    const phase = !isUnsetOffset(storedOffset)
      ? toPhaseOnlyOffsetSec(storedOffset!, beatSec)
      : readDnaBeatPhaseSec(currentTrack.sonic_dna, beatSec)
    const hasSolidGrid =
      phase != null &&
      existingScore != null &&
      existingScore >= AUTO_GRID_LOCK_SCORE
    if (hasSolidGrid) {
      autoAlignedTrackIdRef.current = currentTrack.id
      const usePhase = phase ?? 0
      if (
        typeof storedOffset === 'number' &&
        Number.isFinite(storedOffset) &&
        storedOffset >= beatSec
      ) {
        setBeatGridOffsetSec(usePhase)
        persistBeatGridOffset(usePhase)
      }
      applyPeakVisualLock(usePhase, bpm)
      return
    }

    const t = window.setTimeout(() => {
      autoAlignedTrackIdRef.current = currentTrack.id
      alignBeatGridToWaveform()
    }, 180)
    return () => window.clearTimeout(t)
  }, [
    currentTrack?.id,
    currentTrack?.sonic_dna,
    currentTrack?.beat_grid_offset,
    duration,
    waveformData.length,
    detectedBPM,
    beatGridLocked,
    alignBeatGridToWaveform,
    applyPeakVisualLock,
    persistBeatGridOffset,
  ])

  // Reset auto-align gate when the track changes
  useEffect(() => {
    autoAlignedTrackIdRef.current = null
  }, [currentTrack?.id])

  const lockBeatGrid = useCallback(() => {
    const bpm = resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm
    const peaks =
      trackWaveformBaseRef.current.length > 0
        ? trackWaveformBaseRef.current
        : waveformData
    const bundle =
      bpm && bpm > 0 && peaks.length && duration > 0
        ? buildGridOnsetBundle({
            sonicDna: currentTrack?.sonic_dna,
            peaks,
            durationSec: duration,
            bpm,
            offsetSec: beatGridOffsetSec,
          })
        : { kickOnsetSec: [] as number[], snareClapOnsetSec: [] as number[] }
    setBeatGridLocked(true)
    setBeatGridEnabled(true)
    applyPeakVisualLock(beatGridOffsetSec, bpm || 120)
    void persistGridLock(true, {
      kickOnsetSec: bundle.kickOnsetSec.length >= 4 ? bundle.kickOnsetSec : undefined,
      snareClapOnsetSec:
        bundle.snareClapOnsetSec.length >= 4 ? bundle.snareClapOnsetSec : undefined,
      gridLockScore: beatGridLock ?? undefined,
    })
  }, [
    currentTrack,
    detectedBPM,
    waveformData,
    duration,
    beatGridOffsetSec,
    beatGridLock,
    persistGridLock,
    applyPeakVisualLock,
  ])

  const unlockBeatGrid = useCallback(() => {
    setBeatGridLocked(false)
    void persistGridLock(false)
  }, [persistGridLock])

  const snapPlayheadToDna = useCallback(
    (mode: 'kick' | 'beat' | 'phrase') => {
      const bpm = waveformBpm
      const live = getPlaybackAudio()
      if (!bpm || !live) return
      const next = quantizeToDnaGrid({
        timeSec: live.currentTime,
        bpm,
        offsetSec: beatGridOffsetSec,
        sonicDna: currentTrack?.sonic_dna,
        mode,
        beatsPerBar: beatGridBeatsPerBar || 4,
      })
      live.currentTime = next
      setCurrentTime(next)
    },
    [waveformBpm, beatGridOffsetSec, currentTrack?.sonic_dna, beatGridBeatsPerBar, getPlaybackAudio]
  )

  const applyDnaEqPocket = useCallback(() => {
    const bias = eqBiasFromDna(currentTrack?.sonic_dna)
    const liveDeck: DeckId = playbackDeckRef.current === 'next' ? 'b' : 'a'
    applyDeckStripEq(liveDeck, {
      low: bias.low,
      mid: bias.mid,
      high: bias.high,
    })
  }, [currentTrack?.sonic_dna, applyDeckStripEq])

  const resetBeatGrid = useCallback(() => {
    if (beatGridLocked) return
    setBeatGridOffsetSec(0)
    setBeatGridLock(null)
    persistBeatGridOffset(0)
  }, [beatGridLocked, persistBeatGridOffset])

  const setBeatHere = useCallback(() => {
    if (beatGridLocked) return
    const bpm = resolvePlaybackBpm(currentTrack, detectedBPM) || detectedBPM || currentTrack?.bpm
    if (!bpm || bpm <= 0) return
    const beatSec = 60 / bpm
    const next = setDownbeatAt(getPlaybackAudio()?.currentTime ?? playbackTimeRef.current, beatSec)
    setBeatGridOffsetSec(next)
    setBeatGridLock(null)
    persistBeatGridOffset(next)
    setBeatGridEnabled(true)
  }, [beatGridLocked, currentTrack, detectedBPM, persistBeatGridOffset, getPlaybackAudio])

  // DNA report (library) can drive the same waveform actions via event bridge
  useEffect(() => {
    const onDnaWaveform = (ev: Event) => {
      const detail = (ev as CustomEvent<SonicDnaWaveformEventDetail>).detail
      if (!detail) return
      switch (detail.action) {
        case 'align-grid':
          alignBeatGridToWaveform()
          break
        case 'set-beat-here':
          setBeatHere()
          break
        case 'snap':
          snapPlayheadToDna(detail.mode)
          break
        case 'reset-grid':
          resetBeatGrid()
          break
        case 'apply-eq':
          applyDnaEqPocket()
          break
      }
    }
    window.addEventListener(SONIC_DNA_WAVEFORM_EVENT, onDnaWaveform as EventListener)
    return () => window.removeEventListener(SONIC_DNA_WAVEFORM_EVENT, onDnaWaveform as EventListener)
  }, [alignBeatGridToWaveform, snapPlayheadToDna, resetBeatGrid, applyDnaEqPocket, setBeatHere])

  waveformDataLengthRef.current = waveformData.length
  if (!waveformGestureRef.current && waveformFlushRafRef.current == null) {
    waveformVisibleBarsRef.current = waveformVisibleBars
    waveformOffsetRef.current = waveformOffset
    waveformPanEnabledRef.current = isWaveformBarZoomed
  }

  const flushWaveformView = useCallback(() => {
    waveformFlushRafRef.current = null
    if (pendingWaveformBarsRef.current != null) {
      setWaveformVisibleBars(pendingWaveformBarsRef.current)
      pendingWaveformBarsRef.current = null
    }
    if (pendingWaveformOffsetRef.current != null) {
      setWaveformOffset(pendingWaveformOffsetRef.current)
      pendingWaveformOffsetRef.current = null
    }
  }, [])

  const scheduleWaveformFlush = useCallback(() => {
    if (waveformFlushRafRef.current != null) return
    waveformFlushRafRef.current = requestAnimationFrame(flushWaveformView)
  }, [flushWaveformView])

  const onWaveformVisibleBarsChange = useCallback(
    (bars: number) => {
      // Stage already applied focal math — sync React state only
      waveformVisibleBarsRef.current = bars
      pendingWaveformBarsRef.current = bars
      waveformPanEnabledRef.current = bars > 0
      scheduleWaveformFlush()
    },
    [scheduleWaveformFlush]
  )

  const onWaveformOffsetChange = useCallback(
    (offset: number) => {
      waveformOffsetRef.current = offset
      pendingWaveformOffsetRef.current = offset
      scheduleWaveformFlush()
    },
    [scheduleWaveformFlush]
  )

  const onWaveformContextMenu = useCallback((deck: 'a' | 'b', e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setWaveformMenu({ x: e.clientX, y: e.clientY, deck })
  }, [])

  const resolveDeckChannelTrack = useCallback(
    (deck: 'a' | 'b'): Track | null | undefined => trackForQueueDeck(deck),
    [trackForQueueDeck],
  )

  const waveformMenuDeck = waveformMenu?.deck ?? liveDeckId
  const waveformMenuDeckIsLive = waveformMenuDeck === liveDeckId
  const waveformMenuDeckTrack = resolveDeckChannelTrack(waveformMenuDeck)
  const waveformMenuDeckBpm = waveformMenuDeckIsLive
    ? waveformBpm
    : resolveTrackBpm(waveformMenuDeckTrack)

  const showDeckChannelWaveforms =
    isExpanded && !isMiniMode && (expandedMode as string) !== 'dj'

  const deckChannelWaveforms = useMemo(() => {
    if (!showDeckChannelWaveforms) return undefined

    const hoverRoot =
      (waveformHost?.closest('[data-waveform-hover-root]') as HTMLElement | null) || waveformHost
    const deckAIsLive = liveDeckId === 'a'
    const deckBIsLive = liveDeckId === 'b'
    const deckATrack = trackForQueueDeck('a')
    const deckBTrack = trackForQueueDeck('b')

    const resolveIdleSamples = (deck: 'a' | 'b', track: Track | null | undefined) => {
      if (!track?.id) return { samples: [] as typeof waveformData, durationSec: 0 }
      const cached = deckWaveformCache[deck]
      if (cached?.trackId === track.id) {
        return { samples: cached.samples, durationSec: cached.durationSec }
      }
      const ghost = ghostSamplesRef.current
      if (ghost?.trackId === track.id && ghost.samples.length > 0) {
        return {
          samples: ghost.samples,
          durationSec: ghost.durationSec || track.duration || 180,
        }
      }
      return { samples: [] as typeof waveformData, durationSec: track.duration || 180 }
    }

    const deckAIdle = deckAIsLive ? null : resolveIdleSamples('a', deckATrack)
    const deckBIdle = deckBIsLive ? null : resolveIdleSamples('b', deckBTrack)
    const deckASamples = deckAIsLive ? waveformData : deckAIdle!.samples
    const deckBSamples = deckBIsLive ? waveformData : deckBIdle!.samples
    const deckADuration = deckAIsLive ? duration || 0 : deckAIdle!.durationSec
    const deckBDuration = deckBIsLive ? duration || 0 : deckBIdle!.durationSec
    const deckABpm = deckAIsLive ? waveformBpm : resolveTrackBpm(deckATrack)
    const deckBBpm = deckBIsLive ? waveformBpm : resolveTrackBpm(deckBTrack)
    const deckAIntel = deckAIsLive
      ? waveformIntelligenceProfile
      : profileFromSonicDna(deckATrack?.sonic_dna)
    const deckBIntel = deckBIsLive
      ? waveformIntelligenceProfile
      : profileFromSonicDna(deckBTrack?.sonic_dna)

    const renderDeckWaveform = (
      deck: 'a' | 'b',
      opts: {
        audioRef: typeof audioRef
        isLive: boolean
        samples: typeof waveformData
        durationSec: number
        bpm: number | null
        beatGridOffsetSec: number
        mediaSyncKey: string
        intelligenceProfile: ReturnType<typeof profileFromSonicDna>
      },
    ) => (
      <WaveformStage
        audioRef={opts.audioRef}
        mediaSyncKey={opts.mediaSyncKey}
        isPlaying={opts.isLive ? isPlaying : incomingDeckHot}
        samples={opts.samples}
        durationSec={opts.durationSec}
        visibleBars={waveformVisibleBars}
        offsetIndex={opts.isLive ? waveformOffset : 0}
        follow={opts.isLive ? waveformFollow : incomingDeckHot}
        mirror={waveformMirror}
        colorMode={waveformMode}
        layerLayout={waveformLayerLayout}
        intelligenceProfile={opts.intelligenceProfile}
        bpm={opts.bpm}
        beatGridEnabled={beatGridEnabled && Boolean(opts.bpm)}
        beatGridOffsetSec={opts.beatGridOffsetSec}
        beatsPerBar={waveformBeatsPerBar}
        mixOverlay={opts.isLive && isAutoDJEnabled ? waveformMixOverlay : null}
        ghostTape={null}
        hotCues={opts.isLive ? waveformHotCues : []}
        deckId={deck === 'a' ? 'A' : 'B'}
        hoverRoot={undefined}
        gestureActiveRef={waveformGestureRef}
        className={`relative h-full w-full touch-none overflow-hidden ${
          opts.isLive && waveformZoom > 1.04 ? 'cursor-grab' : 'cursor-pointer'
        } ${!opts.isLive && !incomingDeckHot ? 'opacity-80' : ''}`}
        onVisibleBarsChange={opts.isLive ? onWaveformVisibleBarsChange : () => {}}
        onOffsetChange={opts.isLive ? onWaveformOffsetChange : () => {}}
        onSeekSec={opts.isLive ? snapPlaybackTime : () => {}}
        onContextMenu={(e) => onWaveformContextMenu(deck, e)}
      />
    )

    return {
      a: renderDeckWaveform('a', {
        audioRef: audioRef,
        isLive: deckAIsLive,
        samples: deckASamples,
        durationSec: deckADuration,
        bpm: deckABpm,
        beatGridOffsetSec: deckAIsLive
          ? beatGridOffsetSec
          : resolveTrackBeatGridOffset(deckATrack),
        mediaSyncKey: deckAIsLive ? waveformMediaSyncKey : 'idle-a',
        intelligenceProfile: deckAIntel,
      }),
      b: renderDeckWaveform('b', {
        audioRef: nextAudioRef,
        isLive: deckBIsLive,
        samples: deckBSamples,
        durationSec: deckBDuration,
        bpm: deckBBpm,
        beatGridOffsetSec: deckBIsLive
          ? beatGridOffsetSec
          : resolveTrackBeatGridOffset(deckBTrack),
        mediaSyncKey: deckBIsLive ? waveformMediaSyncKey : 'idle-b',
        intelligenceProfile: deckBIntel,
      }),
    }
  }, [
    showDeckChannelWaveforms,
    waveformHost,
    liveDeckId,
    trackForQueueDeck,
    waveformData,
    deckWaveformCache,
    duration,
    nextQueueTrack,
    currentQueueIndex,
    queue,
    waveformBpm,
    resolveTrackBpm,
    resolveTrackBeatGridOffset,
    currentTrack,
    isPlaying,
    waveformVisibleBars,
    waveformOffset,
    waveformFollow,
    waveformMirror,
    waveformMode,
    waveformLayerLayout,
    waveformIntelligenceProfile,
    beatGridEnabled,
    beatGridOffsetSec,
    waveformBeatsPerBar,
    isAutoDJEnabled,
    incomingDeckHot,
    waveformMixOverlay,
    waveformGhostTape,
    waveformHotCues,
    waveformZoom,
    waveformMediaSyncKey,
    onWaveformVisibleBarsChange,
    onWaveformOffsetChange,
    snapPlaybackTime,
    onWaveformContextMenu,
  ])

  const markPanEnabled = useCallback((visibleBars: number) => {
    waveformPanEnabledRef.current = visibleBars > 0
  }, [])

  const samplesForVisibleBars = useCallback((visibleBars: number, length: number) => {
    if (length <= 0) return length
    if (visibleBars <= 0) return length
    const dur = audioRef.current?.duration || duration || 0
    const beatSec = waveformBeatDurationSec
    if (dur > 0 && beatSec && beatSec > 0) {
      const spanSec = Math.min(dur, visibleBars * waveformBeatsPerBar * beatSec)
      return Math.max(8, Math.round((spanSec / dur) * length))
    }
    // Fallback without BPM: treat 128 bars as full track
    return Math.max(8, Math.round(length * (visibleBars / 128)))
  }, [duration, waveformBeatDurationSec, waveformBeatsPerBar])

  /** Set absolute visible-bar window (0 = full). Preserves focal time under cursor. */
  const applyVisibleBars = useCallback((nextBars: number, focalRatio = 0.5) => {
    const length = waveformDataLengthRef.current
    const prevBars = waveformVisibleBarsRef.current
    const newBars = nextBars <= 0 ? 0 : nearestBarZoomStep(nextBars)

    if (newBars <= 0 || length <= 0) {
      waveformVisibleBarsRef.current = 0
      waveformOffsetRef.current = 0
      pendingWaveformBarsRef.current = 0
      pendingWaveformOffsetRef.current = 0
      markPanEnabled(0)
      scheduleWaveformFlush()
      return
    }

    const prevVisible = samplesForVisibleBars(prevBars <= 0 ? 0 : prevBars, length)
    const newVisible = samplesForVisibleBars(newBars, length)
    const start = prevBars <= 0 ? 0 : waveformOffsetRef.current
    const focal = Math.max(0, Math.min(1, focalRatio))
    const focalIndex = start + focal * Math.min(prevBars <= 0 ? length : prevVisible, length)
    const newStart = focalIndex - focal * newVisible
    const maxOffset = Math.max(0, length - newVisible)
    const newOffset = Math.max(0, Math.min(maxOffset, newStart))

    waveformVisibleBarsRef.current = newBars
    waveformOffsetRef.current = newOffset
    pendingWaveformBarsRef.current = newBars
    pendingWaveformOffsetRef.current = newOffset
    markPanEnabled(newBars)
    scheduleWaveformFlush()
  }, [markPanEnabled, samplesForVisibleBars, scheduleWaveformFlush])

  /** Legacy name — maps old zoom multipliers onto the bar ladder. */
  const applyWaveformZoom = useCallback((nextZoom: number, focalRatio = 0.5) => {
    if (nextZoom <= 1.04) {
      applyVisibleBars(0, focalRatio)
      return
    }
    // Map legacy zoom into a bar count on the ladder (higher zoom → fewer bars)
    const approxBars = Math.max(4, Math.round(128 / nextZoom))
    const stepped = WAVEFORM_BAR_ZOOM_STEPS.reduce((best, step) =>
      Math.abs(step - approxBars) < Math.abs(best - approxBars) ? step : best
    , WAVEFORM_BAR_ZOOM_STEPS[0])
    applyVisibleBars(stepped, focalRatio)
  }, [applyVisibleBars])

  /** delta > 0 zooms in (fewer bars); delta < 0 zooms out (+8 bar steps toward full). */
  const handleWaveformZoom = useCallback((delta: number) => {
    const prev = waveformVisibleBarsRef.current
    const next = stepVisibleBars(prev, delta > 0 ? 1 : -1)
    applyVisibleBars(next, 0.5)
  }, [applyVisibleBars])

  const handleWaveformPan = useCallback((delta: number) => {
    if (waveformVisibleBarsRef.current <= 0) return
    const length = waveformDataLengthRef.current
    const visibleCount = samplesForVisibleBars(waveformVisibleBarsRef.current, length)
    const maxOffset = Math.max(0, length - visibleCount)
    const next = Math.max(0, Math.min(maxOffset, waveformOffsetRef.current + delta))
    waveformOffsetRef.current = next
    pendingWaveformOffsetRef.current = next
    setWaveformOffset(next)
  }, [samplesForVisibleBars])

  useEffect(() => {
    if (!waveformMenu) return

    const onPointerDown = (e: PointerEvent) => {
      if (waveformMenuRef.current?.contains(e.target as Node)) return
      setWaveformMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWaveformMenu(null)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [waveformMenu])

  // Reset zoom/pan when minimized or not expanded; keep Colorful + Mirror defaults
  useEffect(() => {
    if (waveformHost) return
    if (isMiniMode || !isExpanded) {
      waveformVisibleBarsRef.current = 0
      waveformOffsetRef.current = 0
      waveformPanEnabledRef.current = false
      setWaveformVisibleBars(0)
      setWaveformOffset(0)
      setWaveformFollow(false)
      if (!isMiniMode && !isExpanded && precomputedPeaks && precomputedPeaks.length > 0) {
        const restored = peaksOrEnvelopesToWaveformSamples(precomputedPeaks)
        trackWaveformBaseRef.current = restored
        setWaveformData(restored)
      }
    }
  }, [isMiniMode, isExpanded, precomputedPeaks, waveformHost])

  /** Lets fixed UI (e.g. docked Admin AI) reserve space above this bar. */
  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return
    const el = playerRef.current
    if (!el) return
    const node = el

    function sync() {
      const h = Math.ceil(node.getBoundingClientRect().height)
      if (h > 0) {
        document.documentElement.style.setProperty('--global-music-player-height', `${h}px`)
      } else {
        document.documentElement.style.removeProperty('--global-music-player-height')
      }
    }

    sync()
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(sync)
    })
    ro.observe(el)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      document.documentElement.style.removeProperty('--global-music-player-height')
    }
  }, [currentTrack, isMiniMode, isExpanded, isWaveformCollapsed, isQueueOpen, isSettingsOpen, isMobileControlsOpen])

  const lockBackgroundScroll = Boolean(
    autoDJSettingsMenu ||
      showTrackDetails ||
      (isSettingsOpen && !isMiniMode) ||
      (isQueueOpen && !isQueueDocked),
  )
  useLockBodyScroll(lockBackgroundScroll)

  const bpmForGrid = waveformBpm
  const beatDurationSec = waveformBeatDurationSec
  // setBeatHere is defined above (useCallback) so DNA bridge + menu share one handler

  if (!currentTrack) {
    return null
  }


  return (
    <div 
      ref={playerRef}
      className={`fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-[9999] transition-[max-height] duration-300 [contain:layout_paint] ${
        isMiniMode ? 'max-sm:h-auto sm:h-16' : 'max-h-[90vh]'
      }`}
    >
      <div
        data-scroll-lock-root=""
        className={
          isMiniMode
            ? ''
            : `max-h-[90vh] overscroll-contain ${lockBackgroundScroll ? 'overflow-hidden' : 'overflow-y-auto'}`
        }
      >
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
      
      {/* Mini Mode Bar — mobile: two rows, larger touch targets + safe area; sm+: single row */}
      {isMiniMode && (
        <>
          {/* Mobile: seek above title; then artwork/transport chrome */}
          <div className="container mx-auto w-full max-w-full min-w-0 px-3 pt-2 sm:hidden">
            <PlaybackTransportScrubber
              ref={transportMiniMobileRef}
              variant="mini-mobile"
              duration={duration}
              initialTime={currentTime}
              onSeek={seekToTime}
            />
            <p className="mt-1.5 truncate text-center text-sm font-medium leading-snug text-white">
              {currentTrack.title}
            </p>
          </div>
          <div className="container mx-auto w-full max-w-full min-w-0 px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:px-4 sm:py-2 sm:pb-2 sm:pt-2">
          {/* Mobile (< sm): artwork + artist | centered transport | expand */}
          <div className="flex w-full min-w-0 flex-col gap-1.5 sm:hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex min-w-0 items-center gap-2.5 justify-self-start">
                {coverSrc && (
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md">
                    <Image
                      key={coverSrc}
                      src={coverSrc}
                      alt={coverAlt}
                      fill
                      className="object-cover"
                      unoptimized={coverUnoptimized}
                      sizes="44px"
                      priority={true}
                      quality={75}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-xs leading-snug text-gray-400">{currentTrack.artist}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 justify-self-center">
                <button
                  type="button"
                  onClick={onPrevious}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                  disabled={queue.length <= 1}
                  aria-label="Previous track"
                >
                  <FaStepBackward className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors active:bg-gray-200 disabled:opacity-50 touch-manipulation"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  disabled={isLoading || !!error}
                >
                  {isPlaying ? <FaPause className="h-4 w-4" /> : <FaPlay className="ml-0.5 h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleSkipToNext}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                  disabled={queue.length <= 1}
                  aria-label="Next track"
                >
                  <FaStepForward className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-0.5 justify-self-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsMiniMode(false)
                    setIsExpanded(true)
                  }}
                  className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors active:bg-white/10 hover:bg-gray-800 hover:text-white touch-manipulation"
                  title="Expand player"
                  aria-label="Expand player"
                >
                  <DjIcon className="h-full w-full" preserveAspectRatio="none" />
                </button>
              </div>
            </div>
          </div>

          {/* Desktop / tablet: single row */}
          <div className="hidden w-full min-w-0 items-center gap-2 sm:flex sm:gap-3">
            {/* Playback controls — left of artwork */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={toggleShuffle}
                className={`flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 transition-colors touch-manipulation ${
                  settings.isShuffled ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                }`}
                title="Shuffle queue order"
                disabled={queue.length <= 1}
                aria-label="Shuffle queue order"
              >
                <FaRandom className="h-3 w-3" />
              </button>
              <button
                onClick={onPrevious}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center p-1.5 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                disabled={queue.length <= 1}
                title="Previous"
                aria-label="Previous track"
              >
                <FaStepBackward className="h-3 w-3" />
              </button>
              <button
                onClick={togglePlay}
                className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full bg-white p-2 text-black transition-colors hover:bg-gray-200 disabled:opacity-50 touch-manipulation"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                disabled={isLoading || !!error}
              >
                {isPlaying ? <FaPause className="h-3 w-3" /> : <FaPlay className="ml-0.5 h-3 w-3" />}
              </button>
              <button
                onClick={handleSkipToNext}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center p-1.5 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                disabled={queue.length <= 1}
                title="Next"
                aria-label="Next track"
              >
                <FaStepForward className="h-3 w-3" />
              </button>
              <button
                onClick={cycleRepeatMode}
                className={`relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 transition-colors touch-manipulation ${
                  settings.repeatMode !== 'off' ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                }`}
                title={`Repeat: ${settings.repeatMode}`}
                aria-label={`Repeat: ${settings.repeatMode}`}
              >
                <FaRedo className="h-3 w-3" />
                {settings.repeatMode === 'one' && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-blue-500 text-[6px]">1</span>
                )}
                {settings.repeatMode === 'all' && (
                  <span className="absolute -right-0.5 -top-0.5 text-[6px]">∞</span>
                )}
              </button>
            </div>
            {coverSrc && (
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
                <Image
                  key={coverSrc}
                  src={coverSrc}
                  alt={coverAlt}
                  fill
                  className="object-cover"
                  unoptimized={coverUnoptimized}
                  sizes="40px"
                  priority={true}
                  quality={75}
                />
              </div>
            )}
            <div className="min-w-0 max-w-[200px] shrink-0 overflow-hidden md:max-w-[240px]">
              <p className="truncate text-xs font-medium text-white">{currentTrack.title}</p>
              <p className="truncate text-xs text-gray-400">{currentTrack.artist}</p>
            </div>
            <PlaybackTransportScrubber
              ref={transportMiniDesktopRef}
              variant="mini-desktop"
              duration={duration}
              initialTime={currentTime}
              onSeek={seekToTime}
            />
            <div className="hidden items-center gap-1.5 md:flex md:shrink-0">
              <button
                onClick={toggleMute}
                className="flex min-h-[40px] min-w-[36px] items-center justify-center text-gray-400 transition-colors hover:text-white touch-manipulation"
                title={settings.isMuted ? 'Unmute' : 'Mute'}
                aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
              >
                {settings.isMuted ? <FaVolumeMute className="h-3.5 w-3.5" /> : <FaVolumeUp className="h-3.5 w-3.5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.isMuted ? 0 : settings.volume}
                onChange={(e) => {
                  const newVolume = parseFloat(e.target.value)
                  saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                  const __live = getPlaybackAudio()
                  if (__live && !phraseMixLockRef.current) {
                    __live.volume = newVolume
                  }
                  mixEngineRef.current?.setMasterVolume(newVolume)
                }}
                className="h-1.5 w-16 cursor-pointer appearance-none rounded-lg touch-manipulation"
                style={{
                  background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`
                }}
                title="Adjust volume"
                aria-label="Adjust volume"
              />
            </div>
            <button
              onClick={() => {
                setIsMiniMode(false)
                setIsExpanded(true)
              }}
              className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation"
              title="Expand player"
              aria-label="Expand player"
            >
              <DjIcon className="h-full w-full" preserveAspectRatio="none" />
            </button>
          </div>
        </div>
        </>
      )}

      {/* Full Player chrome */}
      {!isMiniMode && expandedMode !== 'dj' && (
        <>
          {/* Waveform above chrome when collapsed (vault Now Playing docks via portal) */}
          {!isExpanded && (() => {
            if (!waveformHost && isWaveformCollapsed) {
              return (
                <button
                  type="button"
                  onClick={() => setIsWaveformCollapsed(false)}
                  className="flex h-7 w-full items-center justify-center gap-1.5 border-b border-gray-700 bg-black/90 text-[10px] font-medium uppercase tracking-wide text-gray-500 transition-colors hover:bg-gray-900 hover:text-gray-300 touch-manipulation"
                  title="Show waveform"
                  aria-label="Show waveform"
                  aria-expanded={false}
                  aria-controls="player-compact-waveform"
                >
                  <FaChevronUp className="h-3 w-3" aria-hidden />
                  Waveform
                </button>
              )
            }

            const hoverRoot =
              (waveformHost?.closest('[data-waveform-hover-root]') as HTMLElement | null) || waveformHost
            const waveformHeightClass = isWaveformDocked
              ? 'h-full w-full'
              : 'h-20 sm:h-24 md:h-32'

            const incomingTrack = nextQueueTrack
            const incomingDeckId: 'a' | 'b' = liveDeckId === 'a' ? 'b' : 'a'
            const incomingCached = incomingTrack
              ? deckWaveformCache[incomingDeckId]
              : undefined
            const incomingGhost =
              incomingTrack && ghostSamplesRef.current?.trackId === incomingTrack.id
                ? ghostSamplesRef.current
                : null
            const incomingCacheHit = Boolean(
              incomingCached && incomingTrack && incomingCached.trackId === incomingTrack.id,
            )
            const incomingSamples = incomingCacheHit
              ? incomingCached.samples
              : incomingGhost?.samples ?? []
            const incomingDuration = incomingCacheHit
              ? incomingCached.durationSec
              : incomingGhost?.durationSec || incomingTrack?.duration || 0
            const showDualDeckBlend =
              isAutoDJEnabled && incomingDeckHot && incomingSamples.length > 0

            const renderWaveformStage = (
              deck: 'a' | 'b',
              opts: {
                audioRef: typeof audioRef
                isLive: boolean
                samples: typeof waveformData
                durationSec: number
                bpm: number | null
                mediaSyncKey: string
                intelligenceProfile?: ReturnType<typeof profileFromSonicDna>
                beatGridOffsetSec?: number
              },
            ) => (
              <WaveformStage
                audioRef={opts.audioRef}
                mediaSyncKey={opts.mediaSyncKey}
                isPlaying={opts.isLive ? isPlaying : incomingDeckHot}
                samples={opts.samples}
                durationSec={opts.durationSec}
                visibleBars={waveformVisibleBars}
                offsetIndex={opts.isLive ? waveformOffset : 0}
                follow={opts.isLive ? waveformFollow : incomingDeckHot}
                mirror={waveformMirror}
                colorMode={waveformMode}
                layerLayout={waveformLayerLayout}
                intelligenceProfile={opts.intelligenceProfile ?? waveformIntelligenceProfile}
                bpm={opts.bpm}
                beatGridEnabled={beatGridEnabled && Boolean(opts.bpm)}
                beatGridOffsetSec={
                  opts.beatGridOffsetSec ??
                  (opts.isLive
                    ? beatGridOffsetSec
                    : resolveTrackBeatGridOffset(incomingTrack ?? currentTrack))
                }
                beatsPerBar={waveformBeatsPerBar}
                mixOverlay={opts.isLive && isAutoDJEnabled ? waveformMixOverlay : null}
                ghostTape={null}
                hotCues={opts.isLive ? waveformHotCues : []}
                deckId={deck === 'a' ? 'A' : 'B'}
                hoverRoot={hoverRoot}
                gestureActiveRef={waveformGestureRef}
                className={`relative touch-none overflow-hidden ${
                  showDualDeckBlend ? 'h-full w-full' : waveformHeightClass
                } ${
                  opts.isLive && waveformZoom > 1.04 ? 'cursor-grab' : 'cursor-pointer'
                } ${!opts.isLive && !incomingDeckHot ? 'opacity-80' : ''}`}
                onVisibleBarsChange={opts.isLive ? onWaveformVisibleBarsChange : () => {}}
                onOffsetChange={opts.isLive ? onWaveformOffsetChange : () => {}}
                onSeekSec={opts.isLive ? snapPlaybackTime : () => {}}
                onContextMenu={(e) => onWaveformContextMenu(deck, e)}
                showOverview={false}
              />
            )

            const outgoingStage = renderWaveformStage(liveDeckId, {
              audioRef: liveAudioRef,
              isLive: true,
              samples: waveformData,
              durationSec: duration || 0,
              bpm: waveformBpm,
              mediaSyncKey: waveformMediaSyncKey,
            })
            const incomingStage =
              showDualDeckBlend && incomingTrack
                ? renderWaveformStage(incomingDeckId, {
                    audioRef: incomingDeckId === 'b' ? nextAudioRef : audioRef,
                    isLive: false,
                    samples: incomingSamples,
                    durationSec: incomingDuration,
                    bpm: resolveTrackBpm(incomingTrack),
                    mediaSyncKey: incomingDeckId === 'b' ? 'idle-b' : 'idle-a',
                    intelligenceProfile: profileFromSonicDna(incomingTrack.sonic_dna),
                    beatGridOffsetSec: resolveTrackBeatGridOffset(incomingTrack),
                  })
                : null

            const waveformUi = (
              <div
                id="player-compact-waveform"
                ref={waveformContainerRef}
                className={`h-full w-full min-h-0 ${
                  showDualDeckBlend && !isWaveformDocked
                    ? 'min-h-[10rem] sm:min-h-[12rem] md:min-h-[16rem]'
                    : ''
                }`}
              >
                {showDualDeckBlend && incomingStage ? (
                  <div className="grid h-full min-h-0 grid-rows-2">
                    <div className="min-h-0 border-b border-emerald-500/20">{outgoingStage}</div>
                    <div className="min-h-0 border-t border-sky-500/20">{incomingStage}</div>
                  </div>
                ) : (
                  outgoingStage
                )}
              </div>
            )
            if (waveformHost) {
              return createPortal(waveformUi, waveformHost)
            }
            return (
              <div className="relative w-full bg-black/90 border-b border-gray-700">
                {waveformUi}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsWaveformCollapsed(true)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation"
                  title="Hide waveform"
                  aria-label="Hide waveform"
                  aria-expanded={true}
                  aria-controls="player-compact-waveform"
                >
                  <FaChevronDown className="h-3 w-3" aria-hidden />
                </button>
              </div>
            )
          })()}

          {/* Main Controls */}
          <div className="w-full max-w-none px-3 sm:px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:py-3">
            {/* Mobile: art + title | centered transport (seek via waveform unless it is collapsed) */}
            <div className="md:hidden">
              {!isExpanded && isWaveformCollapsed && (
                <div className="mb-1.5">
                  <PlaybackTransportScrubber
                    ref={transportMiniMobileRef}
                    variant="mini-mobile"
                    duration={duration}
                    initialTime={currentTime}
                    onSeek={seekToTime}
                  />
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="flex min-w-0 items-center gap-2.5 justify-self-start">
                  {coverSrc && (
                    <button
                      type="button"
                      onClick={() => setShowTrackDetails(!showTrackDetails)}
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded touch-manipulation"
                      title="View track details"
                      aria-label="View track details"
                    >
                      <Image
                        key={coverSrc}
                        src={coverSrc}
                        alt={coverAlt}
                        fill
                        className="object-cover"
                        unoptimized={coverUnoptimized}
                        sizes="48px"
                        priority
                        quality={85}
                      />
                    </button>
                  )}
                  {(isLoading || error) && (
                  <div className="min-w-0 flex-1 overflow-hidden">
                    {isLoading && (
                      <p className="truncate text-[10px] text-gray-500">Loading…</p>
                    )}
                    {error && (
                      <p className="truncate text-[10px] text-red-400">{error}</p>
                    )}
                  </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 justify-self-center">
                  {isExpanded ? (
                    <AutoDJHeaderButton size="compact" />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onPrevious}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                        disabled={queue.length <= 1}
                        aria-label="Previous track"
                      >
                        <FaStepBackward className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors active:bg-gray-200 disabled:opacity-50 touch-manipulation"
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        disabled={isLoading || !!error}
                      >
                        {isPlaying ? <FaPause className="h-4 w-4" /> : <FaPlay className="ml-0.5 h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipToNext}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white transition-colors active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                        disabled={queue.length <= 1}
                        aria-label="Next track"
                      >
                        <FaStepForward className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-self-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (isExpanded) {
                        setIsExpanded(false)
                        setIsSettingsOpen(false)
                      } else {
                        setIsExpanded(true)
                      }
                    }}
                    className="flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors active:bg-white/10 hover:bg-gray-800 hover:text-white touch-manipulation"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    aria-label={isExpanded ? 'Collapse player' : 'Expand player'}
                    aria-expanded={isExpanded}
                  >
                    <FaChevronDown
                      className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? '' : 'rotate-180'}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop / tablet: collapsed = flex row with fluid scrubber; expanded = 3-col grid */}
            <div
              className={`relative hidden w-full md:items-center ${
                isExpanded
                  ? 'md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4'
                  : 'md:flex md:gap-3'
              }`}
            >
              <div
                className={`flex min-w-0 items-center gap-3 ${
                  isExpanded ? 'md:col-start-1' : 'shrink-0'
                }`}
              >
              {!isExpanded && coverSrc && (
                <button
                  type="button"
                  onClick={() => setShowTrackDetails(!showTrackDetails)}
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded hover:opacity-80 transition-opacity touch-manipulation"
                  title="View track details"
                  aria-label="View track details"
                >
                  <Image
                    key={coverSrc}
                    src={coverSrc}
                    alt={coverAlt}
                    fill
                    className="object-cover"
                    unoptimized={coverUnoptimized}
                    sizes="56px"
                    priority
                    quality={85}
                  />
                </button>
              )}

              {!isExpanded && (
              <div className="min-w-0 max-w-[220px] shrink-0 lg:max-w-[280px]">
                <p className="truncate text-sm font-medium text-white">{currentTrack.title}</p>
                <p className="truncate text-xs text-gray-400">{currentTrack.artist}</p>
                {(currentTrack.album || currentTrack.folder) && (
                  <p className="truncate text-xs text-gray-500">
                    {currentTrack.album || currentTrack.folder}
                  </p>
                )}
              </div>
              )}

              {isLoading && <div className="text-xs text-gray-400">Loading...</div>}
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

              {!isExpanded && (
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleShuffle}
                  className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.isShuffled ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Shuffle queue order"
                  disabled={queue.length <= 1}
                >
                  <FaRandom />
                </button>
                <button
                  onClick={onPrevious}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                  disabled={queue.length <= 1}
                  title="Previous"
                >
                  <FaStepBackward />
                </button>
                <button
                  onClick={togglePlay}
                  className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-full bg-white p-3 text-black transition-colors hover:bg-gray-200 disabled:opacity-50 touch-manipulation"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  disabled={isLoading || !!error}
                >
                  {isPlaying ? <FaPause /> : <FaPlay />}
                </button>
                <button
                  onClick={handleSkipToNext}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-white transition-colors hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                  disabled={queue.length <= 1}
                  title="Next"
                >
                  <FaStepForward />
                </button>
                <button
                  onClick={cycleRepeatMode}
                  className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.repeatMode !== 'off' ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title={`Repeat: ${settings.repeatMode}`}
                >
                  <FaRedo />
                  {settings.repeatMode === 'one' && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">
                      1
                    </span>
                  )}
                  {settings.repeatMode === 'all' && (
                    <span className="absolute -right-1 -top-1 text-[8px]">∞</span>
                  )}
                </button>
              </div>
              )}

              </div>

              {!isExpanded && (
              <div className="relative min-w-0 flex-1">
                <PlaybackTransportScrubber
                  ref={transportExpandedRef}
                  variant="expanded"
                  duration={duration}
                  initialTime={currentTime}
                  onSeek={seekToTime}
                  onHoverPreview={setSeekPreviewTime}
                />
                {seekPreviewTime !== null && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800/40 px-2 py-1 text-xs text-white">
                    {formatTime(seekPreviewTime)}
                  </div>
                )}
              </div>
              )}

              {isExpanded && (
              <div className="hidden items-center gap-2 justify-self-center md:col-start-2 lg:flex">
                <button
                  onClick={toggleShuffle}
                  className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.isShuffled ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title="Shuffle queue order"
                  disabled={queue.length <= 1}
                >
                  <FaRandom />
                </button>
                <button
                  onClick={() => {
                    setIsExpanded(false)
                    setIsSettingsOpen(false)
                  }}
                  className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation"
                  title="Collapse"
                  aria-label="Collapse player"
                >
                  <DjIcon
                    className="h-full w-full rotate-180 transition-transform duration-300"
                    preserveAspectRatio="none"
                  />
                </button>
                <button
                  onClick={cycleRepeatMode}
                  className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 transition-colors touch-manipulation ${
                    settings.repeatMode !== 'off' ? 'bg-gray-800/40 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title={`Repeat: ${settings.repeatMode}`}
                >
                  <FaRedo />
                  {settings.repeatMode === 'one' && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px]">
                      1
                    </span>
                  )}
                  {settings.repeatMode === 'all' && (
                    <span className="absolute -right-1 -top-1 text-[8px]">∞</span>
                  )}
                </button>
              </div>
              )}

              <div
                className={`flex items-center justify-end gap-3 ${
                  isExpanded ? 'md:col-start-3 md:justify-self-end' : 'shrink-0'
                }`}
              >
              {!isExpanded && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={toggleMute}
                    className="flex min-h-[44px] min-w-[36px] items-center justify-center text-gray-400 transition-colors hover:text-white touch-manipulation"
                    title={settings.isMuted ? 'Unmute' : 'Mute'}
                    aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {settings.isMuted ? <FaVolumeMute className="h-4 w-4" /> : <FaVolumeUp className="h-4 w-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.isMuted ? 0 : settings.volume}
                    onChange={(e) => {
                      const newVolume = parseFloat(e.target.value)
                      saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                      const __live = getPlaybackAudio()
                      if (__live && !phraseMixLockRef.current) {
                        __live.volume = newVolume
                      }
                      mixEngineRef.current?.setMasterVolume(newVolume)
                    }}
                    className="h-1.5 w-20 cursor-pointer appearance-none rounded-lg touch-manipulation"
                    style={{
                      background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`,
                    }}
                    title="Adjust volume"
                    aria-label="Adjust volume"
                  />
                </div>
              )}
              <AutoDJHeaderButton size="header" />
              {!isExpanded && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="hidden h-11 w-[88px] shrink-0 items-center justify-center rounded-lg px-1 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white touch-manipulation lg:flex"
                  title="Expand"
                  aria-label="Expand player"
                >
                  <DjIcon
                    className="h-full w-full transition-transform duration-300"
                    preserveAspectRatio="none"
                  />
                </button>
              )}
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-colors touch-manipulation ${
                  isSettingsOpen ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
                title="Settings"
              >
                <FaCog />
              </button>

              {djModeAvailable && (
                <button
                  onClick={() => {
                    if (!isExpanded) setIsExpanded(true)
                    setExpandedMode((m) => (m === 'controls' ? 'dj' : 'controls'))
                  }}
                  className={`hidden min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-colors touch-manipulation lg:flex ${
                    (expandedMode as string) === 'dj' ? 'bg-blue-600/30 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                  title={expandedMode === 'controls' ? 'Switch to DJ Mode' : 'Switch to Controls'}
                  aria-label="Toggle DJ Mode"
                >
                  {expandedMode === 'controls' ? '🎛️' : '⚙️'}
                </button>
              )}
              </div>
            </div>
          </div>

        {/* Queue Panel — docked under vault header when host exists; else above player */}
        {isQueueOpen && typeof document !== 'undefined' && createPortal(
          <div
            data-allow-scroll-when-locked=""
            className={
              isQueueDocked
                ? 'w-full bg-black px-5 pt-3 pb-3'
                : 'fixed left-0 right-0 z-[10040] border-t border-gray-800 bg-black pt-3 pb-3 shadow-2xl overscroll-y-contain'
            }
            style={
              isQueueDocked
                ? {
                    maxHeight: 'min(55vh, calc(100dvh - var(--global-music-player-height, 5rem) - 8rem))',
                  }
                : {
                    bottom: 'var(--global-music-player-height, 5rem)',
                    maxHeight: 'min(70vh, calc(100vh - var(--global-music-player-height, 5rem) - 0.5rem))',
                  }
            }
            role="dialog"
            aria-label="Playlist queue"
          >
            <div className={`${isQueueDocked ? 'max-h-full' : 'container mx-auto max-h-full px-4'} overflow-y-auto`}>
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">
                    {`Queue (${queue.length}) · ${upcomingListLabel}`}
                  </h3>
                  {autoDJStatusMessage && (
                    <p className="text-[10px] text-emerald-300">{autoDJStatusMessage}</p>
                  )}
                  <MixQualityHud quality={lastMixQuality} compact />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={primeQueue}
                    className="h-11 min-w-[88px] shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors touch-manipulation"
                    title="Add upcoming library tracks to the queue"
                    aria-label="Prime queue"
                  >
                    Prime queue
                  </button>
                  <AutoDJHeaderButton size="compact" />
                  <button
                    type="button"
                    onClick={toggleCatalogRandom}
                    className={`relative flex h-11 min-w-[88px] shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors touch-manipulation ${
                      settings.catalogRandom
                        ? 'bg-amber-600/30 text-amber-200'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                    title={
                      autoDJConfig.enabled
                        ? 'Random from catalog / playlist / folder — applies when Auto DJ is off. Does not reorder the queue list.'
                        : 'Random from catalog / playlist / folder — does not reorder the queue list'
                    }
                    aria-label={
                      settings.catalogRandom ? 'Disable catalog random' : 'Enable catalog random'
                    }
                    aria-pressed={settings.catalogRandom}
                  >
                    <FaDice className="h-3 w-3" />
                    Random
                  </button>
                  <button
                    onClick={toggleShuffle}
                    className={`p-2 rounded transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center ${
                      settings.isShuffled ? 'text-white bg-gray-800/40' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Shuffle queue list order"
                    disabled={queue.length <= 1}
                    aria-label="Shuffle queue order"
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
              {/* Auto DJ settings live in the now-playing Auto DJ right-click menu */}
                            {/* Collapsible Queue Track List */}
              <div className="mt-3 bg-gray-900/70 border border-gray-800 rounded-lg">
                <button
                  onClick={() => setIsTrackListExpanded((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors rounded-lg"
                >
                  <span className="text-xs uppercase tracking-[0.2em] text-gray-400">
                    {upcomingListLabel} ({displayTracks.length})
                    {canReorderQueue ? ' · drag to reorder' : ''}
                  </span>
                  <FaChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isTrackListExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isTrackListExpanded && (
                <div 
                  ref={queueContainerRef}
                  className={`overflow-y-auto border-t border-gray-800/50 ${
                    isQueueDocked ? 'max-h-[min(40vh,20rem)]' : 'max-h-[min(50vh,24rem)]'
                  }`}
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
                        const isDnaSuggestion = autoDJConfig.enabled && !isInQueue
                        const reorderEnabled = canReorderQueue && isInQueue && queueIndex > currentQueueIndex
                        return (
                          <div key={track.id} className="relative">
                            <QueueItem
                              track={track}
                              index={queueIndex >= 0 ? queueIndex : index}
                              isCurrent={queueIndex === currentQueueIndex}
                              onRemove={queueIndex >= 0 ? handleRemoveFromQueueClick : () => {}}
                              isAutoDJNext={
                                autoDJPendingTrackId === track.id ||
                                (isDnaSuggestion && index === 0)
                              }
                              reorderEnabled={reorderEnabled}
                              isDragOver={queueDragOverIndex === index}
                              onDragStart={(e) => handleQueueDragStart(e, index, track.id)}
                              onDragOver={(e) => handleQueueDragOver(e, index)}
                              onDrop={(e) => handleQueueDrop(e, index)}
                              onDragEnd={handleQueueDragEnd}
                            />
                            {isDnaSuggestion && index > 0 && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400/80">
                                DNA match
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8 px-4">
                      <div className="text-gray-400 text-sm text-center">
                        {autoDJConfig.enabled
                          ? 'No upcoming tracks.'
                          : settings.catalogRandom
                            ? isLoadingSourceTracks
                              ? `Loading ${catalogScopeLabel(currentSource)}…`
                              : `Picking random tracks from ${catalogScopeLabel(currentSource)}…`
                            : settings.isShuffled
                              ? 'Queue-order shuffle is on — add tracks or turn on Random.'
                              : 'No upcoming tracks.'}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>,
          queueDockHost ?? document.body
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
                      {/* Waveform Color Mode */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Color Mode</label>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {WAVEFORM_COLOR_MODES.map((mode) => (
                            <button
                              key={mode.id}
                              onClick={() => setWaveformMode(mode.id)}
                              className={`px-2 py-1.5 rounded text-[11px] transition-colors ${
                                waveformMode === mode.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                              }`}
                              title={mode.description}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Layer layout — Drums/Elements separated lanes vs classic merged */}
                      <div>
                        <label className="text-gray-300 mb-2 block">Layer display</label>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          {WAVEFORM_LAYER_LAYOUTS.map((layout) => (
                            <button
                              key={layout.id}
                              onClick={() => setWaveformLayerLayout(layout.id)}
                              className={`px-2 py-1.5 rounded text-[11px] transition-colors ${
                                waveformLayerLayout === layout.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                              }`}
                              title={layout.description}
                            >
                              {layout.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-500 leading-snug">
                          Separated / overlay / merged apply to Drums &amp; Elements; other modes stay merged.
                        </p>
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

                      {/* Zoom Controls — musical bar windows */}
                      <div>
                        <label className="text-gray-300 mb-2 block">
                          Zoom: {waveformVisibleBars <= 0 ? 'Full track' : `${Math.round(waveformVisibleBars)} bars`}
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleWaveformZoom(-1)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom out (+bars toward full track)"
                            disabled={waveformVisibleBars <= 0}
                          >
                            −
                          </button>
                          <button
                            onClick={() => applyVisibleBars(0, 0.5)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors"
                            title="Fit full waveform"
                          >
                            Full
                          </button>
                          <button
                            onClick={() => handleWaveformZoom(1)}
                            className="px-3 py-1.5 bg-gray-700/40 text-gray-300 hover:bg-gray-700/60 rounded text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Zoom in (fewer bars)"
                            disabled={waveformVisibleBars === WAVEFORM_BAR_ZOOM_STEPS[0]}
                          >
                            +
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          {[4, 8, 16].map((bars) => (
                            <button
                              key={bars}
                              type="button"
                              onClick={() => applyVisibleBars(bars, 0.5)}
                              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                                waveformVisibleBars === bars
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                              }`}
                              title={`Show ${bars} bars`}
                            >
                              {bars}
                            </button>
                          ))}
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
                      {waveformVisibleBars > 0 && (
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
                          Beat Grid {bpmForGrid ? `(${Number(bpmForGrid.toFixed(2))} BPM)` : '(no BPM)'}
                        </label>

                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              setBeatGridEnabled((v) => {
                                const next = !v
                                if (next && beatGridOffsetSec === 0) {
                                  // Defer so state toggle isn't blocked by align work
                                  queueMicrotask(() => alignBeatGridToWaveform())
                                }
                                return next
                              })
                            }}
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
                            disabled={!bpmForGrid || beatGridLocked}
                            title="Set downbeat at the playhead (phrase starts here)"
                          >
                            Set Downbeat Here
                          </button>

                          <button
                            onClick={() => {
                              if (beatGridLocked) unlockBeatGrid()
                              else lockBeatGrid()
                            }}
                            className={`px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40 ${
                              beatGridLocked
                                ? 'bg-emerald-700/80 text-white'
                                : 'bg-gray-700/40 text-gray-300 hover:bg-gray-700/60'
                            }`}
                            disabled={!bpmForGrid}
                            title={
                              beatGridLocked
                                ? 'Unlock beat grid (allow re-align)'
                                : 'Verify & lock beat grid + kick onsets for Auto DJ'
                            }
                          >
                            {beatGridLocked ? 'Grid: LOCKED' : 'Lock Grid'}
                          </button>

                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[10px] text-gray-500">Beats/Bar</span>
                            <select
                              value={beatGridBeatsPerBar}
                              onChange={(e) => setBeatGridBeatsPerBar(parseInt(e.target.value, 10))}
                              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1"
                              disabled={beatGridLocked}
                            >
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                            </select>
                          </div>
                        </div>

                        {bpmForGrid && (
                          <div className="text-[10px] text-gray-500 mt-1">
                            Downbeat: {beatGridOffsetSec.toFixed(3)}s
                            {beatGridLock != null ? ` · lock ${(beatGridLock * 100).toFixed(0)}%` : ''}
                            {beatGridLocked ? ' · verified' : ''}
                            {' · '}bars / 8-bar phrases / 16-bar sections
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
                  title="Shuffle queue order"
                  disabled={queue.length <= 1}
                >
                  <FaRandom className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSkipToNext}
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
                <AutoDJHeaderButton size="compact" />
              </div>
              {/* Volume Control - always visible in mobile panel */}
              {!isExpanded && (
                <div className="flex items-center justify-center gap-3 mt-1">
                  <button
                    onClick={toggleMute}
                    className={`touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${
                      settings.isMuted ? 'text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title={settings.isMuted ? 'Unmute' : 'Mute'}
                    aria-label={settings.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {settings.isMuted ? <FaVolumeMute className="w-5 h-5" /> : <FaVolumeUp className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.isMuted ? 0 : settings.volume}
                    onChange={(e) => {
                      const newVolume = parseFloat(e.target.value)
                      saveSettings({ volume: newVolume, isMuted: newVolume === 0 })
                      const __live = getPlaybackAudio()
                      if (__live && !phraseMixLockRef.current) {
                        __live.volume = newVolume
                      }
                      mixEngineRef.current?.setMasterVolume(newVolume)
                    }}
                    className="flex-1 max-w-[200px] h-2 rounded-lg appearance-none cursor-pointer touch-manipulation"
                    style={{
                      background: `linear-gradient(to right, #fff 0%, #fff ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 ${(settings.isMuted ? 0 : settings.volume) * 100}%, #374151 100%)`
                    }}
                    title="Adjust volume"
                    aria-label="Adjust volume"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Auto DJ settings — always available from mini bar / vault header (not only expanded chrome) */}
      {autoDJSettingsMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={autoDJMenuClamp.ref}
          {...autoDJMenuClamp.rootProps}
          data-auto-dj-settings-menu=""
          data-allow-scroll-when-locked=""
          className="fixed w-[min(28rem,calc(100vw-1rem))] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-950 shadow-2xl"
          style={autoDJMenuClamp.style}
          role="dialog"
          aria-label="Auto DJ settings"
          onContextMenu={(e) => e.preventDefault()}
        >
              <PopupMenuDragHeader
                title={
                  <span className="flex items-center gap-2">
                    <span>Auto DJ Settings</span>
                    {autoDJConfig.enabled && (
                      <span className="px-1.5 py-0.5 text-[9px] normal-case tracking-normal bg-emerald-600/30 text-emerald-400 rounded">
                        ON
                      </span>
                    )}
                  </span>
                }
                headerProps={{
                  ...autoDJMenuClamp.headerProps,
                  className: `${autoDJMenuClamp.headerProps.className} bg-gray-950`,
                }}
                trailing={
                  <button
                    type="button"
                    data-no-drag=""
                    onClick={closeAutoDJSettingsMenu}
                    className="flex min-h-[32px] min-w-[32px] items-center justify-center text-gray-400 hover:text-white"
                    aria-label="Close Auto DJ settings"
                  >
                    <FaTimes className="h-3 w-3" />
                  </button>
                }
              />
              <div className="px-3 pb-3 pt-2">
                <AutoDJSettingsPanel
                  config={autoDJConfig}
                  leadIn={autoDJLeadIn}
                  suggestedLeadIn={autoDJSuggestedLeadIn}
                  fanUserId={fanUserId}
                  saving={autoDJSaving}
                  dirty={autoDJDirty}
                  statusMessage={autoDJStatusMessage}
                  lastMixQuality={lastMixQuality}
                  mixQualityHistory={mixQualityHistory}
                  onMixQualityHistoryChange={setMixQualityHistory}
                  onPatch={patchAutoDJConfig}
                  onLeadIn={(value) => {
                    setAutoDJLeadIn(value)
                    setAutoDJDirty(true)
                  }}
                  onSave={() => { void saveAutoDJToAccount() }}
                  onReset={resetAutoDJToDefaults}
                />
              </div>
        </div>,
        document.body,
      )}

      {/* Track Details Modal — portaled so player contain/overflow cannot pin it off-screen */}
      {showTrackDetails && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowTrackDetails(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="track-details-title"
            className="max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-lg border border-gray-800 bg-black/90 p-6 shadow-2xl"
            data-allow-scroll-when-locked=""
            data-track-details-modal=""
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="track-details-title" className="text-lg font-semibold text-white">Track Details</h3>
              <button
                onClick={() => setShowTrackDetails(false)}
                className="text-gray-400 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Close track details"
                aria-label="Close track details"
              >
                <FaTimes />
              </button>
            </div>
            {coverSrc && (
              <div className="relative w-full h-64 rounded-lg overflow-hidden mb-4">
                <Image
                  key={coverSrc}
                  src={coverSrc}
                  alt={coverAlt}
                  fill
                  className="object-cover"
                  unoptimized={coverUnoptimized}
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
        </div>,
        document.body,
      )}

      {/* Expanded Controls - Must be outside the conditional to show in DJ mode */}
      {!isMiniMode && isExpanded && (
        <div className="border-t border-gray-800">
          {expandedMode === 'controls' || !djModeAvailable ? (
            <ExpandedPlayerControls
              decks={expandedDeckChannels}
              deckWaveforms={deckChannelWaveforms}
              onTapTempo={handleDeckTapTempo}
              onTempoChange={handleDeckTempoChange}
              onChangePlaybackRate={changeDeckPlaybackRate}
              getTempoPercentage={getTempoPercentage}
              getAdjustedBPM={getAdjustedBPM}
              rateToTempoValue={rateToTempoValue}
              onBPMUpdate={handleDeckBPMUpdate}
              canEditOrigBpm={canEditOrigBpm}
              onDeckEqGains={handleDeckEqGains}
              isPlaying={isPlaying}
              isLoading={isLoading}
              error={error}
              canSkip={queue.length > 1}
              onPrevious={onPrevious}
              onNext={handleSkipToNext}
              onTogglePlay={() => {
                void togglePlay()
              }}
              mixProgress={mixVisualProgress}
              mixCrossfadeActive={crossfadeActive}
              autoDjStatusLine={autoDjDeckStatusLine}
              mixSessionEntries={mixQualityHistory}
              autoDjStatusMessage={autoDJStatusMessage || null}
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
      {waveformMenu && createPortal(
        <div
          ref={waveformMenuClamp.ref}
          {...waveformMenuClamp.rootProps}
          role="menu"
          aria-label="Waveform display options"
          data-allow-scroll-when-locked=""
          className="fixed z-[12000] w-56 overflow-y-auto overscroll-y-contain rounded-lg border border-gray-700 bg-gray-900 py-0 shadow-2xl"
          style={waveformMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader
            title={`Waveform · Deck ${waveformMenuDeck === 'a' ? 'A' : 'B'}`}
            headerProps={waveformMenuClamp.headerProps}
          />
          <div className="py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Color mode
          </div>
          {WAVEFORM_COLOR_MODES.map((mode) => (
            <WaveformMenuItem
              key={mode.id}
              label={mode.label}
              active={waveformMode === mode.id}
              onSelect={() => setWaveformMode(mode.id)}
            />
          ))}
          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Layer display
          </div>
          {WAVEFORM_LAYER_LAYOUTS.map((layout) => (
            <WaveformMenuItem
              key={layout.id}
              label={layout.label}
              active={waveformLayerLayout === layout.id}
              onSelect={() => setWaveformLayerLayout(layout.id)}
            />
          ))}
          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Display
          </div>
          <WaveformMenuItem
            label="Mirror"
            active={waveformMirror}
            onSelect={() => setWaveformMirror((prev) => !prev)}
          />
          <WaveformMenuItem
            label={waveformMenuDeckBpm ? `Beat grid (${waveformMenuDeckBpm.toFixed(0)} BPM)` : 'Beat grid'}
            active={beatGridEnabled}
            disabled={!waveformMenuDeckBpm}
            onSelect={() => setBeatGridEnabled((v) => !v)}
          />
          <WaveformMenuItem
            label="Follow playhead"
            active={waveformFollow}
            disabled={waveformVisibleBars <= 0 || !waveformMenuDeckIsLive}
            onSelect={() => setWaveformFollow((prev) => !prev)}
          />
          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500">
            Zoom{' '}
            {waveformVisibleBars <= 0 ? 'Full track' : `${Math.round(waveformVisibleBars)} bars`}
          </div>
          {[4, 8, 16].map((bars) => (
            <WaveformMenuItem
              key={`bars-${bars}`}
              label={`${bars} bars`}
              active={waveformVisibleBars === bars}
              onSelect={() => applyVisibleBars(bars, 0.5)}
            />
          ))}
          <WaveformMenuItem
            label="Zoom in"
            disabled={waveformVisibleBars === WAVEFORM_BAR_ZOOM_STEPS[0]}
            onSelect={() => handleWaveformZoom(1)}
          />
          <WaveformMenuItem
            label="Zoom out"
            disabled={waveformVisibleBars <= 0}
            onSelect={() => handleWaveformZoom(-1)}
          />
          <WaveformMenuItem
            label="Fit to track"
            onSelect={() => applyVisibleBars(0, 0.5)}
          />
          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-500/90">
            Sonic DNA
          </div>
          <WaveformMenuItem
            label="Open Sonic DNA"
            disabled={!waveformMenuDeckTrack}
            onSelect={() => {
              if (waveformMenuDeckTrack) {
                setSonicDnaReportTrack(waveformMenuDeckTrack)
              }
              setWaveformMenu(null)
              setSonicDnaReportOpen(true)
            }}
          />
          <WaveformMenuItem
            label="Set beat here"
            disabled={!waveformMenuDeckBpm || !waveformMenuDeckIsLive}
            onSelect={setBeatHere}
          />
          <WaveformMenuItem
            label="Snap to kick"
            disabled={!waveformMenuDeckBpm || !waveformMenuDeckIsLive}
            onSelect={() => snapPlayheadToDna('kick')}
          />
          <WaveformMenuItem
            label="Snap to beat"
            disabled={!waveformMenuDeckBpm || !waveformMenuDeckIsLive}
            onSelect={() => snapPlayheadToDna('beat')}
          />
          <WaveformMenuItem
            label="Snap to phrase"
            disabled={!waveformMenuDeckBpm || !waveformMenuDeckIsLive}
            onSelect={() => snapPlayheadToDna('phrase')}
          />
          <WaveformMenuItem
            label="Align to waveform"
            disabled={!waveformMenuDeckBpm || !waveformMenuDeckIsLive || waveformData.length === 0}
            onSelect={alignBeatGridToWaveform}
          />
          <WaveformMenuItem
            label="Apply DNA EQ pocket"
            disabled={!waveformMenuDeckTrack?.sonic_dna || !waveformMenuDeckIsLive}
            onSelect={applyDnaEqPocket}
          />
          <WaveformMenuItem
            label="Reset beat grid"
            disabled={!waveformMenuDeckBpm || !waveformMenuDeckIsLive}
            onSelect={resetBeatGrid}
          />
          </div>
        </div>,
        document.body
      )}
      {sonicDnaReportOpen && (sonicDnaReportTrack ?? currentTrack) && (
        <SonicDnaReportModal
          track={(sonicDnaReportTrack ?? currentTrack) as any}
          dialogRef={sonicDnaReportRef}
          onClose={() => {
            setSonicDnaReportOpen(false)
            setSonicDnaReportTrack(null)
          }}
          waveformActions={{
            gridReady: Boolean(bpmForGrid),
            hasWaveform: waveformData.length > 0,
            onAlignGrid: alignBeatGridToWaveform,
            onSetBeatHere: setBeatHere,
            onSnapPlayhead: snapPlayheadToDna,
            onResetGrid: resetBeatGrid,
            onApplyEqBias: applyDnaEqPocket,
          }}
        />
      )}
    </div>
  )
}
