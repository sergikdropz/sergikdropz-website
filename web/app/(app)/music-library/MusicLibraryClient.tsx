/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
'use client'

import dynamic from 'next/dynamic'
import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useDeferredValue,
  type Dispatch,
  type SetStateAction,
} from 'react'
import Image from 'next/image'
import { FaSearch, FaTimes, FaTrash, FaPlus, FaMusic, FaExpand, FaCompress, FaChevronDown, FaChevronUp, FaArrowLeft, FaPlay, FaSort, FaSortAlphaDown, FaSortAlphaUp, FaSortNumericDown, FaSortNumericUp, FaClock, FaColumns, FaCheckSquare, FaSquare, FaCalendar, FaFolder, FaChevronRight, FaEdit } from 'react-icons/fa'
import { useMusicPlayer, isPlayerFullyExpanded } from '@/contexts/MusicPlayerContext'
import { readCatalogRandomSetting } from '@/lib/audio/catalog-random'
import FolderTree from '@/components/FolderTree'
import { 
  BpmBadge, 
  KeyBadge, 
  GenreBadge,
  DnaMatchBadge,
  DnaMatchScoreBadge,
  MoodBadge,
  ProductionEraBadge,
  CompatibleKeysBadge,
} from '@/components/music/MusicBadges'
import NowPlayingTransportMirror from '@/components/music/NowPlayingTransportMirror'
import SocialLinks from '@/components/SocialLinks'
import {
  fetchMusicLibrary,
  fetchPlaylists,
  fetchTracksSummary,
  fetchAllTracksSummaryForHydration,
  invalidateMusicLibraryCache,
  peekCachedMusicLibrary,
  seedMusicLibraryCache,
  updateTrack,
  recordTrackPlay,
  type MusicLibraryData,
} from '@/utils/musicLibraryApi'
import { deriveMixingRecommendations } from '@/lib/audio/sonic-dna-mix'
import { MUSIC_LIBRARY_OVERLAY_HOST_ID } from '@/lib/content-overlay'
import {
  subscribeCatalogSync,
  normalizeArtworkPatch,
  stampLibraryCover,
  stampPlaylistCovers,
  catalogItemMatchesCoverEvent,
  playerTrackMatchesCoverEvent,
  stampAllTrackArtwork,
  applyCatalogTrackPatch,
  catalogTrackPatchHasFields,
} from '@/lib/catalog-sync'

function importWithChunkRetry<T>(importer: () => Promise<{ default: T }>) {
  return importer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const isChunkLoadError =
      (error instanceof Error && error.name === 'ChunkLoadError') ||
      /Loading chunk .+ failed/i.test(message)
    if (!isChunkLoadError) throw error
    return new Promise<{ default: T }>((resolve, reject) => {
      window.setTimeout(() => {
        importer().then(resolve).catch(reject)
      }, 800)
    })
  })
}

const PlaylistManager = dynamic(() => import('@/components/PlaylistManager'), { ssr: false })
const SonicDNA = dynamic(
  () => importWithChunkRetry(() => import('@/components/SonicDNA')),
  {
    ssr: false,
    loading: () => (
      <div className="py-4 text-center text-xs text-gray-400">Loading Sonic DNA…</div>
    ),
  }
)
const SergBrowser = dynamic(() => import('@/components/music/SergBrowser'), { ssr: false })
const SmartPlaylistBuilder = dynamic(
  () => import('@/components/music/SmartPlaylistBuilder'),
  { ssr: false }
)
import MusicLibraryVirtualTrackScroller from '@/components/music/MusicLibraryVirtualTrackScroller'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { areKeysCompatible } from '@/types/sergik-data'
import {
  displayTrackBpm,
  displayTrackDrumStyle,
  displayTrackGenre,
  displayTrackKey,
  displayTrackScale,
  displayTrackSubgenre,
  displayTrackTimeSignature,
} from '@/lib/audio/track-display'


interface Track {
  id: string
  folderId?: string
  audioFileId?: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string | null
  bpm?: number
  key_signature?: string
  genre?: string
  subgenre?: string
  sonic_dna?: any
  created_at?: string
  date?: string
  year?: number
  display_order?: number
  track_number?: number
}

interface FolderItem {
  id: string
  name: string
  type: 'folder' | 'album' | 'ep' | 'single' | 'remix' | 'track'
  parentId: string | null
  hidden?: boolean
  children?: FolderItem[]
  tracks?: Track[]
  artwork?: string
  year?: number
}

function trackCoverArtRaw(track: Track): string | undefined {
  const a = track.artwork?.trim()
  if (a) return a
  const u = (track as { artwork_url?: string }).artwork_url?.trim()
  return u || undefined
}

// Helper to filter out hidden folders from display
const filterVisibleFolders = (folders: FolderItem[] | undefined): FolderItem[] => {
  if (!folders) return []
  return folders.filter(f => !f.hidden)
}

/** First artwork URL on any visible descendant (for containers with nested EPs/albums). */
function findFirstDescendantArtworkRaw(folder: FolderItem): string | undefined {
  const stack: FolderItem[] = [...filterVisibleFolders(folder.children)]
  while (stack.length) {
    const n = stack.pop()!
    if (n.artwork?.trim()) return n.artwork
    const tr = n.tracks?.find((t) => trackCoverArtRaw(t))
    const fromTrack = tr ? trackCoverArtRaw(tr) : undefined
    if (fromTrack) return fromTrack
    if (n.children?.length) {
      stack.push(...filterVisibleFolders(n.children))
    }
  }
  return undefined
}

/** Resolved artwork URL(s) for a folder grid tile: collage (2+ unique) or single cover. */
function getFolderCoverArtworkUrls(folder: FolderItem): string[] {
  const uniqueArtworks = new Set<string>()
  const collageOrder: string[] = []

  const pushRaw = (raw: string | undefined) => {
    if (raw == null || !String(raw).trim()) return
    const resolved = resolveImageUrl(raw)
    if (!resolved || uniqueArtworks.has(resolved)) return
    uniqueArtworks.add(resolved)
    collageOrder.push(resolved)
  }

  if (folder.tracks && folder.tracks.length > 0) {
    for (const track of folder.tracks) {
      pushRaw(trackCoverArtRaw(track))
      if (collageOrder.length >= 9) break
    }
  }

  const walkDescendants = (nodes: FolderItem[] | undefined) => {
    if (!nodes?.length || collageOrder.length >= 9) return
    for (const child of filterVisibleFolders(nodes)) {
      pushRaw(child.artwork)
      if (collageOrder.length >= 9) return
      if (child.tracks?.length) {
        for (const track of child.tracks) {
          pushRaw(trackCoverArtRaw(track))
          if (collageOrder.length >= 9) return
        }
      }
      walkDescendants(child.children)
      if (collageOrder.length >= 9) return
    }
  }

  if (collageOrder.length < 9) {
    walkDescendants(folder.children)
  }

  if (collageOrder.length > 1) {
    return collageOrder.slice(0, 9)
  }

  const preFilteredVisibleChildren = filterVisibleFolders(folder.children)
  const artworkRaw =
    folder.artwork ||
    collageOrder[0] ||
    folder.tracks?.map(trackCoverArtRaw).find(Boolean) ||
    preFilteredVisibleChildren.find(c => c.artwork)?.artwork ||
    preFilteredVisibleChildren.flatMap(c => c.tracks || []).map(trackCoverArtRaw).find(Boolean) ||
    findFirstDescendantArtworkRaw(folder)

  if (!artworkRaw || !String(artworkRaw).trim()) return []
  const single = resolveImageUrl(artworkRaw)
  return single ? [single] : []
}

function hydrateLibraryWithTracks(
  library: MusicLibraryData | null,
  apiTracks: Track[],
): MusicLibraryData | null {
  if (!library?.folders || apiTracks.length === 0) return library

  const tracksById = new Map<string, Track>()
  const tracksByAudioId = new Map<string, Track>()
  const tracksByFile = new Map<string, Track>()
  const tracksByFolder = new Map<string, Track[]>()
  apiTracks.forEach((track) => {
    if (track?.id) tracksById.set(track.id, track)
    const audioId = (track as { audioFileId?: string; audio_file_id?: string })?.audioFileId ||
      (track as { audio_file_id?: string }).audio_file_id
    if (audioId) tracksByAudioId.set(audioId, track)
    if (track?.file) tracksByFile.set(track.file, track)
    const folderId =
      track.folderId ||
      (track as { folder_id?: string }).folder_id ||
      ''
    if (folderId) {
      const list = tracksByFolder.get(folderId)
      if (list) list.push(track)
      else tracksByFolder.set(folderId, [track])
    }
  })

  const mergeTrack = (track: Track): Track => {
    const audioId = (track as { audioFileId?: string })?.audioFileId ||
      (track as { audio_file_id?: string })?.audio_file_id
    const rich =
      tracksById.get(track.id) ||
      (audioId ? tracksByAudioId.get(audioId) : undefined) ||
      (track.file ? tracksByFile.get(track.file) : undefined)
    return rich ? { ...track, ...rich } : track
  }

  const sortFolderTracks = (tracks: Track[]) =>
    [...tracks].sort(
      (a, b) =>
        (a.display_order ?? a.track_number ?? 0) - (b.display_order ?? b.track_number ?? 0),
    )

  const mapFolders = (items: FolderItem[]): FolderItem[] =>
    items.map((item) => {
      const fromApi = tracksByFolder.get(item.id)
      const existing = item.tracks || []
      let tracks: Track[]
      if (fromApi?.length) {
        if (existing.length > 0) {
          const seen = new Set<string>()
          tracks = []
          for (const stub of existing) {
            const merged = mergeTrack(stub)
            tracks.push(merged)
            if (merged.id) seen.add(merged.id)
          }
          for (const track of fromApi) {
            if (track.id && seen.has(track.id)) continue
            tracks.push(track)
            if (track.id) seen.add(track.id)
          }
        } else {
          tracks = sortFolderTracks(fromApi)
        }
      } else {
        tracks = existing.map(mergeTrack)
      }
      return {
        ...item,
        tracks,
        children: item.children ? mapFolders(item.children) : item.children,
      }
    })

  return {
    ...library,
    folders: mapFolders(library.folders),
  }
}

/** Display-only labels in FolderTree (source data name unchanged). */
const FOLDER_TREE_DISPLAY_NAMES: Record<string, string> = {
  'Curated ID Playlists': 'Curated Crates',
  SERGIK: 'SERGIK EP Collection',
}

/** At Discography root, vault grid only promotes these entries (ids from library JSON / admin scripts). */
const DISCOGRAPHY_VAULT_GRID_FOLDER_IDS = new Set(['folder-playlists', 'artist-sergik'])
/** Main panel FolderTree: curated playlists only (EP hub lives in SergBrowser). */
const VAULT_MAIN_NAV_TREE_ORDER = ['folder-playlists'] as const

interface Playlist {
  id: string
  name: string
  description?: string
  artwork?: string
  trackIds: string[]
  createdAt: string
  is_archived?: boolean
  /** Fan-owned playlist (API `/api/fan/playlists`) */
  isFan?: boolean
}

type MusicLibraryMainProps = {
  libraryData: MusicLibraryData
  setLibraryData: Dispatch<SetStateAction<MusicLibraryData | null>>
  playlists: Playlist[]
  setPlaylists: Dispatch<SetStateAction<Playlist[]>>
}

function MusicLibraryMain({
  libraryData,
  setLibraryData,
  playlists,
  setPlaylists,
}: MusicLibraryMainProps) {
  const {
    currentTrack,
    isPlaying,
    queue,
    currentIndex,
    setCurrentTrack,
    setQueue,
    setCurrentIndex,
    setIsPlaying,
    playTrack,
    playQueue,
    addToQueue,
    nextTrack,
    previousTrack,
    handleShuffle,
    handleQueueChange,
    removeFromQueue,
    setWaveformHost,
    playerChrome,
  } = useMusicPlayer()
  const nowPlayingWaveformRef = useRef<HTMLDivElement | null>(null)
  // Show now-playing chrome only after the user has actually started playback;
  // keep it visible while paused until the session clears the current track.
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false)
  useEffect(() => {
    if (!currentTrack) {
      setHasStartedPlayback(false)
      return
    }
    if (isPlaying) setHasStartedPlayback(true)
  }, [currentTrack, isPlaying])
  const hasNowPlaying = Boolean(currentTrack && hasStartedPlayback)
  const showLibraryNowPlaying =
    hasNowPlaying && currentTrack && !isPlayerFullyExpanded(playerChrome)

  // Signal catalog hydration to pause while playback needs bandwidth
  useEffect(() => {
    try {
      ;(window as any).__sergikVaultPlaybackBusy = Boolean(isPlaying && currentTrack)
    } catch {
      /* ignore */
    }
    return () => {
      try {
        ;(window as any).__sergikVaultPlaybackBusy = false
      } catch {
        /* ignore */
      }
    }
  }, [isPlaying, currentTrack])

  useLayoutEffect(() => {
    const el = nowPlayingWaveformRef.current
    if (!el || !showLibraryNowPlaying) {
      setWaveformHost(null)
      return
    }

    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => {
      setWaveformHost(mq.matches ? el : null)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      setWaveformHost(null)
    }
  }, [showLibraryNowPlaying, setWaveformHost])
  const [fanUser, setFanUser] = useState<{ id: string; email?: string } | null>(null)
  const [fanPlaylists, setFanPlaylists] = useState<Playlist[]>([])
  const [playlistsNeedMembership, setPlaylistsNeedMembership] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [genreFilter, setGenreFilter] = useState<string>('all')
  const [showSmartFiltersPanel, setShowSmartFiltersPanel] = useState(false)
  const [selectedGenreFusions, setSelectedGenreFusions] = useState<string[]>([])
  const [selectedMicrogenres, setSelectedMicrogenres] = useState<string[]>([])
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([])
  const [minEnergy, setMinEnergy] = useState(1)
  const [maxEnergy, setMaxEnergy] = useState(10)
  const [energyPeaksOnly, setEnergyPeaksOnly] = useState(false)
  const [minMoodIntensity, setMinMoodIntensity] = useState(1)
  const [maxMoodIntensity, setMaxMoodIntensity] = useState(10)
  const [crowdTimeFilter, setCrowdTimeFilter] = useState<'all' | 'warm-up' | 'peak' | 'cooldown'>('all')
  const [mixFriendlyOnly, setMixFriendlyOnly] = useState(false)
  const [minMixScore, setMinMixScore] = useState(60)
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null)
  const [displayTracks, setDisplayTracks] = useState<Track[]>([])
  const [displayFolders, setDisplayFolders] = useState<FolderItem[]>([])

  useEffect(() => {
    return subscribeCatalogSync((event) => {
      if (event.entity === 'track' && catalogTrackPatchHasFields(event.patch)) {
        const matches = (track: Track) =>
          track.id === event.entityId ||
          track.audioFileId === event.entityId ||
          track.audio_file_id === event.entityId
        const stamp = (track: Track) => (matches(track) ? applyCatalogTrackPatch(track, event.patch) : track)
        setDisplayTracks((prev) => prev.map(stamp))
        setLibraryData((prev) => {
          if (!prev?.tracks) return prev
          const tracks = prev.tracks.map(stamp)
          if (tracks === prev.tracks) return prev
          const next = { ...prev, tracks }
          seedMusicLibraryCache(next, { persist: true })
          return next
        })
      }
      if (!Object.prototype.hasOwnProperty.call(event.patch, 'artwork')) return
      const folderId = event.folderId
      const playlistId = event.playlistId
      if (!folderId && !playlistId) return
      const artwork = normalizeArtworkPatch(event.patch.artwork ?? null)

      if (folderId) {
        setLibraryData((prev) => {
          if (!prev) return prev
          const folders = stampLibraryCover(prev.folders, folderId, artwork)
          const nextPlaylists = stampPlaylistCovers(prev.playlists || [], {
            folderId,
            playlistId,
            artwork,
          })
          if (folders === prev.folders && nextPlaylists === prev.playlists) return prev
          const next = { ...prev, folders, playlists: nextPlaylists }
          seedMusicLibraryCache(next, { persist: true })
          return next
        })
        setDisplayFolders((prev) => stampLibraryCover(prev, folderId, artwork))
        setDisplayTracks((prev) => {
          if (selectedFolder && catalogItemMatchesCoverEvent(selectedFolder, folderId)) {
            return stampAllTrackArtwork(prev, artwork)
          }
          return prev.map((track) =>
            playerTrackMatchesCoverEvent(track, { folderId }) || track.folderId === folderId
              ? { ...track, artwork }
              : track,
          )
        })
        setSelectedFolder((prev) => {
          if (!prev) return prev
          const [stamped] = stampLibraryCover([prev], folderId, artwork)
          return stamped
        })
      }

      setPlaylists((prev) => stampPlaylistCovers(prev, { folderId, playlistId, artwork }))
      setFanPlaylists((prev) => stampPlaylistCovers(prev, { folderId, playlistId, artwork }))
      setSelectedPlaylist((prev) => {
        if (!prev) return prev
        const [stamped] = stampPlaylistCovers([prev], { folderId, playlistId, artwork })
        return stamped
      })
    })
  }, [setLibraryData, setPlaylists])

  const [tracksOffset, setTracksOffset] = useState(0)
  const [tracksHasMore, setTracksHasMore] = useState(false)
  const [tracksLoadingMore, setTracksLoadingMore] = useState(false)
  const [tracksFolderId, setTracksFolderId] = useState<string | null>(null)
  const [isPlaylistEditMode, setIsPlaylistEditMode] = useState(false)
  const [showAddTrackModal, setShowAddTrackModal] = useState(false)
  const [addTrackQuery, setAddTrackQuery] = useState('')
  const [showSmartPlaylistBuilder, setShowSmartPlaylistBuilder] = useState(false)
  const [isArtworkExpanded, setIsArtworkExpanded] = useState(false)
  const [isSonicDNAExpanded, setIsSonicDNAExpanded] = useState(false)
  const [loadedSonicDnaByTrackId, setLoadedSonicDnaByTrackId] = useState<Record<string, unknown>>({})
  const [sortBy, setSortBy] = useState<'default' | 'title' | 'artist' | 'duration' | 'bpm' | 'genre' | 'subgenre' | 'drumStyle' | 'timeSignature' | 'key' | 'scale' | 'date'>('default')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({
    genre: false,
    subgenre: false,
    drumStyle: false,
    timeSignature: false,
    key: true,  // Always show Key by default
    scale: false,
    date: false,
    bpm: true,  // Always show BPM by default
    duration: true  // Always show Duration by default
  })
  const [folderPath, setFolderPath] = useState<FolderItem[]>([])
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [coverGridMaxWidth, setCoverGridMaxWidth] = useState<number | 'auto'>('auto')
  const [isResizingCoverGrid, setIsResizingCoverGrid] = useState(false)
  const [folderOrder, setFolderOrder] = useState<string[]>([])
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const queueRef = useRef<HTMLDivElement>(null)
  /** Main folder / track panel — scroll into view when opening an album or EP so the song list is visible. */
  const libraryMainPanelRef = useRef<HTMLDivElement>(null)
  const currentTrackRef = useRef<HTMLDivElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const folderDropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const layoutRef = useRef<HTMLDivElement>(null)
  const coverGridWidthRef = useRef(680)
  const coverGridResizeRef = useRef({ startX: 0, startWidth: 680 })

  /**
   * Global artwork pool used as a visual fallback for container tiles whose tracks
   * don't have embedded artwork yet (common for vault MP3s without artwork_url).
   *
   * IMPORTANT: This hook must be above early returns to keep hook order stable.
   */
  const globalArtworkPool = useMemo(() => {
    const unique = new Set<string>()
    const ordered: string[] = []

    const pushRaw = (raw: string | undefined) => {
      if (!raw || !String(raw).trim()) return
      const resolved = resolveImageUrl(raw)
      if (!resolved || unique.has(resolved)) return
      unique.add(resolved)
      ordered.push(resolved)
    }

    const walk = (nodes: FolderItem[] | undefined) => {
      if (!nodes) return
      for (const f of nodes) {
        pushRaw(f.artwork)
        f.tracks?.forEach((t) => pushRaw(trackCoverArtRaw(t)))
        if (f.children?.length) walk(f.children)
      }
    }

    walk(libraryData?.folders)
    return ordered
  }, [libraryData?.folders])

  const getCoverGridLimits = () => {
    const min = 360
    const preferredMax = 860
    const containerWidth = layoutRef.current?.offsetWidth ?? 1200
    const max = Math.max(min + 120, Math.min(preferredMax, containerWidth - 48))
    return { min, max }
  }

  const findFolderInLibrary = (items: FolderItem[], targetId: string): FolderItem | null => {
    for (const item of items) {
      if (item.id === targetId) return item
      if (item.children) {
        const found = findFolderInLibrary(item.children, targetId)
        if (found) return found
      }
    }
    return null
  }

  const TRACKS_PAGE_SIZE = 200

  const resetTrackPagination = (folderId: string | null, hasMore: boolean, offset: number) => {
    setTracksFolderId(folderId)
    setTracksHasMore(hasMore)
    setTracksOffset(offset)
  }

  // When an album/EP (or playlist) shows its track list, bring the panel into view and reset the table scroll.
  useEffect(() => {
    if (displayFolders.length > 0 || displayTracks.length === 0) return
    const panel = libraryMainPanelRef.current
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const tableScroll = queueRef.current
    if (tableScroll) tableScroll.scrollTop = 0
  }, [selectedFolder?.id, selectedPlaylist?.id, displayFolders.length])

  const loadMoreTracks = async () => {
    if (!selectedFolder || tracksLoadingMore || !tracksHasMore) return
    if (tracksFolderId !== selectedFolder.id) return
    setTracksLoadingMore(true)
    try {
      const summaryResult = await fetchTracksSummary(selectedFolder.id, {
        includeArchived: false,
        limit: TRACKS_PAGE_SIZE,
        offset: tracksOffset,
      })
      const nextTracks = summaryResult.tracks || []
      if (nextTracks.length > 0) {
        setDisplayTracks((prev) => {
          const existingIds = new Set(prev.map((t) => t.id))
          const merged = [...prev]
          nextTracks.forEach((t) => {
            if (!existingIds.has(t.id)) merged.push(t)
          })
          return merged
        })
      }
      const nextOffset = tracksOffset + nextTracks.length
      setTracksOffset(nextOffset)
      setTracksHasMore(Boolean(summaryResult.hasMore))
    } catch (error) {
      console.error('Error loading more tracks:', error)
    } finally {
      setTracksLoadingMore(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/auth/session', { credentials: 'include' })
        const d = await r.json()
        if (cancelled) return
        if (d.authenticated && d.user && !d.isAdmin) {
          setFanUser(d.user)
          const pr = await fetch('/api/fan/playlists', { credentials: 'include' })
          const pj = await pr.json().catch(() => ({}))
          if (pr.ok) {
            setFanPlaylists((pj.playlists || []) as Playlist[])
            setPlaylistsNeedMembership(false)
          } else {
            setFanPlaylists([])
            setPlaylistsNeedMembership(pr.status === 401 || pr.status === 403)
          }
        } else {
          setFanUser(null)
          setFanPlaylists([])
          setPlaylistsNeedMembership(false)
        }
      } catch {
        if (!cancelled) {
          setFanUser(null)
          setFanPlaylists([])
          setPlaylistsNeedMembership(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Helper to get all tracks from library (for playlist track resolution)
  const getAllTracksFromLibrary = useMemo(() => {
    if (!libraryData?.folders) return []
    
    const tracksMap = new Map<string, Track>()
    
    const extractTracks = (items: FolderItem[]) => {
      items.forEach(item => {
        if (item.tracks) {
          item.tracks.forEach(track => {
            if (!tracksMap.has(track.id)) {
              tracksMap.set(track.id, track)
            }
          })
        }
        if (item.children) {
          extractTracks(item.children)
        }
      })
    }
    
    extractTracks(libraryData.folders)
    return Array.from(tracksMap.values())
  }, [libraryData])

  // Curator "Playlists" + signed-in fan "My playlists" folders
  const libraryWithPlaylists = useMemo(() => {
    if (!libraryData) {
      return libraryData
    }

    const baseFolders = [...(libraryData.folders || [])]
    const discographyIndex = baseFolders.findIndex(f => f.id === 'folder-discography')
    const insertAt = discographyIndex >= 0 ? discographyIndex + 1 : 0

    const extraFolders: FolderItem[] = []

    if (playlists && playlists.length > 0) {
      const playlistFolders: FolderItem[] = playlists
        .filter((playlist) => !playlist.is_archived)
        .map((playlist) => ({
          id: `playlist-${playlist.id}`,
          name: playlist.name,
          type: 'folder' as const,
          parentId: 'folder-playlists',
          artwork: playlist.artwork,
          tracks: playlist.trackIds
            .map((trackId) => getAllTracksFromLibrary.find((t) => t.id === trackId))
            .filter(Boolean) as Track[],
          children: [],
        }))

      extraFolders.push({
        id: 'folder-playlists',
        name: 'Playlists',
        type: 'folder',
        parentId: null,
        children: playlistFolders,
        tracks: [],
      })
    }

    if (fanUser) {
      const fanFolders: FolderItem[] = fanPlaylists.map((fp) => ({
        id: `fan-playlist-${fp.id}`,
        name: fp.name,
        type: 'folder' as const,
        parentId: 'folder-fan-playlists',
        tracks: fp.trackIds
          .map((trackId) => getAllTracksFromLibrary.find((t) => t.id === trackId))
          .filter(Boolean) as Track[],
        children: [],
      }))

      extraFolders.push({
        id: 'folder-fan-playlists',
        name: 'My playlists',
        type: 'folder',
        parentId: null,
        children: fanFolders,
        tracks: [],
      })
    }

    if (extraFolders.length === 0) {
      return libraryData
    }

    const folders = [...baseFolders.slice(0, insertAt), ...extraFolders, ...baseFolders.slice(insertAt)]

    return {
      ...libraryData,
      folders,
    }
  }, [libraryData, playlists, fanPlaylists, fanUser, getAllTracksFromLibrary])

  useEffect(() => {
    if (!selectedPlaylist) {
      setIsPlaylistEditMode(false)
      setShowAddTrackModal(false)
      setAddTrackQuery('')
    }
  }, [selectedPlaylist?.id])

  useEffect(() => {
    const { min, max } = getCoverGridLimits()
    const clamped = Math.min(max, Math.max(min, coverGridWidthRef.current))
    if (clamped !== coverGridWidthRef.current) {
      coverGridWidthRef.current = clamped
      setCoverGridMaxWidth(clamped)
    }
    const handleResize = () => {
      const { min: nextMin, max: nextMax } = getCoverGridLimits()
      const next = Math.min(nextMax, Math.max(nextMin, coverGridWidthRef.current))
      if (next !== coverGridWidthRef.current) {
        coverGridWidthRef.current = next
        setCoverGridMaxWidth(next)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isResizingCoverGrid) return
    const handleMove = (event: PointerEvent) => {
      const delta = event.clientX - coverGridResizeRef.current.startX
      const nextWidth = coverGridResizeRef.current.startWidth + delta
      const { min, max } = getCoverGridLimits()
      const clamped = Math.min(max, Math.max(min, nextWidth))
      coverGridWidthRef.current = clamped
      setCoverGridMaxWidth(clamped)
    }
    const handleUp = () => setIsResizingCoverGrid(false)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingCoverGrid])

  // Flatten all tracks from library (deduplicated by ID)
  const allTracks = useMemo(() => {
    if (!libraryData?.folders) return []
    
    const tracksMap = new Map<string, Track>()
    
    const extractTracks = (items: FolderItem[]) => {
      items.forEach(item => {
        if (item.tracks) {
          item.tracks.forEach(track => {
            // Only add track if we haven't seen this ID before
            if (!tracksMap.has(track.id)) {
              tracksMap.set(track.id, track)
            }
          })
        }
        if (item.children) {
          extractTracks(item.children)
        }
      })
    }
    
    extractTracks(libraryData.folders)
    return Array.from(tracksMap.values())
  }, [libraryData])

  // OPTIMIZATION: defer search filtering work to keep typing smooth
  const deferredSearchQuery = useDeferredValue(searchQuery)

  // Available genres for filter tabs
  const availableGenres = useMemo(() => {
    const genres = new Set<string>()
    allTracks.forEach(track => {
      if (track.sonic_dna) {
        try {
          const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
          const genre = dna?.genres?.primaryGenres?.[0] || 
                        dna?.comprehensive?.genres?.primary?.[0] ||
                        dna?.genres?.primary?.[0] || 
                        dna?.genre
          if (genre) genres.add(genre)
        } catch (e) {}
      }
    })
    return Array.from(genres).sort()
  }, [allTracks])

  const availableGenreFusions = useMemo(() => {
    const fusions = new Set<string>()
    allTracks.forEach(track => {
      if (!track.sonic_dna) return
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const fusion = dna?.genres?.genreFusion || dna?.comprehensive?.genres?.fusion || ''
        if (fusion) fusions.add(fusion)
      } catch {}
    })
    return Array.from(fusions).sort()
  }, [allTracks])

  const availableMicrogenres = useMemo(() => {
    const micro = new Set<string>()
    allTracks.forEach(track => {
      if (!track.sonic_dna) return
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const list = dna?.genres?.microgenres || dna?.comprehensive?.genres?.microgenres || dna?.genres?.subgenres || []
        if (Array.isArray(list)) {
          list.forEach((item: string) => item && micro.add(item))
        }
      } catch {}
    })
    return Array.from(micro).sort()
  }, [allTracks])

  const availableEmotions = useMemo(() => {
    const emotions = new Set<string>()
    allTracks.forEach(track => {
      if (!track.sonic_dna) return
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const list = dna?.emotional?.primaryEmotions || dna?.comprehensive?.emotional?.primaryEmotions || []
        if (Array.isArray(list)) {
          list.forEach((item: string) => item && emotions.add(item))
        }
      } catch {}
    })
    return Array.from(emotions).sort()
  }, [allTracks])

  const applySmartFilters = (items: Track[]) => {
    let results = items

    const getEnergy = (track: Track): number => {
      if (!track.sonic_dna) {
        if (track.bpm) {
          if (track.bpm < 90) return 4
          if (track.bpm < 110) return 5
          if (track.bpm < 125) return 6
          if (track.bpm < 135) return 7
          return 8
        }
        return SERGIK_DEFAULTS.energy
      }
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        return dna?.comprehensive?.energy?.level || 
               dna?.energy?.level || 
               dna?.musical?.energy ||
               SERGIK_DEFAULTS.energy
      } catch {
        return SERGIK_DEFAULTS.energy
      }
    }

    const getBpm = (track: Track): number => displayTrackBpm(track) || SERGIK_DEFAULTS.bpm

    const getKey = (track: Track): string => displayTrackKey(track) || SERGIK_DEFAULTS.key

    const getMoodIntensity = (track: Track): number | null => {
      if (!track.sonic_dna) return null
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const direct = dna?.emotional?.intensity || dna?.comprehensive?.emotional?.intensity || null
        if (typeof direct === 'number') {
          if (direct <= 1) return Math.round(direct * 10)
          return Math.min(10, Math.max(1, Math.round(direct)))
        }
        const transitions = dna?.emotional?.moodTransitions || dna?.comprehensive?.emotional?.moodTransitions || []
        if (Array.isArray(transitions) && transitions.length > 0) {
          const avg = transitions.reduce((sum: number, item: any) => sum + (item?.intensity || 0), 0) / transitions.length
          if (avg <= 1) return Math.round(avg * 10)
          return Math.min(10, Math.max(1, Math.round(avg)))
        }
      } catch {}
      return null
    }

    const getCrowdTime = (track: Track): 'warm-up' | 'peak' | 'cooldown' => {
      const bpm = getBpm(track)
      const energy = getEnergy(track)
      if (bpm < 105 || energy <= 4) return 'cooldown'
      if (bpm >= 126 || energy >= 7) return 'peak'
      return 'warm-up'
    }

    const getMixScore = (track: Track, baseTrack: Track): number => {
      const bpm = getBpm(track)
      const baseBpm = getBpm(baseTrack)
      const baseKey = getKey(baseTrack)
      const trackKey = getKey(track)
      const diffs = [
        Math.abs(bpm - baseBpm),
        Math.abs(bpm - baseBpm * 2),
        Math.abs(bpm - baseBpm / 2),
      ]
      const bpmDiff = Math.min(...diffs)
      const bpmScore = Math.max(0, 50 - Math.min(50, bpmDiff * 5))
      let keyScore = 0
      if (trackKey && baseKey) {
        if (trackKey.toUpperCase() === baseKey.toUpperCase()) keyScore = 50
        else if (areKeysCompatible(baseKey.toUpperCase(), trackKey.toUpperCase())) keyScore = 35
      }
      return Math.round(bpmScore + keyScore)
    }

    // Genre filter
    if (genreFilter !== 'all') {
      results = results.filter(track => {
        if (!track.sonic_dna) return false
        try {
          const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
          const genre = dna?.genres?.primaryGenres?.[0] || 
                        dna?.comprehensive?.genres?.primary?.[0] ||
                        dna?.genres?.primary?.[0] || 
                        dna?.genre || ''
          return genre.toLowerCase().includes(genreFilter.toLowerCase())
        } catch {
          return false
        }
      })
    }
    
    // Genre fusion multi-select
    if (selectedGenreFusions.length > 0) {
      const targets = selectedGenreFusions.map((fusion) => fusion.toLowerCase())
      results = results.filter(track => {
        if (!track.sonic_dna) return false
        try {
          const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
          const fusion = dna?.genres?.genreFusion || dna?.comprehensive?.genres?.fusion || ''
          const value = fusion.toLowerCase()
          return targets.some(target => value.includes(target))
        } catch {
          return false
        }
      })
    }

    // Microgenre multi-select
    if (selectedMicrogenres.length > 0) {
      const targets = selectedMicrogenres.map((micro) => micro.toLowerCase())
      results = results.filter(track => {
        if (!track.sonic_dna) return false
        try {
          const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
          const micro = dna?.genres?.microgenres || dna?.comprehensive?.genres?.microgenres || dna?.genres?.subgenres || []
          const list = Array.isArray(micro) ? micro.map((item: string) => item.toLowerCase()) : []
          return list.some((item: string) => targets.includes(item))
        } catch {
          return false
        }
      })
    }

    // Mood cluster: primary emotions
    if (selectedEmotions.length > 0) {
      const targets = selectedEmotions.map((emotion) => emotion.toLowerCase())
      results = results.filter(track => {
        if (!track.sonic_dna) return false
        try {
          const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
          const emotions = dna?.emotional?.primaryEmotions || dna?.comprehensive?.emotional?.primaryEmotions || []
          if (!Array.isArray(emotions) || emotions.length === 0) return false
          return emotions.some((emotion: string) => targets.includes(emotion.toLowerCase()))
        } catch {
          return false
        }
      })
    }

    // Mood intensity range
    if (minMoodIntensity > 1 || maxMoodIntensity < 10) {
      results = results.filter(track => {
        const intensity = getMoodIntensity(track)
        if (!intensity) return false
        return intensity >= minMoodIntensity && intensity <= maxMoodIntensity
      })
    }

    // Energy range + peaks
    if (minEnergy > 1 || maxEnergy < 10) {
      results = results.filter(track => {
        const energy = getEnergy(track)
        return energy >= minEnergy && energy <= maxEnergy
      })
    }
    if (energyPeaksOnly) {
      results = results.filter(track => getEnergy(track) >= 8)
    }

    // Crowd time
    if (crowdTimeFilter !== 'all') {
      results = results.filter(track => getCrowdTime(track) === crowdTimeFilter)
    }

    // Mix-friendly (requires current track)
    if (mixFriendlyOnly && currentTrack) {
      results = results.filter(track => getMixScore(track, currentTrack) >= minMixScore)
    }

    return results
  }

  // Filter tracks based on search, genre, and smart filters
  const filteredTracks = useMemo(() => {
    let tracks = allTracks
    
    // Search filter
    if (deferredSearchQuery.trim()) {
      const query = deferredSearchQuery.toLowerCase()
      tracks = tracks.filter(track => 
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query)
      )
    }
    
    tracks = applySmartFilters(tracks)
    
    return tracks
  }, [
    allTracks,
    deferredSearchQuery,
    genreFilter,
    selectedGenreFusions,
    selectedMicrogenres,
    selectedEmotions,
    minEnergy,
    maxEnergy,
    energyPeaksOnly,
    minMoodIntensity,
    maxMoodIntensity,
    crowdTimeFilter,
    mixFriendlyOnly,
    minMixScore,
    currentTrack
  ])

  const filteredDisplayTracks = useMemo(() => {
    return applySmartFilters(displayTracks)
  }, [
    displayTracks,
    genreFilter,
    selectedGenreFusions,
    selectedMicrogenres,
    selectedEmotions,
    minEnergy,
    maxEnergy,
    energyPeaksOnly,
    minMoodIntensity,
    maxMoodIntensity,
    crowdTimeFilter,
    mixFriendlyOnly,
    minMixScore,
    currentTrack
  ])

  // Helper function to check if sonic_dna has actual analysis data (not just status)
  const hasAnalysisData = (sonicDna: any): boolean => {
    if (!sonicDna) return false
    try {
      const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna
      
      // If it's just status metadata (has status/hasData but no actual analysis fields)
      if (dna.status && dna.hasData && !dna.genres && !dna.musical && !dna.technical && !dna.drums && !dna.comprehensive && !dna.emotional && !dna.historical) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[hasAnalysisData] Status only:', Object.keys(dna))
        }
        return false
      }
      
      // Check if it has actual analysis data - check all possible paths
      const hasData = !!(dna.genres || dna.musical || dna.technical || dna.drums || dna.comprehensive || dna.emotional || dna.historical || dna.regional || dna.cultural)
      
      if (process.env.NODE_ENV === 'development' && !hasData) {
        console.log('[hasAnalysisData] No analysis data found. Keys:', Object.keys(dna))
      }
      
      return hasData
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[hasAnalysisData] Error:', e)
      }
      return false
    }
  }

  // Debug logging is expensive (JSON.parse + lots of derived lookups). Keep it behind an explicit flag.
  const DEBUG_SONIC_DNA = process.env.NEXT_PUBLIC_DEBUG_SONIC_DNA === 'true'
  useEffect(() => {
    if (!DEBUG_SONIC_DNA) return
    if (process.env.NODE_ENV !== 'development') return
    if (displayTracks.length <= 0) return

    console.log('=== DISPLAY TRACKS DEBUG ===')
    console.log('Total tracks:', displayTracks.length)
    displayTracks.slice(0, 3).forEach((track, idx) => {
      const dna = track.sonic_dna
        ? (typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna)
        : null
      console.log(`Track ${idx + 1}:`, {
        title: track.title,
        hasSonicDna: !!track.sonic_dna,
        sonicDnaType: typeof track.sonic_dna,
        sonicDnaKeys: dna ? Object.keys(dna) : [],
      })
    })
    console.log('=== END DEBUG ===')
  }, [DEBUG_SONIC_DNA, displayTracks])

  // SERGIK DNA defaults for missing data (based on knowledge base)
  const SERGIK_DEFAULTS = {
    genre: 'House', // Most common SERGIK genre
    subgenre: 'Tech House',
    drumStyle: '4-on-the-floor',
    timeSignature: '4/4',
    key: '10B', // D Major - SERGIK's primary key (31%)
    scale: 'Major',
    bpm: 125, // SERGIK sweet spot
    energy: 6, // SERGIK average energy
  }

  // Drum pattern signatures for genre recognition
  const DRUM_PATTERN_SIGNATURES = {
    // House family - kick on every beat
    'house': { kickPattern: '4-on-the-floor', hatPattern: 'offbeat-8ths', bpmRange: [118, 132], snarePosition: 'backbeat' },
    'tech_house': { kickPattern: '4-on-the-floor', hatPattern: 'rolling-16ths', bpmRange: [122, 130], snarePosition: 'backbeat' },
    'deep_house': { kickPattern: '4-on-the-floor', hatPattern: 'sparse-swing', bpmRange: [118, 125], snarePosition: 'backbeat' },
    // Techno family
    'techno': { kickPattern: '4-on-the-floor', hatPattern: 'driving-16ths', bpmRange: [128, 145], snarePosition: 'none-or-clap' },
    'minimal': { kickPattern: 'sparse-kick', hatPattern: 'minimal-percs', bpmRange: [120, 135], snarePosition: 'syncopated' },
    // Hip-hop family - kick on 1, snare on 2&4
    'hiphop': { kickPattern: 'boom-bap', hatPattern: 'swing-hats', bpmRange: [80, 100], snarePosition: '2-and-4' },
    'boom_bap': { kickPattern: 'boom-bap', hatPattern: 'swing-hats', bpmRange: [85, 98], snarePosition: '2-and-4' },
    'trap': { kickPattern: '808-sub', hatPattern: 'triplet-rolls', bpmRange: [130, 170], snarePosition: 'syncopated' },
    'lofi': { kickPattern: 'boom-bap', hatPattern: 'dusty-swing', bpmRange: [70, 90], snarePosition: '2-and-4' },
    // Funk/Soul family
    'funk': { kickPattern: 'syncopated-funk', hatPattern: '16th-ghost', bpmRange: [95, 115], snarePosition: 'syncopated' },
    'disco': { kickPattern: '4-on-the-floor', hatPattern: 'open-hat-disco', bpmRange: [115, 130], snarePosition: 'backbeat' },
    'soul': { kickPattern: 'laid-back', hatPattern: 'sparse-feel', bpmRange: [70, 100], snarePosition: '2-and-4' },
    // Electronic/Other
    'dnb': { kickPattern: 'breakbeat', hatPattern: 'chopped-breaks', bpmRange: [160, 180], snarePosition: 'syncopated' },
    'reggaeton': { kickPattern: 'dembow', hatPattern: 'dembow-hats', bpmRange: [88, 100], snarePosition: 'dembow' },
    'ambient': { kickPattern: 'sparse-or-none', hatPattern: 'none', bpmRange: [60, 120], snarePosition: 'none' },
  }

  // Extract drum pattern info from sonic_dna
  const extractDrumPatternInfo = (track: Track): { kickPattern?: string; hatPattern?: string; snarePattern?: string; swing?: number } => {
    if (!track.sonic_dna) return {}
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return {
        kickPattern: dna?.drums?.kickPattern || dna?.drums?.patternType || dna?.comprehensive?.drums?.kickPattern,
        hatPattern: dna?.drums?.hihatPattern || dna?.drums?.hatStyle || dna?.comprehensive?.drums?.hihatPattern,
        snarePattern: dna?.drums?.snarePattern || dna?.drums?.snareStyle,
        swing: dna?.drums?.swing || dna?.drums?.groove?.swing,
      }
    } catch {
      return {}
    }
  }

  // Infer genre from BPM AND drum pattern recognition
  const inferGenreFromPatterns = (bpm: number | undefined, drumInfo: { kickPattern?: string; hatPattern?: string; snarePattern?: string; swing?: number }): string => {
    const { kickPattern, hatPattern, snarePattern, swing } = drumInfo
    const bpmVal = bpm || SERGIK_DEFAULTS.bpm
    
    // Pattern-based detection (prioritize over BPM alone)
    if (kickPattern || hatPattern || snarePattern) {
      const kick = (kickPattern || '').toLowerCase()
      const hat = (hatPattern || '').toLowerCase()
      const snare = (snarePattern || '').toLowerCase()
      
      // Trap detection: 808s + triplet hi-hats
      if (kick.includes('808') || hat.includes('triplet') || hat.includes('roll')) {
        if (bpmVal >= 130) return 'Trap'
      }
      
      // Boom Bap detection: swing + classic patterns
      if (kick.includes('boom') || kick.includes('bap') || (swing && swing > 50)) {
        if (bpmVal >= 80 && bpmVal <= 100) return 'Hip-Hop'
      }
      
      // House detection: 4-on-the-floor + offbeat hats
      if (kick.includes('4-on-the-floor') || kick.includes('four') || kick.includes('four-to-the-floor')) {
        if (hat.includes('offbeat') || hat.includes('open')) {
          if (bpmVal >= 118 && bpmVal <= 132) return 'House'
        }
        if (hat.includes('rolling') || hat.includes('16th')) {
          if (bpmVal >= 122 && bpmVal <= 130) return 'Tech House'
        }
        // Disco uses 4-on-floor but with more open hats
        if (hat.includes('disco') || hat.includes('open')) {
          if (bpmVal >= 115 && bpmVal <= 130) return 'Disco'
        }
      }
      
      // Funk detection: syncopated patterns
      if (kick.includes('syncopat') || kick.includes('funk') || snare.includes('ghost')) {
        if (bpmVal >= 95 && bpmVal <= 115) return 'Funk'
      }
      
      // Breakbeat/DnB detection
      if (kick.includes('break') || kick.includes('chop') || hat.includes('break')) {
        if (bpmVal >= 160) return 'Drum & Bass'
        if (bpmVal >= 130) return 'Breakbeat'
      }
      
      // Reggaeton/Dembow detection
      if (kick.includes('dembow') || snare.includes('dembow')) {
        return 'Reggaeton'
      }
      
      // Techno detection: driving, minimal patterns
      if (kick.includes('minimal') || kick.includes('driving') || hat.includes('driving')) {
        if (bpmVal >= 128 && bpmVal <= 145) return 'Techno'
      }
      
      // Lo-fi detection: dusty, tape-like
      if (hat.includes('dusty') || hat.includes('lofi') || hat.includes('lo-fi')) {
        return 'Lo-Fi'
      }
    }
    
    // BPM-based fallback with SERGIK genre DNA distribution
    // SERGIK DNA: Hip-Hop 42%, House 8%, Funk 17%, Soul 7%
    if (bpmVal < 85) return 'Hip-Hop'
    if (bpmVal >= 85 && bpmVal < 95) {
      // Could be slow Hip-Hop, Lo-Fi, or R&B - use SERGIK preference
      return swing && swing > 40 ? 'Hip-Hop' : 'Lo-Fi'
    }
    if (bpmVal >= 95 && bpmVal < 108) return 'Funk' // SERGIK's funk zone
    if (bpmVal >= 108 && bpmVal < 118) return 'Disco'
    if (bpmVal >= 118 && bpmVal < 126) return 'House' // Classic house range
    if (bpmVal >= 126 && bpmVal < 132) return 'Tech House'
    if (bpmVal >= 132 && bpmVal < 145) return 'Techno'
    if (bpmVal >= 145 && bpmVal < 165) return 'Trance'
    if (bpmVal >= 165) return 'Drum & Bass'
    
    return SERGIK_DEFAULTS.genre
  }

  // Infer drum style from genre and detected patterns
  const inferDrumStyleFromGenre = (genre: string, bpm: number | undefined, drumInfo?: { kickPattern?: string; hatPattern?: string }): string => {
    // If we have actual drum info, use it
    if (drumInfo?.kickPattern) return drumInfo.kickPattern
    
    const g = genre.toLowerCase()
    
    // Map genre to typical drum style
    if (g.includes('hip') || g.includes('hop') || g.includes('boom') || g.includes('bap')) return 'Boom Bap'
    if (g.includes('trap')) return 'Trap 808s'
    if (g.includes('lo-fi') || g.includes('lofi')) return 'Dusty Boom Bap'
    if (g.includes('funk')) return 'Syncopated Funk'
    if (g.includes('disco')) return '4-on-the-floor Disco'
    if (g.includes('soul') || g.includes('r&b')) return 'Laid-back Groove'
    if (g.includes('tech house')) return 'Driving 4-on-the-floor'
    if (g.includes('deep house')) return 'Swinging 4-on-the-floor'
    if (g.includes('house')) return '4-on-the-floor'
    if (g.includes('techno')) return 'Minimal Techno'
    if (g.includes('dnb') || g.includes('drum') && g.includes('bass')) return 'Breakbeat'
    if (g.includes('reggaeton') || g.includes('dembow')) return 'Dembow'
    if (g.includes('ambient') || g.includes('chill')) return 'Sparse Percussion'
    
    // BPM-based fallback
    if (bpm && bpm < 90) return 'Boom Bap'
    if (bpm && bpm >= 118 && bpm < 135) return '4-on-the-floor'
    if (bpm && bpm >= 135) return 'Driving'
    
    return SERGIK_DEFAULTS.drumStyle
  }

  // Helper functions to extract metadata from sonic_dna with SERGIK fallbacks
  const withLibraryFields = (track: Track): Track => {
    const match = allTracks.find((item) => item.id === track.id)
    if (!match) return track
    return {
      ...track,
      genre: track.genre || match.genre,
      subgenre: track.subgenre || match.subgenre,
      bpm: track.bpm || match.bpm,
      key_signature: track.key_signature || match.key_signature,
      sonic_dna: track.sonic_dna || match.sonic_dna,
    }
  }

  const currentTrackForDna = useMemo(() => {
    if (!currentTrack) return null
    const loaded = loadedSonicDnaByTrackId[currentTrack.id]
    return loaded ? { ...currentTrack, sonic_dna: loaded } : currentTrack
  }, [currentTrack, loadedSonicDnaByTrackId])

  const handleSonicDnaLoaded = useCallback(
    (dna: unknown) => {
      if (!currentTrack?.id) return
      setLoadedSonicDnaByTrackId((prev) => ({
        ...prev,
        [currentTrack.id]: dna,
      }))
    },
    [currentTrack?.id],
  )

  const dnaDeckTrack = currentTrackForDna || currentTrack

  const getTrackGenre = (track: Track): string => displayTrackGenre(withLibraryFields(track))

  const getTrackSubgenre = (track: Track): string => displayTrackSubgenre(withLibraryFields(track))

  const getTrackDrumStyle = (track: Track): string => displayTrackDrumStyle(withLibraryFields(track))

  const getTrackTimeSignature = (track: Track): string => displayTrackTimeSignature(withLibraryFields(track)) || '4/4'

  const getTrackKey = (track: Track): string => displayTrackKey(withLibraryFields(track))

  const getTrackScale = (track: Track): string => displayTrackScale(withLibraryFields(track))

  const getTrackDate = (track: Track): string => {
    // Try multiple date sources
    if (track.created_at) return track.created_at
    if (track.date) return track.date
    if (track.year) return track.year.toString()
    // Default to current year for SERGIK productions
    return new Date().getFullYear().toString()
  }

  // Get track BPM with fallback
  const getTrackBpm = (track: Track): number => displayTrackBpm(withLibraryFields(track)) || SERGIK_DEFAULTS.bpm

  // =========== ENRICHED DATA HELPERS ===========
  
  // Get track mood from enriched sonic_dna
  const getTrackMood = (track: Track): string | null => {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.emotional?.mood || 
             dna?.mood ||
             dna?.comprehensive?.emotional?.mood ||
             null
    } catch {
      return null
    }
  }

  // Get track description from enriched sonic_dna
  const getTrackDescription = (track: Track): string | null => {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.description || 
             dna?.summary ||
             dna?.comprehensive?.description ||
             null
    } catch {
      return null
    }
  }

  const handleCoverGridResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    coverGridResizeRef.current = { startX: event.clientX, startWidth: coverGridWidthRef.current }
    setIsResizingCoverGrid(true)
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  // Folder drag-and-drop reordering handlers
  const handleFolderDragStart = (e: React.DragEvent<HTMLDivElement>, folderId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', folderId)
    setDraggedFolderId(folderId)
  }

  const handleFolderDragOver = (e: React.DragEvent<HTMLDivElement>, folderId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (folderId !== draggedFolderId) {
      setDragOverFolderId(folderId)
    }
  }

  const handleFolderDragLeave = () => {
    setDragOverFolderId(null)
  }

  const handleFolderDrop = (e: React.DragEvent<HTMLDivElement>, targetFolderId: string) => {
    e.preventDefault()
    const sourceFolderId = e.dataTransfer.getData('text/plain')
    
    if (sourceFolderId && sourceFolderId !== targetFolderId) {
      setDisplayFolders(prevFolders => {
        const newFolders = [...prevFolders]
        const sourceIndex = newFolders.findIndex(f => f.id === sourceFolderId)
        const targetIndex = newFolders.findIndex(f => f.id === targetFolderId)
        
        if (sourceIndex !== -1 && targetIndex !== -1) {
          const [removed] = newFolders.splice(sourceIndex, 1)
          newFolders.splice(targetIndex, 0, removed)
        }
        
        // Save the new order
        setFolderOrder(newFolders.map(f => f.id))
        return newFolders
      })
    }
    
    setDraggedFolderId(null)
    setDragOverFolderId(null)
  }

  const handleFolderDragEnd = () => {
    setDraggedFolderId(null)
    setDragOverFolderId(null)
  }

  // Get DNA match score from enriched sonic_dna
  const getTrackDnaMatchScore = (track: Track): number | null => {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?._enrichment?.dnaMatchScore || 
             dna?.dnaMatchScore ||
             null
    } catch {
      return null
    }
  }

  // Get mixing recommendations from enriched sonic_dna (or derive from measured DNA)
  const getTrackMixingRecommendations = (track: Track): { bpmRange?: { min: number; max: number }; compatibleKeys?: string[]; mixableGenres?: string[] } | null => {
    return deriveMixingRecommendations(track)
  }

  // Get production era from enriched sonic_dna
  const getTrackProductionEra = (track: Track): string | null => {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.production?.era || 
             dna?.comprehensive?.production?.era ||
             null
    } catch {
      return null
    }
  }

  // Get instrument signatures from enriched sonic_dna
  const getTrackInstruments = (track: Track): string[] | null => {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.production?.instrumentSignatures || 
             dna?.instruments ||
             dna?.comprehensive?.instruments ||
             null
    } catch {
      return null
    }
  }

  // Get emotional characteristics from enriched sonic_dna
  const getTrackEmotions = (track: Track): string[] | null => {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.emotional?.primaryEmotions || 
             dna?.characteristics ||
             null
    } catch {
      return null
    }
  }

  const hasSmartFilters =
    selectedGenreFusions.length > 0 ||
    selectedMicrogenres.length > 0 ||
    selectedEmotions.length > 0 ||
    minEnergy !== 1 ||
    maxEnergy !== 10 ||
    energyPeaksOnly ||
    minMoodIntensity !== 1 ||
    maxMoodIntensity !== 10 ||
    crowdTimeFilter !== 'all' ||
    mixFriendlyOnly

  const resetSmartFilters = () => {
    setSelectedGenreFusions([])
    setSelectedMicrogenres([])
    setSelectedEmotions([])
    setMinEnergy(1)
    setMaxEnergy(10)
    setEnergyPeaksOnly(false)
    setMinMoodIntensity(1)
    setMaxMoodIntensity(10)
    setCrowdTimeFilter('all')
    setMixFriendlyOnly(false)
    setMinMixScore(60)
  }

  const handleTrackDropOnFolder = async (trackId: string, targetFolder: FolderItem) => {
    if (!trackId || !targetFolder?.id) return
    if (targetFolder.id === 'folder-all-tracks') {
      alert('Drop onto a specific folder or subfolder instead of All Tracks.')
      return
    }

    const track = allTracks.find((item) => item.id === trackId) || displayTracks.find((item) => item.id === trackId)
    const sourceFolderId = track?.folderId || (track as any)?.folder_id || ''
    if (sourceFolderId && sourceFolderId === targetFolder.id) {
      return
    }

    try {
      await updateTrack(trackId, { folderId: targetFolder.id })
      const updatedLibrary = await fetchMusicLibrary({ skipCache: true })
      const refreshedTracks = await fetchAllTracksSummaryForHydration({ includeArchived: true })
      const hydrated = hydrateLibraryWithTracks(updatedLibrary, refreshedTracks)
      if (hydrated) seedMusicLibraryCache(hydrated, { persist: true })
      setLibraryData(hydrated || updatedLibrary)

      if (selectedFolder && (selectedFolder.id === targetFolder.id || selectedFolder.id === sourceFolderId)) {
        const refreshed = findFolderInLibrary(updatedLibrary.folders, selectedFolder.id) || selectedFolder
        await handleFolderSelect(refreshed)
      }
    } catch (error: any) {
      alert(`Failed to move track: ${error?.message || 'Unknown error'}`)
    }
  }

  // Sorted tracks based on sortBy and sortOrder
  const sortedDisplayTracks = useMemo(() => {
    if (!filteredDisplayTracks.length) return []
    
    const tracks = [...filteredDisplayTracks]
    
    if (sortBy === 'default') {
      return tracks
    }
    
    return tracks.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          break
        case 'artist':
          comparison = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' })
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'duration':
          comparison = a.duration - b.duration
          break
        case 'bpm':
          const aBpm = a.bpm || 0
          const bBpm = b.bpm || 0
          comparison = aBpm - bBpm
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'genre':
          comparison = getTrackGenre(a).localeCompare(getTrackGenre(b), undefined, { sensitivity: 'base' })
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'subgenre':
          comparison = getTrackSubgenre(a).localeCompare(getTrackSubgenre(b), undefined, { sensitivity: 'base' })
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'drumStyle':
          comparison = getTrackDrumStyle(a).localeCompare(getTrackDrumStyle(b), undefined, { sensitivity: 'base' })
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'timeSignature':
          comparison = getTrackTimeSignature(a).localeCompare(getTrackTimeSignature(b), undefined, { sensitivity: 'base' })
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'key':
          comparison = getTrackKey(a).localeCompare(getTrackKey(b), undefined, { sensitivity: 'base' })
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'scale':
          comparison = getTrackScale(a).localeCompare(getTrackScale(b), undefined, { sensitivity: 'base' })
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
        case 'date':
          const aDate = getTrackDate(a)
          const bDate = getTrackDate(b)
          if (aDate && bDate) {
            comparison = new Date(aDate).getTime() - new Date(bDate).getTime()
          } else if (aDate) {
            comparison = -1
          } else if (bDate) {
            comparison = 1
          }
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          }
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [filteredDisplayTracks, sortBy, sortOrder])

  const displayFoldersForGrid = useMemo(() => {
    if (selectedFolder?.id !== 'folder-discography') return displayFolders
    const picked = displayFolders.filter((f) => DISCOGRAPHY_VAULT_GRID_FOLDER_IDS.has(f.id))
    return picked.length > 0 ? picked : displayFolders
  }, [displayFolders, selectedFolder?.id])

  /** Folder-grid + track-list artwork for `<link rel=preload>` (runs even when default view is folders-only). */
  const artworkPreloadUrls = useMemo(() => {
    const out: string[] = []
    const add = (url: string) => {
      if (url && !out.includes(url)) out.push(url)
    }

    let foldersToPreload = displayFoldersForGrid
    if (foldersToPreload.length === 0 && libraryData?.folders?.length) {
      const roots = libraryWithPlaylists?.folders || libraryData.folders
      const disc = roots.find((f) => f.id === 'folder-discography')
      if (disc?.children?.length) {
        const visible = filterVisibleFolders(disc.children)
        const picked = visible.filter((f) => DISCOGRAPHY_VAULT_GRID_FOLDER_IDS.has(f.id))
        foldersToPreload = picked.length > 0 ? picked : visible
      }
    }

    for (const folder of foldersToPreload) {
      getFolderCoverArtworkUrls(folder).forEach(add)
    }
    displayTracks
      .filter((t) => t.artwork)
      .slice(0, 30)
      .forEach((t) => add(resolveImageUrl(t.artwork!)))
    return out.slice(0, 48)
  }, [displayFoldersForGrid, displayTracks, libraryData, libraryWithPlaylists])

  // Preload folder covers + track artwork (runs for folder-only default view, not only track lists)
  useEffect(() => {
    if (!libraryData || artworkPreloadUrls.length === 0) return

    artworkPreloadUrls.forEach((artworkUrl, index) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = artworkUrl
      link.setAttribute('fetchpriority', index < 14 ? 'high' : 'auto')

      if (!document.querySelector(`link[href="${artworkUrl}"]`)) {
        document.head.appendChild(link)
      }
    })
  }, [libraryData, artworkPreloadUrls])

  const vaultMainNavTreeItems = useMemo(() => {
    const roots = libraryWithPlaylists?.folders || libraryData?.folders || []
    return VAULT_MAIN_NAV_TREE_ORDER.map((id) => findFolderInLibrary(roots, id)).filter(
      (f): f is FolderItem => Boolean(f)
    )
  }, [libraryWithPlaylists?.folders, libraryData?.folders])

  // Build folder path from selected folder
  useEffect(() => {
    const foldersToUse = libraryWithPlaylists?.folders || libraryData?.folders
    if (selectedFolder && foldersToUse) {
      const buildPath = (targetId: string, items: FolderItem[], path: FolderItem[] = []): FolderItem[] | null => {
        for (const item of items) {
          if (item.id === targetId) {
            return [...path, item]
          }
          if (item.children) {
            const found = buildPath(targetId, item.children, [...path, item])
            if (found) return found
          }
        }
        return null
      }
      
      const path = buildPath(selectedFolder.id, foldersToUse) || []
      setFolderPath(path)
    } else {
      setFolderPath([])
    }
  }, [selectedFolder, libraryData, libraryWithPlaylists])

  // Do not auto-open the old folder-grid landing view; SergBrowser is the default browse UI.

  // Auto-scroll to current track
  useEffect(() => {
    if (currentTrackRef.current && displayTracks.length > 0) {
      currentTrackRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest' 
      })
    }
  }, [currentTrack, displayTracks.length])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false)
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setIsColumnMenuOpen(false)
      }
    }
    
    if (isSortMenuOpen || isColumnMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSortMenuOpen, isColumnMenuOpen])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          // Toggle play/pause - this will be handled by MusicPlayer
          break
        case 'ArrowUp':
          e.preventDefault()
          previousTrack()
          break
        case 'ArrowDown':
          e.preventDefault()
          nextTrack()
          break
        case 'Delete':
        case 'Backspace':
          if (queue.length > 0 && currentIndex < queue.length) {
            e.preventDefault()
            removeFromQueue(currentIndex)
          }
          break
        case 'Escape':
          setSearchQuery('')
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentIndex, queue])

  const handleTrackSelect = (track: Track) => {
    if (!track || !track.file) {
      console.warn('Invalid track selected:', track)
      return
    }
    
    // Determine the source folder - use selectedFolder if available, otherwise try to find from track
    let sourceFolderId: string | null = null
    if (selectedFolder) {
      sourceFolderId = selectedFolder.id
    } else if (track.folderId) {
      sourceFolderId = track.folderId
    }
    
    // Extract folder path from track's file
    // e.g., "/audio/unreleased/eps/ep-2025/track1.mp3" -> "/audio/unreleased/eps/ep-2025/"
    const filePath = track.file
    const lastSlashIndex = filePath.lastIndexOf('/')
    const folderPath = lastSlashIndex >= 0 ? filePath.substring(0, lastSlashIndex + 1) : ''
    
    // Find all tracks in the same folder
    const folderTracks = allTracks.filter(t => {
      if (!t.file) return false
      const trackFolderPath = t.file.substring(0, t.file.lastIndexOf('/') + 1)
      return trackFolderPath === folderPath
    })
    
    // Sort tracks by filename for consistent order
    const sortedTracks = [...folderTracks].sort((a, b) => {
      const aFileName = a.file.substring(a.file.lastIndexOf('/') + 1)
      const bFileName = b.file.substring(b.file.lastIndexOf('/') + 1)
      return aFileName.localeCompare(bFileName)
    })
    
    // Find the index of the selected track in the sorted list
    const selectedIndex = sortedTracks.findIndex(t => t.id === track.id)
    
    // Reorder so selected track is first, then continue with rest
    const sequentialQueue = selectedIndex >= 0
      ? [sortedTracks[selectedIndex], ...sortedTracks.slice(0, selectedIndex), ...sortedTracks.slice(selectedIndex + 1)]
      : sortedTracks.length > 0 ? sortedTracks : [track]
    const queue = readCatalogRandomSetting() ? [track] : sequentialQueue
    
    // Determine source for continuous playback
    const source = selectedPlaylist
      ? { type: 'playlist' as const, id: selectedPlaylist.id }
      : sourceFolderId
        ? { type: 'folder' as const, id: sourceFolderId }
        : undefined
    
    playTrack(track, queue, source)
    
    // If track is in displayTracks, keep showing them, otherwise show just this track
    if (!displayTracks.find(t => t.id === track.id)) {
      setDisplayTracks([track])
    }
  }

  const handleAddToQueue = (track: Track) => {
    addToQueue(track)
  }

  const handleClearQueue = () => {
    setQueue([])
    setCurrentTrack(null)
    setCurrentIndex(0)
    setIsPlaying(false)
  }


  const handleFolderSelect = async (folder: FolderItem) => {
    // Set selected folder and display its child folders/albums
    setSelectedFolder(folder)
    setSelectedPlaylist(null)
    
    // Get the full folder data with children from library (including playlists)
    const foldersToUse = libraryWithPlaylists?.folders || libraryData?.folders
    const fullFolder = foldersToUse
      ? findFolderInLibrary(foldersToUse, folder.id) || folder
      : folder
    
    // Prefer showing tracks when the folder actually has tracks (e.g. "All Tracks", playlists),
    // otherwise show its children.
    if (fullFolder.tracks && fullFolder.tracks.length > 0) {
      // For playlist folders, use the tracks directly (they're already resolved)
      if (folder.id.startsWith('playlist-') || folder.id.startsWith('fan-playlist-')) {
        setDisplayTracks(fullFolder.tracks)
        resetTrackPagination(null, false, 0)
        setDisplayFolders([])
        if (folder.id.startsWith('fan-playlist-')) {
          const rawId = folder.id.replace(/^fan-playlist-/, '')
          const fp = fanPlaylists.find((p) => p.id === rawId)
          if (fp) setSelectedPlaylist({ ...fp, isFan: true })
        } else {
          setSelectedPlaylist(null)
        }
        return
      }
      
      // Show tracks already on the folder tree immediately — do not block the
      // list on another round-trip to tracks-optimized (that caused the long wait).
      const paintFolderTracks = (tracks: Track[]) => {
        if (folder.id === 'folder-all-tracks') {
          const seen = new Set<string>()
          const deduped = tracks.filter((t: any) => {
            const audioId = t?.audioFileId || t?.audio_file_id
            if (!audioId) return false
            if (seen.has(audioId)) return false
            seen.add(audioId)
            return true
          })
          setDisplayTracks(deduped)
        } else {
          setDisplayTracks(tracks)
        }
      }
      paintFolderTracks(fullFolder.tracks || [])
      resetTrackPagination(
        folder.id,
        (fullFolder.tracks?.length || 0) >= TRACKS_PAGE_SIZE,
        fullFolder.tracks?.length || 0,
      )
      setDisplayFolders([])

      // Soft-refresh first page in background for keys/sort consistency
      void import('@/utils/musicLibraryApi')
        .then(({ fetchTracksSummary }) =>
          fetchTracksSummary(folder.id, {
            includeArchived: false,
            limit: TRACKS_PAGE_SIZE,
            offset: 0,
          }),
        )
        .then((summaryResult) => {
          const summaryTracks = summaryResult.tracks || []
          if (!summaryTracks.length) return
          paintFolderTracks(summaryTracks)
          resetTrackPagination(folder.id, Boolean(summaryResult.hasMore), summaryTracks.length)
        })
        .catch((error) => {
          console.error('Error refreshing tracks:', error)
        })
      return
    }

    // Check for children - use fullFolder which has the complete data
    const visibleChildren = filterVisibleFolders(fullFolder.children)
    if (visibleChildren.length > 0) {
      // Folder-only nodes stay in the sidebar/iTunes browser — do not open the old grid panel.
      setDisplayFolders([])
      setDisplayTracks([])
      resetTrackPagination(null, false, 0)
      return
    }

    // No children or tracks - try to fetch tracks from API as last resort
    try {
      const { fetchTracksSummary } = await import('@/utils/musicLibraryApi')
      const summaryResult = await fetchTracksSummary(folder.id, { includeArchived: false, limit: TRACKS_PAGE_SIZE, offset: 0 })
      if (summaryResult.tracks && summaryResult.tracks.length > 0) {
        setDisplayTracks(summaryResult.tracks)
        resetTrackPagination(folder.id, Boolean(summaryResult.hasMore), summaryResult.tracks.length)
        setDisplayFolders([])
        return
      }
    } catch (error) {
      console.error('Error fetching tracks:', error)
    }

    // Truly empty
    setDisplayFolders([])
    setDisplayTracks([])
    resetTrackPagination(null, false, 0)
  }

  const toggleFolderExpand = (folderId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    setExpandedFolders(prev => {
      // Only allow one folder expanded at a time
      if (prev.has(folderId)) {
        // If clicking on already expanded folder, collapse it
        return new Set()
      } else {
        // Expand this folder, collapse all others
        return new Set([folderId])
      }
    })
  }

  const handleFolderPlay = (folder: FolderItem) => {
    // This is called on double-click to actually play
    // First select the folder to show its tracks
    handleFolderSelect(folder)
    
    // Determine source for continuous playback
    const source = { type: 'folder' as const, id: folder.id }
    
    // Then play the tracks
    if (folder.tracks && folder.tracks.length > 0) {
      playQueue(folder.tracks, 0, source)
    } else if (folder.children) {
      // Collect all tracks from children
      const collectTracks = (items: FolderItem[]): Track[] => {
        const tracks: Track[] = []
        items.forEach(item => {
          if (item.tracks) {
            tracks.push(...item.tracks)
          }
          if (item.children) {
            tracks.push(...collectTracks(item.children))
          }
        })
        return tracks
      }
      
      const tracks = collectTracks(folder.children)
      if (tracks.length > 0) {
        playQueue(tracks, 0, source)
      }
    }
  }

  const handlePlayPlaylist = (playlist: Playlist) => {
    const tracks = playlist.trackIds
      .map((id: string) => allTracks.find(t => t.id === id))
      .filter(Boolean) as Track[]
    
    if (tracks.length > 0) {
      const source = { type: 'playlist' as const, id: playlist.id }
      playQueue(tracks, 0, source)
    }
  }

  const handleSelectPlaylist = (playlist: Playlist) => {
    setSelectedPlaylist(playlist)
  }

  const handleBack = () => {
    // Go back to folder view
    if (selectedFolder) {
      // Find parent folder or default folder
      const findParentFolder = (items: FolderItem[], targetId: string, parent: FolderItem | null = null): FolderItem | null => {
        for (const item of items) {
          if (item.id === targetId) {
            return parent
          }
          if (item.children) {
            const found = findParentFolder(item.children, targetId, item)
            if (found !== null) {
              return found
            }
          }
        }
        return null
      }

      if (!libraryData?.folders) return
      
      const parentFolder = findParentFolder(libraryData.folders, selectedFolder.id)
      
      if (parentFolder) {
        handleFolderSelect(parentFolder)
      } else {
        setSelectedFolder(null)
        setDisplayFolders([])
        setDisplayTracks([])
      }
    } else {
      setSelectedFolder(null)
      setDisplayFolders([])
      setDisplayTracks([])
    }
    setSelectedPlaylist(null)
  }

  const getPlaylistTracks = (playlist: Playlist) => {
    return playlist.trackIds
      .map((id: string) => allTracks.find(t => t.id === id))
      .filter(Boolean) as Track[]
  }

  const availableTracksForPlaylist = useMemo(() => {
    if (!selectedPlaylist) return []
    const existing = new Set(selectedPlaylist.trackIds)
    const query = addTrackQuery.trim().toLowerCase()
    return allTracks.filter((track) => {
      if (existing.has(track.id)) return false
      if (!query) return true
      return (
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query)
      )
    })
  }, [selectedPlaylist?.id, selectedPlaylist?.trackIds, allTracks, addTrackQuery])

  const handleTrackEnd = () => {
    nextTrack()
  }

  const handleCreatePlaylist = async (name: string, description?: string) => {
    try {
      if (!fanUser || playlistsNeedMembership) {
        alert('Sign in with your fan account to create playlists.')
        window.location.href = `/fan/login?next=${encodeURIComponent('/music-library')}`
        return
      }

      const res = await fetch('/api/fan/playlists', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      if (res.ok) {
        const j = await res.json()
        if (j.playlist) setFanPlaylists((prev) => [...prev, j.playlist as Playlist])
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create playlist')
      }
    } catch (error) {
      console.error('Error creating playlist:', error)
      alert('Could not create playlist. Sign in with your fan account and try again.')
    }
  }

  const handleDeletePlaylist = async (id: string) => {
    try {
      if (!fanPlaylists.some((p) => p.id === id)) {
        alert('Sign in with your fan account to manage playlists.')
        window.location.href = `/fan/login?next=${encodeURIComponent('/music-library')}`
        return
      }
      const res = await fetch(`/api/fan/playlists/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        setFanPlaylists((prev) => prev.filter((p) => p.id !== id))
      } else {
        alert('Failed to delete playlist. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting playlist:', error)
      alert('Failed to delete playlist. Please try again.')
    }
  }

  const handleAddTrackToPlaylist = async (playlistId: string, trackId: string) => {
    try {
      const fanPl = fanPlaylists.find((p) => p.id === playlistId)
      if (!fanPl) {
        alert('Sign in with your fan account to add tracks to playlists.')
        window.location.href = `/fan/login?next=${encodeURIComponent('/music-library')}`
        return
      }
      const res = await fetch(`/api/fan/playlists/${playlistId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addTrackId: trackId }),
      })
      if (res.ok) {
        const j = await res.json()
        if (j.playlist) {
          setFanPlaylists((prev) => prev.map((p) => (p.id === playlistId ? (j.playlist as Playlist) : p)))
        }
      } else {
        alert('Failed to add track to playlist. Please try again.')
      }
    } catch (error) {
      console.error('Error adding track to playlist:', error)
      alert('Failed to add track to playlist. Please try again.')
    }
  }

  const handleRemoveTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    try {
      const fanPl = fanPlaylists.find((p) => p.id === playlistId)
      if (!fanPl) {
        alert('Sign in with your fan account to edit playlists.')
        window.location.href = `/fan/login?next=${encodeURIComponent('/music-library')}`
        return
      }
      const res = await fetch(`/api/fan/playlists/${playlistId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeTrackId: trackId }),
      })
      if (res.ok) {
        const j = await res.json()
        if (j.playlist) {
          setFanPlaylists((prev) => prev.map((p) => (p.id === playlistId ? (j.playlist as Playlist) : p)))
          if (selectedFolder?.id === `fan-playlist-${playlistId}`) {
            setDisplayTracks(
              (j.playlist.trackIds as string[])
                .map((id: string) => getAllTracksFromLibrary.find((t) => t.id === id))
                .filter(Boolean) as Track[]
            )
          }
        }
      } else {
        alert('Failed to remove track from playlist. Please try again.')
      }
    } catch (error) {
      console.error('Error removing track from playlist:', error)
      alert('Failed to remove track from playlist. Please try again.')
    }
  }

  const handleSortChange = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(newSortBy)
      setSortOrder('asc')
    }
    setIsSortMenuOpen(false)
  }

  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
  }

  const getSortIcon = () => {
    if (sortBy === 'default') return <FaSort className="text-sm" />
    if (sortOrder === 'asc') {
      return sortBy === 'duration' || sortBy === 'bpm' || sortBy === 'date'
        ? <FaSortNumericDown className="text-sm" />
        : <FaSortAlphaDown className="text-sm" />
    } else {
      return sortBy === 'duration' || sortBy === 'bpm' || sortBy === 'date'
        ? <FaSortNumericUp className="text-sm" />
        : <FaSortAlphaUp className="text-sm" />
    }
  }

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr // Return as-is if invalid
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  // Folder hierarchy navigation functions
  const toggleFolderDropdown = (folderId: string) => {
    setOpenDropdowns(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const navigateToFolder = (folder: FolderItem) => {
    handleFolderSelect(folder)
    setOpenDropdowns(new Set())
  }

  const getFolderChildren = (folderId: string): FolderItem[] => {
    if (!libraryData?.folders) return []
    
    const findFolder = (items: FolderItem[], targetId: string): FolderItem | null => {
      for (const item of items) {
        if (item.id === targetId) {
          return item
        }
        if (item.children) {
          const found = findFolder(item.children, targetId)
          if (found) return found
        }
      }
      return null
    }
    
    const folder = findFolder(libraryData.folders, folderId)
    return folder?.children || []
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      let clickedInside = false
      folderDropdownRefs.current.forEach((ref) => {
        if (ref && ref.contains(event.target as Node)) {
          clickedInside = true
        }
      })
      
      if (!clickedInside) {
        setOpenDropdowns(new Set())
      }
    }
    
    if (openDropdowns.size > 0) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openDropdowns])

  const vaultMainNavTreeEl =
    vaultMainNavTreeItems.length > 0 ? (
      <div className="border-b border-gray-700 bg-gray-900/20">
        <FolderTree
          items={vaultMainNavTreeItems}
          onTrackSelect={handleTrackSelect}
          onFolderSelect={handleFolderSelect}
          onFolderPlay={handleFolderPlay}
          onTrackDrop={handleTrackDropOnFolder}
          hideFolderIds={['folder-all-tracks']}
          folderNameOverrides={FOLDER_TREE_DISPLAY_NAMES}
          treeContainerClassName="divide-y divide-gray-700 max-h-[min(46dvh,320px)] sm:max-h-[min(480px,48vh)] lg:max-h-[min(560px,50vh)] overflow-y-auto overscroll-y-contain"
        />
      </div>
    ) : null

  return (
    <div
      className="pt-16 sm:pt-20 min-h-screen pb-[calc(var(--global-music-player-height,7rem)+1rem+env(safe-area-inset-bottom,0px))] relative z-10 [--music-lib-chrome-top:4rem] sm:[--music-lib-chrome-top:5rem]"
      data-music-library-main
    >
      <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-6 md:py-8 max-w-7xl relative z-10 min-w-0">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          {playlistsNeedMembership && (
            <div
              className="mb-4 rounded-lg border border-purple-500/50 bg-purple-950/50 px-4 py-3 text-sm text-gray-200 text-center max-w-2xl mx-auto"
              role="status"
            >
              <span className="font-medium text-white">Fan account required: </span>
              sign in to create/edit playlists or buy/download from the shop (
              <a href="/fan/login?next=/music-library" className="text-purple-300 underline hover:text-purple-200">
                sign in
              </a>
              ,{' '}
              <a href="/fan/register?next=/music-library" className="text-purple-300 underline hover:text-purple-200">
                create account
              </a>
              ). You can still listen in the vault with email unlock.
            </div>
          )}
          <div className="flex flex-col items-center justify-center mb-3 sm:mb-6 w-full px-1">
            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold mb-1 font-six-caps text-center border border-yellow-400 text-yellow-400 px-2.5 sm:px-4 py-1 sm:py-2 rounded text-wrap leading-tight max-w-full">
              SERGIK Music Vault
            </h1>
          </div>

          {/* Genre Filter Tabs & Key Filter */}
          <div className="mb-4 sm:mb-6 space-y-3">
            {/* Genre Tabs */}
            {availableGenres.length > 0 && (
              <div className="flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 -mx-1 px-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] touch-pan-x">
                <button
                  onClick={() => setGenreFilter('all')}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                    genreFilter === 'all'
                      ? 'bg-yellow-500 text-black'
                      : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                  }`}
                >
                  All Genres
                </button>
                {availableGenres.slice(0, 8).map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setGenreFilter(genre)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                      genreFilter === genre
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            )}
            
            {(genreFilter !== 'all' || hasSmartFilters) && (
              <span className="text-xs text-gray-400">
                Showing {filteredDisplayTracks.length} tracks
              </span>
            )}

          </div>
        </div>
        
        {/* Now Playing - Top Row for Tablet/Mobile, Sidebar for Desktop */}
        {showLibraryNowPlaying && (
          <div className="mb-3 sm:mb-4 lg:hidden">
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
              {/* Track Info Section - Always Visible */}
              <div className="px-3 py-3 sm:px-4 sm:py-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-start gap-3">
                  {currentTrack.artwork ? (
                    <div
                      className="relative w-80 h-80 max-w-full sm:w-28 sm:h-28 rounded-xl overflow-hidden flex-shrink-0 shadow-2xl cursor-pointer hover:scale-[1.02] transition-all duration-200 group ring-2 ring-gray-700/50 hover:ring-gray-600 self-center sm:self-start"
                      onClick={() => setIsArtworkExpanded(true)}
                      title="Click to expand artwork"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setIsArtworkExpanded(true)
                        }
                      }}
                    >
                      <Image
                        src={resolveImageUrl(currentTrack.artwork)}
                        alt={currentTrack.title}
                        fill
                        className="object-cover"
                        unoptimized={shouldUnoptimizeImage(currentTrack.artwork)}
                        sizes="(max-width: 639px) 320px, 112px"
                        priority
                        fetchPriority="high"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-1.5 sm:pb-2">
                        <span className="text-white text-[10px] sm:text-xs font-medium bg-black/80 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md">
                          View Full Size
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-80 h-80 max-w-full sm:w-28 sm:h-28 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0 shadow-lg border border-gray-600/50 self-center sm:self-start">
                      <FaMusic className="text-gray-400 text-5xl sm:text-3xl" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1.5 self-center w-full sm:w-auto text-center sm:text-left">
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-bold text-white leading-snug break-words [overflow-wrap:anywhere]">
                        {currentTrack.title}
                      </h3>
                      <p className="text-xs text-gray-300 truncate">
                        {currentTrack.artist}
                      </p>
                    </div>
                    {(getTrackDnaMatchScore(currentTrack) || getTrackMood(currentTrack) || getTrackProductionEra(currentTrack)) && (
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                        {getTrackDnaMatchScore(currentTrack) && (
                          <DnaMatchScoreBadge score={getTrackDnaMatchScore(currentTrack)} size="xs" />
                        )}
                        {getTrackMood(currentTrack) && (
                          <MoodBadge mood={getTrackMood(currentTrack)} size="xs" />
                        )}
                        {getTrackProductionEra(currentTrack) && (
                          <ProductionEraBadge era={getTrackProductionEra(currentTrack)} size="xs" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {getTrackDescription(currentTrack) && (
                <div className="px-3 sm:px-4 py-2 border-t border-gray-800/30">
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                    {getTrackDescription(currentTrack)}
                  </p>
                </div>
              )}

              <div className="px-3 sm:px-4 py-2 border-t border-gray-800/30 bg-gray-800/20">
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 min-w-0">
                  <BpmBadge bpm={getTrackBpm(dnaDeckTrack)} size="xs" />
                  {getTrackGenre(dnaDeckTrack) && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 max-w-[10rem] truncate">
                      {getTrackGenre(dnaDeckTrack)}
                    </span>
                  )}
                  <KeyBadge keySignature={getTrackKey(dnaDeckTrack)} size="xs" />
                  {getTrackMixingRecommendations(currentTrack) && (
                    <>
                      <span className="text-gray-500 font-medium text-[10px] shrink-0 pl-0.5">
                        Mix with
                      </span>
                      <CompatibleKeysBadge
                        currentKey={getTrackKey(dnaDeckTrack)}
                        compatibleKeys={getTrackMixingRecommendations(currentTrack)?.compatibleKeys}
                        size="xs"
                        showLabel={false}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Sonic DNA - Seamlessly Integrated Expandable Section */}
              <div className="border-t border-gray-800/40">
                <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 min-w-0">
                  <button
                    onClick={() => setIsSonicDNAExpanded(!isSonicDNAExpanded)}
                    className="relative min-w-0 flex-1 px-1 py-1.5 hover:bg-gray-800/40 active:bg-gray-800/40 transition-all duration-200 flex items-center justify-center group focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-inset rounded-md"
                    {...(isSonicDNAExpanded ? { 'aria-expanded': 'true' } : { 'aria-expanded': 'false' })}
                    aria-label={isSonicDNAExpanded ? 'Collapse Sonic DNA analysis' : 'Expand Sonic DNA analysis'}
                  >
                    <span className="text-[11px] sm:text-xs font-semibold text-gray-200 uppercase tracking-wide group-hover:text-white transition-colors text-center">
                      Sonic DNA Analysis
                    </span>
                    <div className="absolute right-1 sm:right-2 flex items-center gap-2 shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                        isSonicDNAExpanded ? 'bg-purple-400' : 'bg-gray-500'
                      }`}></div>
                      {isSonicDNAExpanded ? (
                        <FaChevronUp className="text-gray-400 text-sm group-hover:text-gray-300 transition-all duration-200" />
                      ) : (
                        <FaChevronDown className="text-gray-400 text-sm group-hover:text-gray-300 transition-all duration-200" />
                      )}
                    </div>
                  </button>
                </div>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isSonicDNAExpanded
                      ? 'max-h-[min(55dvh,1600px)] overflow-y-auto overscroll-y-contain opacity-100'
                      : 'max-h-0 opacity-0'
                  }`}
                  {...(!isSonicDNAExpanded && { 'aria-hidden': 'true' })}
                >
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 border-t border-gray-800/40">
                    <SonicDNA
                      key={`${currentTrack.id}::${currentTrack.audioFileId || ''}`}
                      trackId={currentTrack.id}
                      audioFileId={currentTrack.audioFileId || (currentTrack as { audio_file_id?: string }).audio_file_id}
                      trackFile={currentTrack.file}
                      trackTitle={currentTrack.title}
                      artistName={currentTrack.artist}
                      initialSonicDna={dnaDeckTrack.sonic_dna}
                      enabled={isSonicDNAExpanded}
                      onSonicDnaLoaded={handleSonicDnaLoaded}
                      compact={true}
                      hideHeader={true}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Multi-Panel Hierarchical Folder Navigation - Below Library on Mobile/Tablet */}
        {folderPath.length > 0 && (
          <div className="mb-4 hidden bg-gray-800/40 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Root/Home button */}
                        <button
                          onClick={() => {
                            if (!libraryData?.folders) return
                            const folders = libraryData.folders
                            // Try to find Discography first, then first available folder
                            const rootFolder = folders.find(f => f.name === 'Discography' && f.id === 'folder-discography') ||
                                              (folders.length > 0 ? folders[0] : null)
                            if (rootFolder) {
                              navigateToFolder(rootFolder)
                            }
                          }}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-700/40 transition-colors text-gray-300 hover:text-white text-sm"
                title="Go to root"
              >
                <FaFolder className="text-xs" />
                <span className="hidden sm:inline">Root</span>
              </button>

              {/* Folder path with dropdowns */}
              {folderPath.map((folder, index) => {
                const isLast = index === folderPath.length - 1
                const children = getFolderChildren(folder.id)
                const isOpen = openDropdowns.has(folder.id)
                const hasChildren = children.length > 0

                return (
                  <div key={folder.id} className="flex items-center gap-1">
                    <FaChevronRight className="text-gray-600 text-xs" />
                    <div className="relative" ref={(el) => {
                      if (el) {
                        folderDropdownRefs.current.set(folder.id, el)
                      } else {
                        folderDropdownRefs.current.delete(folder.id)
                      }
                    }}>
                      <button
                        onClick={() => {
                          if (hasChildren) {
                            toggleFolderDropdown(folder.id)
                          } else {
                            navigateToFolder(folder)
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors text-sm ${
                          isLast
                            ? 'text-white font-medium bg-gray-700/40'
                            : 'text-gray-300 hover:text-white hover:bg-gray-700/40'
                        }`}
                        title={folder.name}
                      >
                        {hasChildren && (
                          <FaChevronRight 
                            className={`text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          />
                        )}
                        <FaFolder className="text-xs" />
                        <span className="truncate max-w-[min(42vw,9rem)] sm:max-w-[200px]">{folder.name}</span>
                      </button>

                      {/* Dropdown menu for children */}
                      {isOpen && hasChildren && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800/40 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] max-w-[300px] max-h-[400px] overflow-y-auto">
                          <div className="py-1">
                            {children.map((child) => (
                              <button
                                key={child.id}
                                onClick={() => navigateToFolder(child)}
                                className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700/40 transition-colors text-gray-300"
                              >
                                <FaFolder className="text-xs text-gray-500" />
                                <span className="truncate">{child.name}</span>
                                {child.children && child.children.length > 0 && (
                                  <span className="ml-auto text-xs text-gray-500">
                                    {child.children.length}
                                  </span>
                                )}
                                {child.tracks && child.tracks.length > 0 && (
                                  <span className="ml-auto text-xs text-gray-500">
                                    {child.tracks.length} tracks
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
        <div ref={layoutRef} className="flex flex-col gap-4 sm:gap-6">
          {/* Now Playing (full width, above main browser) */}
          {showLibraryNowPlaying && (
          <div className="hidden lg:block w-full">
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-gray-900/40 border-b border-gray-700">
                  {/* Track Info Section - Always Visible */}
                  <div className="px-4 py-4 overscroll-contain" data-waveform-hover-root>
                    <div className="mb-3 flex min-w-0 items-center justify-center gap-3">
                      <div className="flex min-w-0 max-w-full items-center justify-center gap-2">
                        <h3 className="truncate text-sm font-bold leading-tight text-white">
                          {currentTrack.title}
                        </h3>
                        <span className="shrink-0 text-gray-500" aria-hidden="true">-</span>
                        <p className="truncate text-sm text-gray-300">
                          {currentTrack.artist}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-stretch gap-4">
                      {/* Artwork - match waveform stage height */}
                      {currentTrack.artwork ? (
                        <div 
                          className="group relative h-32 w-32 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl shadow-2xl ring-2 ring-gray-700/50 transition-all duration-200 hover:scale-[1.02] hover:ring-gray-600 sm:h-36 sm:w-36"
                          onClick={() => setIsArtworkExpanded(true)}
                          title="Click to expand artwork"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setIsArtworkExpanded(true)
                            }
                          }}
                        >
                          <Image
                            src={resolveImageUrl(currentTrack.artwork)}
                            alt={currentTrack.title}
                            fill
                            className="object-cover"
                            unoptimized={shouldUnoptimizeImage(currentTrack.artwork)}
                            sizes="(min-width: 640px) 144px, 128px"
                            priority
                          />
                          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent pb-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <span className="rounded-md bg-black/80 px-2.5 py-1 text-xs font-medium text-white">
                              View Full Size
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-xl border border-gray-600/50 bg-gradient-to-br from-gray-700 to-gray-800 shadow-lg sm:h-36 sm:w-36">
                          <FaMusic className="text-3xl text-gray-400" />
                        </div>
                      )}
                      
                      <div className="relative isolate z-0 h-32 min-w-0 flex-1 sm:h-36">
                        <div
                          ref={nowPlayingWaveformRef}
                          className="absolute inset-0 z-0 overflow-hidden rounded-md bg-black"
                        />
                      </div>
                    </div>
                    
                    {/* Track Description - Mobile View */}
                    {getTrackDescription(currentTrack) && (
                      <div className="px-4 py-2 border-t border-gray-800/30">
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                          {getTrackDescription(currentTrack)}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Meta · Transport · Sonic DNA — three equal columns, same row height */}
                  <div className="border-t border-gray-800/40">
                    <div className="grid grid-cols-3 items-center gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5">
                        <BpmBadge bpm={getTrackBpm(dnaDeckTrack)} size="xs" />
                        <GenreBadge genre={getTrackGenre(dnaDeckTrack)} size="xs" />
                        <KeyBadge keySignature={getTrackKey(dnaDeckTrack)} size="xs" />
                      </div>

                      <div className="flex items-center justify-center">
                        <NowPlayingTransportMirror />
                      </div>

                      <div className="flex min-w-0 items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsSonicDNAExpanded(!isSonicDNAExpanded)}
                          className="group relative flex min-w-0 items-center justify-end gap-3 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 focus-visible:ring-inset rounded-md"
                          {...(isSonicDNAExpanded ? { 'aria-expanded': 'true' } : { 'aria-expanded': 'false' })}
                          aria-label={isSonicDNAExpanded ? 'Collapse Sonic DNA analysis' : 'Expand Sonic DNA analysis'}
                        >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-xs font-semibold uppercase tracking-wide text-gray-200 transition-colors group-hover:text-white">
                            Sonic DNA Analysis
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                            isSonicDNAExpanded ? 'bg-purple-400' : 'bg-gray-500'
                          }`}></div>
                          {isSonicDNAExpanded ? (
                            <FaChevronUp className="text-sm text-gray-400 transition-all duration-200 group-hover:text-gray-300" />
                          ) : (
                            <FaChevronDown className="text-sm text-gray-400 transition-all duration-200 group-hover:text-gray-300" />
                          )}
                        </div>
                      </button>
                      </div>
                    </div>
                    
                    {/* Expandable Content with Smooth Animation */}
                    <div 
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        isSonicDNAExpanded
                          ? 'max-h-[min(70vh,1600px)] overflow-y-auto opacity-100'
                          : 'max-h-0 opacity-0'
                      }`}
                      {...(!isSonicDNAExpanded && { 'aria-hidden': 'true' })}
                    >
                      <div className="px-4 pb-4 pt-2 border-t border-gray-800/40">
                        <SonicDNA
                          key={`${currentTrack.id}::${currentTrack.audioFileId || ''}`}
                          trackId={currentTrack.id}
                          audioFileId={currentTrack.audioFileId || (currentTrack as { audio_file_id?: string }).audio_file_id}
                          trackFile={currentTrack.file}
                          trackTitle={currentTrack.title}
                          artistName={currentTrack.artist}
                          initialSonicDna={dnaDeckTrack.sonic_dna}
                          enabled={isSonicDNAExpanded}
                          onSonicDnaLoaded={handleSonicDnaLoaded}
                          compact={true}
                          hideHeader={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </div>
          )}

          {displayTracks.length > 0 && (
          <div
            ref={libraryMainPanelRef}
            className="w-full lg:flex-1 lg:min-w-0 scroll-mt-20 sm:scroll-mt-24"
          >
              <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
                {vaultMainNavTreeEl}
                <div className="px-3 py-3 sm:px-6 sm:py-4 bg-gray-900/40 border-b border-gray-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex flex-col gap-2 min-w-0 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                      <button
                        onClick={handleBack}
                        className="flex shrink-0 items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white touch-manipulation"
                        aria-label="Go back to playlist selection"
                        title="Go back"
                      >
                        <FaArrowLeft className="text-sm" />
                      </button>
                      <h2 className="text-base sm:text-lg font-semibold text-white truncate min-w-0">
                        {selectedFolder?.name || selectedPlaylist?.name || 'Tracks'}
                      </h2>
                      <span className="text-xs sm:text-sm text-gray-400 shrink-0">
                        {displayTracks.length} {displayTracks.length === 1 ? 'song' : 'songs'}
                      </span>
                    </div>
                    {currentTrack && (
                      <div className="flex items-center gap-2 pl-0 sm:pl-0 text-xs sm:text-sm text-gray-300 min-w-0 border-t border-gray-800/60 pt-2 sm:border-0 sm:pt-0">
                        <span className="text-blue-400 shrink-0">▶</span>
                        <span className="truncate font-medium">{currentTrack.title}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Sort and Column Controls */}
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:shrink-0">
                    {selectedPlaylist && (
                      <>
                        <button
                          onClick={() => setIsPlaylistEditMode((prev) => !prev)}
                          className={`flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] sm:min-w-0 px-3 py-2 rounded-lg transition-colors border touch-manipulation ${
                            isPlaylistEditMode
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'text-gray-300 hover:text-white border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                          }`}
                          title="Toggle playlist edit mode"
                        >
                          <FaEdit className="text-sm" />
                          <span className="text-sm hidden sm:inline">{isPlaylistEditMode ? 'Editing' : 'Edit Playlist'}</span>
                        </button>
                        {isPlaylistEditMode && (
                          <button
                            onClick={() => setShowAddTrackModal(true)}
                            className="flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] sm:min-w-0 px-3 py-2 rounded-lg transition-colors border border-indigo-500 text-indigo-100 hover:bg-indigo-600 touch-manipulation"
                            title="Add tracks to playlist"
                          >
                            <FaPlus className="text-sm" />
                            <span className="text-sm hidden sm:inline">Add Tracks</span>
                          </button>
                        )}
                      </>
                    )}
                    {/* Column Visibility Toggle */}
                    <div className="relative" ref={columnMenuRef}>
                      <button
                        onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                        className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 touch-manipulation"
                        title="Column visibility"
                      >
                        <FaColumns className="text-sm" />
                        <span className="text-sm hidden sm:inline">Columns</span>
                        <FaChevronDown className={`text-xs transition-transform ${isColumnMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {isColumnMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 max-w-[min(18rem,calc(100vw-1.5rem))] bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="px-3 py-2 bg-gray-900/80 border-b border-gray-700">
                            <div className="text-xs font-semibold text-gray-300 uppercase">Show Columns</div>
                          </div>
                          <div className="py-1 max-h-96 overflow-y-auto bg-gray-800/80">
                            {[
                              { key: 'genre' as const, label: 'Genre' },
                              { key: 'subgenre' as const, label: 'Sub-Genre' },
                              { key: 'drumStyle' as const, label: 'Drum Style' },
                              { key: 'timeSignature' as const, label: 'Time Signature' },
                              { key: 'key' as const, label: 'Key' },
                              { key: 'scale' as const, label: 'Scale' },
                              { key: 'date' as const, label: 'Date' },
                              { key: 'bpm' as const, label: 'BPM' },
                            ].map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => toggleColumn(key)}
                                className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700/40 transition-colors text-gray-300"
                              >
                                {visibleColumns[key] ? (
                                  <FaCheckSquare className="text-blue-400 text-xs" />
                                ) : (
                                  <FaSquare className="text-gray-500 text-xs" />
                                )}
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative" ref={sortMenuRef}>
                      <button
                        onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                        className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 touch-manipulation"
                        title="Sort tracks"
                      >
                        {getSortIcon()}
                        <span className="text-sm hidden sm:inline">
                          {sortBy === 'default' ? 'Sort' : 
                           sortBy === 'title' ? 'Title' :
                           sortBy === 'artist' ? 'Artist' :
                           sortBy === 'duration' ? 'Duration' :
                           sortBy === 'bpm' ? 'BPM' :
                           sortBy === 'genre' ? 'Genre' :
                           sortBy === 'subgenre' ? 'Sub-Genre' :
                           sortBy === 'drumStyle' ? 'Drum Style' :
                           sortBy === 'timeSignature' ? 'Time Sig' :
                           sortBy === 'key' ? 'Key' :
                           sortBy === 'scale' ? 'Scale' :
                           sortBy === 'date' ? 'Date' : 'Sort'}
                        </span>
                        <FaChevronDown className={`text-xs transition-transform ${isSortMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {isSortMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 max-w-[min(18rem,calc(100vw-1.5rem))] bg-gray-800/40 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="py-1">
                            <button
                              onClick={() => handleSortChange('default')}
                              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700/40 transition-colors ${
                                sortBy === 'default' ? 'text-blue-400 bg-gray-700/40' : 'text-gray-300'
                              }`}
                            >
                              <FaSort className="text-xs" />
                              <span>Default Order</span>
                            </button>
                            {[
                              { key: 'title' as const, label: 'Title', icon: FaSortAlphaDown },
                              { key: 'artist' as const, label: 'Artist', icon: FaSortAlphaDown },
                              { key: 'duration' as const, label: 'Duration', icon: FaSortNumericDown },
                              { key: 'bpm' as const, label: 'BPM', icon: FaSortNumericDown },
                              { key: 'genre' as const, label: 'Genre', icon: FaSortAlphaDown },
                              { key: 'subgenre' as const, label: 'Sub-Genre', icon: FaSortAlphaDown },
                              { key: 'drumStyle' as const, label: 'Drum Style', icon: FaSortAlphaDown },
                              { key: 'timeSignature' as const, label: 'Time Signature', icon: FaSortAlphaDown },
                              { key: 'key' as const, label: 'Key', icon: FaSortAlphaDown },
                              { key: 'scale' as const, label: 'Scale', icon: FaSortAlphaDown },
                              { key: 'date' as const, label: 'Date', icon: FaSortNumericDown },
                            ].map(({ key, label, icon: Icon }) => (
                              <button
                                key={key}
                                onClick={() => handleSortChange(key)}
                                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700/40 transition-colors ${
                                  sortBy === key ? 'text-blue-400 bg-gray-700/40' : 'text-gray-300'
                                }`}
                              >
                                {sortBy === key && sortOrder === 'asc' ? (
                                  <Icon className="text-xs" />
                                ) : sortBy === key && sortOrder === 'desc' ? (
                                  <Icon className="text-xs rotate-180" />
                                ) : (
                                  <FaSort className="text-xs" />
                                )}
                                <span>{label}</span>
                                {sortBy === key && (
                                  <span className="ml-auto text-xs text-gray-500">
                                    {sortOrder === 'asc' ? (key === 'duration' || key === 'bpm' || key === 'date' ? '↑' : 'A→Z') : (key === 'duration' || key === 'bpm' || key === 'date' ? '↓' : 'Z→A')}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div 
                  ref={queueRef}
                  className="divide-y divide-gray-700 max-h-[min(50dvh,480px)] sm:max-h-[600px] md:max-h-[700px] overflow-y-auto overflow-x-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
                >
                  {(visibleColumns.genre || visibleColumns.subgenre || visibleColumns.drumStyle || visibleColumns.timeSignature || visibleColumns.key || visibleColumns.scale || visibleColumns.date || visibleColumns.bpm || visibleColumns.duration) && (
                    <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 text-[10px] uppercase tracking-wide text-gray-400 [contain:layout_paint] hidden sm:block">
                      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 py-2">
                        <div className="w-6 sm:w-8 hidden sm:block">#</div>
                        <div className="w-[44px]">Play</div>
                        <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">Art</div>
                        <div className="flex-1 min-w-0">Title / Artist</div>
                        {visibleColumns.genre && (
                          <div className="min-w-[80px] border-l border-gray-700/60 pl-3">Genre</div>
                        )}
                        {visibleColumns.subgenre && (
                          <div className="min-w-[100px] border-l border-gray-700/60 pl-3">Sub-Genre</div>
                        )}
                        {visibleColumns.drumStyle && (
                          <div className="min-w-[100px] border-l border-gray-700/60 pl-3">Drum Style</div>
                        )}
                        {visibleColumns.timeSignature && (
                          <div className="min-w-[80px] border-l border-gray-700/60 pl-3">Time Sig</div>
                        )}
                        {visibleColumns.key && (
                          <div className="min-w-[60px] border-l border-gray-700/60 pl-3">Key</div>
                        )}
                        {visibleColumns.scale && (
                          <div className="min-w-[70px] border-l border-gray-700/60 pl-3">Scale</div>
                        )}
                        {visibleColumns.date && (
                          <div className="min-w-[100px] border-l border-gray-700/60 pl-3 hidden lg:block">Date</div>
                        )}
                        {visibleColumns.bpm && (
                          <div className="min-w-[50px] border-l border-gray-700/60 pl-3 hidden sm:block">BPM</div>
                        )}
                        {visibleColumns.duration && (
                          <div className="min-w-[60px] border-l border-gray-700/60 pl-3">Dur.</div>
                        )}
                        <div className="w-8">+</div>
                      </div>
                    </div>
                  )}
                  <MusicLibraryVirtualTrackScroller
                    scrollRef={queueRef}
                    count={sortedDisplayTracks.length}
                    enabled
                  >
                    {(index) => {
                    const track = sortedDisplayTracks[index]
                    const isPlaying = currentTrack?.id === track.id
                    const queueIndex = queue.findIndex(t => t.id === track.id)
                    return (
                      <div
                        key={track.id}
                        ref={isPlaying ? currentTrackRef : null}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/track-id', track.id)
                          const folderId = track.folderId || (track as any).folder_id || selectedFolder?.id || ''
                          if (folderId) e.dataTransfer.setData('text/track-folder', folderId)
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          // Double click: add to queue AND play
                          if (queueIndex < 0) {
                            // Track not in queue, add it first
                            addToQueue(track)
                          }
                          const updatedQueue = queueIndex >= 0 ? queue : [...queue, track]
                          // Determine source for continuous playback
                          const source = selectedFolder 
                            ? { type: 'folder' as const, id: selectedFolder.id }
                            : selectedPlaylist
                            ? { type: 'playlist' as const, id: selectedPlaylist.id }
                            : undefined
                          playTrack(track, updatedQueue, source)
                        }}
                        className={`group flex items-center gap-2 sm:gap-3 md:gap-4 px-2.5 sm:px-4 md:px-6 py-2.5 sm:py-3 cursor-pointer transition-colors touch-manipulation active:bg-gray-700/40 [content-visibility:auto] [contain-intrinsic-size:0_76px] ${
                          isPlaying
                            ? 'bg-blue-900/20 border-l-4 border-blue-500'
                            : 'hover:bg-gray-700/40'
                        }`}
                      >
                        <div className="text-xs sm:text-sm text-gray-400 w-6 sm:w-8 text-right font-medium hidden sm:block flex-shrink-0">
                          {isPlaying ? (
                            <span className="text-blue-400">▶</span>
                          ) : (
                            index + 1
                          )}
                        </div>
                        {/* Play button - always visible on mobile, shows on hover on desktop */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            // Single click on play button: just play (replace queue with this track)
                            // Determine source for continuous playback
                            const source = selectedFolder 
                              ? { type: 'folder' as const, id: selectedFolder.id }
                              : selectedPlaylist
                              ? { type: 'playlist' as const, id: selectedPlaylist.id }
                              : undefined
                            playTrack(track, [track], source)
                          }}
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-400 hover:text-blue-400 active:text-blue-300 p-1.5 sm:p-2 transition-all flex-shrink-0 touch-manipulation min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center"
                          title="Play"
                          aria-label={`Play ${track.title}`}
                        >
                          <FaPlay className="text-sm" />
                        </button>
                      {track.artwork ? (
                        <div className="relative w-11 h-11 sm:w-14 sm:h-14 rounded overflow-hidden flex-shrink-0 shadow-lg">
                          <Image
                            src={resolveImageUrl(track.artwork)}
                            alt={track.title}
                            fill
                            className="object-cover"
                            unoptimized={shouldUnoptimizeImage(track.artwork)}
                            sizes="(max-width: 640px) 44px, 56px"
                            priority={index < 15}
                            fetchPriority={index < 10 ? 'high' : 'auto'}
                          />
                        </div>
                      ) : (
                        <div className="w-11 h-11 sm:w-14 sm:h-14 rounded bg-gray-700/40 flex items-center justify-center flex-shrink-0">
                          <FaMusic className="text-gray-500 text-sm sm:text-base" />
                        </div>
                      )}
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs sm:text-sm truncate ${
                            isPlaying ? 'font-semibold text-white' : 'font-medium text-white'
                          }`}>{track.title}</div>
                          <div className="text-[10px] sm:text-xs text-gray-400 truncate mt-0.5">{track.artist}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1 sm:hidden">
                            {getTrackBpm(track) ? (
                              <span className="font-mono text-[10px] text-gray-400">{getTrackBpm(track)}</span>
                            ) : null}
                            {getTrackKey(track) ? (
                              <span className="font-mono text-[10px] text-gray-400">{getTrackKey(track)}</span>
                            ) : null}
                            <span className="font-mono text-[10px] text-gray-500">
                              {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        </div>
                        
                        {/* Dynamic Columns — desktop/tablet; mobile meta lives under title */}
                        {visibleColumns.genre && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[80px] hidden sm:block border-l border-gray-700/60 pl-3">
                            <div 
                              className="truncate" 
                              title={`${getTrackGenre(track) || '—'} | Has sonic_dna: ${!!track.sonic_dna} | Type: ${typeof track.sonic_dna}`}
                              onClick={() => {
                                console.log('Track data:', {
                                  title: track.title,
                                  sonic_dna: track.sonic_dna,
                                  genre: getTrackGenre(track),
                                  hasAnalysis: hasAnalysisData(track.sonic_dna)
                                })
                              }}
                            >
                              {getTrackGenre(track) || '—'}
                            </div>
                          </div>
                        )}
                        {visibleColumns.subgenre && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[100px] hidden sm:block border-l border-gray-700/60 pl-3">
                            <div className="truncate" title={getTrackSubgenre(track)}>
                              {getTrackSubgenre(track) || '—'}
                            </div>
                          </div>
                        )}
                        {visibleColumns.drumStyle && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[100px] hidden sm:block border-l border-gray-700/60 pl-3">
                            <div className="truncate" title={getTrackDrumStyle(track)}>
                              {getTrackDrumStyle(track) || '—'}
                            </div>
                          </div>
                        )}
                        {visibleColumns.timeSignature && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[80px] hidden sm:block font-mono border-l border-gray-700/60 pl-3">
                            {getTrackTimeSignature(track) || '—'}
                          </div>
                        )}
        {visibleColumns.key && (() => {
          const key = getTrackKey(track)
          return key ? (
            <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[60px] hidden sm:block font-mono border-l border-gray-700/60 pl-3">
              {key}
            </div>
          ) : null
        })()}
                        {visibleColumns.scale && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[70px] hidden sm:block border-l border-gray-700/60 pl-3">
                            {getTrackScale(track) || '—'}
                          </div>
                        )}
                        {visibleColumns.date && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[100px] hidden lg:block border-l border-gray-700/60 pl-3">
                            {getTrackDate(track) ? formatDate(getTrackDate(track)) : '—'}
                          </div>
                        )}
                        {visibleColumns.bpm && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[50px] hidden sm:block font-mono border-l border-gray-700/60 pl-3">
                            {getTrackBpm(track) || '—'}
                          </div>
                        )}
                        {visibleColumns.duration && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 font-mono border-l border-gray-700/60 pl-3 hidden sm:block">
                            {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                          </div>
                        )}
                        {isPlaylistEditMode && selectedPlaylist && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              handleRemoveTrackFromPlaylist(selectedPlaylist.id, track.id)
                            }}
                            className="text-red-400 hover:text-red-300 p-2 transition-colors flex items-center justify-center"
                            title="Remove from playlist"
                            aria-label={`Remove ${track.title} from playlist`}
                          >
                            <FaTrash className="text-sm" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddToQueue(track)
                          }}
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-400 hover:text-blue-400 active:text-blue-300 p-1.5 sm:p-2 transition-all touch-manipulation min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center shrink-0"
                          title="Add to queue"
                          aria-label={`Add ${track.title} to queue`}
                        >
                          <FaPlus className="text-sm" />
                        </button>
                      </div>
                    )
                    }}
                  </MusicLibraryVirtualTrackScroller>
                  {tracksHasMore && selectedFolder && (
                    <div className="px-4 py-4 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={loadMoreTracks}
                        disabled={tracksLoadingMore}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-600 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700/40 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {tracksLoadingMore ? 'Loading…' : 'Load more tracks'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
          </div>
          )}
        </div>

        {/* Search — scrolls with page; Crates header sticks under nav */}
        <div className="relative mt-2 sm:mt-8 mb-2 sm:mb-4">
          <FaSearch
            className="pointer-events-none absolute left-3 sm:left-4 top-1/2 z-[1] -translate-y-1/2 text-gray-400 text-sm sm:text-base"
            aria-hidden
          />
          <input
            type="text"
            placeholder="Search library"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 text-sm sm:text-base text-center bg-gray-800/40 border border-gray-700 rounded-lg text-white placeholder:text-center placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all touch-manipulation"
            aria-label="Search library"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <FaTimes />
            </button>
          )}
        </div>

        {searchQuery && filteredTracks.length > 0 && (
          <div className="mb-3 sm:mb-4 bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-900/40 border-b border-gray-700">
              <div className="text-sm font-medium text-gray-200">
                {filteredTracks.length} {filteredTracks.length === 1 ? 'result' : 'results'}
              </div>
            </div>
            <div className="divide-y divide-gray-700 max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
              {filteredTracks.map((track) => (
                <div
                  key={track.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/track-id', track.id)
                    const folderId = track.folderId || (track as any).folder_id || ''
                    if (folderId) e.dataTransfer.setData('text/track-folder', folderId)
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleTrackSelect(track)
                  }}
                  className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-gray-700/40 cursor-pointer transition-colors group touch-manipulation [content-visibility:auto] [contain-intrinsic-size:0_76px]"
                >
                  {track.artwork ? (
                    <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0 shadow-lg">
                      <Image
                        src={resolveImageUrl(track.artwork)}
                        alt={track.title}
                        fill
                        className="object-cover"
                        unoptimized={shouldUnoptimizeImage(track.artwork)}
                        sizes="48px"
                        priority={displayTracks.indexOf(track) < 15}
                        fetchPriority={displayTracks.indexOf(track) < 10 ? 'high' : 'auto'}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-700/40 flex items-center justify-center flex-shrink-0">
                      <FaMusic className="text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{track.title}</div>
                    <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <BpmBadge bpm={track.bpm} size="xs" />
                      <KeyBadge keySignature={track.key_signature || getTrackKey(track)} size="xs" />
                      <DnaMatchBadge
                        bpm={track.bpm}
                        keySignature={track.key_signature || getTrackKey(track)}
                        energy={6}
                        size="xs"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddToQueue(track)
                    }}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-400 hover:text-blue-400 active:text-blue-300 p-2 sm:p-2 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation shrink-0"
                    title="Add to queue"
                    aria-label={`Add ${track.title} to queue`}
                  >
                    <FaPlus className="text-sm" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* overflow-visible so sticky Crates / sidebar can pin under site nav */}
        <div className="w-full min-w-0 min-h-[240px] sm:min-h-[320px] rounded-xl border border-gray-800 bg-gray-900/30 overflow-visible">
          <SergBrowser
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        </div>

        <div className="mt-8 mb-2 sm:mt-10 sm:mb-4 text-center">
          <SocialLinks />
        </div>

      </div>

      {/* Music Player is now global - no need to render here */}

      {showAddTrackModal && selectedPlaylist && (
        <div
          className="pointer-events-auto absolute inset-0 z-[10000] flex items-center justify-center bg-black/70 px-4"
          onClick={() => setShowAddTrackModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add tracks to playlist"
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-indigo-600/40 bg-gray-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-white">Add Tracks</div>
                <div className="text-xs text-gray-400">Playlist: {selectedPlaylist.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTrackModal(false)}
                className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                aria-label="Close add tracks"
              >
                Close
              </button>
            </div>
            <div className="px-4 py-3 border-b border-gray-800">
              <input
                value={addTrackQuery}
                onChange={(e) => setAddTrackQuery(e.target.value)}
                placeholder="Search tracks by title or artist"
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {availableTracksForPlaylist.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  No tracks available to add.
                </div>
              ) : (
                <ul className="divide-y divide-gray-800">
                  {availableTracksForPlaylist.slice(0, 200).map((track) => (
                    <li key={track.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{track.title}</div>
                        <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddTrackToPlaylist(selectedPlaylist.id, track.id)}
                        className="ml-4 inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                      >
                        <FaPlus className="text-[10px]" />
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Smart Playlist Builder Modal */}
      {showSmartPlaylistBuilder && (
        <SmartPlaylistBuilder
          onClose={() => setShowSmartPlaylistBuilder(false)}
          onCreated={() => {}}
          overlayScope="content"
        />
      )}

      {/* Expanded Artwork Modal */}
      {isArtworkExpanded && currentTrack && currentTrack.artwork && (
        <div 
          className="pointer-events-auto absolute inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIsArtworkExpanded(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsArtworkExpanded(false)
              }}
              className="absolute top-4 right-4 z-10 bg-gray-800/40 hover:bg-gray-700/40 text-white p-3 rounded-full transition-colors shadow-lg"
              title="Close"
              aria-label="Close artwork"
            >
              <FaTimes className="text-xl" />
            </button>
            <div 
              className="relative w-full aspect-square rounded-lg overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={resolveImageUrl(currentTrack.artwork)}
                alt={currentTrack.title}
                fill
                className="object-contain"
                unoptimized={shouldUnoptimizeImage(currentTrack.artwork)}
                sizes="(max-width: 768px) 100vw, 80vw"
                priority
                fetchPriority="high"
              />
            </div>
            <div className="mt-4 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="text-xl font-semibold text-white mb-1">{currentTrack.title}</div>
              <div className="text-lg text-gray-400">{currentTrack.artist}</div>
            </div>
          </div>
        </div>
      )}

      <div
        id={MUSIC_LIBRARY_OVERLAY_HOST_ID}
        className="pointer-events-none absolute inset-0 z-[10000] overflow-hidden"
        aria-hidden
      />
    </div>
  )
}

export default function MusicLibrary() {
  // Keep SSR and the first client render identical (loading shell).
  // Cache paint happens after mount so we never hydrate MusicLibraryMain vs spinner.
  const [libraryData, setLibraryData] = useState<MusicLibraryData | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(true)

  useLayoutEffect(() => {
    const cached = peekCachedMusicLibrary()
    if (cached) {
      setLibraryData(cached)
      setLoadingLibrary(false)
    }
  }, [])

  useEffect(() => {
    let seen = 0
    let cancelled = false
    let abortHydration: (() => void) | null = null
    let idleHydrationId: number | undefined
    let idleHydrationTimeout: ReturnType<typeof setTimeout> | undefined
    const loadLibraryData = async (skipCache = false) => {
      try {
        // Paint from cache immediately when available; only show full-page spinner on cold start
        if (!skipCache) {
          const cached = peekCachedMusicLibrary()
          if (cached) {
            setLibraryData(cached)
            setLoadingLibrary(false)
          } else {
            setLoadingLibrary(true)
          }
        }
        if (skipCache) invalidateMusicLibraryCache()
        // Sync already returns folders with light track rows — show UI as soon as it returns.
        // Do not block on paginated tracks-optimized hydration.
        const [libraryDataResult, playlistsResult] = await Promise.all([
          fetchMusicLibrary({ skipCache }),
          fetchPlaylists(),
        ])
        if (cancelled) return
        setLibraryData(libraryDataResult)
        setPlaylists(playlistsResult)
        setLoadingLibrary(false)

        // Bootstrap has empty tracks — defer full summary hydration until idle, and
        // pause while the user is actively playing so DB pages don't fight audio.
        const countTracks = (folders: typeof libraryDataResult.folders | undefined): number => {
          let n = 0
          const walk = (nodes: typeof folders) => {
            for (const f of nodes || []) {
              n += f.tracks?.length || 0
              if (f.children?.length) walk(f.children)
            }
          }
          walk(folders)
          return n
        }
        if (countTracks(libraryDataResult.folders) === 0) {
          const ac = new AbortController()
          abortHydration = () => ac.abort()
          const shouldPause = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true
            try {
              return Boolean((window as any).__sergikVaultPlaybackBusy)
            } catch {
              return false
            }
          }
          const startHydration = () => {
            if (cancelled || ac.signal.aborted) return
            void fetchAllTracksSummaryForHydration({
              includeArchived: false,
              signal: ac.signal,
              shouldPause,
            })
              .then((summaryTracks) => {
                if (cancelled || ac.signal.aborted || !summaryTracks.length) return
                setLibraryData((prev) => {
                  const next = hydrateLibraryWithTracks(prev, summaryTracks) || prev
                  if (next) seedMusicLibraryCache(next, { persist: true })
                  return next
                })
              })
              .catch((err) => {
                if (err?.name === 'AbortError') return
              })
          }
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            idleHydrationId = window.requestIdleCallback(startHydration, { timeout: 6000 })
          } else {
            idleHydrationTimeout = setTimeout(startHydration, 2000)
          }
        }
      } catch (error) {
        console.error('Error loading library data:', error)
        if (!cancelled) setLoadingLibrary(false)
      }
    }
    const refreshIfPublished = async () => {
      try {
        const res = await fetch('/api/music-library/catalog-version', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const version = Number(data?.version) || 0
        if (seen && version && version !== seen) {
          await loadLibraryData(true)
        }
        if (version) seen = version
      } catch {
        /* ignore */
      }
    }
    void loadLibraryData()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshIfPublished()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      abortHydration?.()
      if (idleHydrationId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleHydrationId)
      }
      if (idleHydrationTimeout != null) clearTimeout(idleHydrationTimeout)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (loadingLibrary) {
    return (
      <div className="pt-20 min-h-screen pb-40 relative z-10 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-2">Loading music library...</div>
          <div className="text-gray-400 text-sm">Fetching playlists and tracks</div>
        </div>
      </div>
    )
  }

  if (!libraryData) {
    return (
      <div className="pt-20 min-h-screen pb-40 relative z-10 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-2">Failed to load music library</div>
          <div className="text-gray-400 text-sm">Please refresh the page</div>
        </div>
      </div>
    )
  }

  return (
    <MusicLibraryMain
      libraryData={libraryData}
      setLibraryData={setLibraryData}
      playlists={playlists}
      setPlaylists={setPlaylists}
    />
  )
}
