'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  subscribeCatalogSync,
  normalizeArtworkPatch,
  playerTrackMatchesCoverEvent,
  catalogItemMatchesCoverEvent,
  stampAllTrackArtwork,
  applyCatalogTrackPatch,
  catalogTrackPatchHasFields,
} from '@/lib/catalog-sync'
import { normalizeVaultAudioUrl, toSameOriginMediaUrl } from '@/utils/normalizeVaultAudioUrl'
import {
  readAutoDJEnabledFromStorage,
  writeAutoDJEnabledToStorage,
} from '@/lib/audio/auto-dj-preferences'
import {
  readIDJEnabledFromStorage,
  writeIDJEnabledToStorage,
} from '@/lib/audio/idj-preferences'

function fisherYatesShuffle<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function normalizePersistedTrackFile(file: string | undefined): string {
  if (!file) return ''
  return toSameOriginMediaUrl(file) || normalizeVaultAudioUrl(file)
}

function normalizePersistedTrack(track: Track): Track {
  const file = normalizePersistedTrackFile(track.file)
  return file && file !== track.file ? { ...track, file } : track
}

export interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
  album?: string
  albumType?: string
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
  grid_manual?: boolean
  // Sonic DNA analysis (from Supabase)
  sonic_dna?: any
  musicbrainz_id?: string
  musicbrainz_data?: any
}

export type PlayerSource = { type: 'folder' | 'playlist' | null; id: string | null } | null

/** Compact transport bar is the default chrome after reload. */
export type PlayerChromeState = {
  isMiniMode: boolean
  isExpanded: boolean
  /** Hide the compact (non-expanded) player waveform strip. */
  isWaveformCollapsed: boolean
}

export type PersistedMusicPlayerState = {
  currentTrack: Track | null
  queue: Track[]
  currentIndex: number
  currentTime?: number
  currentSource?: PlayerSource
  chrome?: PlayerChromeState
}

export const MUSIC_PLAYER_STATE_KEY = 'musicPlayerState'

export const DEFAULT_PLAYER_CHROME: PlayerChromeState = {
  isMiniMode: true,
  isExpanded: false,
  isWaveformCollapsed: false,
}

export function readMusicPlayerState(): PersistedMusicPlayerState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(MUSIC_PLAYER_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedMusicPlayerState
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** Merge-patch so track/queue writers and position/chrome writers do not clobber each other. */
export function patchMusicPlayerState(patch: Partial<PersistedMusicPlayerState>): void {
  if (typeof window === 'undefined') return
  try {
    const prev = readMusicPlayerState() || {
      currentTrack: null,
      queue: [],
      currentIndex: 0,
    }
    const next: PersistedMusicPlayerState = {
      ...prev,
      ...patch,
      chrome: {
        ...DEFAULT_PLAYER_CHROME,
        ...prev.chrome,
        ...patch.chrome,
      },
    }
    localStorage.setItem(MUSIC_PLAYER_STATE_KEY, JSON.stringify(next))
  } catch {
    // quota / private mode — ignore
  }
}

export function hasPersistedMusicTrack(): boolean {
  return Boolean(readMusicPlayerState()?.currentTrack)
}

interface MusicPlayerContextType {
  currentTrack: Track | null
  queue: Track[]
  isPlaying: boolean
  currentIndex: number
  currentSource: PlayerSource
  setCurrentTrack: (track: Track | null) => void
  setQueue: (queue: Track[]) => void
  setIsPlaying: (isPlaying: boolean) => void
  setCurrentIndex: (index: number) => void
  setCurrentSource: (source: PlayerSource) => void
  playTrack: (track: Track, queue?: Track[], source?: PlayerSource) => void
  /**
   * Update current track/queue identity without resetting transport to 0.
   * Used after a dual-deck mix handoff where the incoming element is already playing.
   */
  adoptPlayingTrack: (track: Track, queue: Track[]) => void
  playQueue: (queue: Track[], startIndex?: number, source?: PlayerSource) => void
  addToQueue: (track: Track) => void
  /** Insert track(s) to play immediately after the current track (iTunes “Play Next”). */
  playNext: (tracks: Track | Track[]) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  nextTrack: () => void
  previousTrack: () => void
  shuffleQueue: () => void
  handleShuffle: (shuffledQueue: Track[]) => void
  handleQueueChange: (newQueue: Track[]) => void
  waveformHost: HTMLElement | null
  setWaveformHost: (host: HTMLElement | null) => void
  /** Vault main column host for the queue panel (under SergBrowser sticky header). */
  queuePanelHost: HTMLElement | null
  setQueuePanelHost: (host: HTMLElement | null) => void
  seekTo: (seconds: number) => void
  /** Drop a pending media seek (iDJ same-deck loads must not keep re-seeking). */
  clearSeekTarget: () => void
  seekTargetSec: number | null
  seekNonce: number
  reportPlaybackPosition: (seconds: number) => void
  /** Global queue / playlist panel (MusicPlayer portal; toggled from vault header). */
  isQueuePanelOpen: boolean
  setIsQueuePanelOpen: (open: boolean) => void
  toggleQueuePanel: () => void
  /** Auto DJ enable — toggled from the now-playing Auto DJ button. */
  isAutoDJEnabled: boolean
  setIsAutoDJEnabled: (enabled: boolean) => void
  toggleAutoDJ: () => void
  /** Manual dual-deck iDJ — mutually exclusive with Auto DJ. */
  isIDJEnabled: boolean
  setIsIDJEnabled: (enabled: boolean) => void
  toggleIDJ: () => void
  /** Right-click Auto DJ settings popup (MusicPlayer portal). */
  autoDJSettingsMenu: { x: number; y: number } | null
  openAutoDJSettingsMenu: (pos: { x: number; y: number }) => void
  closeAutoDJSettingsMenu: () => void
  /** Right-click iDJ settings popup (MusicPlayer portal). */
  idjSettingsMenu: { x: number; y: number } | null
  openIDJSettingsMenu: (pos: { x: number; y: number }) => void
  closeIDJSettingsMenu: () => void
  /** Bottom player chrome — synced from MusicPlayer for layout decisions elsewhere. */
  playerChrome: PlayerChromeState
  setPlayerChrome: (patch: Partial<PlayerChromeState>) => void
}

/** Full expanded player UI (decks + waveforms), not the compact mini bar. */
export function isPlayerFullyExpanded(chrome: PlayerChromeState): boolean {
  return chrome.isExpanded && !chrome.isMiniMode
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined)

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [originalQueue, setOriginalQueue] = useState<Track[]>([])
  const [isShuffled, setIsShuffled] = useState(false)
  const [currentSource, setCurrentSource] = useState<PlayerSource>(null)
  const currentSourceRef = useRef<PlayerSource>(null)
  currentSourceRef.current = currentSource
  const [waveformHost, setWaveformHost] = useState<HTMLElement | null>(null)
  const [queuePanelHost, setQueuePanelHost] = useState<HTMLElement | null>(null)
  const [seekTargetSec, setSeekTargetSec] = useState<number | null>(null)
  const [seekNonce, setSeekNonce] = useState(0)
  const [isQueuePanelOpen, setIsQueuePanelOpen] = useState(false)
  const [isAutoDJEnabled, setIsAutoDJEnabledState] = useState(false)
  const isAutoDJEnabledRef = useRef(false)
  const [isIDJEnabled, setIsIDJEnabledState] = useState(false)
  const isIDJEnabledRef = useRef(false)
  const [autoDJSettingsMenu, setAutoDJSettingsMenu] = useState<{ x: number; y: number } | null>(null)
  const [idjSettingsMenu, setIdjSettingsMenu] = useState<{ x: number; y: number } | null>(null)
  const [playerChrome, setPlayerChromeState] = useState<PlayerChromeState>(DEFAULT_PLAYER_CHROME)

  useEffect(() => {
    const saved = readMusicPlayerState()?.chrome
    if (saved) {
      setPlayerChromeState({ ...DEFAULT_PLAYER_CHROME, ...saved })
    }
  }, [])

  const setPlayerChrome = useCallback((patch: Partial<PlayerChromeState>) => {
    setPlayerChromeState((prev) => ({ ...prev, ...patch }))
  }, [])

  const toggleQueuePanel = useCallback(() => {
    setIsQueuePanelOpen((prev) => !prev)
  }, [])

  const applyAutoDJEnabled = useCallback((enabled: boolean, persist: boolean) => {
    isAutoDJEnabledRef.current = enabled
    setIsAutoDJEnabledState(enabled)
    if (persist) writeAutoDJEnabledToStorage(enabled)
    if (enabled && isIDJEnabledRef.current) {
      isIDJEnabledRef.current = false
      setIsIDJEnabledState(false)
      if (persist) writeIDJEnabledToStorage(false)
    }
  }, [])

  const applyIDJEnabled = useCallback((enabled: boolean, persist: boolean) => {
    isIDJEnabledRef.current = enabled
    setIsIDJEnabledState(enabled)
    if (persist) writeIDJEnabledToStorage(enabled)
    if (enabled && isAutoDJEnabledRef.current) {
      isAutoDJEnabledRef.current = false
      setIsAutoDJEnabledState(false)
      if (persist) writeAutoDJEnabledToStorage(false)
    }
  }, [])

  // Restored after mount rather than in useState so the server-rendered toggle
  // markup matches the first client render.
  useEffect(() => {
    applyAutoDJEnabled(readAutoDJEnabledFromStorage(), false)
    applyIDJEnabled(readIDJEnabledFromStorage(), false)
  }, [applyAutoDJEnabled, applyIDJEnabled])

  // Catalog hydration (tracks-optimized) pauses while playback needs bandwidth.
  useEffect(() => {
    try {
      ;(window as any).__sergikVaultPlaybackBusy = Boolean(isPlaying && currentTrack)
    } catch {
      /* ignore */
    }
  }, [isPlaying, currentTrack])

  const setIsAutoDJEnabled = useCallback(
    (enabled: boolean) => applyAutoDJEnabled(enabled, true),
    [applyAutoDJEnabled],
  )

  const toggleAutoDJ = useCallback(
    () => applyAutoDJEnabled(!isAutoDJEnabledRef.current, true),
    [applyAutoDJEnabled],
  )

  const setIsIDJEnabled = useCallback(
    (enabled: boolean) => applyIDJEnabled(enabled, true),
    [applyIDJEnabled],
  )

  const toggleIDJ = useCallback(
    () => applyIDJEnabled(!isIDJEnabledRef.current, true),
    [applyIDJEnabled],
  )

  const openAutoDJSettingsMenu = useCallback((pos: { x: number; y: number }) => {
    setIdjSettingsMenu(null)
    setAutoDJSettingsMenu(pos)
  }, [])

  const closeAutoDJSettingsMenu = useCallback(() => {
    setAutoDJSettingsMenu(null)
  }, [])

  const openIDJSettingsMenu = useCallback((pos: { x: number; y: number }) => {
    setAutoDJSettingsMenu(null)
    setIdjSettingsMenu(pos)
  }, [])

  const closeIDJSettingsMenu = useCallback(() => {
    setIdjSettingsMenu(null)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      __SERGIK_E2E__?: {
        openAutoDJSettings: () => void
        enableIDJ: () => void
        openIDJSettings: () => void
      }
    }
    w.__SERGIK_E2E__ = {
      ...w.__SERGIK_E2E__,
      openAutoDJSettings: () =>
        setAutoDJSettingsMenu({
          x: Math.min(420, window.innerWidth - 16),
          y: 96,
        }),
      enableIDJ: () => applyIDJEnabled(true, true),
      openIDJSettings: () =>
        setIdjSettingsMenu({
          x: Math.min(420, window.innerWidth - 16),
          y: 96,
        }),
    }
    return () => {
      delete w.__SERGIK_E2E__
    }
  }, [applyIDJEnabled])

  const seekTo = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return
    setSeekTargetSec(Math.max(0, seconds))
    setSeekNonce((n) => n + 1)
  }, [])

  const clearSeekTarget = useCallback(() => {
    setSeekTargetSec(null)
  }, [])

  const reportPlaybackPosition = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return
    patchMusicPlayerState({ currentTime: seconds })
  }, [])

  // Folder/EP cover assignment stamps every track in the live queue.
  // Edit-track field saves (title/artist/genre/BPM/key/dates) patch the same rows.
  useEffect(() => {
    return subscribeCatalogSync((event) => {
      if (event.entity === 'track' && catalogTrackPatchHasFields(event.patch)) {
        const stampFields = (track: Track) =>
          track.id === event.entityId || track.audioFileId === event.entityId
            ? applyCatalogTrackPatch(track, event.patch)
            : track
        setQueue((prev) => prev.map(stampFields))
        setOriginalQueue((prev) => prev.map(stampFields))
        setCurrentTrack((prev) => (prev ? stampFields(prev) : prev))
      }
      if (!Object.prototype.hasOwnProperty.call(event.patch, 'artwork')) return
      const folderId = event.folderId
      const trackId = event.entity === 'track' ? event.entityId : undefined
      if (!folderId && !trackId) return
      const artwork = normalizeArtworkPatch(event.patch.artwork ?? null)
      const source = currentSourceRef.current
      const sourceFolderId = source?.type === 'folder' ? source.id : null
      const stampMatchingTracks = (list: Track[]) => {
        const sourceMatch =
          Boolean(folderId) &&
          Boolean(sourceFolderId) &&
          catalogItemMatchesCoverEvent({ id: sourceFolderId ?? undefined }, folderId ?? undefined)
        // Only stamp the whole queue when playback is scoped to that folder/EP.
        // Mixed Auto DJ queues must not inherit one release cover onto every track.
        if (sourceMatch) return stampAllTrackArtwork(list, artwork ?? undefined)
        let changed = false
        const next = list.map((track) => {
          const matches = playerTrackMatchesCoverEvent(
            { ...track, artwork: track.artwork ?? undefined },
            { folderId: folderId ?? undefined, trackId, sourceFolderId: sourceFolderId ?? undefined },
          )
          if (!matches) return track
          if (track.artwork === (artwork ?? undefined)) return track
          changed = true
          return { ...track, artwork: artwork ?? undefined }
        })
        return changed ? next : list
      }

      setQueue((prev) => stampMatchingTracks(prev))
      setOriginalQueue((prev) => stampMatchingTracks(prev))
      setCurrentTrack((prev) => {
        if (!prev) return prev
        const [stamped] = stampMatchingTracks([prev])
        return stamped
      })
    })
  }, [])

  // Restore last session (paused — never autoplay on reload)
  useEffect(() => {
    const state = readMusicPlayerState()
    if (!state?.currentTrack) return

    setCurrentTrack(normalizePersistedTrack(state.currentTrack))
    if (state.queue && state.queue.length > 0) {
      setQueue(state.queue.map(normalizePersistedTrack))
      setCurrentIndex(
        typeof state.currentIndex === 'number' && state.currentIndex >= 0
          ? state.currentIndex
          : 0,
      )
    } else {
      setQueue([normalizePersistedTrack(state.currentTrack)])
      setCurrentIndex(0)
    }
    if (state.currentSource) setCurrentSource(state.currentSource)
    setIsPlaying(false)

    const t = state.currentTime
    if (typeof t === 'number' && Number.isFinite(t) && t > 0) {
      setSeekTargetSec(t)
      setSeekNonce((n) => n + 1)
    }
  }, [])

  // Persist queue / track identity (merge-patch keeps currentTime + chrome)
  useEffect(() => {
    if (!currentTrack && queue.length === 0) return
    patchMusicPlayerState({
      currentTrack,
      queue,
      currentIndex,
      currentSource,
    })
  }, [currentTrack, queue, currentIndex, currentSource])

  const playTrack = useCallback((track: Track, trackQueue?: Track[], source?: PlayerSource) => {
    setSeekTargetSec(null)
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
    patchMusicPlayerState({ currentTime: 0 })

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

  /** Deck-swap handoff: keep playhead; do not force currentTime 0. */
  const adoptPlayingTrack = useCallback((track: Track, trackQueue: Track[]) => {
    const index = trackQueue.findIndex((t) => t.id === track.id)
    setQueue(trackQueue)
    setCurrentIndex(index >= 0 ? index : 0)
    setCurrentTrack(index >= 0 ? trackQueue[index] : track)
    setIsPlaying(true)
  }, [])

  const playQueue = useCallback((trackQueue: Track[], startIndex: number = 0, source?: PlayerSource) => {
    if (trackQueue.length > 0) {
      setSeekTargetSec(null)
      setQueue(trackQueue)
      setCurrentIndex(startIndex)
      setCurrentTrack(trackQueue[startIndex])
      setCurrentSource(source || null)
      setIsPlaying(true)
      patchMusicPlayerState({ currentTime: 0 })
    }
  }, [])

  const addToQueue = useCallback((track: Track) => {
    setQueue(prev => [...prev, track])
  }, [])

  const playNext = useCallback((tracks: Track | Track[]) => {
    const incoming = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean)
    if (!incoming.length) return
    setQueue((prev) => {
      if (!prev.length) {
        setCurrentTrack(incoming[0])
        setCurrentIndex(0)
        setIsPlaying(true)
        setSeekTargetSec(null)
        patchMusicPlayerState({ currentTime: 0 })
        return incoming
      }
      const insertAt = Math.min(currentIndex + 1, prev.length)
      return [...prev.slice(0, insertAt), ...incoming, ...prev.slice(insertAt)]
    })
  }, [currentIndex])

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
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(MUSIC_PLAYER_STATE_KEY)
      } catch {
        // ignore
      }
    }
  }, [])

  const nextTrack = useCallback(() => {
    setSeekTargetSec(null)
    patchMusicPlayerState({ currentTime: 0 })
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
    setSeekTargetSec(null)
    patchMusicPlayerState({ currentTime: 0 })
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
        setCurrentTrack(shuffledQueue[newIndex])
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
        // Queue patches (Orig BPM, DNA, artwork) must replace the live track
        // object — index-only updates leave the player chrome on stale fields.
        setCurrentTrack(newQueue[newIndex])
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

  const contextValue = useMemo(
    () => ({
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
      adoptPlayingTrack,
      playQueue,
      addToQueue,
      playNext,
      removeFromQueue,
      clearQueue,
      nextTrack,
      previousTrack,
      shuffleQueue,
      handleShuffle,
      handleQueueChange,
      waveformHost,
      setWaveformHost,
      queuePanelHost,
      setQueuePanelHost,
      seekTo,
      clearSeekTarget,
      seekTargetSec,
      seekNonce,
      reportPlaybackPosition,
      isQueuePanelOpen,
      setIsQueuePanelOpen,
      toggleQueuePanel,
      isAutoDJEnabled,
      setIsAutoDJEnabled,
      toggleAutoDJ,
      isIDJEnabled,
      setIsIDJEnabled,
      toggleIDJ,
      autoDJSettingsMenu,
      openAutoDJSettingsMenu,
      closeAutoDJSettingsMenu,
      idjSettingsMenu,
      openIDJSettingsMenu,
      closeIDJSettingsMenu,
      playerChrome,
      setPlayerChrome,
    }),
    [
      currentTrack,
      queue,
      isPlaying,
      currentIndex,
      currentSource,
      playTrack,
      adoptPlayingTrack,
      playQueue,
      addToQueue,
      playNext,
      removeFromQueue,
      clearQueue,
      nextTrack,
      previousTrack,
      shuffleQueue,
      handleShuffle,
      handleQueueChange,
      waveformHost,
      queuePanelHost,
      seekTo,
      clearSeekTarget,
      seekTargetSec,
      seekNonce,
      reportPlaybackPosition,
      isQueuePanelOpen,
      toggleQueuePanel,
      isAutoDJEnabled,
      setIsAutoDJEnabled,
      toggleAutoDJ,
      isIDJEnabled,
      setIsIDJEnabled,
      toggleIDJ,
      autoDJSettingsMenu,
      openAutoDJSettingsMenu,
      closeAutoDJSettingsMenu,
      idjSettingsMenu,
      openIDJSettingsMenu,
      closeIDJSettingsMenu,
      playerChrome,
      setPlayerChrome,
    ],
  )

  return (
    <MusicPlayerContext.Provider value={contextValue}>
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
        adoptPlayingTrack: () => {},
        playQueue: () => {},
        addToQueue: () => {},
        playNext: () => {},
        removeFromQueue: () => {},
        clearQueue: () => {},
        nextTrack: () => {},
        previousTrack: () => {},
        shuffleQueue: () => {},
        handleShuffle: () => {},
        handleQueueChange: () => {},
        waveformHost: null,
        setWaveformHost: () => {},
        queuePanelHost: null,
        setQueuePanelHost: () => {},
        seekTo: () => {},
        clearSeekTarget: () => {},
        seekTargetSec: null,
        seekNonce: 0,
        reportPlaybackPosition: () => {},
        isQueuePanelOpen: false,
        setIsQueuePanelOpen: () => {},
        toggleQueuePanel: () => {},
        isAutoDJEnabled: false,
        setIsAutoDJEnabled: () => {},
        toggleAutoDJ: () => {},
        isIDJEnabled: false,
        setIsIDJEnabled: () => {},
        toggleIDJ: () => {},
        autoDJSettingsMenu: null,
        openAutoDJSettingsMenu: () => {},
        closeAutoDJSettingsMenu: () => {},
        idjSettingsMenu: null,
        openIDJSettingsMenu: () => {},
        closeIDJSettingsMenu: () => {},
        playerChrome: DEFAULT_PLAYER_CHROME,
        setPlayerChrome: () => {},
      }
    }
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider')
  }
  return context
}

