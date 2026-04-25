'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { FaFolder, FaMusic, FaPlus, FaEdit, FaTrash, FaSync, FaSave, FaTimes, FaEye, FaEyeSlash, FaChevronRight, FaChevronDown, FaGripVertical, FaSearch, FaUpload, FaCog, FaList, FaSitemap, FaSort, FaLink, FaUnlink, FaCheckCircle, FaArrowLeft, FaSortAlphaDown, FaSortAlphaUp, FaSortNumericDown, FaSortNumericUp, FaColumns, FaCheckSquare, FaSquare, FaPlay, FaPause, FaCopy, FaFilter, FaChartBar, FaImage, FaCommentDots, FaPaperPlane, FaBrain, FaPaste, FaClipboard } from 'react-icons/fa'
import {
  fetchMusicLibrary,
  fetchFolders,
  fetchTracks,
  createFolder,
  updateFolder,
  deleteFolder,
  createTrack,
  updateTrack,
  deleteTrack,
  fetchPlaylists,
  createPlaylist,
  updatePlaylist,
  syncToDatabase,
  invalidateMusicLibraryCache,
  type FolderItem,
  type Track,
} from '@/utils/musicLibraryApi'
import { buildFolderHierarchy, type HierarchicalFolder, isDescendant } from '@/utils/buildFolderHierarchy'
import FolderTree from '@/components/FolderTree'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

type ViewMode = 'structure' | 'tracks' | 'upload'

interface Playlist {
  id: string
  name: string
  description?: string
  trackIds: string[]
  createdAt?: string
}

export default function AdminMusic() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('structure')
  
  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadFolder, setUploadFolder] = useState('')
  
  // Library structure state - matching frontend
  const [libraryData, setLibraryData] = useState<any>(null)
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [hierarchicalFolders, setHierarchicalFolders] = useState<HierarchicalFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null)
  const [displayTracks, setDisplayTracks] = useState<Track[]>([])
  const [displayFolders, setDisplayFolders] = useState<FolderItem[]>([])
  const [folderPath, setFolderPath] = useState<FolderItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  
  // Audio files state
  const [audioFiles, setAudioFiles] = useState<any[]>([])
  const [loadingAudioFiles, setLoadingAudioFiles] = useState(true)
  
  // General state
  const [loadingData, setLoadingData] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [dbHealthy, setDbHealthy] = useState<boolean | null>(null)
  const [organizeStrategy, setOrganizeStrategy] = useState<'auto' | 'folder_path' | 'title' | 'artist'>('auto')
  const [sortBy, setSortBy] = useState<'default' | 'title' | 'artist' | 'duration' | 'bpm' | 'genre' | 'subgenre' | 'drumStyle' | 'timeSignature' | 'key' | 'scale' | 'date'>('default')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [createMissingFolders, setCreateMissingFolders] = useState(true)
  const [showOrganizeModal, setShowOrganizeModal] = useState(false)
  const [editingFolder, setEditingFolder] = useState<HierarchicalFolder | null>(null)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showCreateTrack, setShowCreateTrack] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['folder-discography']))
  const [draggedFolder, setDraggedFolder] = useState<HierarchicalFolder | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState<Partial<FolderItem>>({})
  const [newTrack, setNewTrack] = useState<Partial<Track>>({})
  const [showSonicDnaChat, setShowSonicDnaChat] = useState(false)
  const [sonicDnaChatInput, setSonicDnaChatInput] = useState('')
  const [sonicDnaChatMessages, setSonicDnaChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [sonicDnaChatLoading, setSonicDnaChatLoading] = useState(false)
  const [sonicDnaLockedFields, setSonicDnaLockedFields] = useState<Set<string>>(new Set())
  const [sonicDnaLastDraft, setSonicDnaLastDraft] = useState<any | null>(null)
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  
  // Enhanced features state
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set())
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [pendingPlaylistTrackIds, setPendingPlaylistTrackIds] = useState<string[]>([])
  const [playlistDraft, setPlaylistDraft] = useState({ name: '', description: '' })
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [pendingFolderTrackIds, setPendingFolderTrackIds] = useState<string[]>([])
  const [clipboardTrackIds, setClipboardTrackIds] = useState<string[]>([])
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(['title', 'artist', 'duration', 'bpm', 'key', 'genre']))
  const [showFilters, setShowFilters] = useState(false)
  const [filterGenre, setFilterGenre] = useState('')
  const [filterBpmMin, setFilterBpmMin] = useState('')
  const [filterBpmMax, setFilterBpmMax] = useState('')
  const [filterKey, setFilterKey] = useState('')
  const [buildingSonicDnaCache, setBuildingSonicDnaCache] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [findingSonicDna, setFindingSonicDna] = useState(false)
  const [artworkDragOver, setArtworkDragOver] = useState(false)
  const [uploadingArtwork, setUploadingArtwork] = useState(false)
  const [folderTracks, setFolderTracks] = useState<Track[]>([])
  const [loadingFolderTracks, setLoadingFolderTracks] = useState(false)
  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(null)
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | null>(null)
  
  // Use music player context instead of simple audio player
  const { playTrack, currentTrack, isPlaying, setIsPlaying } = useMusicPlayer()
  const [linkingTrackId, setLinkingTrackId] = useState<string | null>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    folder: FolderItem | null
    track: Track | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    folder: null,
    track: null,
  })
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    // Gate destructive actions when DB is unhealthy (prevents “resync during outage” corruption)
    if (!isAdmin) return
    ;(async () => {
      try {
        const res = await fetch('/api/admin/health')
        if (!res.ok) {
          setDbHealthy(false)
          return
        }
        const data = await res.json()
        setDbHealthy(data.database === 'healthy')
      } catch {
        setDbHealthy(false)
      }
    })()
  }, [isAdmin])

  const loadAllData = async () => {
    setLoadingData(true)
    try {
      await Promise.all([
        loadLibraryStructure(),
        loadAudioFiles(),
      ])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    if (isAdmin && !loading) {
      loadAllData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading])

  // Cleanup audio preview when editing track changes or component unmounts
  useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause()
        previewAudio.src = ''
        setPreviewAudio(null)
        setIsPreviewPlaying(false)
      }
    }
  }, [editingTrack, previewAudio])

  // Keyboard shortcuts for edit modal
  useEffect(() => {
    if (!editingTrack) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingTrack(null)
        if (previewAudio) {
          previewAudio.pause()
          setPreviewAudio(null)
          setIsPreviewPlaying(false)
        }
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleUpdateTrack(editingTrack)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTrack, previewAudio])

  useEffect(() => {
    if (!editingTrack) return
    setShowSonicDnaChat(false)
    setSonicDnaChatInput('')
    setSonicDnaChatMessages([])
    setSonicDnaLockedFields(new Set())
    setSonicDnaLastDraft(null)
  }, [editingTrack?.id])

  const loadLibraryStructure = async () => {
    try {
      // Admin always includes hidden folders
      const data = await fetchMusicLibrary({ includeHidden: true, skipCache: true })
      setLibraryData(data)
      const folderList = await fetchFolders(true) // Include hidden
      setFolders(folderList)
      
      // Fetch all tracks (lightweight, no heavy columns)
      const allTracksData = await fetchTracks()
      const hierarchy = buildFolderHierarchy(folderList, allTracksData)
      setHierarchicalFolders(hierarchy)
      
      // Fetch fast stats from server (uses indexed metadata)
      try {
        const statsRes = await fetch('/api/music-library/stats')
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          if (statsData.success) {
            setServerStats(statsData.stats)
          }
        }
      } catch (e) {
        console.warn('Failed to fetch server stats:', e)
      }
      
      // Set default folder (Discography) - set directly to avoid forward reference
      if (!selectedFolder && hierarchy.length > 0) {
        const discography = hierarchy.find(f => f.id === 'folder-discography') || hierarchy[0]
        // Set folder and load its tracks directly
        setSelectedFolder(discography as FolderItem)
        try {
          const folderTracks = await fetchTracks(discography.id)
          setDisplayTracks(folderTracks)
          const childFolders = folderList.filter(f => f.parentId === discography.id)
          setDisplayFolders(childFolders)
        } catch (error) {
          console.error('Error loading default folder data:', error)
        }
      }
    } catch (error: any) {
      console.error('Error loading library structure:', error)
    }
  }

  const loadAudioFiles = async () => {
    try {
      setLoadingAudioFiles(true)
      // This list is used for linking audio files to tracks; it does not need heavy TOAST fields.
      const response = await fetch('/api/audio/list?limit=1000')
      const data = await response.json()
      setAudioFiles(data.files || [])
    } catch (error) {
      console.error('Error loading audio files:', error)
    } finally {
      setLoadingAudioFiles(false)
    }
  }

  // Fast stats from server (uses indexed metadata, no heavy columns)
  const [serverStats, setServerStats] = useState<any>(null)

  // Flatten all tracks from library (deduplicated by ID) - lightweight, no full data
  const allTracks = useMemo(() => {
    const tracksMap = new Map<string, Track>()
    
    const extractTracks = (items: FolderItem[]) => {
      items.forEach(item => {
        if (item.tracks) {
          item.tracks.forEach(track => {
            // Only add if we haven't seen this track ID before
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
    
    if (libraryData?.folders) {
      extractTracks(libraryData.folders)
    }
    return Array.from(tracksMap.values())
  }, [libraryData])

  // Header count should match the canonical "All Tracks" folder contents (safe: read-only traversal)
  const allTracksFolderCount = useMemo(() => {
    const findFolder = (items: FolderItem[], id: string): FolderItem | null => {
      for (const item of items) {
        if (item.id === id) return item
        if (item.children) {
          const found = findFolder(item.children, id)
          if (found) return found
        }
      }
      return null
    }

    if (!libraryData?.folders) return 0
    const allTracksFolder = findFolder(libraryData.folders, 'folder-all-tracks')
    const tracks = allTracksFolder?.tracks || []
    const audioIds = new Set<string>()
    tracks.forEach((t: any) => {
      const id = t?.audioFileId || t?.audio_file_id
      if (id) audioIds.add(id)
    })
    return audioIds.size
  }, [libraryData])

  // Filter tracks based on search
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return allTracks
    const query = searchQuery.toLowerCase()
    return allTracks.filter(track => 
      track.title.toLowerCase().includes(query) ||
      track.artist.toLowerCase().includes(query)
    )
  }, [allTracks, searchQuery])

  // Helper functions to extract metadata from sonic_dna (matching frontend)
  const getTrackDna = (track: Track): any | null => {
    const raw = track.sonic_dna ?? (track as any).metadata?.sonic_dna
    if (!raw) return null
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      return null
    }
  }

  const getTrackGenre = (track: Track): string => {
    if ((track as any).metadata?.primary_genre) return (track as any).metadata.primary_genre
    if ((track as any).metadata?.genres?.[0]) return (track as any).metadata.genres[0]

    const dna = getTrackDna(track)
    if (!dna) return ''
    return (
      dna?.genres?.primaryGenres?.[0] ||
      dna?.genres?.primary?.[0] ||
      dna?.genres?.genreTags?.[0] ||
      dna?.technical?.genre ||
      dna?.drums?.genreStyles?.[0] ||
      ''
    )
  }

  const getTrackSubgenre = (track: Track): string => {
    const dna = getTrackDna(track)
    if (!dna) return ''
    return dna?.genres?.subgenres?.[0] || ''
  }

  const getTrackDrumStyle = (track: Track): string => {
    const dna = getTrackDna(track)
    if (!dna) return ''
    return dna?.drums?.genreStyles?.[0] || dna?.drums?.patternType || ''
  }

  const getTrackTimeSignature = (track: Track): string => {
    const dna = getTrackDna(track)
    if (!dna) return ''
    return dna?.musical?.timeSignature || dna?.technical?.timeSignature || ''
  }

  const getTrackKey = (track: Track): string => {
    const metaKey = (track as any).metadata?.key_signature
    if (metaKey && metaKey !== 'Unknown') return metaKey
    if (track.key_signature && track.key_signature !== 'Unknown') return track.key_signature
    const dna = getTrackDna(track)
    if (!dna) return ''
    return dna?.musical?.keySignature || dna?.technical?.key?.key || ''
  }

  const getTrackScale = (track: Track): string => {
    const dna = getTrackDna(track)
    if (!dna) return ''
    return dna?.musical?.scale || dna?.technical?.key?.scale || dna?.technical?.key?.mode || ''
  }

  const getTrackBpm = (track: Track): number => {
    if (typeof track.bpm === 'number' && track.bpm > 0) return track.bpm
    const metaBpm = (track as any).metadata?.bpm
    if (typeof metaBpm === 'number' && metaBpm > 0) return metaBpm
    const dna = getTrackDna(track)
    const dnaBpm = dna?.technical?.bpm || dna?.musical?.bpm
    return typeof dnaBpm === 'number' ? dnaBpm : 0
  }

  // Helper functions to get/set sonic_dna values for editing
  const getSonicDNAValue = (track: Track, path: string[]): string => {
    if (!track.sonic_dna) return ''
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      let value: any = dna
      for (const key of path) {
        if (Array.isArray(value) && key === '0') {
          value = value[0]
        } else {
          value = value?.[key]
        }
        if (value === undefined || value === null) return ''
      }
      return typeof value === 'string' ? value : Array.isArray(value) ? value[0] || '' : String(value || '')
    } catch {
      return ''
    }
  }

  const setSonicDNAValue = (track: Track, path: string[], value: string): Track => {
    const dna = track.sonic_dna 
      ? (typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : JSON.parse(JSON.stringify(track.sonic_dna)))
      : {}
    
    let current: any = dna
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i]
      if (!current[key]) {
        // If next key is '0', create an array, otherwise create an object
        const nextKey = path[i + 1]
        current[key] = nextKey === '0' ? [] : {}
      }
      current = current[key]
    }
    
    const lastKey = path[path.length - 1]
    if (lastKey === '0' && Array.isArray(current)) {
      if (current.length === 0) {
        current.push(value)
      } else {
        current[0] = value
      }
    } else if (Array.isArray(current[lastKey])) {
      if (current[lastKey].length === 0) {
        current[lastKey].push(value)
      } else {
        current[lastKey][0] = value
      }
    } else {
      current[lastKey] = value
    }
    
    return { ...track, sonic_dna: dna }
  }

  /** Fill only missing track editor fields from current Sonic DNA (in-place in sonic_dna and top-level). */
  const applySonicDnaToMissingFields = (track: Track): Track => {
    const dna = track.sonic_dna
      ? (typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : JSON.parse(JSON.stringify(track.sonic_dna)))
      : null
    if (!dna || typeof dna !== 'object') return track

    const hasBpm = track.bpm != null && track.bpm !== 0
    const hasKey = track.key_signature != null && String(track.key_signature).trim() !== ''
    const hasEnergy = track.energy_level != null && track.energy_level !== 0
    const hasDance = track.danceability != null && track.danceability !== 0

    const bpmFromDna = dna.technical?.bpm ?? dna.musical?.bpm
    const keyFromDna = dna.harmony?.keySignature ?? dna.musical?.keySignature ?? dna.technical?.key?.key
    const energyFromDna = dna.technical?.energyLevel
    const danceFromDna = dna.technical?.danceability

    let out: Track = { ...track }
    if (!hasBpm && (bpmFromDna != null || bpmFromDna === 0)) {
      out = { ...out, bpm: typeof bpmFromDna === 'number' ? bpmFromDna : parseInt(String(bpmFromDna), 10) }
    }
    if (!hasKey && keyFromDna) {
      out = { ...out, key_signature: String(keyFromDna).trim() }
    }
    if (!hasEnergy && (energyFromDna != null || energyFromDna === 0)) {
      out = { ...out, energy_level: typeof energyFromDna === 'number' ? energyFromDna : parseFloat(String(energyFromDna)) }
    }
    if (!hasDance && (danceFromDna != null || danceFromDna === 0)) {
      out = { ...out, danceability: typeof danceFromDna === 'number' ? danceFromDna : parseFloat(String(danceFromDna)) }
    }

    // Fill missing sonic_dna-internal fields (genre, subgenre, scale, time sig, drum style) from DNA paths
    type PathSource = (string | number)[]
    const paths: { path: string[]; sources: PathSource[] }[] = [
      { path: ['genres', 'primaryGenres', '0'], sources: [['genres', 'primaryGenres', 0], ['comprehensive', 'genres', 'primaryGenres', 0]] },
      { path: ['genres', 'subgenres', '0'], sources: [['genres', 'subgenres', 0], ['comprehensive', 'genres', 'subgenres', 0]] },
      { path: ['musical', 'scale'], sources: [['musical', 'scale'], ['technical', 'key', 'scale'], ['technical', 'key', 'mode']] },
      { path: ['musical', 'timeSignature'], sources: [['musical', 'timeSignature'], ['technical', 'timeSignature']] },
      { path: ['drums', 'genreStyles', '0'], sources: [['drums', 'genreStyles', 0], ['drums', 'patternType']] },
    ]
    const getAt = (obj: any, keys: (string | number)[]): any => {
      let v: any = obj
      for (const k of keys) {
        v = v?.[k]
        if (v === undefined || v === null) return undefined
      }
      return v
    }
    const setAt = (obj: any, path: string[], value: string) => {
      let cur: any = obj
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i]
        const nextKey = path[i + 1]
        if (!cur[key]) cur[key] = nextKey === '0' ? [] : {}
        cur = cur[key]
      }
      const last = path[path.length - 1]
      if (last === '0' && Array.isArray(cur)) {
        if (cur.length === 0) cur.push(value)
        else cur[0] = value
      } else {
        cur[last] = value
      }
    }
    let dnaMut = false
    for (const { path, sources } of paths) {
      const currentVal = getAt(dna, path)
      if (currentVal !== undefined && currentVal !== null && String(currentVal).trim() !== '') continue
      for (const src of sources) {
        const v = getAt(dna, src)
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          setAt(dna, path, String(v))
          dnaMut = true
          break
        }
      }
    }
    if (dnaMut) out = { ...out, sonic_dna: dna }
    return out
  }

  const applySonicDnaToMissingOrUnknownFields = (track: Track): Track => {
    const isUnknown = (value: any) => {
      if (value === undefined || value === null) return true
      if (typeof value !== 'string') return false
      const trimmed = value.trim().toLowerCase()
      return trimmed === '' || trimmed === 'unknown' || trimmed === 'n/a' || trimmed === 'na'
    }

    let updated = applySonicDnaToMissingFields(track)
    const dna = updated.sonic_dna
      ? (typeof updated.sonic_dna === 'string' ? JSON.parse(updated.sonic_dna) : updated.sonic_dna)
      : null
    if (!dna || typeof dna !== 'object') return updated

    const bpmFromDna = dna.technical?.bpm ?? dna.musical?.bpm
    const keyFromDna = dna.harmony?.keySignature ?? dna.musical?.keySignature ?? dna.technical?.key?.key
    const energyFromDna = dna.technical?.energyLevel
    const danceFromDna = dna.technical?.danceability

    if (isUnknown(updated.key_signature) && keyFromDna) {
      updated = { ...updated, key_signature: String(keyFromDna).trim() }
    }
    if ((updated.bpm == null || updated.bpm === 0) && bpmFromDna != null) {
      const bpm = typeof bpmFromDna === 'number' ? bpmFromDna : parseInt(String(bpmFromDna), 10)
      if (!Number.isNaN(bpm)) updated = { ...updated, bpm }
    }
    if ((updated.energy_level == null || updated.energy_level === 0) && energyFromDna != null) {
      const energy = typeof energyFromDna === 'number' ? energyFromDna : parseFloat(String(energyFromDna))
      if (!Number.isNaN(energy)) updated = { ...updated, energy_level: energy }
    }
    if ((updated.danceability == null || updated.danceability === 0) && danceFromDna != null) {
      const dance = typeof danceFromDna === 'number' ? danceFromDna : parseFloat(String(danceFromDna))
      if (!Number.isNaN(dance)) updated = { ...updated, danceability: dance }
    }

    const replaceIfUnknown = (path: string[], sourcePaths: (string | number)[][]) => {
      const current = getSonicDNAValue(updated, path)
      if (!isUnknown(current)) return
      for (const src of sourcePaths) {
        const value = src.reduce((acc: any, key: any) => acc?.[key], dna)
        if (value !== undefined && value !== null && !isUnknown(String(value))) {
          updated = setSonicDNAValue(updated, path, String(value))
          break
        }
      }
    }

    replaceIfUnknown(['genres', 'primaryGenres', '0'], [
      ['genres', 'primaryGenres', 0],
      ['genres', 'primary', 0],
      ['drums', 'genreStyles', 0],
    ])
    replaceIfUnknown(['genres', 'subgenres', '0'], [
      ['genres', 'subgenres', 0],
    ])
    replaceIfUnknown(['musical', 'scale'], [
      ['musical', 'scale'],
      ['technical', 'key', 'scale'],
      ['technical', 'key', 'mode'],
    ])
    replaceIfUnknown(['musical', 'timeSignature'], [
      ['musical', 'timeSignature'],
      ['technical', 'timeSignature'],
    ])
    replaceIfUnknown(['drums', 'genreStyles', '0'], [
      ['drums', 'genreStyles', 0],
      ['drums', 'patternType'],
    ])

    return updated
  }

  const deepMerge = (target: any, source: any): any => {
    if (Array.isArray(target) && Array.isArray(source)) {
      return source.length > 0 ? source : target
    }
    if (typeof target === 'object' && typeof source === 'object' && target && source) {
      const output: any = { ...target }
      Object.keys(source).forEach((key) => {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          output[key] = deepMerge(target[key] || {}, source[key])
        } else if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
          output[key] = source[key]
        } else if (target[key] !== undefined) {
          output[key] = target[key]
        }
      })
      return output
    }
    return source !== undefined && source !== null && source !== '' ? source : target
  }

  const getAudioFileId = (track: Track | null): string | null => {
    if (!track) return null
    return (
      (track.audioFileId as string | undefined) ||
      (track.metadata?.audio_file_id as string | undefined) ||
      (track.metadata?.audioFileId as string | undefined) ||
      null
    )
  }

  const handleSonicDnaDirective = async () => {
    if (!editingTrack) {
      alert('Select a track first.')
      return
    }
    const directive = sonicDnaChatInput.trim()
    if (!directive) return
    const audioFileId = getAudioFileId(editingTrack)

    const pushAssistant = (content: string) =>
      setSonicDnaChatMessages((prev) => [...prev, { role: 'assistant', content }])

    const pruneLockedFields = (incoming: any, locked: Set<string>) => {
      if (!incoming || typeof incoming !== 'object') return incoming
      const next = JSON.parse(JSON.stringify(incoming))
      const drop = (path: string[]) => {
        let cur = next
        for (let i = 0; i < path.length - 1; i++) {
          if (!cur[path[i]]) return
          cur = cur[path[i]]
        }
        delete cur[path[path.length - 1]]
      }

      if (locked.has('description')) drop(['description'])
      if (locked.has('intention')) drop(['intention'])
      if (locked.has('summary')) drop(['summary'])
      if (locked.has('genre')) {
        drop(['genres', 'primaryGenres'])
        drop(['genres', 'primary'])
      }
      if (locked.has('subgenre')) drop(['genres', 'subgenres'])
      if (locked.has('drumstyle')) drop(['drums', 'genreStyles'])
      if (locked.has('timesignature')) {
        drop(['musical', 'timeSignature'])
        drop(['technical', 'timeSignature'])
      }
      if (locked.has('scale')) {
        drop(['musical', 'scale'])
        drop(['technical', 'key', 'scale'])
      }
      if (locked.has('key')) {
        drop(['harmony', 'keySignature'])
        drop(['technical', 'key'])
        drop(['musical', 'keySignature'])
      }
      if (locked.has('bpm')) {
        drop(['technical', 'bpm'])
        drop(['musical', 'bpm'])
      }
      return next
    }

    const diffSonicDna = (current: any, incoming: any) => {
      const diffs: Array<{ path: string; from: string; to: string }> = []
      const walk = (a: any, b: any, path: string[]) => {
        if (a === b) return
        if (typeof a !== typeof b) {
          diffs.push({ path: path.join('.'), from: String(a), to: String(b) })
          return
        }
        if (Array.isArray(a) || Array.isArray(b)) {
          const aStr = JSON.stringify(a)
          const bStr = JSON.stringify(b)
          if (aStr !== bStr) {
            diffs.push({ path: path.join('.'), from: aStr, to: bStr })
          }
          return
        }
        if (a && typeof a === 'object' && b && typeof b === 'object') {
          const keys = new Set([...Object.keys(a), ...Object.keys(b)])
          keys.forEach((key) => walk(a[key], b[key], [...path, key]))
          return
        }
        diffs.push({ path: path.join('.'), from: String(a), to: String(b) })
      }
      walk(current || {}, incoming || {}, [])
      return diffs.slice(0, 50)
    }

    const runAnalysis = async (force: boolean, userDirective?: string, apply: boolean = true) => {
      if (!audioFileId) {
        pushAssistant('This track is not linked to an audio file. Link it first to run Sonic DNA.')
        return
      }
      const response = await fetch(`/api/audio/sonic-dna-agents?trackId=${audioFileId}&force=${force ? 'true' : 'false'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: userDirective ? JSON.stringify({ directive: userDirective }) : undefined,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`
        pushAssistant(`Analysis failed: ${errorMessage}`)
        return
      }

      const data = await response.json()
      if (data?.sonicDNA) {
        const sanitized = pruneLockedFields(data.sonicDNA, sonicDnaLockedFields)
        setSonicDnaLastDraft(sanitized)
        if (!apply) {
          const currentDna = typeof editingTrack.sonic_dna === 'string'
            ? JSON.parse(editingTrack.sonic_dna)
            : editingTrack.sonic_dna || {}
          const diffs = diffSonicDna(currentDna, sanitized)
          if (diffs.length === 0) {
            pushAssistant('No changes detected from the draft analysis.')
          } else {
            const lines = diffs.map((d) => `• ${d.path}: ${d.from} → ${d.to}`)
            pushAssistant(`Proposed changes (preview):\n${lines.join('\n')}`)
          }
          return
        }

        const merged = deepMerge(
          typeof editingTrack.sonic_dna === 'string'
            ? JSON.parse(editingTrack.sonic_dna)
            : editingTrack.sonic_dna || {},
          sanitized
        )
        setEditingTrack((prev) => {
          if (!prev) return prev
          const updated = { ...prev, sonic_dna: merged }
          return applySonicDnaToMissingFields(updated)
        })
        pushAssistant('Applied Sonic DNA updates. Review the fields and save when ready.')
      } else {
        pushAssistant('Analysis completed but no Sonic DNA was returned.')
      }
    }

    const applyFieldUpdate = (field: string, value: string) => {
      if (!editingTrack) return false
      const normalized = field.toLowerCase()
      let updated: Track = { ...editingTrack }
      if (normalized === 'bpm') {
        const bpm = parseInt(value, 10)
        if (!Number.isNaN(bpm)) updated = { ...updated, bpm }
      } else if (normalized === 'key') {
        updated = { ...updated, key_signature: value }
      } else if (normalized === 'genre') {
        updated = setSonicDNAValue(updated, ['genres', 'primaryGenres', '0'], value)
      } else if (normalized === 'subgenre') {
        updated = setSonicDNAValue(updated, ['genres', 'subgenres', '0'], value)
      } else if (normalized === 'drumstyle') {
        updated = setSonicDNAValue(updated, ['drums', 'genreStyles', '0'], value)
      } else if (normalized === 'timesignature') {
        updated = setSonicDNAValue(updated, ['musical', 'timeSignature'], value)
      } else if (normalized === 'scale') {
        updated = setSonicDNAValue(updated, ['musical', 'scale'], value)
      } else if (normalized === 'description') {
        updated = setSonicDNAValue(updated, ['description'], value)
      } else if (normalized === 'intention') {
        updated = setSonicDNAValue(updated, ['intention'], value)
      } else if (normalized === 'summary') {
        updated = setSonicDNAValue(updated, ['summary'], value)
      } else {
        return false
      }
      setEditingTrack(updated)
      return true
    }

    const parseFieldCommand = (text: string) => {
      const match = text.match(/^(?:\/set|set|update)\s+([a-zA-Z]+)\s+(.+)$/i)
      if (!match) return null
      return { field: match[1], value: match[2].trim() }
    }

    const runValidation = () => {
      if (!editingTrack) return
      const dna = typeof editingTrack.sonic_dna === 'string'
        ? JSON.parse(editingTrack.sonic_dna)
        : editingTrack.sonic_dna || {}
      const bpm = editingTrack.bpm || dna?.technical?.bpm
      const genre = (dna?.genres?.primaryGenres?.[0] || '').toLowerCase()
      const keySig = (editingTrack.key_signature || dna?.harmony?.keySignature || '').toLowerCase()
      const mode = (dna?.technical?.key?.mode || '').toLowerCase()
      const warnings: string[] = []

      if (bpm && genre) {
        if (bpm < 110 && (genre.includes('drum') || genre.includes('dnb') || genre.includes('jungle'))) {
          warnings.push('BPM is low for Drum & Bass/Jungle. Check genre or BPM.')
        }
        if (bpm > 150 && (genre.includes('hip hop') || genre.includes('boom bap') || genre.includes('trap'))) {
          warnings.push('BPM is high for Hip-Hop/Trap. Check half-time or genre.')
        }
        if (bpm >= 120 && bpm <= 132 && genre.includes('dub')) {
          warnings.push('Dub at 120–132 BPM is uncommon. Verify genre or BPM.')
        }
      }
      if (keySig && mode) {
        if (keySig.includes('minor') && mode.includes('major')) {
          warnings.push('Key signature says minor but mode says major.')
        }
        if (keySig.includes('major') && mode.includes('minor')) {
          warnings.push('Key signature says major but mode says minor.')
        }
      }

      if (warnings.length === 0) {
        pushAssistant('Validation: no obvious inconsistencies found.')
      } else {
        pushAssistant(`Validation warnings:\n${warnings.map((w) => `• ${w}`).join('\n')}`)
      }
    }

    const runSuggestions = () => {
      if (!editingTrack) return
      const dna = typeof editingTrack.sonic_dna === 'string'
        ? JSON.parse(editingTrack.sonic_dna)
        : editingTrack.sonic_dna || {}
      const suggestions: string[] = []
      if (!dna?.description) suggestions.push('Add a richer track description.')
      if (!dna?.intention) suggestions.push('Add intention to capture purpose/goal.')
      if (!dna?.emotional?.emotionalJourney) suggestions.push('Describe emotional journey.')
      if (!dna?.musical?.instrumentation || dna?.musical?.instrumentation?.length === 0) suggestions.push('List key instruments.')
      if (!dna?.genres?.primaryGenres?.length) suggestions.push('Set a primary genre.')
      if (!dna?.drums?.patternType) suggestions.push('Confirm drum pattern type.')
      if (!editingTrack.bpm && !dna?.technical?.bpm) suggestions.push('Set BPM for accuracy.')

      if (suggestions.length === 0) {
        pushAssistant('Suggestions: everything looks complete.')
      } else {
        pushAssistant(`Suggestions:\n${suggestions.map((s) => `• ${s}`).join('\n')}`)
      }
    }

    setSonicDnaChatMessages((prev) => [...prev, { role: 'user', content: directive }])
    setSonicDnaChatInput('')
    setSonicDnaChatLoading(true)

    try {
      const [command, ...rest] = directive.split(' ')
      const remainder = rest.join(' ').trim()

      if (command === '/help') {
        pushAssistant('Commands: /analyze, /reprocess, /fill-missing, /find, /save, /validate, /suggest, /diff, /lock <field>, /set <field> <value>. Example: /set genre Dub')
        return
      }
      if (command === '/analyze') {
        await runAnalysis(false, remainder || undefined, true)
        return
      }
      if (command === '/reprocess') {
        await runAnalysis(true, remainder || undefined, true)
        return
      }
      if (command === '/fill-missing') {
        setEditingTrack((prev) => (prev ? applySonicDnaToMissingFields(prev) : prev))
        pushAssistant('Filled missing fields from existing Sonic DNA.')
        return
      }
      if (command === '/find') {
        await handleFindSonicDna()
        pushAssistant('Find Sonic DNA triggered.')
        return
      }
      if (command === '/save') {
        await handleUpdateTrack(editingTrack)
        pushAssistant('Save triggered. Check for any errors in the toast/alerts.')
        return
      }
      if (command === '/validate') {
        runValidation()
        return
      }
      if (command === '/suggest') {
        runSuggestions()
        return
      }
      if (command === '/diff') {
        await runAnalysis(true, remainder || undefined, false)
        return
      }
      if (command === '/lock') {
        const field = remainder.toLowerCase().trim()
        if (!field) {
          pushAssistant('Usage: /lock <field>. Example: /lock genre')
          return
        }
        setSonicDnaLockedFields((prev) => {
          const next = new Set(prev)
          if (next.has(field)) {
            next.delete(field)
            pushAssistant(`Unlocked ${field}.`)
          } else {
            next.add(field)
            pushAssistant(`Locked ${field}.`)
          }
          return next
        })
        return
      }

      const fieldCmd = parseFieldCommand(directive)
      if (fieldCmd) {
        const applied = applyFieldUpdate(fieldCmd.field, fieldCmd.value)
        pushAssistant(applied ? `Updated ${fieldCmd.field}.` : `Unknown field: ${fieldCmd.field}. Try /set bpm|key|genre|subgenre|drumStyle|timeSignature|scale|description|intention|summary.`)
        return
      }

      await runAnalysis(true, directive, true)
    } catch (error: any) {
      pushAssistant(`Analysis error: ${error.message || 'Unknown error'}`)
    } finally {
      setSonicDnaChatLoading(false)
    }
  }

  // Format duration from seconds to MM:SS
  const formatDuration = (seconds: number): string => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Parse MM:SS or HH:MM:SS to seconds
  const parseDuration = (durationStr: string): number => {
    if (!durationStr) return 0
    const parts = durationStr.split(':').map(Number)
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    return Number(durationStr) || 0
  }

  const getTrackDate = (track: Track): string => {
    // Try multiple date sources
    if (track.created_at) return track.created_at
    if (track.date) return track.date
    if (track.year) return track.year.toString()
    return ''
  }

  // Get unique genres, keys, etc. for filters
  const availableGenres = useMemo(() => {
    const genres = new Set<string>()
    allTracks.forEach(track => {
      const genre = getTrackGenre(track)
      if (genre) genres.add(genre)
    })
    return Array.from(genres).sort()
  }, [allTracks])

  const availableKeys = useMemo(() => {
    const keys = new Set<string>()
    allTracks.forEach(track => {
      const key = getTrackKey(track)
      if (key) keys.add(key)
    })
    return Array.from(keys).sort()
  }, [allTracks])

  // Filtered tracks
  const filteredDisplayTracks = useMemo(() => {
    let tracks = [...displayTracks]
    
    if (filterGenre) {
      tracks = tracks.filter(track => getTrackGenre(track).toLowerCase().includes(filterGenre.toLowerCase()))
    }
    if (filterBpmMin) {
      const min = parseInt(filterBpmMin)
      tracks = tracks.filter(track => getTrackBpm(track) >= min)
    }
    if (filterBpmMax) {
      const max = parseInt(filterBpmMax)
      tracks = tracks.filter(track => getTrackBpm(track) <= max)
    }
    if (filterKey) {
      tracks = tracks.filter(track => getTrackKey(track).toLowerCase().includes(filterKey.toLowerCase()))
    }

    if (showDuplicates) {
      const keyFor = (track: Track) => {
        // Prefer canonical stable identifiers, but fall back gracefully
        const audioFileId = (track as any).audioFileId || (track as any).audio_file_id
        const file = (track as any).file_url || track.file || ''
        const normalizedFile = typeof file === 'string' ? file.split('?')[0].toLowerCase() : ''
        return audioFileId ? `audio:${audioFileId}` : `file:${normalizedFile}`
      }

      const counts = new Map<string, number>()
      tracks.forEach((t) => {
        const k = keyFor(t)
        if (!k || k === 'file:') return
        counts.set(k, (counts.get(k) || 0) + 1)
      })
      tracks = tracks.filter((t) => {
        const k = keyFor(t)
        return k && (counts.get(k) || 0) > 1
      })
    }
    
    return tracks
  }, [displayTracks, filterGenre, filterBpmMin, filterBpmMax, filterKey, showDuplicates])

  // Sorted tracks
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
          comparison = (a.duration || 0) - (b.duration || 0)
          break
        case 'bpm':
          const aBpm = getTrackBpm(a)
          const bBpm = getTrackBpm(b)
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

  // Statistics - prefer server stats (fast, uses indexed metadata) over client calculation
  const stats = useMemo(() => {
    // Use server stats if available (much faster, pre-indexed, deduped by audio_file_id)
    if (serverStats) {
      return {
        ...serverStats,
        totalEntries: serverStats.totalEntries || serverStats.total
      }
    }
    
    // Fallback to client-side calculation (slower, but works without index)
    // DEDUPLICATE by audio_file_id to get TRUE unique track count
    const uniqueByAudioFile = new Map<string, any>()
    const tracksWithoutAudioFile: any[] = []
    
    for (const track of allTracks) {
      const audioFileId = (track as any).audioFileId || (track as any).audio_file_id
      if (audioFileId) {
        if (!uniqueByAudioFile.has(audioFileId)) {
          uniqueByAudioFile.set(audioFileId, track)
        }
      } else {
        tracksWithoutAudioFile.push(track)
      }
    }
    
    const uniqueTracks = [...Array.from(uniqueByAudioFile.values()), ...tracksWithoutAudioFile]
    const total = uniqueTracks.length
    const totalEntries = allTracks.length
    
    const withBpm = uniqueTracks.filter(t => t.bpm).length
    const withKey = uniqueTracks.filter(t => getTrackKey(t)).length
    const withGenre = uniqueTracks.filter(t => getTrackGenre(t)).length
    const withArtwork = uniqueTracks.filter(t => t.artwork || (t as any).artwork_url).length
    const linked = uniqueTracks.filter(t => (t as any).audioFileId || (t as any).audio_file_id).length
    // For these, we need indexed metadata - check if track has metadata with flags
    const withSonicDna = uniqueTracks.filter(t => (t as any).metadata?.has_sonic_dna).length
    const withEnergy = uniqueTracks.filter(t => (t as any).energy_level != null || (t as any).metadata?.has_energy).length
    const withDanceability = uniqueTracks.filter(t => (t as any).danceability != null || (t as any).metadata?.has_danceability).length
    const withWaveform = uniqueTracks.filter(t => (t as any).metadata?.has_waveform).length
    
    return {
      total,
      totalEntries,
      withBpm,
      withKey,
      withGenre,
      withArtwork,
      linked,
      withSonicDna,
      withEnergy,
      withDanceability,
      withWaveform,
      completeness: {
        bpm: total > 0 ? Math.round((withBpm / total) * 100) : 0,
        key: total > 0 ? Math.round((withKey / total) * 100) : 0,
        genre: total > 0 ? Math.round((withGenre / total) * 100) : 0,
        artwork: total > 0 ? Math.round((withArtwork / total) * 100) : 0,
        linked: total > 0 ? Math.round((linked / total) * 100) : 0,
        sonicDna: total > 0 ? Math.round((withSonicDna / total) * 100) : 0,
        energy: total > 0 ? Math.round((withEnergy / total) * 100) : 0,
        danceability: total > 0 ? Math.round((withDanceability / total) * 100) : 0,
        waveform: total > 0 ? Math.round((withWaveform / total) * 100) : 0,
      }
    }
  }, [allTracks, serverStats])

  // Track playback - use music player context
  const handlePlayTrack = (track: Track) => {
    // If clicking the same track that's currently playing, toggle play/pause
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying)
      return
    }
    
    // Otherwise, play the new track with the current folder's tracks as queue
    const trackQueue = displayTracks.length > 0 ? displayTracks : [track]
    playTrack(track, trackQueue, selectedFolder ? { type: 'folder', id: selectedFolder.id } : undefined)
  }

  // Bulk operations
  const handleSelectTrack = (trackId: string) => {
    setSelectedTracks(prev => {
      const next = new Set(prev)
      if (next.has(trackId)) {
        next.delete(trackId)
      } else {
        next.add(trackId)
      }
      return next
    })
  }

  const getCanonicalTrackId = (trackId: string) => {
    const track =
      displayTracks.find((t) => t.id === trackId) ||
      allTracks.find((t) => t.id === trackId)
    const original = (track?.metadata as any)?.originalTrackId
    return original || trackId
  }

  const addTracksToPlaylist = async (playlistId: string, trackIds: string[]) => {
    if (!trackIds.length) return
    const playlist = playlists.find((p) => p.id === playlistId)
    if (!playlist) return
    const canonicalIds = trackIds.map(getCanonicalTrackId)
    const unique = Array.from(new Set([...playlist.trackIds, ...canonicalIds]))
    await updatePlaylist(playlistId, { trackIds: unique })
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, trackIds: unique } : p)))
  }

  const copyTracksToFolder = async (folderId: string, trackIds: string[]) => {
    if (!trackIds.length) return
    if (!folderId) return
    
    try {
      // Get all tracks to copy
      const tracksToCopy = trackIds.map(trackId => {
        const canonicalId = getCanonicalTrackId(trackId)
        return displayTracks.find(t => t.id === canonicalId) || 
               allTracks.find(t => t.id === canonicalId)
      }).filter(Boolean) as Track[]
      
      if (tracksToCopy.length === 0) {
        alert('No tracks found to copy')
        return
      }
      
      // Create copies of each track in the target folder
      await Promise.all(
        tracksToCopy.map(async (track) => {
          // Create a new track entry with same data but new ID and target folder
          // Generate a unique ID for the copy
          const timestamp = Date.now()
          const random = Math.random().toString(36).substr(2, 9)
          const newId = `${track.id}-copy-${folderId}-${timestamp}-${random}`
          
          // Prepare track data for creation, preserving audioFileId to link to same audio file
          const newTrack: Partial<Track> = {
            id: newId,
            folderId,
            audioFileId: track.audioFileId, // Preserve audio file link
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            file: track.file,
            artwork: track.artwork,
            bpm: track.bpm,
            key_signature: track.key_signature,
            sonic_dna: track.sonic_dna,
            energy_level: track.energy_level,
            danceability: track.danceability,
            created_at: track.created_at,
            date: track.date,
            year: track.year,
            metadata: track.metadata,
            is_archived: track.is_archived,
          }
          
          await createTrack(newTrack)
        })
      )
      
      // Refresh the library structure and current folder view
      invalidateMusicLibraryCache()
      await loadLibraryStructure()
      if (selectedFolder) {
        await handleFolderSelect(selectedFolder)
      }
      
      setShowFolderPicker(false)
      setPendingFolderTrackIds([])
      alert(`Successfully copied ${tracksToCopy.length} track${tracksToCopy.length === 1 ? '' : 's'} to folder`)
    } catch (error: any) {
      alert(`Failed to copy tracks: ${error.message}`)
    }
  }

  const handleSelectAll = () => {
    if (selectedTracks.size === sortedDisplayTracks.length) {
      setSelectedTracks(new Set())
    } else {
      setSelectedTracks(new Set(sortedDisplayTracks.map(t => t.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedTracks.size} tracks?`)) return
    
    try {
      await Promise.all(Array.from(selectedTracks).map(id => deleteTrack(id)))
      setSelectedTracks(new Set())
      await handleFolderSelect(selectedFolder!)
      alert('Tracks deleted successfully')
    } catch (error: any) {
      alert(`Error deleting tracks: ${error.message}`)
    }
  }

  const handleBulkLink = async () => {
    // For bulk link, we'll use the auto-link feature which tries to match tracks automatically
    setLinking(true)
    try {
      const response = await fetch('/api/music-library/link-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Empty body triggers auto-linking
      })

      const data = await response.json()
      if (response.ok && data.success) {
        alert(
          `Linking complete!\n\n` +
          `Tracks processed: ${data.stats.tracksProcessed}\n` +
          `Tracks linked: ${data.stats.tracksLinked}\n` +
          `Tracks already linked: ${data.stats.tracksAlreadyLinked}\n` +
          `Tracks not found: ${data.stats.tracksNotFound}`
        )
        setSelectedTracks(new Set())
        await loadAllData()
      } else {
        alert(`Linking failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error: any) {
      alert(`Linking error: ${error.message}`)
    } finally {
      setLinking(false)
    }
  }

  const handleDuplicateTrack = async (track: Track) => {
    try {
      const newTrack = {
        ...track,
        id: `${track.id}-copy-${Date.now()}`,
        title: `${track.title} (Copy)`,
      }
      delete (newTrack as any).audioFileId
      delete (newTrack as any).audio_file_id
      
      await createTrack({ ...newTrack, folderId: selectedFolder?.id })
      await handleFolderSelect(selectedFolder!)
      alert('Track duplicated successfully')
    } catch (error: any) {
      alert(`Failed to duplicate track: ${error.message}`)
    }
  }

  // Build folder path
  useEffect(() => {
    if (selectedFolder && libraryData?.folders) {
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
      
      const path = buildPath(selectedFolder.id, libraryData.folders) || []
      setFolderPath(path)
    } else {
      setFolderPath([])
    }
  }, [selectedFolder, libraryData])

  const handleFolderSelect = async (folder: FolderItem | HierarchicalFolder) => {
    setSelectedFolder(folder as FolderItem)
    
    try {
      console.log('Loading folder:', folder.id, folder.name)
      
      // Try to fetch tracks from API (lightweight, no heavy columns)
      let folderTracks: Track[] = []
      try {
        folderTracks = await fetchTracks(folder.id)
        console.log('Fetched tracks from API for folder:', folder.id, 'count:', folderTracks.length)
      } catch (apiError) {
        console.warn('API fetch failed, trying folder.tracks:', apiError)
      }
      
      // Fallback: Use tracks from folder object if API returned empty and folder has tracks
      if (folderTracks.length === 0 && (folder as HierarchicalFolder).tracks && (folder as HierarchicalFolder).tracks!.length > 0) {
        console.log('Using tracks from folder object:', (folder as HierarchicalFolder).tracks!.length, 'tracks')
        folderTracks = (folder as HierarchicalFolder).tracks!
      }
      
      // Also check if folder has tracks in the hierarchical structure
      if (folderTracks.length === 0) {
        const hierarchicalFolder = hierarchicalFolders.find(f => f.id === folder.id)
        if (hierarchicalFolder?.tracks && hierarchicalFolder.tracks.length > 0) {
          console.log('Using tracks from hierarchical structure:', hierarchicalFolder.tracks.length, 'tracks')
          folderTracks = hierarchicalFolder.tracks
        }
      }
      
      console.log('Final tracks count for folder:', folder.id, 'count:', folderTracks.length)
      setDisplayTracks(folderTracks)
      
      // Get child folders - check multiple sources
      let childFolders = folders.filter(f => f.parentId === folder.id)
      const existingIds = new Set(childFolders.map(f => f.id))
      
      // 1. Check the folder's own children property (for HierarchicalFolder)
      const folderWithChildren = folder as HierarchicalFolder
      if (folderWithChildren.children && folderWithChildren.children.length > 0) {
        folderWithChildren.children.forEach(child => {
          if (!existingIds.has(child.id)) {
            childFolders.push(child)
            existingIds.add(child.id)
          }
        })
      }
      
      // 2. Check hierarchical structure for children (find folder in top-level)
      const hierarchicalFolder = hierarchicalFolders.find(f => f.id === folder.id)
      if (hierarchicalFolder?.children && hierarchicalFolder.children.length > 0) {
        hierarchicalFolder.children.forEach(child => {
          if (!existingIds.has(child.id)) {
            childFolders.push(child)
            existingIds.add(child.id)
          }
        })
      }
      
      // 3. Deep search in hierarchical folders to find nested folder
      const findFolderInHierarchy = (items: HierarchicalFolder[], targetId: string): HierarchicalFolder | null => {
        for (const item of items) {
          if (item.id === targetId) return item
          if (item.children) {
            const found = findFolderInHierarchy(item.children, targetId)
            if (found) return found
          }
        }
        return null
      }
      const deepFound = findFolderInHierarchy(hierarchicalFolders, folder.id)
      if (deepFound?.children && deepFound.children.length > 0) {
        deepFound.children.forEach(child => {
          if (!existingIds.has(child.id)) {
            childFolders.push(child)
            existingIds.add(child.id)
          }
        })
      }
      
      console.log('Child folders for folder:', folder.id, 'count:', childFolders.length, childFolders.map(f => ({ id: f.id, name: f.name })))
      setDisplayFolders(childFolders)
      
      // Debug: Log what will be displayed
      if (childFolders.length > 0) {
        console.log('Will display folders grid with', childFolders.length, 'folders')
      } else if (folderTracks.length > 0) {
        console.log('Will display tracks list with', folderTracks.length, 'tracks')
      } else {
        console.warn('Folder has no child folders and no tracks - empty state will be shown')
        console.warn('Folder details:', { id: folder.id, name: folder.name, hasTracksProperty: !!(folder as any).tracks, tracksCount: (folder as any).tracks?.length })
      }
    } catch (error) {
      console.error('Error loading folder data:', error)
      // Set empty arrays on error to show empty state
      setDisplayTracks([])
      setDisplayFolders([])
    }
  }

  const handleTrackSelect = (track: Track) => {
    // When a track is selected, set it for editing
    setEditingTrack(track)
  }

  const handleBack = () => {
    if (folderPath.length > 1) {
      const parentFolder = folderPath[folderPath.length - 2]
      handleFolderSelect(parentFolder)
    } else if (hierarchicalFolders.length > 0) {
      const rootFolder = hierarchicalFolders[0]
      handleFolderSelect(rootFolder)
    }
  }

  const handleSync = async () => {
    if (dbHealthy === false) {
      alert('Database is currently unhealthy. Sync is disabled to prevent data corruption. Please try again later.')
      return
    }
    setSyncing(true)
    try {
      const result = await syncToDatabase()
      alert(`Sync complete!\nFolders: ${result.stats.foldersCreated}\nTracks: ${result.stats.tracksCreated}`)
      await handleBuildSonicDnaCache()
      await loadLibraryStructure()
    } catch (error: any) {
      alert(`Sync failed: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleBuildSonicDnaCache = async () => {
    if (dbHealthy === false) {
      alert('Database is currently unhealthy. Cache rebuild is disabled. Please try again later.')
      return
    }
    setBuildingSonicDnaCache(true)
    try {
      const res = await fetch('/api/music-library/build-sonic-dna-cache', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to rebuild Sonic DNA cache.')
        return
      }
      alert(`Sonic DNA cache rebuilt. Cached tracks: ${data.cached_tracks ?? 0}`)
      invalidateMusicLibraryCache()
      await loadLibraryStructure()
    } catch (error: any) {
      alert(`Cache rebuild error: ${error.message}`)
    } finally {
      setBuildingSonicDnaCache(false)
    }
  }

  const handleLinkTracks = async () => {
    if (dbHealthy === false) {
      alert('Database is currently unhealthy. Linking is disabled to prevent partial updates. Please try again later.')
      return
    }
    setLinking(true)
    try {
      const response = await fetch('/api/music-library/link-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert(
          `Linking complete!\n\n` +
          `Tracks processed: ${data.stats.tracksProcessed}\n` +
          `Tracks linked: ${data.stats.tracksLinked}\n` +
          `Tracks already linked: ${data.stats.tracksAlreadyLinked}\n` +
          `Tracks not found: ${data.stats.tracksNotFound}`
        )
        await loadAllData()
      } else {
        alert(`Linking failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error: any) {
      alert(`Linking error: ${error.message}`)
    } finally {
      setLinking(false)
    }
  }

  const handleOrganizeTracks = async () => {
    if (dbHealthy === false) {
      alert('Database is currently unhealthy. Organize is disabled to prevent partial updates. Please try again later.')
      return
    }
    setOrganizing(true)
    try {
      const response = await fetch('/api/music-library/organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: organizeStrategy,
          sortBy,
          sortOrder,
          createMissingFolders,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        alert(
          `Organization complete!\n\n` +
          `Audio files processed: ${data.stats.audioFilesProcessed}\n` +
          `Tracks created: ${data.stats.tracksCreated}\n` +
          `Tracks updated: ${data.stats.tracksUpdated}\n` +
          `Folders created: ${data.stats.foldersCreated}`
        )
        setShowOrganizeModal(false)
        await loadAllData()
      } else {
        alert(`Organization failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error: any) {
      alert(`Organization error: ${error.message}`)
    } finally {
      setOrganizing(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      if (uploadFolder) {
        formData.append('folder', uploadFolder)
      }

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          setUploadProgress(percentComplete)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setSelectedFile(null)
          setUploadFolder('')
          setUploadProgress(0)
          loadAudioFiles()
          alert('Track uploaded successfully!')
        } else {
          alert('Upload failed: ' + xhr.responseText)
        }
        setUploading(false)
      })

      xhr.addEventListener('error', () => {
        alert('Upload failed')
        setUploading(false)
        setUploadProgress(0)
      })

      xhr.open('POST', '/api/audio/upload')
      xhr.send(formData)
    } catch (error: any) {
      alert('Upload error: ' + error.message)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  /** Upload artwork image and return the public URL */
  const handleArtworkUpload = async (file: File, target: 'editFolder' | 'newFolder'): Promise<void> => {
    if (!file.type.startsWith('image/')) {
      alert('Please drop an image file (JPG, PNG, GIF, WebP)')
      return
    }
    
    if (file.size > 10 * 1024 * 1024) {
      alert('Image too large. Maximum size is 10MB.')
      return
    }

    setUploadingArtwork(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/gallery/upload-supabase', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      // Set the uploaded URL to the appropriate folder state
      if (target === 'editFolder' && editingFolder) {
        setEditingFolder({ ...editingFolder, artwork: data.publicUrl })
      } else if (target === 'newFolder') {
        setNewFolder({ ...newFolder, artwork: data.publicUrl })
      }
    } catch (error: any) {
      alert('Failed to upload artwork: ' + error.message)
    } finally {
      setUploadingArtwork(false)
      setArtworkDragOver(false)
    }
  }

  const handleArtworkDrop = (e: React.DragEvent, target: 'editFolder' | 'newFolder') => {
    e.preventDefault()
    e.stopPropagation()
    setArtworkDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFile = files.find(f => f.type.startsWith('image/'))
    
    if (imageFile) {
      handleArtworkUpload(imageFile, target)
    } else {
      alert('Please drop an image file (JPG, PNG, GIF, WebP)')
    }
  }

  /** Load tracks for a folder when editing */
  const loadFolderTracksForEdit = async (folder: HierarchicalFolder) => {
    setLoadingFolderTracks(true)
    try {
      // Try to get tracks from API
      const tracks = await fetchTracks(folder.id)
      if (tracks && tracks.length > 0) {
        setFolderTracks(tracks)
      } else if (folder.tracks && folder.tracks.length > 0) {
        setFolderTracks(folder.tracks)
      } else {
        setFolderTracks([])
      }
    } catch (error) {
      console.error('Error loading folder tracks:', error)
      // Fallback to folder.tracks
      if (folder.tracks && folder.tracks.length > 0) {
        setFolderTracks(folder.tracks)
      } else {
        setFolderTracks([])
      }
    } finally {
      setLoadingFolderTracks(false)
    }
  }

  /** Handle drag start for track reordering */
  const handleTrackDragStart = (index: number) => {
    setDraggedTrackIndex(index)
  }

  /** Handle drag over for track reordering */
  const handleTrackDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedTrackIndex !== null && draggedTrackIndex !== index) {
      setDragOverTrackIndex(index)
    }
  }

  /** Handle drop for track reordering */
  const handleTrackDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (draggedTrackIndex === null || draggedTrackIndex === dropIndex) {
      setDraggedTrackIndex(null)
      setDragOverTrackIndex(null)
      return
    }

    // Reorder tracks
    const newTracks = [...folderTracks]
    const [draggedTrack] = newTracks.splice(draggedTrackIndex, 1)
    newTracks.splice(dropIndex, 0, draggedTrack)
    
    // Update display_order for each track
    const updatedTracks = newTracks.map((track, idx) => ({
      ...track,
      display_order: idx
    }))
    
    setFolderTracks(updatedTracks)
    setDraggedTrackIndex(null)
    setDragOverTrackIndex(null)
  }

  /** Save track order to database */
  const saveFolderTrackOrder = async () => {
    try {
      // Update each track's display_order
      for (let i = 0; i < folderTracks.length; i++) {
        const track = folderTracks[i]
        await updateTrack(track.id, { ...track, display_order: i } as any)
      }
      alert('Track order saved!')
    } catch (error: any) {
      alert('Failed to save track order: ' + error.message)
    }
  }

  /** Remove track from folder */
  const removeTrackFromFolder = async (trackId: string) => {
    if (!confirm('Remove this track from the folder?')) return
    try {
      await deleteTrack(trackId)
      setFolderTracks(folderTracks.filter(t => t.id !== trackId))
    } catch (error: any) {
      alert('Failed to remove track: ' + error.message)
    }
  }

  /** Open edit track modal from folder view */
  const editTrackFromFolder = (track: Track) => {
    setEditingTrack(track)
  }

  const handleScanLibrary = async () => {
    setScanning(true)
    try {
      const response = await fetch('/api/scan-library', { method: 'POST' })
      const data = await response.json()
      if (data.success) {
        alert('Library scanned successfully!')
        await loadAudioFiles()
      } else {
        alert('Scan failed: ' + data.error)
      }
    } catch (error: any) {
      alert('Scan error: ' + error.message)
    } finally {
      setScanning(false)
    }
  }

  const handleAnalyzeAll = async () => {
    setAnalyzing(true)
    try {
      const response = await fetch('/api/audio/analyze-all-sonic-dna?force=true', { method: 'POST' })
      const data = await response.json()
      if (data.success) {
        alert('Analysis started! This may take a while.')
      } else {
        alert('Analysis failed: ' + data.error)
      }
    } catch (error: any) {
      alert('Analysis error: ' + error.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCreateFolderSubmit = async () => {
    // Validate required fields
    if (!newFolder.id || !newFolder.name) {
      alert('Please fill in ID and Name fields')
      return
    }
    
    // Check if folder ID already exists (including archived folders)
    const existingFolder = folders.find(f => f.id === newFolder.id)
    if (existingFolder) {
      alert(`A folder with ID "${newFolder.id}" already exists. Please use a different ID.`)
      return
    }
    
    // Also check database directly for archived folders that might not be in the list
    try {
      const checkResponse = await fetch(`/api/music-library/folders?includeHidden=true&includeArchived=true`)
      if (checkResponse.ok) {
        const checkData = await checkResponse.json()
        const archivedFolder = checkData.folders?.find((f: any) => f.id === newFolder.id)
        if (archivedFolder) {
          alert(`A folder with ID "${newFolder.id}" already exists (it may be archived). Please use a different ID or unarchive the existing folder.`)
          return
        }
      }
    } catch (e) {
      // Continue if check fails - the server will catch the duplicate
    }
    
    try {
      // Ensure type defaults to 'folder' if not set
      const folderData = {
        ...newFolder,
        type: newFolder.type || 'folder'
      }
      console.log('Creating folder with data:', folderData)
      await createFolder(folderData)
      setShowCreateFolder(false)
      setNewFolder({})
      // Invalidate cache and reload fresh data
      invalidateMusicLibraryCache()
      await loadLibraryStructure()
    } catch (error: any) {
      console.error('Error creating folder:', error)
      if (error.message?.includes('duplicate key')) {
        alert(`A folder with this ID already exists. Please use a different ID.`)
      } else {
        alert(`Failed to create folder: ${error.message}`)
      }
    }
  }

  const handleUpdateFolder = async (folder: HierarchicalFolder) => {
    try {
      await updateFolder(folder.id, folder)
      setEditingFolder(null)
      invalidateMusicLibraryCache()
      await loadLibraryStructure()
    } catch (error: any) {
      alert(`Failed to update folder: ${error.message}`)
    }
  }

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this folder? This will also delete all children and tracks.')) {
      return
    }
    try {
      await deleteFolder(id)
      invalidateMusicLibraryCache()
      await loadLibraryStructure()
      if (selectedFolder?.id === id) {
        setSelectedFolder(null)
        setDisplayTracks([])
        setDisplayFolders([])
      }
    } catch (error: any) {
      alert(`Failed to delete folder: ${error.message}`)
    }
  }

  const handleCreateTrackSubmit = async () => {
    if (!selectedFolder) {
      alert('Please select a folder first')
      return
    }
    try {
      await createTrack({ ...newTrack, folderId: selectedFolder.id })
      setShowCreateTrack(false)
      setNewTrack({})
      await handleFolderSelect(selectedFolder)
    } catch (error: any) {
      alert(`Failed to create track: ${error.message}`)
    }
  }

  const handleUpdateTrack = async (track: Track) => {
    try {
      const updated = await updateTrack(track.id, track)
      if (!updated) {
        alert('Save failed: no updated track returned from API.')
        return
      }
      setEditingTrack(null)
      invalidateMusicLibraryCache()
      await handleFolderSelect(selectedFolder!)
    } catch (error: any) {
      alert(`Failed to update track: ${error.message}`)
    }
  }

  /** Find Sonic DNA from DB (by linked audio_file_id or by path) and attach to track + apply to metadata. */
  const handleFindSonicDna = async () => {
    if (!editingTrack) return
    setFindingSonicDna(true)
    try {
      const audioFileId = (editingTrack as any).audioFileId ?? (editingTrack as any).audio_file_id
      let sonicDna: any = null
      let bpm: number | undefined
      let keySignature: string | undefined
      let energyLevel: number | undefined
      let danceability: number | undefined

      if (audioFileId) {
        const res = await fetch(`/api/admin/sonic-dna/${audioFileId}`)
        const data = await res.json()
        if (!res.ok) {
          alert(data.error || 'Could not load Sonic DNA for this track.')
          return
        }
        if (data.track?.sonic_dna) {
          sonicDna = data.track.sonic_dna
          bpm = data.track.bpm
          keySignature = data.track.key_signature
          energyLevel = data.track.energy_level
          danceability = data.track.danceability
        }
      }

      if (!sonicDna) {
        const path = (editingTrack as any).file_url || editingTrack.file || ''
        if (!path) {
          alert('No linked audio file and no file path. Link this track to an audio file first, or use a track with a file path.')
          return
        }
        const res = await fetch(`/api/audio/sonic-dna?path=${encodeURIComponent(path)}`)
        const data = await res.json()
        if (!res.ok) {
          alert(data.error || data.details || 'Could not find Sonic DNA for this path.')
          return
        }
        sonicDna = data.sonicDNA ?? data.sonic_dna
        if (data.bpm != null) bpm = data.bpm
        if (data.key_signature) keySignature = data.key_signature
        if (data.energy_level != null) energyLevel = data.energy_level
        if (data.danceability != null) danceability = data.danceability
      }

      if (!sonicDna) {
        alert('No Sonic DNA data found for this track.')
        return
      }

      let updated: Track = {
        ...editingTrack,
        sonic_dna: sonicDna,
        ...(bpm != null && { bpm }),
        ...(keySignature != null && keySignature !== '' && { key_signature: keySignature }),
        ...(energyLevel != null && { energy_level: energyLevel }),
        ...(danceability != null && { danceability }),
      }
      updated = applySonicDnaToMissingFields(updated)
      setEditingTrack(updated)
    } catch (err: any) {
      alert(err?.message || 'Failed to find Sonic DNA.')
    } finally {
      setFindingSonicDna(false)
    }
  }

  const handleDeleteTrack = async (id: string) => {
    if (!confirm('Are you sure you want to delete this track?')) {
      return
    }
    try {
      await deleteTrack(id)
      await handleFolderSelect(selectedFolder!)
    } catch (error: any) {
      alert(`Failed to delete track: ${error.message}`)
    }
  }

  const handleDeleteAudioFile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this track?')) return

    try {
      const response = await fetch(`/api/audio/${id}`, { method: 'DELETE' })
      if (response.ok) {
        await loadAudioFiles()
        alert('Track deleted successfully')
      } else {
        alert('Delete failed')
      }
    } catch (error) {
      alert('Delete error')
    }
  }

  const getSortIcon = () => {
    if (sortBy === 'default') return <FaSort className="text-sm" />
    const isNumeric = sortBy === 'duration' || sortBy === 'bpm' || sortBy === 'date'
    if (sortOrder === 'asc') {
      return isNumeric
        ? <FaSortNumericDown className="text-sm" />
        : <FaSortAlphaDown className="text-sm" />
    } else {
      return isNumeric
        ? <FaSortNumericUp className="text-sm" />
        : <FaSortAlphaUp className="text-sm" />
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

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false)
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false)
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
      }
    }
    
    if (isSortMenuOpen || showColumnMenu || contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSortMenuOpen, showColumnMenu, contextMenu.visible])
  
  // Handle context menu
  const handleFolderContextMenu = (e: React.MouseEvent, folder: FolderItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      folder,
      track: null,
    })
  }

  const handleTrackContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      folder: null,
      track,
    })
  }
  
  const handleContextMenuAction = (action: string) => {
    if (contextMenu.folder) {
      // Folder actions
      switch (action) {
        case 'edit':
          setEditingFolder(contextMenu.folder as HierarchicalFolder)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'delete':
          handleDeleteFolder(contextMenu.folder.id)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'createSubfolder':
          setNewFolder({ parentId: contextMenu.folder.id })
          setShowCreateFolder(true)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'createTrack':
          handleFolderSelect(contextMenu.folder)
          setShowCreateTrack(true)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'paste':
          if (clipboardTrackIds.length > 0) {
            copyTracksToFolder(contextMenu.folder.id, clipboardTrackIds)
            setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          }
          break
      }
    } else if (contextMenu.track) {
      // Track actions
      switch (action) {
        case 'edit':
          setEditingTrack(contextMenu.track)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'delete':
          handleDeleteTrack(contextMenu.track.id)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'duplicate':
          handleDuplicateTrack(contextMenu.track)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'link':
          setLinkingTrackId(contextMenu.track.id)
          setShowLinkModal(true)
          loadAudioFiles()
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'play':
          handlePlayTrack(contextMenu.track)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'select':
          handleSelectTrack(contextMenu.track.id)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        case 'addToPlaylist': {
          const selected = selectedTracks.size > 0 ? Array.from(selectedTracks) : []
          const trackIds = selected.includes(contextMenu.track.id)
            ? selected
            : [contextMenu.track.id, ...selected]
          setPendingPlaylistTrackIds(trackIds)
          setShowPlaylistPicker(true)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        }
        case 'addToFolder': {
          const selected = selectedTracks.size > 0 ? Array.from(selectedTracks) : []
          const trackIds = selected.includes(contextMenu.track.id)
            ? selected
            : [contextMenu.track.id, ...selected]
          setPendingFolderTrackIds(trackIds)
          setShowFolderPicker(true)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          break
        }
        case 'copy': {
          const selected = selectedTracks.size > 0 ? Array.from(selectedTracks) : []
          const trackIds = selected.includes(contextMenu.track.id)
            ? selected
            : [contextMenu.track.id, ...selected]
          setClipboardTrackIds(trackIds)
          setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
          alert(`Copied ${trackIds.length} track${trackIds.length === 1 ? '' : 's'} to clipboard`)
          break
        }
      }
    }
  }

  // Close context menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, folder: null, track: null })
      }
    }
    
    if (contextMenu.visible) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu.visible])

  useEffect(() => {
    if (!showPlaylistPicker) return
    const loadPlaylists = async () => {
      try {
        const data = await fetchPlaylists()
        setPlaylists(data)
      } catch (error) {
        console.error('Error loading playlists:', error)
      }
    }
    loadPlaylists()
  }, [showPlaylistPicker])

  // Audio player cleanup is handled by MusicPlayer component

  // Admin view: show ALL folders including hidden ones (so admins can manage them)
  // This is different from frontend which filters hidden folders
  const allFolders = useMemo(() => {
    return libraryData?.folders || []
  }, [libraryData])

  // Early returns AFTER all hooks
  if (loading || loadingData || loadingAudioFiles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="pt-20 min-h-screen pb-40 relative z-10 bg-black">
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-8 max-w-7xl relative z-10">
        {/* Header - Matching Frontend */}
        <div className="mb-8">
          <div className="flex flex-col items-center justify-center mb-4 sm:mb-6 w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold mb-1 font-six-caps text-center border border-yellow-400 text-yellow-400 px-3 sm:px-4 py-1.5 sm:py-2 rounded text-wrap">
              SERGIK Music Vault - Admin
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-2 text-center">
              {allTracksFolderCount} songs • Admin Mode
            </p>
          </div>

          {/* Search Bar - Matching Frontend */}
          <div className="relative mb-4 sm:mb-6">
            <FaSearch className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm sm:text-base" />
            <input
              type="text"
              placeholder="Search your library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:pl-11 pr-9 sm:pr-10 py-2.5 sm:py-3 text-sm sm:text-base bg-gray-800/40 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                title="Clear search"
              >
                <FaTimes />
              </button>
            )}
          </div>

          {/* Admin Tools Bar */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={handleLinkTracks}
              disabled={linking}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm disabled:opacity-50 flex items-center gap-2"
            >
              <FaLink className={linking ? 'animate-spin' : ''} />
              Link Tracks
            </button>
            <button
              onClick={() => setShowOrganizeModal(true)}
              disabled={organizing}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm disabled:opacity-50 flex items-center gap-2"
            >
              <FaSitemap className={organizing ? 'animate-spin' : ''} />
              Organize
            </button>
            <button
              onClick={handleBuildSonicDnaCache}
              disabled={buildingSonicDnaCache}
              className="px-3 py-2 bg-purple-700 hover:bg-purple-800 rounded text-sm disabled:opacity-50 flex items-center gap-2"
              title="Rebuild Sonic DNA cache for fast column data"
            >
              <FaBrain className={buildingSonicDnaCache ? 'animate-spin' : ''} />
              Build Sonic DNA Cache
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50 flex items-center gap-2"
            >
              <FaSync className={syncing ? 'animate-spin' : ''} />
              Sync
            </button>
            <button
              onClick={() => setShowStats(!showStats)}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm flex items-center gap-2"
            >
              <FaChartBar /> Stats
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm flex items-center gap-2"
            >
              <FaFilter /> Filters
            </button>
            <button
              onClick={async () => {
                const next = !showDuplicates
                setShowDuplicates(next)
                // When enabling duplicates, jump to All Tracks to surface the true duplicates set.
                if (next) {
                  const allTracksFolder = folders.find((f) => f.id === 'folder-all-tracks')
                  if (allTracksFolder) {
                    await handleFolderSelect(allTracksFolder)
                    setDisplayFolders([])
                  }
                }
              }}
              className={`px-3 py-2 rounded text-sm flex items-center gap-2 ${
                showDuplicates ? 'bg-red-700 hover:bg-red-800' : 'bg-red-600 hover:bg-red-700'
              }`}
              title="Show duplicate tracks (same audio file or same file URL) in All Tracks"
            >
              <FaCopy /> {showDuplicates ? 'Showing Duplicates' : 'Show Duplicates'}
            </button>
            <button
              onClick={() => setShowCreateFolder(true)}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-2"
            >
              <FaPlus /> New Folder
            </button>
            {selectedFolder && (
              <button
                onClick={() => setShowCreateTrack(true)}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-2"
              >
                <FaPlus /> New Track
              </button>
            )}
            {selectedTracks.size > 0 && (
              <>
                <button
                  onClick={handleBulkLink}
                  disabled={linking}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <FaLink /> Link Selected ({selectedTracks.size})
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm flex items-center gap-2"
                >
                  <FaTrash /> Delete Selected ({selectedTracks.size})
                </button>
              </>
            )}
          </div>

          {/* Statistics Panel */}
          {showStats && (
            <div className="mb-4 p-4 bg-gray-800/40 border border-gray-700 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-400">Unique Tracks</div>
                  <div className="text-xl font-semibold text-white">{stats.total}</div>
                  {(stats as any).totalEntries && (stats as any).totalEntries !== stats.total && (
                    <div className="text-xs text-gray-500">{(stats as any).totalEntries} entries</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-400">BPM Coverage</div>
                  <div className={`text-xl font-semibold ${stats.completeness.bpm >= 80 ? 'text-green-400' : stats.completeness.bpm >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.bpm}%</div>
                  <div className="text-xs text-gray-500">{stats.withBpm} tracks</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Key Coverage</div>
                  <div className={`text-xl font-semibold ${stats.completeness.key >= 80 ? 'text-green-400' : stats.completeness.key >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.key}%</div>
                  <div className="text-xs text-gray-500">{stats.withKey} tracks</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Genre Coverage</div>
                  <div className={`text-xl font-semibold ${stats.completeness.genre >= 80 ? 'text-green-400' : stats.completeness.genre >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.genre}%</div>
                  <div className="text-xs text-gray-500">{stats.withGenre} tracks</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Artwork Coverage</div>
                  <div className={`text-xl font-semibold ${stats.completeness.artwork >= 80 ? 'text-green-400' : stats.completeness.artwork >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.artwork}%</div>
                  <div className="text-xs text-gray-500">{stats.withArtwork} tracks</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-700">
                <div>
                  <div className="text-xs text-gray-400">Linked Tracks</div>
                  <div className={`text-xl font-semibold ${stats.completeness.linked >= 80 ? 'text-green-400' : stats.completeness.linked >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.linked}%</div>
                  <div className="text-xs text-gray-500">{stats.linked} tracks</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Sonic DNA</div>
                  <div className={`text-xl font-semibold ${stats.completeness.sonicDna >= 80 ? 'text-purple-400' : stats.completeness.sonicDna >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.sonicDna}%</div>
                  <div className="text-xs text-gray-500">{stats.withSonicDna} tracks</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Energy Level</div>
                  <div className={`text-xl font-semibold ${stats.completeness.energy >= 80 ? 'text-cyan-400' : stats.completeness.energy >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.energy}%</div>
                  <div className="text-xs text-gray-500">{stats.withEnergy} tracks</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Danceability</div>
                  <div className={`text-xl font-semibold ${stats.completeness.danceability >= 80 ? 'text-pink-400' : stats.completeness.danceability >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.danceability}%</div>
                  <div className="text-xs text-gray-500">{stats.withDanceability} tracks</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Waveform</div>
                  <div className={`text-xl font-semibold ${stats.completeness.waveform >= 80 ? 'text-blue-400' : stats.completeness.waveform >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.completeness.waveform}%</div>
                  <div className="text-xs text-gray-500">{stats.withWaveform} tracks</div>
                </div>
              </div>
            </div>
          )}

          {/* Filters Panel */}
          {showFilters && (
            <div className="mb-4 p-4 bg-gray-800/40 border border-gray-700 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Genre</label>
                  <select
                    value={filterGenre}
                    onChange={(e) => setFilterGenre(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white"
                    title="Filter by genre"
                  >
                    <option value="">All Genres</option>
                    {availableGenres.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">BPM Range</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filterBpmMin}
                      onChange={(e) => setFilterBpmMin(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white"
                      title="Filter BPM minimum"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={filterBpmMax}
                      onChange={(e) => setFilterBpmMax(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white"
                      title="Filter BPM maximum"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Key</label>
                  <select
                    value={filterKey}
                    onChange={(e) => setFilterKey(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm text-white"
                    title="Filter by key"
                  >
                    <option value="">All Keys</option>
                    {availableKeys.map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setFilterGenre('')
                      setFilterBpmMin('')
                      setFilterBpmMax('')
                      setFilterKey('')
                    }}
                    className="w-full px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Layout - Matching Frontend (12-col grid, sidebar 3, content 9) */}
        {/* Mobile: Library nav above content */}
        <div className="mb-4 lg:hidden">
          <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-900/40 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-white">Library</h2>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {allFolders.length > 0 ? (
                <FolderTree
                  items={allFolders}
                  onTrackSelect={handleTrackSelect}
                  onFolderSelect={handleFolderSelect}
                  onFolderContextMenu={handleFolderContextMenu}
                  showHidden={true}
                />
              ) : (
                <div className="p-6 text-center text-gray-400 text-sm">No folders</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* Left Sidebar - Folder Tree (Desktop only, same ratio as frontend) */}
          <div className="hidden lg:block lg:col-span-3 order-2 lg:order-1">
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-900/40 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-white">Library</h2>
              </div>
              <div className="max-h-[600px] sm:max-h-[700px] overflow-y-auto">
                {allFolders.length > 0 ? (
                  <div onContextMenu={(e) => e.preventDefault()}>
                    <FolderTree
                      items={allFolders}
                      onTrackSelect={handleTrackSelect}
                      onFolderSelect={handleFolderSelect}
                      onFolderContextMenu={handleFolderContextMenu}
                      showHidden={true}
                      folderPathComponent={
                      folderPath.length > 1 && (
                        <div className="px-4 py-2 border-t border-gray-700">
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {folderPath.map((folder, idx) => (
                              <div key={folder.id} className="flex items-center gap-2">
                                {idx > 0 && <FaChevronRight className="text-xs" />}
                                <button
                                  onClick={() => handleFolderSelect(folder)}
                                  className="hover:text-white transition-colors"
                                >
                                  {folder.name}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }
                  />
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-400">No folders found</div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Area - Matching Frontend (content first on mobile) */}
          <div className="lg:col-span-9 order-1 lg:order-2">
            <div className="bg-gray-800/40 border border-gray-700 rounded-lg overflow-hidden h-full">
              {/* Breadcrumb / Header: Back + current folder name + count (match frontend) */}
              {(folderPath.length > 0 || selectedFolder) && (
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
                      {selectedFolder?.name || 'Library'}
                    </h2>
                    <span className="text-sm text-gray-400">
                      {displayFolders.length > 0
                        ? `${displayFolders.length} ${displayFolders.length === 1 ? 'item' : 'items'}`
                        : displayTracks.length > 0
                          ? `${displayTracks.length} ${displayTracks.length === 1 ? 'track' : 'tracks'}`
                          : ''}
                    </span>
                  </div>
                </div>
              )}

              {/* Sort Controls (tracks view) */}
              {displayTracks.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {sortedDisplayTracks.length > 0 && (
                      <button
                        onClick={handleSelectAll}
                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                        title="Select All"
                      >
                        {selectedTracks.size === sortedDisplayTracks.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                    <div className="relative" ref={sortMenuRef}>
                      <button
                        onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-2"
                      >
                        {getSortIcon()}
                        <span className="hidden sm:inline">
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
                        <div className="absolute left-0 mt-2 w-48 bg-gray-800/40 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
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
                    <div className="relative" ref={columnMenuRef}>
                      <button
                        onClick={() => setShowColumnMenu(!showColumnMenu)}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-2"
                      >
                        <FaColumns />
                        <span className="hidden sm:inline">Columns</span>
                      </button>
                      {showColumnMenu && (
                        <div className="absolute left-0 mt-2 w-48 bg-gray-800/40 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="py-1 max-h-64 overflow-y-auto">
                            {[
                              { key: 'title', label: 'Title' },
                              { key: 'artist', label: 'Artist' },
                              { key: 'duration', label: 'Duration' },
                              { key: 'bpm', label: 'BPM' },
                              { key: 'key', label: 'Key' },
                              { key: 'genre', label: 'Genre' },
                              { key: 'subgenre', label: 'Sub-Genre' },
                              { key: 'drumStyle', label: 'Drum Style' },
                              { key: 'timeSignature', label: 'Time Signature' },
                              { key: 'scale', label: 'Scale' },
                              { key: 'date', label: 'Date' },
                            ].map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => {
                                  setVisibleColumns(prev => {
                                    const next = new Set(prev)
                                    if (next.has(key)) {
                                      next.delete(key)
                                    } else {
                                      next.add(key)
                                    }
                                    return next
                                  })
                                }}
                                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700/40 transition-colors ${
                                  visibleColumns.has(key) ? 'text-blue-400 bg-gray-700/40' : 'text-gray-300'
                                }`}
                              >
                                {visibleColumns.has(key) ? (
                                  <FaCheckSquare className="text-xs" />
                                ) : (
                                  <FaSquare className="text-xs" />
                                )}
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    {sortedDisplayTracks.length} {sortedDisplayTracks.length === 1 ? 'track' : 'tracks'}
                    {filteredDisplayTracks.length !== displayTracks.length && (
                      <span className="text-yellow-400 ml-2">
                        (filtered from {displayTracks.length})
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Content: Folders Grid or Tracks List (match frontend padding and max-height) */}
              <div className="p-3 sm:p-4 md:p-6 max-h-[600px] sm:max-h-[700px] md:max-h-[900px] overflow-y-auto">
                {displayFolders.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 gap-3 sm:gap-4">
                    {displayFolders.map((folder) => {
                      // Count unique tracks by ID to avoid duplicates
                      const uniqueTrackIds = new Set(folder.tracks?.map(t => t.id) || [])
                      const trackCount = uniqueTrackIds.size
                      const childCount = (folder as HierarchicalFolder).children?.length || 0
                      const isAlbumOrEP = folder.type === 'album' || folder.type === 'ep' || folder.type === 'single' || folder.type === 'remix'
                      const artworkRaw = folder.artwork || (folder.tracks && folder.tracks[0]?.artwork) || ((folder as HierarchicalFolder).children?.[0]?.artwork)
                      const artwork = artworkRaw ? resolveImageUrl(artworkRaw) : null
                      
                      return (
                        <div
                          key={folder.id}
                          className="bg-gray-700/40 border border-gray-600 rounded-lg overflow-hidden hover:border-purple-500 transition-all cursor-pointer group relative"
                          onClick={() => handleFolderSelect(folder)}
                          onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                        >
                          {artwork ? (
                            <div className="relative w-full aspect-square">
                              <Image
                                src={artwork}
                                alt={folder.name}
                                fill
                                className="object-cover"
                                unoptimized={artworkRaw ? shouldUnoptimizeImage(artworkRaw) : false}
                                sizes="(max-width: 768px) 50vw, 33vw"
                              />
                            </div>
                          ) : (
                            <div className="w-full aspect-square bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                              {isAlbumOrEP ? (
                                <FaMusic className="text-4xl text-gray-500" />
                              ) : (
                                <FaFolder className="text-4xl text-gray-500" />
                              )}
                            </div>
                          )}
                          <div className="p-3">
                            <h3 className="font-semibold text-white truncate mb-1">{folder.name}</h3>
                            <p className="text-xs text-gray-400">
                              {trackCount > 0
                                ? `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}`
                                : childCount > 0
                                  ? `${childCount} ${childCount === 1 ? 'folder' : 'folders'}`
                                  : 'Empty'}
                            </p>
                          </div>
                          {/* Admin Edit Button */}
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingFolder(folder as HierarchicalFolder)
                              }}
                              className="p-2 bg-blue-600 hover:bg-blue-700 rounded"
                              title="Edit Folder"
                            >
                              <FaEdit className="text-xs" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : displayTracks.length > 0 ? (
                  <div className="space-y-2">
                    {(visibleColumns.has('genre') || visibleColumns.has('subgenre') || visibleColumns.has('drumStyle') || visibleColumns.has('timeSignature') || visibleColumns.has('key') || visibleColumns.has('scale') || visibleColumns.has('date') || visibleColumns.has('bpm') || visibleColumns.has('duration') || visibleColumns.has('artist') || visibleColumns.has('title')) && (
                      <div className="sticky top-0 z-10 bg-gray-900/80 backdrop-blur border border-gray-700 rounded-lg px-4 py-2 text-[10px] uppercase tracking-wide text-gray-400">
                        <div className="flex items-center gap-4">
                          <div className="w-4">Sel</div>
                          <div className="w-9">Play</div>
                          <div className="w-12 h-12">Art</div>
                          {(visibleColumns.has('title') || !visibleColumns.size) && (
                            <div className="min-w-[150px] border-l border-gray-700/60 pl-3">Title</div>
                          )}
                          {(visibleColumns.has('artist') || !visibleColumns.size) && (
                            <div className="min-w-[120px] border-l border-gray-700/60 pl-3">Artist</div>
                          )}
                          {visibleColumns.has('duration') && (
                            <div className="border-l border-gray-700/60 pl-3">Dur.</div>
                          )}
                          {visibleColumns.has('bpm') && (
                            <div className="border-l border-gray-700/60 pl-3">BPM</div>
                          )}
                          {visibleColumns.has('key') && (
                            <div className="border-l border-gray-700/60 pl-3">Key</div>
                          )}
                          {visibleColumns.has('genre') && (
                            <div className="min-w-[100px] border-l border-gray-700/60 pl-3">Genre</div>
                          )}
                          {visibleColumns.has('subgenre') && (
                            <div className="min-w-[100px] border-l border-gray-700/60 pl-3">Sub-Genre</div>
                          )}
                          {visibleColumns.has('drumStyle') && (
                            <div className="min-w-[100px] border-l border-gray-700/60 pl-3">Drum Style</div>
                          )}
                          {visibleColumns.has('timeSignature') && (
                            <div className="border-l border-gray-700/60 pl-3">Time Sig</div>
                          )}
                          {visibleColumns.has('scale') && (
                            <div className="border-l border-gray-700/60 pl-3">Scale</div>
                          )}
                          {visibleColumns.has('date') && (
                            <div className="border-l border-gray-700/60 pl-3">Date</div>
                          )}
                        </div>
                      </div>
                    )}
                    {sortedDisplayTracks.map((track) => {
                      const isLinked = (track as any).audioFileId || (track as any).audio_file_id
                      const isSelected = selectedTracks.has(track.id)
                      const isTrackPlaying = currentTrack?.id === track.id && isPlaying
                      return (
                        <div
                          key={track.id}
                          className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-700/40 rounded-lg transition-colors group border-l-2 ${
                            isSelected ? 'border-blue-500 bg-blue-500/10' : 'border-transparent hover:border-purple-500'
                          }`}
                          onContextMenu={(e) => handleTrackContextMenu(e, track)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectTrack(track.id)}
                            className="w-4 h-4 rounded"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select track ${track.title}`}
                            title={`Select track ${track.title}`}
                          />
                          <button
                            onClick={() => handlePlayTrack(track)}
                            className="p-2 hover:bg-gray-600 rounded flex-shrink-0"
                            title={isTrackPlaying ? 'Pause' : 'Play'}
                          >
                            {isTrackPlaying ? <FaPause /> : <FaPlay />}
                          </button>
                          <div className="relative">
                            {track.artwork ? (
                              <div className="relative w-12 h-12 rounded overflow-hidden">
                                <Image
                                  src={resolveImageUrl(track.artwork)}
                                  alt={track.title}
                                  fill
                                  className="object-cover"
                                  unoptimized={shouldUnoptimizeImage(track.artwork)}
                                  sizes="48px"
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded bg-gray-700/40 flex items-center justify-center">
                                <FaMusic className="text-gray-500" />
                              </div>
                            )}
                            {isLinked && (
                              <FaCheckCircle className="absolute -top-1 -right-1 text-green-500 text-xs" title="Linked" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap">
                            {(visibleColumns.has('title') || !visibleColumns.size) && (
                              <div className="min-w-[150px] border-l border-gray-700/60 pl-3">
                                <div className="text-sm font-medium text-white truncate">{track.title}</div>
                              </div>
                            )}
                            {(visibleColumns.has('artist') || !visibleColumns.size) && (
                              <div className="min-w-[120px] border-l border-gray-700/60 pl-3">
                                <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                              </div>
                            )}
                            {visibleColumns.has('duration') && track.duration && (
                              <div className="text-xs text-gray-400 whitespace-nowrap border-l border-gray-700/60 pl-3">
                                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                              </div>
                            )}
                            {visibleColumns.has('bpm') && getTrackBpm(track) > 0 && (
                              <div className="text-xs text-gray-400 whitespace-nowrap border-l border-gray-700/60 pl-3">
                                {getTrackBpm(track)} BPM
                              </div>
                            )}
                            {visibleColumns.has('key') && getTrackKey(track) && (
                              <div className="text-xs text-gray-400 whitespace-nowrap border-l border-gray-700/60 pl-3">
                                {getTrackKey(track)}
                              </div>
                            )}
                            {visibleColumns.has('genre') && getTrackGenre(track) && (
                              <div className="text-xs text-gray-400 truncate min-w-[100px] border-l border-gray-700/60 pl-3">
                                {getTrackGenre(track)}
                              </div>
                            )}
                            {visibleColumns.has('subgenre') && getTrackSubgenre(track) && (
                              <div className="text-xs text-gray-400 truncate min-w-[100px] border-l border-gray-700/60 pl-3">
                                {getTrackSubgenre(track)}
                              </div>
                            )}
                            {visibleColumns.has('drumStyle') && getTrackDrumStyle(track) && (
                              <div className="text-xs text-gray-400 truncate min-w-[100px] border-l border-gray-700/60 pl-3">
                                {getTrackDrumStyle(track)}
                              </div>
                            )}
                            {visibleColumns.has('timeSignature') && getTrackTimeSignature(track) && (
                              <div className="text-xs text-gray-400 whitespace-nowrap border-l border-gray-700/60 pl-3">
                                {getTrackTimeSignature(track)}
                              </div>
                            )}
                            {visibleColumns.has('scale') && getTrackScale(track) && (
                              <div className="text-xs text-gray-400 whitespace-nowrap border-l border-gray-700/60 pl-3">
                                {getTrackScale(track)}
                              </div>
                            )}
                            {visibleColumns.has('date') && getTrackDate(track) && (
                              <div className="text-xs text-gray-400 whitespace-nowrap border-l border-gray-700/60 pl-3">
                                {getTrackDate(track)}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!isLinked && (
                              <button
                                onClick={() => {
                                  setLinkingTrackId(track.id)
                                  setShowLinkModal(true)
                                }}
                                className="p-2 hover:bg-indigo-600 rounded"
                                title="Link Audio File"
                              >
                                <FaLink />
                              </button>
                            )}
                            <button
                              onClick={() => handleDuplicateTrack(track)}
                              className="p-2 hover:bg-gray-600 rounded"
                              title="Duplicate Track"
                            >
                              <FaCopy />
                            </button>
                            <button
                              onClick={() => setEditingTrack(track)}
                              className="p-2 hover:bg-gray-600 rounded"
                              title="Edit Track"
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleDeleteTrack(track.id)}
                              className="p-2 hover:bg-red-600 rounded"
                              title="Delete Track"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    {selectedFolder ? 'This folder is empty (no tracks or subfolders)' : 'Select a folder to view contents'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modals - Create/Edit Folder */}
        {showCreateFolder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4">Create Folder</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-1">ID <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={newFolder.id || ''}
                    onChange={(e) => setNewFolder({ ...newFolder, id: e.target.value })}
                    className={`w-full bg-gray-700 rounded p-2 ${!newFolder.id ? 'border border-red-500/50' : ''}`}
                    placeholder="folder-id (required)"
                    title="Folder ID"
                    required
                  />
                  {!newFolder.id && <p className="text-red-400 text-xs mt-1">ID is required</p>}
                </div>
                <div>
                  <label className="block text-sm mb-1">Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={newFolder.name || ''}
                    onChange={(e) => {
                      const name = e.target.value
                      // Auto-generate ID from name if ID is empty or was auto-generated
                      const autoId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                      const shouldAutoId = !newFolder.id || newFolder.id === (newFolder.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                      setNewFolder({ 
                        ...newFolder, 
                        name,
                        ...(shouldAutoId ? { id: autoId ? `folder-${autoId}` : '' } : {})
                      })
                    }}
                    className={`w-full bg-gray-700 rounded p-2 ${!newFolder.name ? 'border border-red-500/50' : ''}`}
                    placeholder="Folder name (required)"
                    title="Folder name"
                    required
                  />
                  {!newFolder.name && <p className="text-red-400 text-xs mt-1">Name is required</p>}
                </div>
                <div>
                  <label className="block text-sm mb-1">Type</label>
                  <select
                    value={newFolder.type || 'folder'}
                    onChange={(e) => setNewFolder({ ...newFolder, type: e.target.value as any })}
                    className="w-full bg-gray-700 rounded p-2"
                    title="Folder type"
                  >
                    <option value="folder">Folder</option>
                    <option value="album">Album</option>
                    <option value="ep">EP</option>
                    <option value="single">Single</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Parent Folder</label>
                  <select
                    value={newFolder.parentId || ''}
                    onChange={(e) => setNewFolder({ ...newFolder, parentId: e.target.value || null })}
                    className="w-full bg-gray-700 rounded p-2"
                    title="Parent folder"
                  >
                    <option value="">Root (No Parent)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Cover Art</label>
                  {/* Drag & Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setArtworkDragOver(true)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setArtworkDragOver(false)
                    }}
                    onDrop={(e) => handleArtworkDrop(e, 'newFolder')}
                    className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                      artworkDragOver
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    {uploadingArtwork ? (
                      <div className="flex items-center justify-center gap-2 py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span className="text-sm text-gray-300">Uploading...</span>
                      </div>
                    ) : newFolder.artwork ? (
                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 rounded overflow-hidden border border-gray-600 flex-shrink-0">
                          <Image
                            src={resolveImageUrl(newFolder.artwork)}
                            alt="Cover art preview"
                            fill
                            className="object-cover"
                            unoptimized={shouldUnoptimizeImage(newFolder.artwork)}
                            sizes="80px"
                          />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-xs text-gray-400 truncate mb-2">{newFolder.artwork}</p>
                          <div className="flex gap-2">
                            <label className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs cursor-pointer">
                              Replace
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleArtworkUpload(file, 'newFolder')
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setNewFolder({ ...newFolder, artwork: undefined })}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer block py-4">
                        <FaImage className="mx-auto text-2xl text-gray-500 mb-2" />
                        <p className="text-sm text-gray-400">
                          Drag & drop an image here, or <span className="text-blue-400">browse</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP (max 10MB)</p>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleArtworkUpload(file, 'newFolder')
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {/* URL Input (alternative) */}
                  <div className="mt-2">
                    <input
                      type="text"
                      value={newFolder.artwork || ''}
                      onChange={(e) => setNewFolder({ ...newFolder, artwork: e.target.value || undefined })}
                      className="w-full bg-gray-700 rounded p-2 text-white text-sm"
                      placeholder="Or paste image URL..."
                      title="Cover art URL"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newFolder.hidden || false}
                    onChange={(e) => setNewFolder({ ...newFolder, hidden: e.target.checked })}
                    className="rounded"
                    id="admin-new-folder-hidden"
                    aria-label="Hidden from frontend"
                    title="Hidden from frontend"
                  />
                  <label htmlFor="admin-new-folder-hidden">Hidden from frontend</label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateFolderSubmit}
                    disabled={!newFolder.id || !newFolder.name}
                    className={`px-4 py-2 rounded flex-1 ${
                      !newFolder.id || !newFolder.name 
                        ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateFolder(false)
                      setNewFolder({})
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Folder Modal */}
        {editingFolder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Edit Folder</h2>
                <button
                  onClick={() => {
                    setEditingFolder(null)
                    setFolderTracks([])
                  }}
                  className="text-gray-400 hover:text-white"
                  title="Close"
                  aria-label="Close"
                >
                  <FaTimes />
                </button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Folder Settings */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input
                      type="text"
                      value={editingFolder.name}
                      onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                      className="w-full bg-gray-700 rounded p-2"
                      title="Folder name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Type</label>
                    <select
                      value={editingFolder.type}
                      onChange={(e) => setEditingFolder({ ...editingFolder, type: e.target.value as any })}
                      className="w-full bg-gray-700 rounded p-2"
                      title="Folder type"
                    >
                      <option value="folder">Folder</option>
                      <option value="album">Album</option>
                      <option value="ep">EP</option>
                      <option value="single">Single</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Cover Art</label>
                    {/* Drag & Drop Zone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setArtworkDragOver(true)
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setArtworkDragOver(false)
                      }}
                      onDrop={(e) => handleArtworkDrop(e, 'editFolder')}
                      className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                        artworkDragOver
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {uploadingArtwork ? (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span className="text-sm text-gray-300">Uploading...</span>
                        </div>
                      ) : editingFolder.artwork ? (
                        <div className="flex items-center gap-4">
                          <div className="relative w-20 h-20 rounded overflow-hidden border border-gray-600 flex-shrink-0">
                            <Image
                              src={resolveImageUrl(editingFolder.artwork)}
                              alt="Cover art preview"
                              fill
                              className="object-cover"
                              unoptimized={shouldUnoptimizeImage(editingFolder.artwork)}
                              sizes="80px"
                            />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-xs text-gray-400 truncate mb-2">{editingFolder.artwork}</p>
                            <div className="flex gap-2">
                              <label className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs cursor-pointer">
                                Replace
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleArtworkUpload(file, 'editFolder')
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => setEditingFolder({ ...editingFolder, artwork: undefined })}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <label className="cursor-pointer block py-4">
                          <FaImage className="mx-auto text-2xl text-gray-500 mb-2" />
                          <p className="text-sm text-gray-400">
                            Drag & drop an image here, or <span className="text-blue-400">browse</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP (max 10MB)</p>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleArtworkUpload(file, 'editFolder')
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {/* URL Input (alternative) */}
                    <div className="mt-2">
                      <input
                        type="text"
                        value={editingFolder.artwork || ''}
                        onChange={(e) => setEditingFolder({ ...editingFolder, artwork: e.target.value || undefined })}
                        className="w-full bg-gray-700 rounded p-2 text-white text-sm"
                        placeholder="Or paste image URL..."
                        title="Cover art URL"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingFolder.hidden || false}
                      onChange={(e) => setEditingFolder({ ...editingFolder, hidden: e.target.checked })}
                      className="rounded"
                      id="admin-edit-folder-hidden"
                      aria-label="Hidden from frontend"
                      title="Hidden from frontend"
                    />
                    <label htmlFor="admin-edit-folder-hidden">Hidden from frontend</label>
                  </div>
                </div>

                {/* Right Column - Tracks in Folder */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium">Tracks in Folder</label>
                    <div className="flex gap-2">
                      {!loadingFolderTracks && folderTracks.length === 0 && (
                        <button
                          onClick={() => loadFolderTracksForEdit(editingFolder)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                        >
                          Load Tracks
                        </button>
                      )}
                      {folderTracks.length > 0 && (
                        <button
                          onClick={saveFolderTrackOrder}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs flex items-center gap-1"
                        >
                          <FaSave className="text-xs" /> Save Order
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-gray-900/50 rounded-lg border border-gray-700 max-h-[400px] overflow-y-auto">
                    {loadingFolderTracks ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      </div>
                    ) : folderTracks.length > 0 ? (
                      <div className="divide-y divide-gray-700">
                        {folderTracks.map((track, index) => (
                          <div
                            key={track.id}
                            draggable
                            onDragStart={() => handleTrackDragStart(index)}
                            onDragOver={(e) => handleTrackDragOver(e, index)}
                            onDragEnd={() => {
                              setDraggedTrackIndex(null)
                              setDragOverTrackIndex(null)
                            }}
                            onDrop={(e) => handleTrackDrop(e, index)}
                            className={`flex items-center gap-2 p-2 transition-colors cursor-move ${
                              draggedTrackIndex === index
                                ? 'opacity-50 bg-gray-700'
                                : dragOverTrackIndex === index
                                  ? 'bg-blue-900/30 border-t-2 border-blue-500'
                                  : 'hover:bg-gray-800/50'
                            }`}
                          >
                            <FaGripVertical className="text-gray-500 text-xs flex-shrink-0" />
                            <span className="text-xs text-gray-500 w-5">{index + 1}</span>
                            {track.artwork && (
                              <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0">
                                <Image
                                  src={resolveImageUrl(track.artwork)}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  unoptimized={shouldUnoptimizeImage(track.artwork)}
                                  sizes="32px"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{track.title}</p>
                              <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {track.bpm && (
                                <span className="text-xs text-gray-500">{track.bpm} BPM</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  editTrackFromFolder(track)
                                }}
                                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                title="Edit Track"
                              >
                                <FaEdit className="text-xs" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeTrackFromFolder(track.id)
                                }}
                                className="p-1.5 hover:bg-red-700 rounded text-gray-400 hover:text-white"
                                title="Remove from Folder"
                              >
                                <FaTrash className="text-xs" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <FaMusic className="mx-auto text-2xl mb-2 opacity-50" />
                        <p className="text-sm">No tracks in this folder</p>
                        <p className="text-xs mt-1">Click "Load Tracks" to fetch tracks</p>
                      </div>
                    )}
                  </div>
                  
                  {folderTracks.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Drag tracks to reorder. Changes are saved when you click "Save Order".
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-6 pt-4 border-t border-gray-700">
                <button
                  onClick={() => handleUpdateFolder(editingFolder)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex-1"
                >
                  Save Folder
                </button>
                <button
                  onClick={() => {
                    setEditingFolder(null)
                    setFolderTracks([])
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Track Modal */}
        {showCreateTrack && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4">Create Track</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-gray-300">ID *</label>
                    <input
                      type="text"
                      value={newTrack.id || ''}
                      onChange={(e) => setNewTrack({ ...newTrack, id: e.target.value })}
                      className="w-full bg-gray-700 rounded p-2 text-white"
                      placeholder="track-id"
                      title="Track ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-gray-300">Title *</label>
                    <input
                      type="text"
                      value={newTrack.title || ''}
                      onChange={(e) => setNewTrack({ ...newTrack, title: e.target.value })}
                      className="w-full bg-gray-700 rounded p-2 text-white"
                      title="Track title"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Artist</label>
                  <input
                    type="text"
                    value={newTrack.artist || ''}
                    onChange={(e) => setNewTrack({ ...newTrack, artist: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2 text-white"
                    title="Track artist"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-gray-300">Duration (seconds)</label>
                    <input
                      type="number"
                      value={newTrack.duration || ''}
                      onChange={(e) => setNewTrack({ ...newTrack, duration: parseInt(e.target.value) || undefined })}
                      className="w-full bg-gray-700 rounded p-2 text-white"
                      title="Track duration (seconds)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-gray-300">BPM</label>
                    <input
                      type="number"
                      value={newTrack.bpm || ''}
                      onChange={(e) => setNewTrack({ ...newTrack, bpm: parseInt(e.target.value) || undefined })}
                      className="w-full bg-gray-700 rounded p-2 text-white"
                      title="Track BPM"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">File URL *</label>
                  <input
                    type="text"
                    value={newTrack.file || ''}
                    onChange={(e) => setNewTrack({ ...newTrack, file: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2 text-white"
                    placeholder="https://..."
                    title="Track file URL"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Artwork URL</label>
                  <input
                    type="text"
                    value={newTrack.artwork || ''}
                    onChange={(e) => setNewTrack({ ...newTrack, artwork: e.target.value || undefined })}
                    className="w-full bg-gray-700 rounded p-2 text-white"
                    placeholder="https://..."
                    title="Track artwork URL"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleCreateTrackSubmit}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex-1"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateTrack(false)
                      setNewTrack({})
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Link Track Modal */}
        {showLinkModal && linkingTrackId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4">Link Audio File to Track</h2>
              <div className="space-y-4">
                <div className="text-sm text-gray-400 mb-4">
                  Select an audio file to link to this track. Only unlinked files are shown.
                </div>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {audioFiles
                    .filter(file => {
                      // Check if this audio file is already linked to any track
                      const isLinked = allTracks.some(t => 
                        (t as any).audioFileId === file.id || (t as any).audio_file_id === file.id
                      )
                      return !isLinked
                    })
                    .map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-4 p-3 bg-gray-700/40 rounded hover:bg-gray-700/60 cursor-pointer"
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/music-library/link-tracks', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                trackIds: [linkingTrackId],
                                audioFileIds: [file.id],
                              }),
                            })
                            const data = await response.json()
                            if (response.ok && data.success) {
                              alert('Track linked successfully!')
                              setShowLinkModal(false)
                              setLinkingTrackId(null)
                              await loadAllData()
                            } else {
                              alert(`Linking failed: ${data.error || 'Unknown error'}`)
                            }
                          } catch (error: any) {
                            alert(`Error: ${error.message}`)
                          }
                        }}
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{file.title || file.filename}</div>
                          <div className="text-xs text-gray-400">{file.artist || 'Unknown Artist'}</div>
                          {file.bpm && (
                            <div className="text-xs text-gray-500 mt-1">{file.bpm} BPM</div>
                          )}
                        </div>
                        <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm">
                          Link
                        </button>
                      </div>
                    ))}
                  {audioFiles.filter(file => !file.linked_to_track).length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      No unlinked audio files available
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowLinkModal(false)
                      setLinkingTrackId(null)
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Track Modal */}
        {editingTrack && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setEditingTrack(null)
                if (previewAudio) {
                  previewAudio.pause()
                  setPreviewAudio(null)
                  setIsPreviewPlaying(false)
                }
              }
            }}
          >
            <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Edit Track</h2>
                <button
                  onClick={() => {
                    setEditingTrack(null)
                    if (previewAudio) {
                      previewAudio.pause()
                      setPreviewAudio(null)
                      setIsPreviewPlaying(false)
                    }
                  }}
                  className="text-gray-400 hover:text-white"
                  title="Close (Esc)"
                >
                  <FaTimes />
                </button>
              </div>

              {/* Audio Preview */}
              {editingTrack.file && (
                <div className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (previewAudio) {
                          if (isPreviewPlaying) {
                            previewAudio.pause()
                            setIsPreviewPlaying(false)
                          } else {
                            previewAudio.play()
                            setIsPreviewPlaying(true)
                          }
                        } else {
                          const audio = new Audio(editingTrack.file)
                          audio.addEventListener('ended', () => {
                            setIsPreviewPlaying(false)
                            setPreviewAudio(null)
                          })
                          audio.addEventListener('pause', () => setIsPreviewPlaying(false))
                          audio.addEventListener('play', () => setIsPreviewPlaying(true))
                          setPreviewAudio(audio)
                          audio.play()
                          setIsPreviewPlaying(true)
                        }
                      }}
                      className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white"
                      title="Preview track"
                    >
                      {isPreviewPlaying ? <FaPause /> : <FaPlay />}
                    </button>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400 mb-1">Audio Preview</div>
                      <div className="text-sm text-gray-300 truncate">{editingTrack.file}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-2 border-b border-gray-700">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Title *</label>
                      <input
                        type="text"
                        value={editingTrack.title || ''}
                        onChange={(e) => setEditingTrack({ ...editingTrack, title: e.target.value })}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        title="Track title"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Artist *</label>
                      <input
                        type="text"
                        value={editingTrack.artist || ''}
                        onChange={(e) => setEditingTrack({ ...editingTrack, artist: e.target.value })}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        title="Track artist"
                      />
                    </div>
                  </div>
                </div>

                {/* Audio Properties */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-2 border-b border-gray-700">Audio Properties</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Duration</label>
                      <input
                        type="text"
                        value={formatDuration(editingTrack.duration || 0)}
                        onChange={(e) => {
                          const seconds = parseDuration(e.target.value)
                          setEditingTrack({ ...editingTrack, duration: seconds })
                        }}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="MM:SS or seconds"
                        title="Track duration (MM:SS format or seconds)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">BPM</label>
                      <input
                        type="number"
                        value={editingTrack.bpm || ''}
                        onChange={(e) => setEditingTrack({ ...editingTrack, bpm: parseInt(e.target.value) || undefined })}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        title="Track BPM"
                        min="0"
                        max="300"
                      />
                    </div>
                  </div>
                </div>

                {/* Musical Properties */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-2 border-b border-gray-700">Musical Properties</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Key Signature</label>
                      <input
                        type="text"
                        value={editingTrack.key_signature || ''}
                        onChange={(e) => setEditingTrack({ ...editingTrack, key_signature: e.target.value || undefined })}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="e.g., C, Dm, F#m"
                        title="Musical key signature"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Scale</label>
                      <input
                        type="text"
                        value={getSonicDNAValue(editingTrack, ['musical', 'scale']) || getSonicDNAValue(editingTrack, ['technical', 'key', 'scale']) || ''}
                        onChange={(e) => {
                          const updated = setSonicDNAValue(editingTrack, ['musical', 'scale'], e.target.value)
                          setEditingTrack(updated)
                        }}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="e.g., Major, Minor, Pentatonic"
                        title="Musical scale"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Time Signature</label>
                      <input
                        type="text"
                        value={getSonicDNAValue(editingTrack, ['musical', 'timeSignature']) || getSonicDNAValue(editingTrack, ['technical', 'timeSignature']) || ''}
                        onChange={(e) => {
                          const updated = setSonicDNAValue(editingTrack, ['musical', 'timeSignature'], e.target.value)
                          setEditingTrack(updated)
                        }}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="e.g., 4/4, 3/4, 6/8"
                        title="Time signature"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Date</label>
                      <input
                        type="text"
                        value={editingTrack.date || editingTrack.created_at || ''}
                        onChange={(e) => setEditingTrack({ ...editingTrack, date: e.target.value || undefined })}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="YYYY-MM-DD"
                        title="Release or creation date"
                      />
                    </div>
                  </div>
                </div>

                {/* Genre Classification */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-2 border-b border-gray-700">Genre Classification</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Genre</label>
                      <input
                        type="text"
                        value={getSonicDNAValue(editingTrack, ['genres', 'primaryGenres', '0'])}
                        onChange={(e) => {
                          const updated = setSonicDNAValue(editingTrack, ['genres', 'primaryGenres', '0'], e.target.value)
                          setEditingTrack(updated)
                        }}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="e.g., House, Techno, Trance"
                        title="Primary genre"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Sub-Genre</label>
                      <input
                        type="text"
                        value={getSonicDNAValue(editingTrack, ['genres', 'subgenres', '0'])}
                        onChange={(e) => {
                          const updated = setSonicDNAValue(editingTrack, ['genres', 'subgenres', '0'], e.target.value)
                          setEditingTrack(updated)
                        }}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="e.g., Progressive House, Deep Techno"
                        title="Sub-genre"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Drum Style</label>
                      <input
                        type="text"
                        value={getSonicDNAValue(editingTrack, ['drums', 'genreStyles', '0']) || getSonicDNAValue(editingTrack, ['drums', 'patternType'])}
                        onChange={(e) => {
                          const updated = setSonicDNAValue(editingTrack, ['drums', 'genreStyles', '0'], e.target.value)
                          setEditingTrack(updated)
                        }}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="e.g., Four-on-the-floor, Breakbeat"
                        title="Drum pattern style"
                      />
                    </div>
                  </div>
                </div>

                {/* Media URLs */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 pb-2 border-b border-gray-700">Media URLs</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">File URL</label>
                      <input
                        type="text"
                        value={editingTrack.file || ''}
                        onChange={(e) => setEditingTrack({ ...editingTrack, file: e.target.value })}
                        className="w-full bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="https://..."
                        title="Track audio file URL"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-300">Artwork URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingTrack.artwork || ''}
                          onChange={(e) => setEditingTrack({ ...editingTrack, artwork: e.target.value || undefined })}
                          className="flex-1 bg-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          placeholder="https://..."
                          title="Track artwork image URL"
                        />
                        {editingTrack.artwork && (
                          <div className="relative w-20 h-20 rounded overflow-hidden border border-gray-600">
                            <Image
                              src={resolveImageUrl(editingTrack.artwork)}
                              alt="Artwork"
                              fill
                              className="object-cover"
                              unoptimized={shouldUnoptimizeImage(editingTrack.artwork)}
                              sizes="80px"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced: Sonic DNA JSON */}
                <div className="border-t border-gray-700 pt-4">
                  <details className="text-xs" open={!!editingTrack.sonic_dna}>
                    <summary className="cursor-pointer text-gray-400 hover:text-white mb-2 text-sm font-semibold">
                      Advanced: Sonic DNA Metadata (JSON)
                    </summary>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs text-gray-400">
                        {editingTrack.sonic_dna ? 'Sonic DNA data available' : 'No Sonic DNA data'}
                      </span>
                      <button
                        type="button"
                        onClick={handleFindSonicDna}
                        disabled={findingSonicDna}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-xs font-medium text-white"
                        title="Load Sonic DNA from DB (linked audio file or path) and apply to this track"
                      >
                        <FaSearch />
                        {findingSonicDna ? 'Finding…' : 'Find Sonic DNA'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTrack(applySonicDnaToMissingFields(editingTrack))}
                        disabled={!editingTrack.sonic_dna}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-xs font-medium text-white"
                        title="Fill only empty fields (BPM, key, genre, scale, etc.) from Sonic DNA"
                      >
                        <FaCopy />
                        Fill missing from Sonic DNA
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTrack(applySonicDnaToMissingOrUnknownFields(editingTrack))}
                        disabled={!editingTrack.sonic_dna}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-xs font-medium text-white"
                        title="Fill missing + replace 'Unknown' values from Sonic DNA"
                      >
                        <FaCopy />
                        Fill missing + Unknown
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTrack(applySonicDnaToMissingOrUnknownFields(editingTrack))}
                        disabled={!editingTrack.sonic_dna}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-xs font-medium text-white"
                        title="Fill missing + unknown fields and save"
                      >
                        <FaSave />
                        Fill & Update
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSonicDnaChat(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded text-xs font-medium text-white"
                        title="Open Sonic DNA chat to steer analysis and edits"
                      >
                        <FaCommentDots />
                        Sonic DNA Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => editingTrack && handleUpdateTrack(editingTrack)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-xs font-medium text-white"
                        title="Update track with latest Sonic DNA edits"
                      >
                        <FaSave />
                        Update Track
                      </button>
                    </div>
                    {editingTrack.sonic_dna && (
                      <pre className="bg-gray-900 p-3 rounded text-xs overflow-x-auto max-h-60 overflow-y-auto border border-gray-700">
                        {JSON.stringify(
                          typeof editingTrack.sonic_dna === 'string' 
                            ? JSON.parse(editingTrack.sonic_dna) 
                            : editingTrack.sonic_dna,
                          null,
                          2
                        )}
                      </pre>
                    )}
                  </details>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => handleUpdateTrack(editingTrack)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex-1 font-medium flex items-center justify-center gap-2"
                    title="Save changes (Ctrl/Cmd + Enter)"
                  >
                    <FaSave />
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setEditingTrack(null)
                      if (previewAudio) {
                        previewAudio.pause()
                        setPreviewAudio(null)
                        setIsPreviewPlaying(false)
                      }
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded flex-1 font-medium"
                    title="Cancel (Esc)"
                  >
                    Cancel
                  </button>
                </div>
                <div className="text-xs text-gray-500 text-center">
                  Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">Esc</kbd> to cancel, <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300">Ctrl/Cmd + Enter</kbd> to save
                </div>

                {showSonicDnaChat && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
                    onClick={() => setShowSonicDnaChat(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Sonic DNA chat"
                  >
                    <div
                      className="w-full max-w-xl overflow-hidden rounded-xl border border-indigo-700/40 bg-gray-900 shadow-2xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FaCommentDots className="text-indigo-300" />
                          <div>
                            <div className="text-sm font-semibold text-white">Sonic DNA Chat</div>
                            <div className="text-xs text-gray-400">Guide analysis edits for this track</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowSonicDnaChat(false)}
                          className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                          aria-label="Close Sonic DNA chat"
                        >
                          Close
                        </button>
                      </div>

                      <div className="max-h-[45vh] overflow-y-auto px-4 py-3 space-y-3">
                        {sonicDnaChatMessages.length === 0 && (
                          <div className="text-xs text-gray-500">
                            Example: “This is dub/reggae with a half-time feel. Fix the genre labels, emphasize sub-bass, and soften the energy description.”
                          </div>
                        )}
                        {sonicDnaChatMessages.map((msg, idx) => (
                          <div
                            key={`${msg.role}-${idx}`}
                            className={`rounded-lg px-3 py-2 text-sm ${
                              msg.role === 'user'
                                ? 'bg-indigo-900/40 text-indigo-100 border border-indigo-700/40'
                                : 'bg-gray-800 text-gray-200 border border-gray-700'
                            }`}
                          >
                            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                              {msg.role === 'user' ? 'You' : 'Sergik AI'}
                            </div>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-gray-800 px-4 py-3">
                        <textarea
                          value={sonicDnaChatInput}
                          onChange={(e) => setSonicDnaChatInput(e.target.value)}
                          placeholder="Add direction to correct or improve the Sonic DNA..."
                          className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          rows={3}
                        />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            This will re-run analysis with your guidance and merge results.
                          </span>
                          <button
                            type="button"
                            onClick={handleSonicDnaDirective}
                            disabled={sonicDnaChatLoading || !sonicDnaChatInput.trim()}
                            className="inline-flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                          >
                            {sonicDnaChatLoading ? (
                              <>
                                <FaSync className="animate-spin" /> Running…
                              </>
                            ) : (
                              <>
                                <FaPaperPlane /> Send & Apply
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Organize Modal */}
        {showOrganizeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full">
              <h2 className="text-xl font-semibold mb-4">Organize & Sort Tracks</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Organization Strategy</label>
                  <select
                    value={organizeStrategy}
                    onChange={(e) => setOrganizeStrategy(e.target.value as any)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                    disabled={organizing}
                    title="Organization strategy"
                  >
                    <option value="auto">Auto (Try folder_path, then title, then artist)</option>
                    <option value="folder_path">By Folder Path</option>
                    <option value="title">By Title/Album</option>
                    <option value="artist">By Artist</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                    disabled={organizing}
                    title="Sort by"
                  >
                    <option value="default">Default Order</option>
                    <option value="title">Title</option>
                    <option value="artist">Artist</option>
                    <option value="duration">Duration</option>
                    <option value="bpm">BPM</option>
                    <option value="genre">Genre</option>
                    <option value="subgenre">Sub-Genre</option>
                    <option value="drumStyle">Drum Style</option>
                    <option value="timeSignature">Time Signature</option>
                    <option value="key">Key</option>
                    <option value="scale">Scale</option>
                    <option value="date">Date</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Sort Order</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as any)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                    disabled={organizing}
                    title="Sort order"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createMissingFolders}
                    onChange={(e) => setCreateMissingFolders(e.target.checked)}
                    className="rounded"
                    disabled={organizing}
                    id="admin-organize-create-missing-folders"
                    aria-label="Create missing folders based on folder_path"
                    title="Create missing folders based on folder_path"
                  />
                  <label htmlFor="admin-organize-create-missing-folders" className="text-sm text-gray-300">Create missing folders based on folder_path</label>
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleOrganizeTracks}
                    disabled={organizing}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FaSitemap className={organizing ? 'animate-spin' : ''} />
                    {organizing ? 'Organizing...' : 'Organize Tracks'}
                  </button>
                  <button
                    onClick={() => setShowOrganizeModal(false)}
                    disabled={organizing}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded flex-1 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenu.visible && (
          <div
            ref={contextMenuRef}
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[180px]"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.folder ? (
              <>
                <button
                  onClick={() => handleContextMenuAction('edit')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaEdit className="text-xs" />
                  Edit Folder
                </button>
                <button
                  onClick={() => handleContextMenuAction('createSubfolder')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaPlus className="text-xs" />
                  Create Subfolder
                </button>
                <button
                  onClick={() => handleContextMenuAction('createTrack')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaMusic className="text-xs" />
                  Add Track
                </button>
                {clipboardTrackIds.length > 0 && (
                  <button
                    onClick={() => handleContextMenuAction('paste')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FaPaste className="text-xs" />
                    Paste ({clipboardTrackIds.length} track{clipboardTrackIds.length === 1 ? '' : 's'})
                  </button>
                )}
                <div className="border-t border-gray-700 my-1" />
                <button
                  onClick={() => handleContextMenuAction('delete')}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                >
                  <FaTrash className="text-xs" />
                  Delete Folder
                </button>
              </>
            ) : contextMenu.track ? (
              <>
                <button
                  onClick={() => handleContextMenuAction('edit')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaEdit className="text-xs" />
                  Edit Track
                </button>
                <button
                  onClick={() => handleContextMenuAction('play')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  {currentTrack?.id === contextMenu.track.id && isPlaying ? (
                    <>
                      <FaPause className="text-xs" />
                      Pause Track
                    </>
                  ) : (
                    <>
                      <FaPlay className="text-xs" />
                      Play Track
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleContextMenuAction('select')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  {selectedTracks.has(contextMenu.track.id) ? (
                    <>
                      <FaSquare className="text-xs" />
                      Deselect Track
                    </>
                  ) : (
                    <>
                      <FaCheckSquare className="text-xs" />
                      Select Track
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleContextMenuAction('addToPlaylist')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaList className="text-xs" />
                  Add to Playlist
                </button>
                <button
                  onClick={() => handleContextMenuAction('addToFolder')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaFolder className="text-xs" />
                  Add to Library Folder
                </button>
                <button
                  onClick={() => handleContextMenuAction('copy')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaClipboard className="text-xs" />
                  Copy Track{selectedTracks.size > 0 ? 's' : ''}
                </button>
                <button
                  onClick={() => handleContextMenuAction('duplicate')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaCopy className="text-xs" />
                  Duplicate Track
                </button>
                <button
                  onClick={() => handleContextMenuAction('link')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                >
                  <FaLink className="text-xs" />
                  Link Audio File
                </button>
                <div className="border-t border-gray-700 my-1" />
                <button
                  onClick={() => handleContextMenuAction('delete')}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                >
                  <FaTrash className="text-xs" />
                  Delete Track
                </button>
              </>
            ) : null}
          </div>
        )}

        {showPlaylistPicker && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            onClick={() => {
              setShowPlaylistPicker(false)
              setPendingPlaylistTrackIds([])
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Add tracks to playlist"
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">Add to Playlist</div>
                  <div className="text-xs text-gray-400">
                    {pendingPlaylistTrackIds.length} track{pendingPlaylistTrackIds.length === 1 ? '' : 's'} selected
                  </div>
                </div>
                <button
                  className="p-2 hover:bg-gray-800 rounded"
                  onClick={() => {
                    setShowPlaylistPicker(false)
                    setPendingPlaylistTrackIds([])
                  }}
                  aria-label="Close playlist picker"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="bg-gray-800 rounded p-3">
                  <div className="text-sm mb-2">Create Playlist</div>
                  <input
                    className="w-full bg-gray-900 rounded p-2 text-sm mb-2"
                    placeholder="Name"
                    value={playlistDraft.name}
                    onChange={(e) => setPlaylistDraft({ ...playlistDraft, name: e.target.value })}
                  />
                  <input
                    className="w-full bg-gray-900 rounded p-2 text-sm"
                    placeholder="Description"
                    value={playlistDraft.description}
                    onChange={(e) => setPlaylistDraft({ ...playlistDraft, description: e.target.value })}
                  />
                  <button
                    className="mt-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm"
                    onClick={async () => {
                      if (!playlistDraft.name.trim()) return
                      const id = `playlist-${Date.now()}`
                      const seedIds = pendingPlaylistTrackIds.map(getCanonicalTrackId)
                      const created = await createPlaylist({
                        id,
                        name: playlistDraft.name,
                        description: playlistDraft.description,
                        trackIds: seedIds,
                      })
                      if (created) setPlaylists([created, ...playlists])
                      setPlaylistDraft({ name: '', description: '' })
                    }}
                  >
                    Create
                  </button>
                </div>

                <div className="space-y-2">
                  {playlists.length === 0 ? (
                    <div className="text-sm text-gray-400">No playlists found.</div>
                  ) : (
                    playlists.map((playlist) => (
                      <div key={playlist.id} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{playlist.name}</div>
                          <div className="text-xs text-gray-400">{playlist.trackIds.length} tracks</div>
                        </div>
                        <button
                          className="px-2 py-1 text-xs bg-blue-600 rounded"
                          onClick={async () => {
                            await addTracksToPlaylist(playlist.id, pendingPlaylistTrackIds)
                            setShowPlaylistPicker(false)
                          }}
                        >
                          Add Selected
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showFolderPicker && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            onClick={() => {
              setShowFolderPicker(false)
              setPendingFolderTrackIds([])
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Add tracks to folder"
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">Copy to Library Folder</div>
                  <div className="text-xs text-gray-400">
                    {pendingFolderTrackIds.length} track{pendingFolderTrackIds.length === 1 ? '' : 's'} selected
                  </div>
                </div>
                <button
                  className="p-2 hover:bg-gray-800 rounded"
                  onClick={() => {
                    setShowFolderPicker(false)
                    setPendingFolderTrackIds([])
                  }}
                  aria-label="Close folder picker"
                >
                  <FaTimes />
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  {folders.length === 0 ? (
                    <div className="text-sm text-gray-400">No folders found.</div>
                  ) : (
                    folders
                      .filter(folder => folder.id !== 'folder-all-tracks') // Exclude "All Tracks" folder
                      .map((folder) => {
                        // Build folder path for display
                        const getFolderPath = (folderId: string): string[] => {
                          const path: string[] = []
                          let currentId: string | null = folderId
                          const visited = new Set<string>()
                          
                          while (currentId && !visited.has(currentId)) {
                            visited.add(currentId)
                            const currentFolder = folders.find(f => f.id === currentId)
                            if (currentFolder) {
                              path.unshift(currentFolder.name)
                              currentId = currentFolder.parentId || null
                            } else {
                              break
                            }
                          }
                          return path
                        }
                        
                        const path = getFolderPath(folder.id)
                        const displayName = path.length > 1 ? path.join(' › ') : folder.name
                        
                        return (
                          <div key={folder.id} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FaFolder className="text-gray-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate" title={displayName}>
                                  {displayName}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {folder.type}
                                </div>
                              </div>
                            </div>
                            <button
                              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors flex-shrink-0 ml-2"
                              onClick={async () => {
                                await copyTracksToFolder(folder.id, pendingFolderTrackIds)
                              }}
                            >
                              Copy Selected
                            </button>
                          </div>
                        )
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
