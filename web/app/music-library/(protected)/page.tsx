'use client'

import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react'
import Image from 'next/image'
import { FaSearch, FaTimes, FaTrash, FaPlus, FaMusic, FaExpand, FaCompress, FaChevronDown, FaChevronUp, FaBrain, FaArrowLeft, FaPlay, FaSort, FaSortAlphaDown, FaSortAlphaUp, FaSortNumericDown, FaSortNumericUp, FaClock, FaColumns, FaCheckSquare, FaSquare, FaCalendar, FaFolder, FaChevronRight, FaEdit } from 'react-icons/fa'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import FolderTree from '@/components/FolderTree'
import { 
  TrackBadgesRow, 
  EnhancedTrackBadgesRow,
  BpmBadge, 
  KeyBadge, 
  EnergyBadge, 
  DnaMatchBadge,
  DnaMatchScoreBadge,
  MoodBadge,
  SubgenreBadge,
  DrumStyleBadge,
  ProductionEraBadge,
  MixingRecommendations,
  TrackDescription,
  InstrumentSignatures,
  CompatibleKeysBadge
} from '@/components/music/MusicBadges'
import PlaylistManager from '@/components/PlaylistManager'
import SonicDNA from '@/components/SonicDNA'
import { fetchMusicLibrary, fetchPlaylists, fetchTracksSummary, createPlaylist, updatePlaylist, deletePlaylist, updateTrack, recordTrackPlay, type MusicLibraryData } from '@/utils/musicLibraryApi'
import ITunesBrowser from '@/components/music/ITunesBrowser'
import NavigationButtons from '@/components/NavigationButtons'
import SmartPlaylistBuilder from '@/components/music/SmartPlaylistBuilder'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { GenreAnalyzer, extractCharacteristicsFromSonicDna, type TrackCharacteristics } from '@/utils/genreAnalyzer'
import { areKeysCompatible } from '@/types/sergik-data'


interface Track {
  id: string
  folderId?: string
  audioFileId?: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
  bpm?: number
  key_signature?: string
  sonic_dna?: any
  created_at?: string
  date?: string
  year?: number
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

// Helper to filter out hidden folders from display
const filterVisibleFolders = (folders: FolderItem[] | undefined): FolderItem[] => {
  if (!folders) return []
  return folders.filter(f => !f.hidden)
}

/** Display-only labels in FolderTree (source data name unchanged). */
const FOLDER_TREE_DISPLAY_NAMES: Record<string, string> = {
  'Curated ID Playlists': 'Curated Singles & Loose IDs Albums',
  SERGIK: 'SERGIK EP Collection',
}

/** At Discography root, vault grid only promotes these entries (ids from library JSON / admin scripts). */
const DISCOGRAPHY_VAULT_GRID_FOLDER_IDS = new Set(['folder-playlists', 'artist-sergik'])

/** Hidden from sidebar/mobile full tree; shown in main panel nav instead. */
const VAULT_FOLDER_TREE_HIDE_IDS = ['folder-all-tracks', 'folder-discography', 'folder-playlists'] as const

/** Main panel FolderTree: curated playlists first, then SERGIK EP hub (matches fan-facing priority). */
const VAULT_MAIN_NAV_TREE_ORDER = ['folder-playlists', 'artist-sergik'] as const

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

export default function MusicLibrary() {
  const {
    currentTrack,
    queue,
    currentIndex,
    isPlaying,
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
  } = useMusicPlayer()
  
  // Library data state - loaded from API
  const [libraryData, setLibraryData] = useState<MusicLibraryData | null>(null)
  const [loadingLibrary, setLoadingLibrary] = useState(true)
  
  const [playlists, setPlaylists] = useState<Playlist[]>([])
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
  const currentTrackRef = useRef<HTMLDivElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const folderDropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const layoutRef = useRef<HTMLDivElement>(null)
  const coverGridWidthRef = useRef(680)
  const coverGridResizeRef = useRef({ startX: 0, startWidth: 680 })

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

  const hydrateLibraryWithTracks = (library: MusicLibraryData | null, apiTracks: Track[]) => {
    if (!library?.folders || apiTracks.length === 0) return library

    const tracksById = new Map<string, Track>()
    const tracksByAudioId = new Map<string, Track>()
    const tracksByFile = new Map<string, Track>()
    apiTracks.forEach((track) => {
      if (track?.id) tracksById.set(track.id, track)
      const audioId = (track as any)?.audioFileId || (track as any)?.audio_file_id
      if (audioId) tracksByAudioId.set(audioId, track)
      if (track?.file) tracksByFile.set(track.file, track)
    })

    const mergeTrack = (track: Track): Track => {
      const audioId = (track as any)?.audioFileId || (track as any)?.audio_file_id
      const rich =
        tracksById.get(track.id) ||
        (audioId ? tracksByAudioId.get(audioId) : undefined) ||
        (track.file ? tracksByFile.get(track.file) : undefined)
      return rich ? { ...track, ...rich } : track
    }

    const mapFolders = (items: FolderItem[]): FolderItem[] =>
      items.map((item) => ({
        ...item,
        tracks: item.tracks ? item.tracks.map(mergeTrack) : item.tracks,
        children: item.children ? mapFolders(item.children) : item.children,
      }))

    return {
      ...library,
      folders: mapFolders(library.folders),
    }
  }

  const TRACKS_PAGE_SIZE = 200

  const resetTrackPagination = (folderId: string | null, hasMore: boolean, offset: number) => {
    setTracksFolderId(folderId)
    setTracksHasMore(hasMore)
    setTracksOffset(offset)
  }

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

  // Load library data from API on mount
  useEffect(() => {
    const loadLibraryData = async () => {
      try {
        setLoadingLibrary(true)
        const [libraryDataResult, playlistsResult] = await Promise.all([
          fetchMusicLibrary(),
          fetchPlaylists()
        ])
        const summaryTracksResult = await fetchTracksSummary(undefined, { includeArchived: true })
        const hydratedLibrary = hydrateLibraryWithTracks(libraryDataResult, summaryTracksResult.tracks)
        setLibraryData(hydratedLibrary || libraryDataResult)
        setPlaylists(playlistsResult)
      } catch (error) {
        console.error('Error loading library data:', error)
      } finally {
        setLoadingLibrary(false)
      }
    }
    loadLibraryData()
  }, [])

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
            setPlaylistsNeedMembership(pr.status === 403)
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

  // Preload artwork URLs for visible tracks (prioritize first 30 tracks)
  useEffect(() => {
    if (!libraryData || !displayTracks.length) return

    // Get first 30 visible tracks with artwork
    const tracksToPreload = displayTracks
      .filter(track => track.artwork)
      .slice(0, 30)

    // Preload artwork URLs using link preload
    tracksToPreload.forEach((track, index) => {
      const artworkUrl = resolveImageUrl(track.artwork!)
      
      // Create link element for preloading
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = artworkUrl
      link.setAttribute('fetchpriority', index < 10 ? 'high' : 'auto')
      
      // Only add if not already in DOM
      if (!document.querySelector(`link[href="${artworkUrl}"]`)) {
        document.head.appendChild(link)
      }
    })
  }, [libraryData, displayTracks])

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

    const getBpm = (track: Track): number => {
      if (track.bpm) return track.bpm
      if (!track.sonic_dna) return SERGIK_DEFAULTS.bpm
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        return dna?.technical?.bpm || 
               dna?.comprehensive?.technical?.bpm ||
               dna?.bpm ||
               SERGIK_DEFAULTS.bpm
      } catch {
        return SERGIK_DEFAULTS.bpm
      }
    }

    const getKey = (track: Track): string => {
      if (track.key_signature && track.key_signature !== 'Unknown' && track.key_signature !== '') {
        return track.key_signature
      }
      if (!track.sonic_dna) {
        if (track.bpm && track.bpm < 100) return '7A'
        return SERGIK_DEFAULTS.key
      }
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const key = dna?.musical?.keySignature || 
               dna?.technical?.key?.key || 
               dna?.comprehensive?.technical?.key?.key ||
               dna?.key?.key ||
               dna?.analysis?.key ||
               ''
        if (key) return key
        if (track.bpm && track.bpm < 100) return '7A'
        return SERGIK_DEFAULTS.key
      } catch {
        return ''
      }
    }

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
  const getTrackGenre = (track: Track): string => {
    // First check if sonic_dna has an explicit genre
    if (track.sonic_dna) {
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const explicitGenre = dna?.genres?.primaryGenres?.[0] || 
                              dna?.comprehensive?.genres?.primary?.[0] ||
                              dna?.genres?.primary?.[0] || 
                              dna?.genre || 
                              dna?.analysis?.genre
        if (explicitGenre) return explicitGenre
      } catch {}
    }
    
    // Use comprehensive GenreAnalyzer for inference
    const characteristics = extractCharacteristicsFromSonicDna(track.sonic_dna)
    
    // Add BPM from track if not in sonic_dna
    if (!characteristics.bpm && track.bpm) {
      characteristics.bpm = track.bpm
    }
    
    // Add key from track if not in characteristics
    if (!characteristics.key && track.key_signature) {
      characteristics.key = track.key_signature
    }
    
    const analyzer = new GenreAnalyzer(characteristics)
    return analyzer.inferGenre()
  }

  const getTrackSubgenre = (track: Track): string => {
    // First check if sonic_dna has an explicit subgenre
    if (track.sonic_dna) {
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const explicitSubgenre = dna?.genres?.subgenres?.[0] || 
                                 dna?.comprehensive?.genres?.subgenres?.[0] ||
                                 dna?.subgenre
        if (explicitSubgenre) return explicitSubgenre
      } catch {}
    }
    
    // Use GenreAnalyzer for inference
    const characteristics = extractCharacteristicsFromSonicDna(track.sonic_dna)
    if (!characteristics.bpm && track.bpm) characteristics.bpm = track.bpm
    if (!characteristics.key && track.key_signature) characteristics.key = track.key_signature
    
    const analyzer = new GenreAnalyzer(characteristics)
    return analyzer.inferSubgenre()
  }

  const getTrackDrumStyle = (track: Track): string => {
    const drumInfo = extractDrumPatternInfo(track)
    
    if (!track.sonic_dna) {
      return inferDrumStyleFromGenre(getTrackGenre(track), track.bpm, drumInfo)
    }
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      // Try multiple possible paths for drum style
      const drumStyle = dna?.drums?.genreStyles?.[0] || 
             dna?.comprehensive?.drums?.genreStyles?.primary?.[0] ||
             dna?.drums?.patternType || 
             dna?.drums?.style ||
             dna?.analysis?.drumStyle ||
             ''
      return drumStyle || inferDrumStyleFromGenre(getTrackGenre(track), track.bpm, drumInfo)
    } catch {
      return inferDrumStyleFromGenre(getTrackGenre(track), track.bpm, drumInfo)
    }
  }

  const getTrackTimeSignature = (track: Track): string => {
    if (!track.sonic_dna) return SERGIK_DEFAULTS.timeSignature
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      // Try multiple possible paths for time signature
      return dna?.musical?.timeSignature || 
             dna?.technical?.timeSignature || 
             dna?.comprehensive?.technical?.timeSignature ||
             dna?.timeSignature ||
             dna?.analysis?.timeSignature ||
             SERGIK_DEFAULTS.timeSignature
    } catch {
      return SERGIK_DEFAULTS.timeSignature
    }
  }

  const getTrackKey = (track: Track): string => {
    // First check direct key_signature field
    if (track.key_signature && track.key_signature !== 'Unknown' && track.key_signature !== '') {
      return track.key_signature
    }
    const camelCaseKey = (track as any)?.keySignature
    if (camelCaseKey && camelCaseKey !== 'Unknown') {
      return camelCaseKey
    }
    // Fallback to metadata key_signature if present
    const metaKey =
      (track as any)?.metadata?.key_signature ||
      (track as any)?.metadata?.keySignature ||
      (track as any)?.metadata?.key ||
      (track as any)?.metadata?.camelot
    if (metaKey && metaKey !== 'Unknown') {
      return metaKey
    }
    const sonicDnaSource = track.sonic_dna || (track as any)?.metadata?.sonic_dna
    if (!sonicDnaSource) {
      return ''
    }
    try {
      const dna = typeof sonicDnaSource === 'string' ? JSON.parse(sonicDnaSource) : sonicDnaSource
      // Try multiple possible paths for key
      const key =
        dna?.harmony?.keySignature ||
        dna?.musical?.keySignature ||
        dna?.comprehensive?.harmony?.keySignature ||
        dna?.technical?.key?.key ||
        dna?.comprehensive?.technical?.key?.key ||
        dna?.key?.key ||
        dna?.analysis?.key ||
        dna?.harmony?.camelot ||
        dna?.technical?.camelot ||
        ''
      if (key && key !== 'Unknown') return key
      return ''
    } catch {
      return ''
    }
  }

  const getTrackScale = (track: Track): string => {
    if (!track.sonic_dna) {
      // Infer scale from key
      const key = getTrackKey(track)
      if (key.includes('A')) return 'Minor'
      if (key.includes('B')) return 'Major'
      return SERGIK_DEFAULTS.scale
    }
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      // Try multiple possible paths for scale
      const scale = dna?.musical?.scale || 
             dna?.technical?.key?.scale || 
             dna?.technical?.key?.mode ||
             dna?.comprehensive?.technical?.key?.scale ||
             dna?.key?.scale ||
             dna?.key?.mode ||
             ''
      if (scale) return scale
      // Infer from key
      const key = getTrackKey(track)
      if (key.includes('A')) return 'Minor'
      if (key.includes('B')) return 'Major'
      return SERGIK_DEFAULTS.scale
    } catch {
      return SERGIK_DEFAULTS.scale
    }
  }

  const getTrackDate = (track: Track): string => {
    // Try multiple date sources
    if (track.created_at) return track.created_at
    if (track.date) return track.date
    if (track.year) return track.year.toString()
    // Default to current year for SERGIK productions
    return new Date().getFullYear().toString()
  }

  // Get track energy level (for badges)
  const getTrackEnergy = (track: Track): number => {
    if (!track.sonic_dna) {
      // Infer from BPM
      if (track.bpm) {
        if (track.bpm < 90) return 4
        if (track.bpm >= 90 && track.bpm < 110) return 5
        if (track.bpm >= 110 && track.bpm < 125) return 6
        if (track.bpm >= 125 && track.bpm < 135) return 7
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

  // Get track BPM with fallback
  const getTrackBpm = (track: Track): number => {
    if (track.bpm) return track.bpm
    if (!track.sonic_dna) return SERGIK_DEFAULTS.bpm
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.technical?.bpm || 
             dna?.comprehensive?.technical?.bpm ||
             dna?.bpm ||
             SERGIK_DEFAULTS.bpm
    } catch {
      return SERGIK_DEFAULTS.bpm
    }
  }

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

  // Get mixing recommendations from enriched sonic_dna
  const getTrackMixingRecommendations = (track: Track): { bpmRange?: { min: number; max: number }; compatibleKeys?: string[]; mixableGenres?: string[] } | null => {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      const mixing = dna?.mixing
      if (!mixing) return null
      return {
        bpmRange: mixing.bpmRange,
        compatibleKeys: mixing.compatibleKeys,
        mixableGenres: mixing.mixableGenres
      }
    } catch {
      return null
    }
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
      const refreshedTracks = await fetchTracksSummary(undefined, { includeArchived: true })
      const hydrated = hydrateLibraryWithTracks(updatedLibrary, refreshedTracks.tracks)
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

  // Set default folder on mount - "Discography" (first folder)
  // Track if we've initialized the default selection
  const defaultFolderInitRef = useRef(false)
  
  useEffect(() => {
    if (!libraryData?.folders) return
    
    // Skip if already initialized with user selection
    if (defaultFolderInitRef.current && selectedFolder) return
    
    const folders = libraryData.folders
    
    // Helper to find folder with children in library data (deep search)
    const findFolderWithChildren = (items: FolderItem[], targetId: string): FolderItem | null => {
      for (const item of items) {
        if (item.id === targetId) return item
        if (item.children) {
          const found = findFolderWithChildren(item.children, targetId)
          if (found) return found
        }
      }
      return null
    }
    
    // Try to find Discography first, then SERGIK EP Collection, then first available folder
    const defaultFolderRef = folders.find(f => f.name === 'Discography' && f.id === 'folder-discography') ||
                          folders.find(f => f.name === 'SERGIK EP Collection' || f.id === 'artist-sergik') ||
                          (folders.length > 0 ? folders[0] : null)
    
    if (defaultFolderRef) {
      // Get the full folder data with children from library
      const fullFolder = findFolderWithChildren(folders, defaultFolderRef.id) || defaultFolderRef
      
      // Only update if we have children now (data fully loaded)
      if (fullFolder.children && fullFolder.children.length > 0) {
        // Mark as initialized
        defaultFolderInitRef.current = true
        
        // Set selected folder and display its child folders/albums (filter hidden)
        setSelectedFolder(fullFolder)
        setSelectedPlaylist(null)
        setDisplayFolders(filterVisibleFolders(fullFolder.children))
        setDisplayTracks([])
      } else if (!defaultFolderInitRef.current) {
        // No children yet, but set folder and try loading tracks
        defaultFolderInitRef.current = true
        setSelectedFolder(fullFolder)
        setSelectedPlaylist(null)
        
        // Always fetch tracks from API to get complete data including sonic_dna
        const loadTracksFromAPI = async () => {
          try {
            const { fetchTracks, fetchTracksSummary } = await import('@/utils/musicLibraryApi')
            const summaryResult = await fetchTracksSummary(fullFolder.id, { includeArchived: true, limit: TRACKS_PAGE_SIZE, offset: 0 })
            if (summaryResult.tracks && summaryResult.tracks.length > 0) {
              setDisplayTracks(summaryResult.tracks)
            } else if (fullFolder.tracks && fullFolder.tracks.length > 0) {
              // Fallback to folder tracks if API doesn't return any
              setDisplayTracks(fullFolder.tracks)
            } else {
              setDisplayTracks([])
            }
            resetTrackPagination(fullFolder.id, Boolean(summaryResult.hasMore), summaryResult.tracks?.length || 0)
            setDisplayFolders([])
          } catch (error) {
            console.error('Error fetching tracks from API:', error)
            // Fallback to folder tracks
            if (fullFolder.tracks && fullFolder.tracks.length > 0) {
              setDisplayTracks(fullFolder.tracks)
            } else {
              setDisplayTracks([])
            }
            resetTrackPagination(fullFolder.id, false, 0)
            setDisplayFolders([])
          }
        }
        loadTracksFromAPI()
      }
    }
  }, [libraryData]) // Only depend on libraryData, not selectedFolder

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
    const queue = selectedIndex >= 0
      ? [sortedTracks[selectedIndex], ...sortedTracks.slice(0, selectedIndex), ...sortedTracks.slice(selectedIndex + 1)]
      : sortedTracks.length > 0 ? sortedTracks : [track]
    
    // Determine source for continuous playback
    const source = sourceFolderId 
      ? { type: 'folder' as const, id: sourceFolderId }
      : undefined // If no folder found, will fallback to "All Tracks" in auto-queue
    
    // Play the track with the full folder queue
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
      
      // Fetch tracks summary first
      try {
        const { fetchTracksSummary } = await import('@/utils/musicLibraryApi')
        const summaryResult = await fetchTracksSummary(folder.id, { includeArchived: false, limit: TRACKS_PAGE_SIZE, offset: 0 })
        const summaryTracks = summaryResult.tracks || []
        if (summaryTracks.length > 0) {
          if (folder.id === 'folder-all-tracks') {
            const seen = new Set<string>()
            const deduped = summaryTracks.filter((t: any) => {
              const audioId = t?.audioFileId || t?.audio_file_id
              if (!audioId) return false
              if (seen.has(audioId)) return false
              seen.add(audioId)
              return true
            })
            setDisplayTracks(deduped)
          } else {
            setDisplayTracks(summaryTracks)
          }
        } else {
          setDisplayTracks([])
        }
        resetTrackPagination(folder.id, Boolean(summaryResult.hasMore), summaryTracks.length)
        setDisplayFolders([])
      } catch (error) {
        console.error('Error fetching tracks:', error)
        // Fallback to folder tracks
        if (folder.id === 'folder-all-tracks') {
          const seen = new Set<string>()
          const deduped = (fullFolder.tracks || []).filter((t: any) => {
            const audioId = t?.audioFileId || t?.audio_file_id
            if (!audioId) return false
            if (seen.has(audioId)) return false
            seen.add(audioId)
            return true
          })
          setDisplayTracks(deduped)
        } else {
          setDisplayTracks(fullFolder.tracks)
        }
        resetTrackPagination(folder.id, false, 0)
        setDisplayFolders([])
      }
      return
    }

    // Check for children - use fullFolder which has the complete data
    const visibleChildren = filterVisibleFolders(fullFolder.children)
    if (visibleChildren.length > 0) {
      // Show child folders/albums in main area (filtered for hidden)
      setDisplayFolders(visibleChildren)
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
        // Show parent folder's children
        handleFolderSelect(parentFolder)
      } else {
        // Go back to default folder (Discography or first folder)
        const folders = libraryData.folders
        const defaultFolder = folders.find(f => f.name === 'Discography' && f.id === 'folder-discography') ||
                              (folders.length > 0 ? folders[0] : null)
        if (defaultFolder) {
          setSelectedFolder(defaultFolder)
          const visibleChildren = filterVisibleFolders(defaultFolder.children)
          if (visibleChildren.length > 0) {
            setDisplayFolders(visibleChildren)
            setDisplayTracks([])
          } else {
            setDisplayFolders([])
            setDisplayTracks([])
          }
        }
      }
    } else {
      // No selected folder, go to default
      if (!libraryData?.folders) return
      
      const folders = libraryData.folders
      const defaultFolder = folders.find(f => f.name === 'Discography' && f.id === 'folder-discography') ||
                            (folders.length > 0 ? folders[0] : null)
      if (defaultFolder) {
        setSelectedFolder(defaultFolder)
        const visibleChildren = filterVisibleFolders(defaultFolder.children)
        if (visibleChildren.length > 0) {
          setDisplayFolders(visibleChildren)
          setDisplayTracks([])
        } else {
          setDisplayFolders([])
          setDisplayTracks([])
        }
      }
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
      if (fanUser) {
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
        return
      }

      const newPlaylist = await createPlaylist({
        id: `playlist-${Date.now()}`,
        name,
        description,
        trackIds: [],
      })
      if (newPlaylist) {
        setPlaylists([...playlists, newPlaylist])
      }
    } catch (error) {
      console.error('Error creating playlist:', error)
      alert('Failed to create playlist. Please try again.')
    }
  }

  const handleDeletePlaylist = async (id: string) => {
    try {
      if (fanPlaylists.some((p) => p.id === id)) {
        const res = await fetch(`/api/fan/playlists/${id}`, { method: 'DELETE', credentials: 'include' })
        if (res.ok) {
          setFanPlaylists((prev) => prev.filter((p) => p.id !== id))
        } else {
          alert('Failed to delete playlist. Please try again.')
        }
        return
      }

      const success = await deletePlaylist(id)
      if (success) {
        setPlaylists(playlists.filter(p => p.id !== id))
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
      if (fanPl) {
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
        return
      }

      const playlist = playlists.find(p => p.id === playlistId)
      if (!playlist) return

      const updatedTrackIds = [...playlist.trackIds, trackId]
      const updatedPlaylist = await updatePlaylist(playlistId, { trackIds: updatedTrackIds })
      
      if (updatedPlaylist) {
        setPlaylists(playlists.map(p => 
          p.id === playlistId ? updatedPlaylist : p
        ))
      }
    } catch (error) {
      console.error('Error adding track to playlist:', error)
      alert('Failed to add track to playlist. Please try again.')
    }
  }

  const handleRemoveTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    try {
      const fanPl = fanPlaylists.find((p) => p.id === playlistId)
      if (fanPl) {
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
        return
      }

      const playlist = playlists.find(p => p.id === playlistId)
      if (!playlist) return

      const updatedTrackIds = playlist.trackIds.filter(id => id !== trackId)
      const updatedPlaylist = await updatePlaylist(playlistId, { trackIds: updatedTrackIds })
      
      if (updatedPlaylist) {
        setPlaylists(playlists.map(p => 
          p.id === playlistId ? updatedPlaylist : p
        ))
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
          treeContainerClassName="divide-y divide-gray-700 max-h-[min(560px,50vh)] overflow-y-auto"
        />
      </div>
    ) : null

  // Show loading state while library data is being fetched
  if (loadingLibrary) {
    return (
      <div className="pt-20 min-h-screen pb-40 relative z-10 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-2">Loading music library...</div>
          <div className="text-gray-400 text-sm">Connecting to database</div>
        </div>
      </div>
    )
  }

  // Show error state if no library data
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
    <div className="pt-20 min-h-screen pb-40 relative z-10">
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-7xl relative z-10">
        {/* Header */}
        <div className="mb-8">
          {playlistsNeedMembership && (
            <div
              className="mb-4 rounded-lg border border-purple-500/50 bg-purple-950/50 px-4 py-3 text-sm text-gray-200 text-center max-w-2xl mx-auto"
              role="status"
            >
              <span className="font-medium text-white">Free fan membership: </span>
              sign in (magic link or password) to save playlists; add a password under account to purchase or download (
              <a href="/fan/register" className="text-purple-300 underline hover:text-purple-200">
                create account
              </a>
              ,{' '}
              <a href="/fan" className="text-purple-300 underline hover:text-purple-200">
                what&apos;s included
              </a>
              ).{' '}
              <a href="/shop/membership" className="text-purple-300 underline hover:text-purple-200">
                Paid plans
              </a>{' '}
              are optional. You can still listen in the vault with your current access.
            </div>
          )}
          <div className="flex flex-col items-center justify-center mb-4 sm:mb-6 w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold mb-1 font-six-caps text-center border border-yellow-400 text-yellow-400 px-3 sm:px-4 py-1.5 sm:py-2 rounded text-wrap">SERGIK Music Vault</h1>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4 sm:mb-6">
            <FaSearch className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm sm:text-base" />
            <input
              type="text"
              placeholder="Search your library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:pl-11 pr-9 sm:pr-10 py-2.5 sm:py-3 text-sm sm:text-base bg-gray-800/40 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all touch-manipulation"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <FaTimes />
              </button>
            )}
          </div>

          {/* Genre Filter Tabs & Key Filter */}
          <div className="mb-4 sm:mb-6 space-y-3">
            {/* Genre Tabs */}
            {availableGenres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setGenreFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
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
                    className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
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
            
            {/* Smart filters (expandable; key / Camelot removed) */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowSmartFiltersPanel(!showSmartFiltersPanel)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  showSmartFiltersPanel || hasSmartFilters
                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30'
                    : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                }`}
              >
                Smart filters
                {showSmartFiltersPanel ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
              </button>

              {(genreFilter !== 'all' || hasSmartFilters) && (
                <span className="text-xs text-gray-400">
                  Showing {filteredDisplayTracks.length} tracks
                </span>
              )}
            </div>

            {showSmartFiltersPanel && (
              <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-3 sm:p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-200 uppercase tracking-wide">Smart Filters</div>
                  {hasSmartFilters && (
                    <button
                      type="button"
                      onClick={resetSmartFilters}
                      className="text-[10px] text-gray-400 hover:text-gray-200"
                    >
                      Clear
                    </button>
                  )}
                </div>

                    {availableGenreFusions.length > 0 && (
                      <div>
                        <div className="text-[11px] text-gray-400 mb-2">Genre Fusion</div>
                        <div className="flex flex-wrap gap-2">
                          {availableGenreFusions.slice(0, 8).map((fusion) => {
                            const isActive = selectedGenreFusions.includes(fusion)
                            return (
                              <button
                                key={fusion}
                                onClick={() => {
                                  setSelectedGenreFusions((prev) =>
                                    prev.includes(fusion) ? prev.filter((item) => item !== fusion) : [...prev, fusion]
                                  )
                                }}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                                  isActive
                                    ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/40'
                                    : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                                }`}
                              >
                                {fusion}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {availableMicrogenres.length > 0 && (
                      <div>
                        <div className="text-[11px] text-gray-400 mb-2">Microgenres</div>
                        <div className="flex flex-wrap gap-2">
                          {availableMicrogenres.slice(0, 10).map((micro) => {
                            const isActive = selectedMicrogenres.includes(micro)
                            return (
                              <button
                                key={micro}
                                onClick={() => {
                                  setSelectedMicrogenres((prev) =>
                                    prev.includes(micro) ? prev.filter((item) => item !== micro) : [...prev, micro]
                                  )
                                }}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                                  isActive
                                    ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40'
                                    : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                                }`}
                              >
                                {micro}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {availableEmotions.length > 0 && (
                      <div>
                        <div className="text-[11px] text-gray-400 mb-2">Mood Cluster</div>
                        <div className="flex flex-wrap gap-2">
                          {availableEmotions.slice(0, 10).map((emotion) => {
                            const isActive = selectedEmotions.includes(emotion)
                            return (
                              <button
                                key={emotion}
                                onClick={() => {
                                  setSelectedEmotions((prev) =>
                                    prev.includes(emotion) ? prev.filter((item) => item !== emotion) : [...prev, emotion]
                                  )
                                }}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                                  isActive
                                    ? 'bg-pink-500/30 text-pink-200 border border-pink-500/40'
                                    : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                                }`}
                              >
                                {emotion}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2">
                        <span>Energy Range</span>
                        <span className="text-gray-300">{minEnergy}–{maxEnergy}</span>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={minEnergy}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            const next = Math.min(value, maxEnergy)
                            setMinEnergy(next)
                          }}
                          className="w-full accent-emerald-400"
                        />
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={maxEnergy}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            const next = Math.max(value, minEnergy)
                            setMaxEnergy(next)
                          }}
                          className="w-full accent-emerald-400"
                        />
                      </div>
                      <button
                        onClick={() => setEnergyPeaksOnly(!energyPeaksOnly)}
                        className={`mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                          energyPeaksOnly
                            ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/40'
                            : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                        }`}
                      >
                        ⚡ Energy Peaks (8+)
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2">
                        <span>Mood Intensity</span>
                        <span className="text-gray-300">{minMoodIntensity}–{maxMoodIntensity}</span>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={minMoodIntensity}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            const next = Math.min(value, maxMoodIntensity)
                            setMinMoodIntensity(next)
                          }}
                          className="w-full accent-pink-400"
                        />
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={maxMoodIntensity}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            const next = Math.max(value, minMoodIntensity)
                            setMaxMoodIntensity(next)
                          }}
                          className="w-full accent-pink-400"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-gray-400 mb-2">Crowd Time</div>
                      <div className="flex flex-wrap gap-2">
                        {(['warm-up', 'peak', 'cooldown'] as const).map((slot) => {
                          const isActive = crowdTimeFilter === slot
                          return (
                            <button
                              key={slot}
                              onClick={() => setCrowdTimeFilter(isActive ? 'all' : slot)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                                isActive
                                  ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                                  : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                              }`}
                            >
                              {slot}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2">
                        <span>Mix-Friendly</span>
                        {!currentTrack && <span className="text-[10px] text-gray-500">Select a track</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => currentTrack && setMixFriendlyOnly(!mixFriendlyOnly)}
                          disabled={!currentTrack}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                            mixFriendlyOnly
                              ? 'bg-blue-500/30 text-blue-200 border border-blue-500/40'
                              : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                          } ${!currentTrack ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Auto Score
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                            <span>Min</span>
                            <span className="text-gray-300">{minMixScore}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={minMixScore}
                            onChange={(event) => setMinMixScore(Number(event.target.value))}
                            className="w-full accent-blue-400"
                            disabled={!mixFriendlyOnly}
                          />
                        </div>
                      </div>
                    </div>
              </div>
            )}

          </div>

          {/* Search Results */}
          {searchQuery && filteredTracks.length > 0 && (
            <div className="mb-6 bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-900/40 border-b border-gray-700">
                <div className="text-sm font-medium text-gray-200">
                  {filteredTracks.length} {filteredTracks.length === 1 ? 'result' : 'results'}
                </div>
              </div>
              <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
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
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-700/40 cursor-pointer transition-colors group"
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
                      {/* Music Badges */}
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
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 p-2 transition-all"
                      title="Add to queue"
                    >
                      <FaPlus className="text-sm" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Now Playing - Top Row for Tablet/Mobile, Sidebar for Desktop */}
        {currentTrack && (
          <div className="mb-4 lg:hidden">
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
              {/* Track Info Section - Always Visible */}
              <div className="px-4 py-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Now Playing</div>
                  {isPlaying && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/20 rounded-full">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-blue-400 font-medium">Live</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-start gap-4">
                  {/* Artwork - Larger, More Prominent */}
                  {currentTrack.artwork ? (
                    <div 
                      className="relative w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 shadow-2xl cursor-pointer hover:scale-[1.02] transition-all duration-200 group ring-2 ring-gray-700/50 hover:ring-gray-600"
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
                        sizes="112px"
                        priority
                        fetchPriority="high"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-2">
                        <span className="text-white text-xs font-medium bg-black/70 px-2.5 py-1 rounded-md backdrop-blur-sm">
                          View Full Size
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0 shadow-lg border border-gray-600/50">
                      <FaMusic className="text-gray-400 text-3xl" />
                    </div>
                  )}
                  
                  {/* Track Details - Better Typography & Spacing */}
                  <div className="flex-1 min-w-0 pt-1">
                    <h3 className="text-lg font-bold text-white truncate mb-1 leading-tight">
                      {currentTrack.title}
                    </h3>
                    <p className="text-sm text-gray-300 truncate mb-2">
                      {currentTrack.artist}
                    </p>
                    
                    {/* Enriched Badges Row */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <BpmBadge bpm={getTrackBpm(currentTrack)} size="xs" />
                      <KeyBadge keySignature={getTrackKey(currentTrack)} size="xs" />
                      <EnergyBadge energy={getTrackEnergy(currentTrack)} size="xs" />
                      {getTrackDnaMatchScore(currentTrack) && (
                        <DnaMatchScoreBadge score={getTrackDnaMatchScore(currentTrack)} size="xs" />
                      )}
                    </div>
                    
                    {/* Genre & Mood Row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {getTrackGenre(currentTrack) && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {getTrackGenre(currentTrack)}
                        </span>
                      )}
                      {getTrackMood(currentTrack) && (
                        <MoodBadge mood={getTrackMood(currentTrack)} size="xs" />
                      )}
                      {getTrackProductionEra(currentTrack) && (
                        <ProductionEraBadge era={getTrackProductionEra(currentTrack)} size="xs" />
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Track Description */}
                {getTrackDescription(currentTrack) && (
                  <div className="px-4 py-2 border-t border-gray-800/30">
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                      {getTrackDescription(currentTrack)}
                    </p>
                  </div>
                )}
                
                {/* Mixing Recommendations - Compact */}
                {getTrackMixingRecommendations(currentTrack) && (
                  <div className="px-4 py-2 border-t border-gray-800/30 bg-gray-800/20">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-gray-500 font-medium">🎧 Mix with:</span>
                      <CompatibleKeysBadge 
                        currentKey={getTrackKey(currentTrack)} 
                        compatibleKeys={getTrackMixingRecommendations(currentTrack)?.compatibleKeys} 
                        size="xs" 
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Sonic DNA - Seamlessly Integrated Expandable Section */}
              <div className="border-t border-gray-800/40">
                <button
                  onClick={() => setIsSonicDNAExpanded(!isSonicDNAExpanded)}
                  className="w-full px-4 py-3.5 hover:bg-gray-800/40 active:bg-gray-800/40 transition-all duration-200 flex items-center justify-between text-left group focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-inset"
                  {...(isSonicDNAExpanded ? { 'aria-expanded': 'true' } : { 'aria-expanded': 'false' })}
                  aria-label={isSonicDNAExpanded ? 'Collapse Sonic DNA analysis' : 'Expand Sonic DNA analysis'}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                      <FaBrain className="text-purple-400 text-sm group-hover:text-purple-300 transition-colors" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-200 uppercase tracking-wide group-hover:text-white transition-colors">
                        Sonic DNA Analysis
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {isSonicDNAExpanded ? 'Tap to collapse' : 'Tap to explore track insights'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
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
                
                {/* Expandable Content with Smooth Animation */}
                <div 
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isSonicDNAExpanded 
                      ? 'max-h-[900px] opacity-100' 
                      : 'max-h-0 opacity-0'
                  }`}
                  {...(!isSonicDNAExpanded && { 'aria-hidden': 'true' })}
                >
                  <div className="px-4 pb-4 pt-2 border-t border-gray-800/40">
                    <SonicDNA
                      trackId={currentTrack.id}
                      trackFile={currentTrack.file}
                      trackTitle={currentTrack.title}
                      artistName={currentTrack.artist}
                      compact={true}
                      hideHeader={true}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Library Navigation - Top Row for Tablet/Mobile, Sidebar for Desktop */}
        <div className="mb-4 lg:hidden">
          <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
            <FolderTree
              items={libraryWithPlaylists?.folders || libraryData?.folders || []}
              onTrackSelect={handleTrackSelect}
              onFolderSelect={handleFolderSelect}
              onFolderPlay={handleFolderPlay}
              onTrackDrop={handleTrackDropOnFolder}
              hideFolderIds={[...VAULT_FOLDER_TREE_HIDE_IDS]}
              folderNameOverrides={FOLDER_TREE_DISPLAY_NAMES}
            />
          </div>
        </div>
        
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
                        <span className="truncate max-w-[150px] sm:max-w-[200px]">{folder.name}</span>
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
          {/* Library + Now Playing (full width, above main browser) */}
          <div className="hidden lg:block w-full">
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
              {/* Now Playing - Desktop Only */}
              {currentTrack && (
                <div className="bg-gray-900/40 border-b border-gray-700">
                  {/* Track Info Section - Always Visible */}
                  <div className="px-4 py-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Now Playing</div>
                      {isPlaying && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/20 rounded-full">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-blue-400 font-medium">Live</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-start gap-4">
                      {/* Artwork - Larger, More Prominent */}
                      {currentTrack.artwork ? (
                        <div 
                          className="relative w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 shadow-2xl cursor-pointer hover:scale-[1.02] transition-all duration-200 group ring-2 ring-gray-700/50 hover:ring-gray-600"
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
                            sizes="112px"
                            priority
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-2">
                            <span className="text-white text-xs font-medium bg-black/70 px-2.5 py-1 rounded-md backdrop-blur-sm">
                              View Full Size
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0 shadow-lg border border-gray-600/50">
                          <FaMusic className="text-gray-400 text-3xl" />
                        </div>
                      )}
                      
                      {/* Track Details - Better Typography & Spacing */}
                      <div className="flex-1 min-w-0 pt-1">
                        <h3 className="text-lg font-bold text-white truncate mb-1 leading-tight">
                          {currentTrack.title}
                        </h3>
                        <p className="text-sm text-gray-300 truncate mb-2">
                          {currentTrack.artist}
                        </p>
                        
                        {/* Enriched Badges Row */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          <BpmBadge bpm={getTrackBpm(currentTrack)} size="xs" />
                          <KeyBadge keySignature={getTrackKey(currentTrack)} size="xs" />
                          <EnergyBadge energy={getTrackEnergy(currentTrack)} size="xs" />
                          {getTrackDnaMatchScore(currentTrack) && (
                            <DnaMatchScoreBadge score={getTrackDnaMatchScore(currentTrack)} size="xs" />
                          )}
                        </div>
                        
                        {/* Genre & Mood Row */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getTrackGenre(currentTrack) && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              {getTrackGenre(currentTrack)}
                            </span>
                          )}
                          {getTrackMood(currentTrack) && (
                            <MoodBadge mood={getTrackMood(currentTrack)} size="xs" />
                          )}
                        </div>
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
                  
                  {/* Sonic DNA - Seamlessly Integrated Expandable Section */}
                  <div className="border-t border-gray-800/40">
                    <button
                      onClick={() => setIsSonicDNAExpanded(!isSonicDNAExpanded)}
                      className="w-full px-4 py-3.5 hover:bg-gray-800/40 active:bg-gray-800/40 transition-all duration-200 flex items-center justify-between text-left group focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-inset"
                      {...(isSonicDNAExpanded ? { 'aria-expanded': 'true' } : { 'aria-expanded': 'false' })}
                      aria-label={isSonicDNAExpanded ? 'Collapse Sonic DNA analysis' : 'Expand Sonic DNA analysis'}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                          <FaBrain className="text-purple-400 text-sm group-hover:text-purple-300 transition-colors" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-200 uppercase tracking-wide group-hover:text-white transition-colors">
                            Sonic DNA Analysis
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {isSonicDNAExpanded ? 'Tap to collapse' : 'Tap to explore track insights'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
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
                    
                    {/* Expandable Content with Smooth Animation */}
                    <div 
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        isSonicDNAExpanded 
                          ? 'max-h-[900px] opacity-100' 
                          : 'max-h-0 opacity-0'
                      }`}
                      {...(!isSonicDNAExpanded && { 'aria-hidden': 'true' })}
                    >
                      <div className="px-4 pb-4 pt-2 border-t border-gray-800/40">
                        <SonicDNA
                          trackId={currentTrack.id}
                          trackFile={currentTrack.file}
                          trackTitle={currentTrack.title}
                          artistName={currentTrack.artist}
                          compact={true}
                          hideHeader={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <FolderTree
                items={libraryWithPlaylists?.folders || libraryData?.folders || []}
                onTrackSelect={handleTrackSelect}
                onFolderSelect={handleFolderSelect}
                onFolderPlay={handleFolderPlay}
                onTrackDrop={handleTrackDropOnFolder}
                hideFolderIds={[...VAULT_FOLDER_TREE_HIDE_IDS]}
                folderNameOverrides={FOLDER_TREE_DISPLAY_NAMES}
              />
            </div>
          </div>

          {/* Main Content - Selected Folder/Playlist */}
          <div className="w-full lg:flex-1 lg:min-w-0">
            {displayFolders.length > 0 ? (
              <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden h-full">
                {vaultMainNavTreeEl}
                <div className="px-6 py-4 bg-gray-900/40 border-b border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleBack}
                      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
                      aria-label="Go back"
                      title="Go back"
                    >
                      <FaArrowLeft className="text-sm" />
                    </button>
                    <h2 className="text-lg font-semibold text-white">
                      {selectedFolder?.name || 'Folders'}
                    </h2>
                    <span className="text-sm text-gray-400">
                      {displayFoldersForGrid.length}{' '}
                      {displayFoldersForGrid.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>
                {/* Folder Grid Layout */}
                <div 
                  ref={queueRef}
                  className="p-4 sm:p-6 md:p-8 overflow-y-auto"
                >
                    <div className="relative w-full max-w-4xl mx-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {displayFoldersForGrid.map((folder) => {
                      // For "All Tracks" folder, count unique audioFileId values to avoid duplicates
                      // For other folders, use track array length
                      const trackCount = folder.id === 'folder-all-tracks' 
                        ? (() => {
                            const audioIds = new Set<string>()
                            folder.tracks?.forEach((t: any) => {
                              const id = t?.audioFileId || t?.audio_file_id
                              if (id) audioIds.add(id)
                            })
                            return audioIds.size
                          })()
                        : (folder.tracks?.length || 0)
                      const isAlbumOrEP = folder.type === 'album' || folder.type === 'ep' || folder.type === 'single' || folder.type === 'remix'
                      const isAllTracks = folder.id === 'folder-all-tracks'
                      
                      // Collect unique artwork from tracks and child folders for collage
                      let collageArtworks: string[] = []
                      const uniqueArtworks = new Set<string>()
                      
                      // Collect from direct tracks
                      if (folder.tracks && folder.tracks.length > 0) {
                        for (const track of folder.tracks) {
                          if (track.artwork) {
                            const resolved = resolveImageUrl(track.artwork)
                            if (resolved && !uniqueArtworks.has(resolved)) {
                              uniqueArtworks.add(resolved)
                              if (uniqueArtworks.size >= 9) break // Limit to 9 for 3x3 grid
                            }
                          }
                        }
                      }
                      
                      // Also collect from visible child folders if no direct tracks or need more artwork
                      // Pre-filter visible children for artwork collection
                      const preFilteredVisibleChildren = filterVisibleFolders(folder.children)
                      if (uniqueArtworks.size < 9 && preFilteredVisibleChildren.length > 0) {
                        for (const child of preFilteredVisibleChildren) {
                          // Get artwork from child folder or any track with artwork
                          const childArtwork = child.artwork || child.tracks?.find(t => t.artwork)?.artwork
                          if (childArtwork) {
                            const resolved = resolveImageUrl(childArtwork)
                            if (resolved && !uniqueArtworks.has(resolved)) {
                              uniqueArtworks.add(resolved)
                              if (uniqueArtworks.size >= 9) break
                            }
                          }
                        }
                      }
                      
                      collageArtworks = Array.from(uniqueArtworks)
                      
                      // Use collage if we have multiple unique artworks (2+), otherwise use single artwork
                      const hasMultipleArtworks = collageArtworks.length > 1
                      // Prefer folder artwork, then any collage artwork, then search visible children for artwork
                      const artworkRaw = hasMultipleArtworks 
                        ? null 
                        : (folder.artwork 
                          || collageArtworks[0] // Use first collected artwork if available
                          || (folder.tracks?.find(t => t.artwork)?.artwork)
                          || (preFilteredVisibleChildren.find(c => c.artwork)?.artwork)
                          || (preFilteredVisibleChildren.flatMap(c => c.tracks || []).find(t => t.artwork)?.artwork))
                      const artwork = artworkRaw ? resolveImageUrl(artworkRaw) : null
                      // Filter out hidden children for display
                      const visibleChildren = filterVisibleFolders(folder.children)
                      const hasChildren = visibleChildren.length > 0
                      const isExpanded = expandedFolders.has(folder.id)
                      
                      return (
                        <div
                          key={folder.id}
                          draggable
                          onDragStart={(e) => handleFolderDragStart(e, folder.id)}
                          onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                          onDragLeave={handleFolderDragLeave}
                          onDrop={(e) => handleFolderDrop(e, folder.id)}
                          onDragEnd={handleFolderDragEnd}
                          className={`transition-all duration-200 ${
                            draggedFolderId === folder.id ? 'opacity-50 scale-95' : ''
                          } ${
                            dragOverFolderId === folder.id ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-900 rounded-xl' : ''
                          }`}
                        >
                          <div
                            onClick={() => {
                              // Click on folder: navigate into it to show contents
                              if (folder.tracks && folder.tracks.length > 0 && !hasChildren) {
                                // Folder has only tracks, show them
                                setDisplayTracks(folder.tracks)
                                setDisplayFolders([])
                                setSelectedFolder(folder)
                                setFolderPath(prev => [...prev, folder])
                              } else if (hasChildren) {
                                // Folder has subfolders, navigate into it to show only subfolders
                                setDisplayFolders(visibleChildren)
                                setDisplayTracks([])
                                setSelectedFolder(folder)
                                setFolderPath(prev => [...prev, folder])
                                setExpandedFolders(new Set()) // Clear any expansions
                              } else if (folder.tracks && folder.tracks.length > 0) {
                                // Has both tracks and children - show tracks
                                setDisplayTracks(folder.tracks)
                                setDisplayFolders([])
                                setSelectedFolder(folder)
                                setFolderPath(prev => [...prev, folder])
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleFolderPlay(folder)
                            }}
                            className="group cursor-pointer transition-all duration-200 hover:scale-[1.02]"
                          >
                          {/* Cover Art Card */}
                          <div className="relative aspect-square rounded-lg overflow-hidden shadow-xl bg-gray-700/40 border border-gray-600/50 group-hover:border-gray-500 transition-colors">
                            {hasMultipleArtworks && collageArtworks.length > 0 ? (
                              <>
                                {/* Collage Grid - Show up to 9 unique artworks in a 3x3 grid */}
                                <div className="w-full h-full grid grid-cols-3 gap-0.5 p-0.5">
                                  {collageArtworks.slice(0, 9).map((artworkUrl, index) => (
                                    <div key={index} className="relative aspect-square overflow-hidden">
                                      <Image
                                        src={artworkUrl}
                                        alt={`${folder.name} artwork ${index + 1}`}
                                        fill
                                        className="object-cover"
                                        unoptimized={shouldUnoptimizeImage(artworkUrl)}
                                        sizes="(max-width: 768px) 16vw, 11vw"
                                        loading="lazy"
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement
                                          if (target) {
                                            target.style.display = 'none'
                                          }
                                        }}
                                      />
                                    </div>
                                  ))}
                                  {/* Fill remaining grid cells if less than 9 */}
                                  {Array.from({ length: Math.max(0, 9 - collageArtworks.length) }).map((_, index) => (
                                    <div key={`empty-${index}`} className="aspect-square bg-gray-800/40" />
                                  ))}
                                </div>
                              </>
                            ) : artwork ? (
                              <>
                                <Image
                                  src={artwork}
                                  alt={folder.name}
                                  fill
                                  className="object-cover"
                                  unoptimized={shouldUnoptimizeImage(artwork)}
                                  sizes="(max-width: 768px) 50vw, 33vw"
                                  loading="lazy"
                                  onError={(e) => {
                                    // Hide broken images
                                    const target = e.target as HTMLImageElement
                                    if (target) {
                                      target.style.display = 'none'
                                    }
                                  }}
                                />
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700/40 to-gray-800/40">
                                <FaMusic className="text-gray-500 text-4xl" />
                              </div>
                            )}
                            
                            {/* Info overlay at bottom */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-white truncate mb-0.5">
                                    {folder.name}
                                  </div>
                                  <div className="text-xs text-gray-300 truncate">
                                    {hasChildren 
                                      ? `${visibleChildren.length} ${visibleChildren.length === 1 ? 'folder' : 'folders'}`
                                      : trackCount > 0 
                                        ? `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}` 
                                        : 'Empty'}
                                    {folder.year && ` • ${folder.year}`}
                                  </div>
                                </div>
                                {hasChildren && (
                                  <div className="flex-shrink-0 p-1.5 text-white/60">
                                    <FaChevronRight className="text-xs" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                    </div>
                </div>
              </div>
            ) : displayTracks.length > 0 ? (
              <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
                {vaultMainNavTreeEl}
                <div className="px-6 py-4 bg-gray-900/40 border-b border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleBack}
                      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
                      aria-label="Go back to playlist selection"
                      title="Go back"
                    >
                      <FaArrowLeft className="text-sm" />
                    </button>
                    <h2 className="text-lg font-semibold text-white">
                      {selectedFolder?.name || selectedPlaylist?.name || 'Tracks'}
                    </h2>
                    <span className="text-sm text-gray-400">
                      {displayTracks.length} {displayTracks.length === 1 ? 'song' : 'songs'}
                    </span>
                    {currentTrack && (
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="text-blue-400">▶</span>
                        <span className="truncate max-w-xs font-medium">{currentTrack.title}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Sort and Column Controls */}
                  <div className="flex items-center gap-2">
                    {selectedPlaylist && (
                      <>
                        <button
                          onClick={() => setIsPlaylistEditMode((prev) => !prev)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors border ${
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
                            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors border border-indigo-500 text-indigo-100 hover:bg-indigo-600"
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
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600"
                        title="Column visibility"
                      >
                        <FaColumns className="text-sm" />
                        <span className="text-sm hidden sm:inline">Columns</span>
                        <FaChevronDown className={`text-xs transition-transform ${isColumnMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {isColumnMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
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
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600"
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
                        <div className="absolute right-0 mt-2 w-48 bg-gray-800/40 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
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
                  className="divide-y divide-gray-700 max-h-[500px] sm:max-h-[600px] md:max-h-[700px] overflow-y-auto -webkit-overflow-scrolling-touch"
                >
                  {(visibleColumns.genre || visibleColumns.subgenre || visibleColumns.drumStyle || visibleColumns.timeSignature || visibleColumns.key || visibleColumns.scale || visibleColumns.date || visibleColumns.bpm || visibleColumns.duration) && (
                    <div className="sticky top-0 z-10 bg-gray-900/80 backdrop-blur border-b border-gray-700 text-[10px] uppercase tracking-wide text-gray-400">
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
                  {sortedDisplayTracks.map((track) => {
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
                        className={`group flex items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 cursor-pointer transition-colors touch-manipulation active:bg-gray-700/40 ${
                          isPlaying
                            ? 'bg-blue-900/20 border-l-4 border-blue-500'
                            : 'hover:bg-gray-700/40'
                        }`}
                      >
                        <div className="text-xs sm:text-sm text-gray-400 w-6 sm:w-8 text-right font-medium hidden sm:block flex-shrink-0">
                          {isPlaying ? (
                            <span className="text-blue-400">▶</span>
                          ) : (
                            sortedDisplayTracks.indexOf(track) + 1
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
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-400 hover:text-blue-400 active:text-blue-300 p-2 transition-all flex-shrink-0 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Play"
                          aria-label={`Play ${track.title}`}
                        >
                          <FaPlay className="text-sm" />
                        </button>
                      {track.artwork ? (
                        <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded overflow-hidden flex-shrink-0 shadow-lg">
                          <Image
                            src={resolveImageUrl(track.artwork)}
                            alt={track.title}
                            fill
                            className="object-cover"
                            unoptimized={shouldUnoptimizeImage(track.artwork)}
                            sizes="(max-width: 640px) 48px, 56px"
                            priority={sortedDisplayTracks.indexOf(track) < 15}
                            fetchPriority={sortedDisplayTracks.indexOf(track) < 10 ? 'high' : 'auto'}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded bg-gray-700/40 flex items-center justify-center flex-shrink-0">
                          <FaMusic className="text-gray-500 text-sm sm:text-base" />
                        </div>
                      )}
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs sm:text-sm truncate ${
                            isPlaying ? 'font-semibold text-white' : 'font-medium text-white'
                          }`}>{track.title}</div>
                          <div className="text-[10px] sm:text-xs text-gray-400 truncate mt-0.5">{track.artist}</div>
                        </div>
                        
                        {/* Dynamic Columns */}
                        {visibleColumns.genre && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[80px] block border-l border-gray-700/60 pl-3">
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
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[100px] block border-l border-gray-700/60 pl-3">
                            <div className="truncate" title={getTrackSubgenre(track)}>
                              {getTrackSubgenre(track) || '—'}
                            </div>
                          </div>
                        )}
                        {visibleColumns.drumStyle && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[100px] block border-l border-gray-700/60 pl-3">
                            <div className="truncate" title={getTrackDrumStyle(track)}>
                              {getTrackDrumStyle(track) || '—'}
                            </div>
                          </div>
                        )}
                        {visibleColumns.timeSignature && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[80px] block font-mono border-l border-gray-700/60 pl-3">
                            {getTrackTimeSignature(track) || '—'}
                          </div>
                        )}
        {visibleColumns.key && (() => {
          const key = getTrackKey(track)
          return key ? (
            <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[60px] block font-mono border-l border-gray-700/60 pl-3">
              {key}
            </div>
          ) : null
        })()}
                        {visibleColumns.scale && (
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 min-w-[70px] block border-l border-gray-700/60 pl-3">
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
                          <div className="text-xs sm:text-sm text-gray-300 flex-shrink-0 font-mono border-l border-gray-700/60 pl-3">
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
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 active:text-blue-300 p-2 transition-all hidden sm:block touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Add to queue"
                          aria-label={`Add ${track.title} to queue`}
                        >
                          <FaPlus className="text-sm" />
                        </button>
                      </div>
                    )
                  })}
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
            ) : (
              <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
                {vaultMainNavTreeEl}
                <div className="p-16 text-center">
                  <FaMusic className="mx-auto text-gray-600 mb-4 text-4xl" />
                  <p className="text-gray-300 mb-2 text-lg font-medium">No tracks selected</p>
                  <p className="text-gray-500 text-sm">Select a folder, album, or playlist to view tracks</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full min-w-0 mt-6 sm:mt-8 min-h-[500px] h-[min(85vh,calc(100vh-280px))] rounded-xl overflow-hidden bg-gray-900/30 border border-gray-800">
          <ITunesBrowser />
        </div>

        <NavigationButtons embedded />
      </div>

      {/* Music Player is now global - no need to render here */}

      {showAddTrackModal && selectedPlaylist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
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
        />
      )}

      {/* Expanded Artwork Modal */}
      {isArtworkExpanded && currentTrack && currentTrack.artwork && (
        <div 
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
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
    </div>
  )
}
