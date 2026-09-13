'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FaFolder, FaMusic, FaPlus, FaEdit, FaTrash, FaSync, FaSave, FaTimes, FaEye, FaEyeSlash, FaChevronRight, FaChevronDown, FaGripVertical, FaSearch, FaSort, FaSortAlphaDown, FaSortAlphaUp, FaSortNumericDown, FaSortNumericUp, FaColumns, FaCheckSquare, FaSquare, FaUpload, FaSpinner, FaList, FaInfoCircle, FaLink } from 'react-icons/fa'
import {
  fetchMusicLibrary,
  fetchFolders,
  fetchTracks,
  fetchAllTracksSummaryForHydration,
  fetchPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  createFolder,
  updateFolder,
  createTrack,
  updateTrack,
  syncToDatabase,
  invalidateMusicLibraryCache,
  type FolderItem,
  type Track,
  type Playlist,
} from '@/utils/musicLibraryApi'
import { buildFolderHierarchy, type HierarchicalFolder, isDescendant } from '@/utils/buildFolderHierarchy'
import { displayTrackDrumStyle, displayTrackGenre, displayTrackSubgenre } from '@/lib/audio/track-display'
import { emitFolderCatalogPatch } from '@/contexts/CatalogSyncContext'
import { emitCatalogSync, stampLibraryCover, withArtworkCacheBust } from '@/lib/catalog-sync'

const DEBUG_INGEST =
  process.env.NODE_ENV !== 'production' && !!process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGGING
const debugIngest = (payload: Record<string, unknown>) => {
  if (!DEBUG_INGEST) return
  if (typeof window === 'undefined') return
  try {
    fetch('http://127.0.0.1:7243/ingest/a346b04a-1680-490e-a42d-0a05edd129a0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  } catch {
    // Ignore debug ingest errors
  }
}

export default function AdminMusicLibrary() {
  const [libraryData, setLibraryData] = useState<any>(null)
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [hierarchicalFolders, setHierarchicalFolders] = useState<HierarchicalFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<HierarchicalFolder | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [dbHealthy, setDbHealthy] = useState<boolean | null>(null)
  const [editingFolder, setEditingFolder] = useState<HierarchicalFolder | null>(null)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showCreateTrack, setShowCreateTrack] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['folder-discography']))
  const [draggedFolder, setDraggedFolder] = useState<HierarchicalFolder | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [dragOverFileFolder, setDragOverFileFolder] = useState<string | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set())
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [trackSearch, setTrackSearch] = useState('')
  const [filterKey, setFilterKey] = useState('')
  const [filterGenre, setFilterGenre] = useState('')
  const [bpmMin, setBpmMin] = useState('')
  const [bpmMax, setBpmMax] = useState('')
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set())
  const [editingRows, setEditingRows] = useState<Set<string>>(new Set())
  const [rowDrafts, setRowDrafts] = useState<Record<string, Partial<Track>>>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState<'details' | 'playlists' | 'sonic'>('details')
  const [drawerTrack, setDrawerTrack] = useState<Track | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: Track } | null>(null)
  const [bulkEdits, setBulkEdits] = useState<{ artist?: string; bpm?: string; key_signature?: string; energy_level?: string; danceability?: string; genre?: string }>({})
  const [playlistDraft, setPlaylistDraft] = useState({ name: '', description: '' })
  const [sonicDnaText, setSonicDnaText] = useState('')
  const [sonicDnaLoading, setSonicDnaLoading] = useState(false)
  const [pendingAddTrackId, setPendingAddTrackId] = useState<string | null>(null)
  const [pendingAddTrackIds, setPendingAddTrackIds] = useState<string[]>([])
  const [newFolder, setNewFolder] = useState<Partial<FolderItem>>({})
  const [newTrack, setNewTrack] = useState<Partial<Track>>({})
  const [sortBy, setSortBy] = useState<'default' | 'title' | 'artist' | 'duration' | 'bpm' | 'genre' | 'subgenre' | 'drumStyle' | 'timeSignature' | 'key' | 'scale' | 'date'>('default')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({
    genre: false,
    subgenre: false,
    drumStyle: false,
    timeSignature: false,
    key: true,
    scale: false,
    date: false,
    bpm: false,
    duration: true
  })
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadData()
  }, [showArchived])

  // Global drag handlers to prevent browser from opening files
  useEffect(() => {
    // CRITICAL: Prevent browser from opening files by default
    // We MUST prevent default on ALL file drag events, everywhere
    
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const handleDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Attach to document body to catch ALL events before they bubble
    const body = document.body
    body.addEventListener('dragenter', handleDragEnter, false)
    body.addEventListener('dragover', handleDragOver, false)
    body.addEventListener('drop', handleDrop, false)

    return () => {
      body.removeEventListener('dragenter', handleDragEnter, false)
      body.removeEventListener('dragover', handleDragOver, false)
      body.removeEventListener('drop', handleDrop, false)
    }
  }, [])

  useEffect(() => {
    // Gate destructive actions when DB is unhealthy (prevents “resync during outage” corruption)
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
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        if (editingRows.size > 0) {
          event.preventDefault()
          const firstId = Array.from(editingRows)[0]
          saveRowEdit(firstId)
        }
      }
      if (event.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null)
          return
        }
        if (drawerOpen) {
          closeDrawer()
          return
        }
        if (editingRows.size > 0) {
          const firstId = Array.from(editingRows)[0]
          cancelRowEdit(firstId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editingRows, contextMenu, drawerOpen, rowDrafts])

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

  // Helper functions to extract metadata from sonic_dna
  const getTrackGenre = (track: Track): string => displayTrackGenre(track)

  const getTrackSubgenre = (track: Track): string => displayTrackSubgenre(track)

  const getTrackDrumStyle = (track: Track): string => displayTrackDrumStyle(track)

  const getTrackTimeSignature = (track: Track): string => {
    if (!track.sonic_dna) return ''
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.musical?.timeSignature || dna?.technical?.timeSignature || ''
    } catch {
      return ''
    }
  }

  const getTrackKey = (track: Track): string => {
    if (track.key_signature && track.key_signature !== 'Unknown') return track.key_signature
    const camelCaseKey = (track as any)?.keySignature
    if (camelCaseKey && camelCaseKey !== 'Unknown') return camelCaseKey
    const metaKey =
      (track as any)?.metadata?.key_signature ||
      (track as any)?.metadata?.keySignature ||
      (track as any)?.metadata?.key ||
      (track as any)?.metadata?.camelot
    if (metaKey && metaKey !== 'Unknown') return metaKey
    const sonicDnaSource = track.sonic_dna || (track as any)?.metadata?.sonic_dna
    if (!sonicDnaSource) {
      return ''
    }
    try {
      const dna = typeof sonicDnaSource === 'string' ? JSON.parse(sonicDnaSource) : sonicDnaSource
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
    if (!track.sonic_dna) return ''
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.musical?.scale || dna?.technical?.key?.scale || dna?.technical?.key?.mode || ''
    } catch {
      return ''
    }
  }

  const getTrackDate = (track: Track): string => {
    if (track.created_at) return track.created_at
    if (track.date) return track.date
    if (track.year) return track.year.toString()
    return ''
  }

  const filteredTracks = useMemo(() => {
    let result = [...tracks]
    const query = trackSearch.trim().toLowerCase()
    if (query) {
      result = result.filter((track) =>
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query)
      )
    }

    if (filterKey.trim()) {
      const keyLower = filterKey.trim().toLowerCase()
      result = result.filter((track) => getTrackKey(track).toLowerCase().includes(keyLower))
    }

    if (filterGenre.trim()) {
      const genreLower = filterGenre.trim().toLowerCase()
      result = result.filter((track) => getTrackGenre(track).toLowerCase().includes(genreLower))
    }

    const minBpm = bpmMin ? parseFloat(bpmMin) : null
    const maxBpm = bpmMax ? parseFloat(bpmMax) : null
    if (minBpm !== null || maxBpm !== null) {
      result = result.filter((track) => {
        const bpm = track.bpm || 0
        if (minBpm !== null && bpm < minBpm) return false
        if (maxBpm !== null && bpm > maxBpm) return false
        return true
      })
    }

    return result
  }, [tracks, trackSearch, filterKey, filterGenre, bpmMin, bpmMax])

  // Sorted tracks based on sortBy and sortOrder
  const sortedTracks = useMemo(() => {
    if (!filteredTracks.length) return []
    
    const tracksCopy = [...filteredTracks]
    
    if (sortBy === 'default') {
      return tracksCopy
    }
    
    return tracksCopy.sort((a, b) => {
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
  }, [filteredTracks, sortBy, sortOrder])

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
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const toggleTrackSelection = (trackId: string) => {
    setSelectedTracks((prev) => {
      const next = new Set(prev)
      if (next.has(trackId)) next.delete(trackId)
      else next.add(trackId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedTracks.size === sortedTracks.length) {
      setSelectedTracks(new Set())
    } else {
      setSelectedTracks(new Set(sortedTracks.map((t) => t.id)))
    }
  }

  const startRowEdit = (track: Track) => {
    setEditingRows((prev) => new Set(prev).add(track.id))
    setRowDrafts((prev) => ({
      ...prev,
      [track.id]: {
        title: track.title,
        artist: track.artist,
        bpm: track.bpm,
        key_signature: track.key_signature,
        duration: track.duration,
      },
    }))
  }

  const updateRowDraft = (trackId: string, field: keyof Track, value: any) => {
    setRowDrafts((prev) => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        [field]: value,
      },
    }))
  }

  const saveRowEdit = async (trackId: string) => {
    const draft = rowDrafts[trackId]
    if (!draft) return
    try {
      await updateTrack(trackId, draft)
      setEditingRows((prev) => {
        const next = new Set(prev)
        next.delete(trackId)
        return next
      })
      setRowDrafts((prev) => {
        const next = { ...prev }
        delete next[trackId]
        return next
      })
      if (selectedFolder) {
        await handleFolderSelect(selectedFolder)
      }
    } catch (error: any) {
      alert(`Failed to save: ${error.message}`)
    }
  }

  const cancelRowEdit = (trackId: string) => {
    setEditingRows((prev) => {
      const next = new Set(prev)
      next.delete(trackId)
      return next
    })
    setRowDrafts((prev) => {
      const next = { ...prev }
      delete next[trackId]
      return next
    })
  }

  const applyBulkEdit = async () => {
    if (!selectedTracks.size) return
    const updates: Partial<Track> = {}
    if (bulkEdits.artist) updates.artist = bulkEdits.artist
    if (bulkEdits.bpm) updates.bpm = parseFloat(bulkEdits.bpm)
    if (bulkEdits.key_signature) updates.key_signature = bulkEdits.key_signature
    if (bulkEdits.energy_level) (updates as any).energy_level = parseFloat(bulkEdits.energy_level)
    if (bulkEdits.danceability) (updates as any).danceability = parseFloat(bulkEdits.danceability)

    try {
      await Promise.all(
        Array.from(selectedTracks).map(async (id) => {
          const track = tracks.find((t) => t.id === id)
          const metadata = bulkEdits.genre && track?.metadata
            ? { ...track.metadata, genre: bulkEdits.genre }
            : bulkEdits.genre
              ? { genre: bulkEdits.genre }
              : undefined
          if (metadata) {
            await updateTrack(id, { ...updates, metadata })
          } else {
            await updateTrack(id, updates)
          }
        })
      )
      setBulkEdits({})
      setSelectedTracks(new Set())
      if (selectedFolder) {
        await handleFolderSelect(selectedFolder)
      }
    } catch (error: any) {
      alert(`Bulk edit failed: ${error.message}`)
    }
  }

  const openDrawerForTrack = (track: Track, tab: 'details' | 'playlists' | 'sonic' = 'details') => {
    setDrawerTrack(track)
    setDrawerTab(tab)
    setDrawerOpen(true)
    setPendingAddTrackId(getCanonicalTrackId(track.id))
    setPendingAddTrackIds([track.id])
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setDrawerTrack(null)
    setPendingAddTrackId(null)
    setPendingAddTrackIds([])
  }

  const loadSonicDna = async (audioFileId?: string) => {
    if (!audioFileId) return
    setSonicDnaLoading(true)
    try {
      const res = await fetch(`/api/admin/sonic-dna/${audioFileId}`)
      const data = await res.json()
      if (res.ok && data?.track?.sonic_dna) {
        setSonicDnaText(JSON.stringify(data.track.sonic_dna, null, 2))
      } else {
        setSonicDnaText('')
      }
    } catch (error) {
      setSonicDnaText('')
    } finally {
      setSonicDnaLoading(false)
    }
  }

  const saveSonicDna = async () => {
    if (!drawerTrack?.audioFileId) return
    try {
      const parsed = JSON.parse(sonicDnaText)
      const res = await fetch(`/api/admin/sonic-dna/${drawerTrack.audioFileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sonic_dna: parsed }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save Sonic DNA')
      }
      alert('Sonic DNA saved')
      if (selectedFolder) {
        await handleFolderSelect(selectedFolder)
      }
    } catch (error: any) {
      alert(`Failed to save Sonic DNA: ${error.message}`)
    }
  }

  const uploadArtwork = async (file: File, track: Track) => {
    const formData = new FormData()
    formData.append('file', file)
    if (track.audioFileId) formData.append('audioFileId', track.audioFileId)
    formData.append('trackId', track.id)

    const res = await fetch('/api/audio/artwork', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Artwork upload failed')
    }

    const artworkUrl = data.artworkUrl as string
    const folderId = (data.folderId as string | undefined) || track.folderId
    const busted = artworkUrl ? withArtworkCacheBust(artworkUrl) : ''
    if (folderId && busted) {
      emitFolderCatalogPatch(folderId, { artwork: busted }, data.publishVersion)
      invalidateMusicLibraryCache()
      setTracks((prev) =>
        prev.map((row) =>
          row.folderId === folderId || row.id === track.id ? { ...row, artwork: busted } : row,
        ),
      )
      setFolders((prev) => stampLibraryCover(prev, folderId, busted))
    } else if (busted) {
      emitCatalogSync({
        entity: 'track',
        entityId: track.id,
        patch: { artwork: busted },
        publishVersion: data.publishVersion,
      })
      setTracks((prev) =>
        prev.map((row) => (row.id === track.id ? { ...row, artwork: busted } : row)),
      )
    }

    return artworkUrl
  }

  const replaceAudioFile = async (file: File, track: Track) => {
    if (!track.audioFileId) {
      throw new Error('Track is not linked to an audio file')
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('audioFileId', track.audioFileId)
    formData.append('trackId', track.id)

    const res = await fetch('/api/audio/replace', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Replace failed')
    }

    return data.fileUrl as string
  }

  const getCanonicalTrackId = (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId)
    const original = (track?.metadata as any)?.originalTrackId
    return original || trackId
  }

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const canonicalId = getCanonicalTrackId(trackId)
    const playlist = playlists.find((p) => p.id === playlistId)
    if (!playlist) return
    if (playlist.trackIds.includes(canonicalId)) return
    const updated = [...playlist.trackIds, canonicalId]
    await updatePlaylist(playlistId, { trackIds: updated })
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, trackIds: updated } : p)))
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


  const loadData = async () => {
    debugIngest({
      location: 'admin/music-library/page.tsx:279',
      message: 'loadData entry',
      data: {},
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId: 'D',
    })
    setLoading(true)
    try {
      const data = await fetchMusicLibrary()
      debugIngest({
        location: 'admin/music-library/page.tsx:283',
        message: 'fetchMusicLibrary result',
        data: { hasFolders: !!data.folders, foldersCount: data.folders?.length || 0 },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'D',
      })
      setLibraryData(data)
      const folderList = await fetchFolders(true, showArchived) // Include hidden + optional archived
      debugIngest({
        location: 'admin/music-library/page.tsx:285',
        message: 'fetchFolders result',
        data: { foldersCount: folderList.length },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'E',
      })
      setFolders(folderList)
      
      // Fetch all tracks to build complete hierarchy
      const allTracks = await fetchAllTracksSummaryForHydration({ includeArchived: showArchived })
      debugIngest({
        location: 'admin/music-library/page.tsx:289',
        message: 'fetchTracks result',
        data: { tracksCount: allTracks.length },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'B',
      })
      const playlistsResult = await fetchPlaylists({ includeArchived: showArchived })
      setPlaylists(playlistsResult)

      const hierarchy = buildFolderHierarchy(folderList, allTracks)
      debugIngest({
        location: 'admin/music-library/page.tsx:290',
        message: 'buildFolderHierarchy result',
        data: { hierarchyCount: hierarchy.length },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'E',
      })
      setHierarchicalFolders(hierarchy)
    } catch (error: any) {
      debugIngest({
        location: 'admin/music-library/page.tsx:292',
        message: 'loadData error',
        data: { errorMessage: error?.message },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'D',
      })
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncSonicDNA = async () => {
    if (dbHealthy === false) {
      alert('Database is currently unhealthy. Sync Sonic DNA is disabled to prevent partial updates. Please try again later.')
      return
    }
    setSyncing(true)
    try {
      const response = await fetch('/api/music-library/sync-sonic-dna', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync Sonic DNA')
      }

      alert(`Sonic DNA sync complete!\n\nUpdated: ${data.stats.updated} tracks\nSkipped: ${data.stats.skipped} tracks\nErrors: ${data.stats.errors}`)
      
      // Reload data to see updates
      await loadData()
    } catch (error: any) {
      console.error('Error syncing Sonic DNA:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleLinkTracks = async () => {
    if (dbHealthy === false) {
      alert('Database is currently unhealthy. Restore Audio Links is disabled to prevent partial updates. Please try again later.')
      return
    }
    if (!confirm('This will attempt to restore audio file links for all tracks.\n\nThis may take a few minutes. Continue?')) {
      return
    }
    setSyncing(true)
    try {
      const response = await fetch('/api/music-library/link-tracks', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to link tracks')
      }

      alert(`Link restoration complete!\n\nProcessed: ${data.stats.tracksProcessed} tracks\nLinked: ${data.stats.tracksLinked} tracks\nAlready linked: ${data.stats.tracksAlreadyLinked} tracks\nNot found: ${data.stats.tracksNotFound} tracks\nErrors: ${data.stats.errors?.length || 0}`)
      
      // Reload data to see updates
      await loadData()
    } catch (error: any) {
      console.error('Error linking tracks:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleSync = async () => {
    if (dbHealthy === false) {
      alert('Database is currently unhealthy. Sync is disabled to prevent data corruption. Please try again once /api/admin/health shows healthy.')
      return
    }
    if (!confirm('⚠️ WARNING: This will overwrite the database with data from music-library.json!\n\nThis action cannot be easily undone. Continue?')) {
      return
    }
    setSyncing(true)
    try {
      const result = await syncToDatabase()
      alert(`Sync complete!\nFolders: ${result.stats.foldersCreated}\nTracks: ${result.stats.tracksCreated}`)
      await loadData()
    } catch (error: any) {
      alert(`Sync failed: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleExportDatabase = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/music-library/sync')
      if (!response.ok) {
        throw new Error('Failed to export database')
      }
      const data = await response.json()
      
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `music-library-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      alert('✅ Database exported successfully!\n\nFile downloaded as backup.')
    } catch (error: any) {
      alert(`Export failed: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const handleFolderSelect = async (folder: HierarchicalFolder) => {
    setSelectedFolder(folder)
    setSelectedTracks(new Set())
    try {
      const folderTracks = await fetchTracks(folder.id, { includeArchived: showArchived })
      setTracks(folderTracks)
    } catch (error) {
      console.error('Error loading tracks:', error)
    }
  }

  const handleDragStart = (e: React.DragEvent, folder: HierarchicalFolder) => {
    setDraggedFolder(folder)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-folder-id', folder.id)
  }

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolder(folderId)
  }

  const handleDragLeave = () => {
    setDragOverFolder(null)
  }

  const handleDrop = async (e: React.DragEvent, targetFolder: HierarchicalFolder) => {
    e.preventDefault()
    setDragOverFolder(null)

    if (!draggedFolder || draggedFolder.id === targetFolder.id) {
      setDraggedFolder(null)
      return
    }

    // Prevent moving folder into itself or its children
    if (isDescendant(targetFolder, draggedFolder.id)) {
      alert('Cannot move a folder into its own descendant')
      setDraggedFolder(null)
      return
    }

    try {
      // Use move API endpoint for better validation
      const response = await fetch('/api/music-library/folders/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: draggedFolder.id,
          newParentId: targetFolder.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to move folder')
      }

      await loadData()
      setDraggedFolder(null)
    } catch (error: any) {
      alert(`Failed to move folder: ${error.message}`)
      setDraggedFolder(null)
    }
  }

  const handleMoveToRoot = async (folder: HierarchicalFolder) => {
    try {
      const response = await fetch('/api/music-library/folders/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: folder.id,
          newParentId: null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to move folder')
      }

      await loadData()
    } catch (error: any) {
      alert(`Failed to move folder: ${error.message}`)
    }
  }

  const handleCreateFolderSubmit = async () => {
    try {
      await createFolder(newFolder)
      setShowCreateFolder(false)
      setNewFolder({})
      await loadData()
    } catch (error: any) {
      alert(`Failed to create folder: ${error.message}`)
    }
  }

  const handleUpdateFolder = async (folder: HierarchicalFolder) => {
    try {
      await updateFolder(folder.id, folder)
      setEditingFolder(null)
      await loadData()
    } catch (error: any) {
      alert(`Failed to update folder: ${error.message}`)
    }
  }

  const handleArchiveFolder = async (folder: HierarchicalFolder) => {
    if (!confirm(`Archive "${folder.name}"? This keeps all data safe but hides it by default.`)) {
      return
    }
    try {
      await updateFolder(folder.id, {
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      await loadData()
      if (!showArchived && selectedFolder?.id === folder.id) {
        setSelectedFolder(null)
        setTracks([])
      }
    } catch (error: any) {
      alert(`Failed to archive folder: ${error.message}`)
    }
  }

  const handleRestoreFolder = async (folder: HierarchicalFolder) => {
    try {
      await updateFolder(folder.id, {
        is_archived: false,
        archived_at: undefined,
      })
      await loadData()
    } catch (error: any) {
      alert(`Failed to restore folder: ${error.message}`)
    }
  }

  const handleCreateTrackSubmit = async () => {
    if (!selectedFolder) {
      alert('Please select a folder first')
      return
    }
    if (selectedFolder.is_archived) {
      alert('This folder is archived. Restore it before adding tracks.')
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

  const handleArchiveTrack = async (track: Track) => {
    if (!confirm(`Archive "${track.title}"? This keeps all data safe but hides it by default.`)) {
      return
    }
    try {
      await updateTrack(track.id, {
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      await handleFolderSelect(selectedFolder!)
    } catch (error: any) {
      alert(`Failed to archive track: ${error.message}`)
    }
  }

  const handleRestoreTrack = async (track: Track) => {
    try {
      await updateTrack(track.id, {
        is_archived: false,
        archived_at: undefined,
      })
      await handleFolderSelect(selectedFolder!)
    } catch (error: any) {
      alert(`Failed to restore track: ${error.message}`)
    }
  }

  // File drag and drop handlers
  const handleFileDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Debug logging
    console.log('handleFileDragOver:', {
      types: Array.from(e.dataTransfer.types),
      hasFiles: e.dataTransfer.types.includes('Files'),
      folderId
    })
    
    // Check if files are being dragged (not folders)
    const hasFiles = e.dataTransfer.types.includes('Files')
    const hasFolderData = e.dataTransfer.types.includes('application/x-folder-id')
    
    if (hasFiles && !hasFolderData) {
      e.dataTransfer.dropEffect = 'copy'
      setDragOverFileFolder(folderId)
    } else {
      // Clear file drag over if not files
      if (dragOverFileFolder === folderId) {
        setDragOverFileFolder(null)
      }
    }
  }

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Use a timeout to handle drag leave properly (prevents flickering)
    setTimeout(() => {
      // Check if we're still dragging over any folder element
      const relatedTarget = e.relatedTarget as HTMLElement
      if (!relatedTarget || !relatedTarget.closest('[data-folder-id]')) {
        setDragOverFileFolder(null)
      }
    }, 50)
  }

  const handleFileDrop = async (e: React.DragEvent, folder: HierarchicalFolder) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFileFolder(null)

    console.log('handleFileDrop called:', {
      types: Array.from(e.dataTransfer.types),
      files: e.dataTransfer.files.length,
      draggedFolder: draggedFolder?.id,
      folder: folder.name
    })

    // Check if this is a folder drag, not a file drop
    const folderId = e.dataTransfer.getData('application/x-folder-id')
    if (folderId || draggedFolder) {
      console.log('Skipping - this is a folder drag')
      return
    }

    // Get files from dataTransfer
    const files = Array.from(e.dataTransfer.files)
    console.log('Files from drop:', files.map(f => ({ name: f.name, type: f.type, size: f.size })))

    const validFiles = files.filter(file => {
      const validTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/aac']
      const isValidType = validTypes.includes(file.type)
      const isValidExtension = file.name.match(/\.(mp3|wav|flac|m4a|ogg|aac)$/i)
      return isValidType || isValidExtension
    })

    console.log('Valid files:', validFiles.length, 'out of', files.length)

    if (validFiles.length === 0) {
      alert(`No valid audio files found. Supported formats: MP3, WAV, FLAC, M4A, OGG, AAC\n\nReceived ${files.length} file(s) but none matched audio file types.`)
      return
    }

    console.log(`Dropping ${validFiles.length} file(s) onto folder: ${folder.name}`)

    if (dbHealthy === false) {
      alert('Database is currently unhealthy. File uploads are disabled. Please try again later.')
      return
    }
    if (folder.is_archived) {
      alert('This folder is archived. Restore it before uploading files.')
      return
    }

    // Upload files one by one
    const uploadPromises = validFiles.map(file => uploadFileToFolder(file, folder))
    const results = await Promise.allSettled(uploadPromises)
    
    console.log('Upload results:', results.map((r, i) => ({
      file: validFiles[i].name,
      status: r.status,
      error: r.status === 'rejected' ? r.reason : null
    })))
    
    // Count successes and failures
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    
    // Refresh data after all uploads complete
    await loadData()
    
    // Re-select the folder to refresh tracks
    if (selectedFolder?.id === folder.id) {
      await handleFolderSelect(folder)
    }
    
    // Show success message
    if (successful > 0) {
      const message = failed > 0 
        ? `Successfully uploaded ${successful} file(s). ${failed} file(s) failed.`
        : `Successfully uploaded ${successful} file(s)!`
      alert(message)
    }
  }

  const uploadFileToFolder = async (file: File, folder: HierarchicalFolder) => {
    const fileId = `${folder.id}-${file.name}-${Date.now()}`
    setUploadingFiles(prev => new Set(prev).add(fileId))
    setUploadProgress(prev => ({ ...prev, [fileId]: 0 }))

    try {
      // Step 1: Upload file to storage
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder.id)

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 50 // First 50% is upload
          setUploadProgress(prev => ({ ...prev, [fileId]: percentComplete }))
        }
      })

      const uploadResult = await new Promise<{ success: boolean; fileUrl?: string; id?: string; error?: string }>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const data = JSON.parse(xhr.responseText)
              resolve({ success: true, fileUrl: data.fileUrl || data.url, id: data.id })
            } catch {
              resolve({ success: false, error: 'Invalid response from server' })
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText)
              resolve({ success: false, error: error.error || 'Upload failed' })
            } catch {
              resolve({ success: false, error: `Upload failed: ${xhr.statusText}` })
            }
          }
        })

        xhr.addEventListener('error', () => {
          resolve({ success: false, error: 'Network error during upload' })
        })

        xhr.open('POST', '/api/audio/upload')
        xhr.send(formData)
      })

      if (!uploadResult.success || !uploadResult.fileUrl) {
        throw new Error(uploadResult.error || 'Upload failed')
      }

      setUploadProgress(prev => ({ ...prev, [fileId]: 60 }))

      // Step 2: Extract filename without extension for track title
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
      
      // Step 3: Create track entry
      const trackId = `track-${folder.id}-${fileNameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
      
      const trackData: Partial<Track> & { folderId: string } = {
        id: trackId,
        folderId: folder.id,
        title: fileNameWithoutExt,
        artist: 'Unknown Artist', // Can be updated later
        file: uploadResult.fileUrl,
        duration: 0, // Will be updated if metadata extraction worked
      }

      // If upload returned audio file ID, use it
      if (uploadResult.id) {
        trackData.audioFileId = uploadResult.id
      }

      setUploadProgress(prev => ({ ...prev, [fileId]: 80 }))

      await createTrack(trackData)
      
      setUploadProgress(prev => ({ ...prev, [fileId]: 100 }))

      // Clean up after a short delay
      setTimeout(() => {
        setUploadingFiles(prev => {
          const next = new Set(prev)
          next.delete(fileId)
          return next
        })
        setUploadProgress(prev => {
          const { [fileId]: _, ...rest } = prev
          return rest
        })
      }, 1000)

    } catch (error: any) {
      console.error('Error uploading file:', error)
      alert(`Failed to upload ${file.name}: ${error.message}`)
      setUploadingFiles(prev => {
        const next = new Set(prev)
        next.delete(fileId)
        return next
      })
      setUploadProgress(prev => {
        const { [fileId]: _, ...rest } = prev
        return rest
      })
    }
  }

  const renderFolderTree = (folderList: HierarchicalFolder[], level = 0): JSX.Element[] => {
    const filtered = searchQuery
      ? folderList.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : folderList

    return filtered.map((folder) => {
      const isExpanded = expandedFolders.has(folder.id)
      const hasChildren = folder.children && folder.children.length > 0
      const isDragged = draggedFolder?.id === folder.id
      const isDragOver = dragOverFolder === folder.id
      const isSelected = selectedFolder?.id === folder.id

      const isDragOverFile = dragOverFileFolder === folder.id
      const isUploading = Array.from(uploadingFiles).some(id => id.startsWith(folder.id))

      return (
        <div key={folder.id}>
          <div
            data-folder-id={folder.id}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const types = Array.from(e.dataTransfer.types)
              const hasFiles = types.includes('Files')
              const hasFolderData = types.includes('application/x-folder-id')
              
              console.log('Folder dragEnter:', {
                types,
                hasFiles,
                hasFolderData,
                folder: folder.name
              })
              
              if (hasFiles && !hasFolderData) {
                e.dataTransfer.dropEffect = 'copy'
                setDragOverFileFolder(folder.id)
              }
            }}
            onDragOver={(e) => {
              e.preventDefault() // Always prevent default to allow drops
              e.stopPropagation()
              
              // Check if files are being dragged (not folders)
              const types = Array.from(e.dataTransfer.types)
              const hasFiles = types.includes('Files')
              const hasFolderData = types.includes('application/x-folder-id')
              
              console.log('Folder dragOver:', {
                types,
                hasFiles,
                hasFolderData,
                draggedFolder: draggedFolder?.id,
                folder: folder.name
              })
              
              if (hasFiles && !hasFolderData) {
                // File drag - show file drop indicator
                e.dataTransfer.dropEffect = 'copy'
                handleFileDragOver(e, folder.id)
              } else if (hasFolderData || draggedFolder) {
                // Folder drag - show folder move indicator
                e.dataTransfer.dropEffect = 'move'
                handleDragOver(e, folder.id)
              } else {
                // Unknown drag type - still prevent default
                e.dataTransfer.dropEffect = 'none'
              }
            }}
            onDragLeave={(e) => {
              handleDragLeave()
              handleFileDragLeave(e)
            }}
            onDrop={(e) => {
              // CRITICAL: Always prevent default FIRST to stop browser from opening files
              e.preventDefault()
              e.stopPropagation()
              
              // Check if dropping files or folders
              const types = Array.from(e.dataTransfer.types)
              const hasFiles = types.includes('Files')
              const hasFolderData = types.includes('application/x-folder-id')
              
              if (hasFiles && !hasFolderData && !draggedFolder) {
                handleFileDrop(e, folder)
              } else if (hasFolderData || draggedFolder) {
                handleDrop(e, folder)
              }
            }}
            className={`
              flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group border-b border-gray-700 relative
              ${isSelected ? 'bg-blue-600' : 'hover:bg-gray-700'}
              ${isDragged ? 'opacity-50' : ''}
              ${folder.is_archived ? 'opacity-60' : ''}
              ${isDragOver ? 'bg-blue-500 border-2 border-blue-300' : ''}
              ${isDragOverFile ? 'bg-green-600 border-2 border-green-400 ring-2 ring-green-300' : ''}
            `}
            style={{ paddingLeft: `${level * 20 + 12}px` }}
            onClick={() => handleFolderSelect(folder)}
          >
            <span
              className="folder-grip text-gray-500 opacity-0 group-hover:opacity-100 cursor-move flex items-center"
              draggable
              onDragStart={(e) => handleDragStart(e, folder)}
              onClick={(e) => e.stopPropagation()}
            >
              <FaGripVertical />
            </span>
            
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolder(folder.id)
                }}
                className="text-gray-400 hover:text-gray-200"
              >
                {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
              </button>
            ) : (
              <span className="w-4" />
            )}

            <FaFolder className={folder.hidden ? 'text-yellow-500' : 'text-blue-400'} />
            
            <span className="flex-1 truncate">{folder.name}</span>
            
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {folder.is_archived && <span className="text-amber-300">Archived</span>}
              {folder.hidden && <FaEyeSlash title="Hidden" />}
              {folder.childCount! > 0 && <span>{folder.childCount} folders</span>}
              {folder.trackCount! > 0 && <span>{folder.trackCount} tracks</span>}
              {isUploading && (
                <FaSpinner className="animate-spin text-green-400" title="Uploading files..." />
              )}
            </div>

            {isDragOverFile && (
              <div className="absolute inset-0 bg-green-600/20 flex items-center justify-center pointer-events-none z-10">
                <div className="bg-green-600 rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
                  <FaUpload className="text-white" />
                  <span className="text-white font-semibold">Drop files here</span>
                </div>
              </div>
            )}

            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingFolder(folder)
                }}
                className="p-1 hover:bg-gray-600 rounded"
                title="Edit"
              >
                <FaEdit className="text-sm" />
              </button>
              {folder.parentId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMoveToRoot(folder)
                  }}
                  className="p-1 hover:bg-gray-600 rounded"
                  title="Move to root"
                >
                  <FaFolder className="text-sm" />
                </button>
              )}
              {folder.is_archived ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRestoreFolder(folder)
                  }}
                  className="p-1 hover:bg-emerald-600 rounded"
                  title="Restore"
                >
                  <FaSync className="text-sm" />
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleArchiveFolder(folder)
                  }}
                  className="p-1 hover:bg-amber-600 rounded"
                  title="Archive"
                >
                  <FaTrash className="text-sm" />
                </button>
              )}
            </div>
          </div>

          {isExpanded && hasChildren && (
            <div>{renderFolderTree(folder.children!, level + 1)}</div>
          )}
        </div>
      )
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen bg-gray-900 text-white"
      onClick={() => setContextMenu(null)}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div className="max-w-[1800px] mx-auto p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Music Library Manager</h1>
            <p className="text-gray-400">iTunes-style hierarchical folder management</p>
            {/* Test Drop Zone */}
            <div
              className={`mt-4 p-6 border-4 border-dashed rounded-lg transition-all ${
                dragOverFileFolder === 'test' 
                  ? 'border-green-400 bg-green-900/30 scale-105 shadow-lg shadow-green-500/50' 
                  : 'border-yellow-500 bg-yellow-900/20 hover:border-yellow-400'
              }`}
              style={{ minHeight: '100px' }}
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const types = Array.from(e.dataTransfer.types)
                console.log('🔥 TEST ZONE dragEnter:', types)
                if (types.includes('Files')) {
                  setDragOverFileFolder('test')
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const types = Array.from(e.dataTransfer.types)
                if (types.includes('Files')) {
                  e.dataTransfer.dropEffect = 'copy'
                  setDragOverFileFolder('test')
                }
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                // Only clear if actually leaving the zone
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const x = e.clientX
                const y = e.clientY
                if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                  if (dragOverFileFolder === 'test') {
                    setDragOverFileFolder(null)
                  }
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const files = Array.from(e.dataTransfer.files)
                console.log('🔥🔥🔥 TEST ZONE DROP SUCCESS:', {
                  types: Array.from(e.dataTransfer.types),
                  fileCount: files.length,
                  fileNames: files.map(f => f.name),
                  fileTypes: files.map(f => f.type)
                })
                setDragOverFileFolder(null)
                alert(`✅ SUCCESS! Test drop zone received ${files.length} file(s).\n\nFiles:\n${files.map(f => `- ${f.name} (${f.type || 'unknown type'})`).join('\n')}\n\nDrag and drop IS working! Now try dropping files on folders.`)
              }}
            >
              <div className="text-center">
                <FaUpload className="inline-block text-3xl mb-2 text-yellow-400" />
                <p className="text-lg font-bold text-yellow-300 mb-1">
                  🧪 TEST DRAG & DROP ZONE
                </p>
                <p className="text-sm text-gray-300">
                  Drag audio files here to test if drag-and-drop is working
                </p>
                {dragOverFileFolder === 'test' && (
                  <p className="text-green-400 font-bold mt-2 animate-pulse">
                    ✓ Drop files here!
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowArchived((prev) => !prev)}
              className={`px-4 py-2 rounded-lg border ${
                showArchived
                  ? 'bg-amber-600 border-amber-500 hover:bg-amber-700'
                  : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
              }`}
              title={showArchived ? 'Hide archived items' : 'Show archived items'}
            >
              {showArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <FaSync className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync JSON to DB'}
            </button>
            <button
              onClick={handleSyncSonicDNA}
              disabled={syncing}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <FaSync className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Sonic DNA'}
            </button>
            <button
              onClick={handleLinkTracks}
              disabled={syncing}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <FaSync className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Linking...' : 'Restore Audio Links'}
            </button>
            <button
              onClick={handleExportDatabase}
              disabled={syncing}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              <FaSave />
              Export DB to JSON
            </button>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left Sidebar - Folder Tree */}
          <div className="col-span-4 bg-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold">Library</h2>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <FaUpload className="text-xs" />
                    Drag audio files onto folders to upload
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="p-2 bg-green-600 hover:bg-green-700 rounded"
                  title="Create Folder"
                >
                  <FaPlus />
                </button>
              </div>
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-700 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(100vh-250px)]">
              {hierarchicalFolders.length > 0 ? (
                <div>
                  {renderFolderTree(hierarchicalFolders)}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400">No folders found</div>
              )}
            </div>
          </div>

          {/* Main Content - Folder Details & Tracks */}
          <div className="col-span-8 space-y-6">
            {/* Selected Folder Info */}
            {selectedFolder ? (
              <>
                <div className="bg-gray-800 rounded-lg p-6">
                  {editingFolder ? (
                    <div className="space-y-4">
                      <h2 className="text-2xl font-semibold mb-4">Edit Folder</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm mb-1">Name</label>
                          <input
                            type="text"
                            value={editingFolder.name}
                            onChange={(e) =>
                              setEditingFolder({ ...editingFolder, name: e.target.value })
                            }
                            className="w-full bg-gray-700 rounded p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm mb-1">Type</label>
                          <select
                            value={editingFolder.type}
                            onChange={(e) =>
                              setEditingFolder({
                                ...editingFolder,
                                type: e.target.value as any,
                              })
                            }
                            className="w-full bg-gray-700 rounded p-2"
                          >
                            <option value="folder">Folder</option>
                            <option value="album">Album</option>
                            <option value="ep">EP</option>
                            <option value="single">Single</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm mb-1">ID</label>
                          <input
                            type="text"
                            value={editingFolder.id}
                            disabled
                            className="w-full bg-gray-700 rounded p-2 opacity-50"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                          <input
                            type="checkbox"
                            checked={editingFolder.hidden || false}
                            onChange={(e) =>
                              setEditingFolder({ ...editingFolder, hidden: e.target.checked })
                            }
                            className="rounded"
                          />
                          <label>Private (hide from public site)</label>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <button
                          onClick={() => handleUpdateFolder(editingFolder)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                        >
                          <FaSave /> Save
                        </button>
                        <button
                          onClick={() => setEditingFolder(null)}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                        >
                          <FaTimes /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="text-2xl font-semibold">{selectedFolder.name}</h2>
                          <p className="text-gray-400 mt-1">
                            {selectedFolder.type} • {selectedFolder.childCount || 0} folders • {selectedFolder.trackCount || 0} tracks
                          </p>
                          {selectedFolder.is_archived && (
                            <p className="text-amber-300 mt-2 text-sm">Archived folder (hidden by default)</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingFolder(selectedFolder)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
                          >
                            <FaEdit /> Edit
                          </button>
                          <button
                            onClick={() => setShowCreateTrack(true)}
                            disabled={selectedFolder.is_archived}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FaPlus /> Add Track
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div><strong>ID:</strong> {selectedFolder.id}</div>
                        {selectedFolder.hidden && (
                          <div className="text-yellow-400">⚠️ Private (hidden from public site)</div>
                        )}
                        {selectedFolder.parentId && (
                          <div><strong>Parent:</strong> {selectedFolder.parentId}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tracks List */}
                <div 
                  className={`bg-gray-800 rounded-lg overflow-hidden relative ${
                    dragOverFileFolder === selectedFolder?.id ? 'ring-2 ring-green-400 bg-green-900/20' : ''
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    const types = Array.from(e.dataTransfer.types)
                    const hasFiles = types.includes('Files')
                    const hasFolderData = types.includes('application/x-folder-id')
                    
                    console.log('Tracks area dragOver:', {
                      types,
                      hasFiles,
                      hasFolderData,
                      selectedFolder: selectedFolder?.id
                    })
                    
                    if (hasFiles && !hasFolderData && selectedFolder) {
                      e.dataTransfer.dropEffect = 'copy'
                      setDragOverFileFolder(selectedFolder.id)
                    }
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // Only clear if leaving the tracks area
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      if (dragOverFileFolder === selectedFolder?.id) {
                        setDragOverFileFolder(null)
                      }
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    console.log('Tracks area drop:', {
                      selectedFolder: selectedFolder?.id,
                      files: e.dataTransfer.files.length,
                      types: Array.from(e.dataTransfer.types)
                    })
                    
                    if (!selectedFolder) {
                      alert('Please select a folder first')
                      return
                    }
                    
                    const folderId = e.dataTransfer.getData('application/x-folder-id')
                    if (folderId || draggedFolder) {
                      console.log('Skipping - folder drag')
                      return
                    }

                    setDragOverFileFolder(null)
                    handleFileDrop(e, selectedFolder)
                  }}
                >
                  <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Tracks {sortedTracks.length}</h3>
                      {selectedFolder && (
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          <FaUpload className="text-xs" />
                          Drop audio files here to add to "{selectedFolder.name}"
                        </p>
                      )}
                    </div>
                    
                    {/* Sort and Column Controls */}
                    <div className="flex items-center gap-2">
                      {/* Column Visibility Toggle */}
                      <div className="relative" ref={columnMenuRef}>
                        <button
                          onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500"
                          title="Column visibility"
                        >
                          <FaColumns className="text-sm" />
                          <span className="text-sm">Columns</span>
                          <FaChevronDown className={`text-xs transition-transform ${isColumnMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isColumnMenuOpen && (
                          <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                            <div className="px-3 py-2 bg-gray-900 border-b border-gray-700">
                              <div className="text-xs font-semibold text-gray-300 uppercase">Show Columns</div>
                            </div>
                            <div className="py-1 max-h-96 overflow-y-auto">
                              {[
                                { key: 'genre' as const, label: 'Genre' },
                                { key: 'subgenre' as const, label: 'Sub-Genre' },
                                { key: 'drumStyle' as const, label: 'Drum Style' },
                                { key: 'timeSignature' as const, label: 'Time Signature' },
                                { key: 'key' as const, label: 'Key' },
                                { key: 'scale' as const, label: 'Scale' },
                                { key: 'date' as const, label: 'Date' },
                                { key: 'bpm' as const, label: 'BPM' },
                                { key: 'duration' as const, label: 'Duration' },
                              ].map(({ key, label }) => (
                                <button
                                  key={key}
                                  onClick={() => toggleColumn(key)}
                                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700 transition-colors text-gray-300"
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
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500"
                          title="Sort tracks"
                        >
                          {getSortIcon()}
                          <span className="text-sm">
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
                          <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                            <div className="py-1">
                              <button
                                onClick={() => handleSortChange('default')}
                                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700 transition-colors ${
                                  sortBy === 'default' ? 'text-blue-400 bg-gray-700' : 'text-gray-300'
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
                                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-700 transition-colors ${
                                    sortBy === key ? 'text-blue-400 bg-gray-700' : 'text-gray-300'
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

                  <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/40 space-y-3">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="Search title or artist..."
                          value={trackSearch}
                          onChange={(e) => setTrackSearch(e.target.value)}
                          className="w-full bg-gray-700 rounded p-2 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Key"
                          value={filterKey}
                          onChange={(e) => setFilterKey(e.target.value)}
                          className="w-full bg-gray-700 rounded p-2 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Genre"
                          value={filterGenre}
                          onChange={(e) => setFilterGenre(e.target.value)}
                          className="w-full bg-gray-700 rounded p-2 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="Min BPM"
                          value={bpmMin}
                          onChange={(e) => setBpmMin(e.target.value)}
                          className="w-full bg-gray-700 rounded p-2 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="Max BPM"
                          value={bpmMax}
                          onChange={(e) => setBpmMax(e.target.value)}
                          className="w-full bg-gray-700 rounded p-2 text-sm"
                        />
                      </div>
                    </div>

                    {selectedTracks.size > 0 && (
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm text-gray-300">Bulk Edit {selectedTracks.size} tracks</div>
                          <button
                            onClick={() => setSelectedTracks(new Set())}
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            Clear Selection
                          </button>
                        </div>
                        <div className="grid grid-cols-12 gap-3">
                          <input
                            className="col-span-3 bg-gray-700 rounded p-2 text-sm"
                            placeholder="Artist"
                            value={bulkEdits.artist || ''}
                            onChange={(e) => setBulkEdits({ ...bulkEdits, artist: e.target.value })}
                          />
                          <input
                            className="col-span-2 bg-gray-700 rounded p-2 text-sm"
                            placeholder="BPM"
                            value={bulkEdits.bpm || ''}
                            onChange={(e) => setBulkEdits({ ...bulkEdits, bpm: e.target.value })}
                          />
                          <input
                            className="col-span-2 bg-gray-700 rounded p-2 text-sm"
                            placeholder="Key"
                            value={bulkEdits.key_signature || ''}
                            onChange={(e) => setBulkEdits({ ...bulkEdits, key_signature: e.target.value })}
                          />
                          <input
                            className="col-span-2 bg-gray-700 rounded p-2 text-sm"
                            placeholder="Energy"
                            value={bulkEdits.energy_level || ''}
                            onChange={(e) => setBulkEdits({ ...bulkEdits, energy_level: e.target.value })}
                          />
                          <input
                            className="col-span-2 bg-gray-700 rounded p-2 text-sm"
                            placeholder="Danceability"
                            value={bulkEdits.danceability || ''}
                            onChange={(e) => setBulkEdits({ ...bulkEdits, danceability: e.target.value })}
                          />
                          <input
                            className="col-span-1 bg-gray-700 rounded p-2 text-sm"
                            placeholder="Genre"
                            value={bulkEdits.genre || ''}
                            onChange={(e) => setBulkEdits({ ...bulkEdits, genre: e.target.value })}
                          />
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={applyBulkEdit}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => setBulkEdits({})}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="overflow-y-auto max-h-[500px]">
                    {sortedTracks.length > 0 ? (
                      <div className="divide-y divide-gray-700">
                        {/* Header Row with Column Names */}
                        <div className="px-4 py-2 bg-gray-900/40 border-b border-gray-700 flex items-center gap-4 text-xs text-gray-400 font-medium">
                          <div className="w-8 flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedTracks.size > 0 && selectedTracks.size === sortedTracks.length}
                              onChange={toggleSelectAll}
                              className="rounded"
                            />
                          </div>
                          <div className="w-8 text-right">#</div>
                          <button className="flex-1 min-w-[200px] text-left" onClick={() => handleSortChange('title')}>Title</button>
                          <button className="w-32 text-left" onClick={() => handleSortChange('artist')}>Artist</button>
                          {visibleColumns.genre && <div className="w-24 hidden md:block">Genre</div>}
                          {visibleColumns.subgenre && <div className="w-28 hidden lg:block">Sub-Genre</div>}
                          {visibleColumns.drumStyle && <div className="w-28 hidden lg:block">Drum Style</div>}
                          {visibleColumns.timeSignature && <div className="w-20 hidden md:block">Time Sig</div>}
                          {visibleColumns.key && <button className="w-16 hidden sm:block text-left" onClick={() => handleSortChange('key')}>Key</button>}
                          {visibleColumns.scale && <div className="w-20 hidden md:block">Scale</div>}
                          {visibleColumns.date && <button className="w-24 hidden lg:block text-left" onClick={() => handleSortChange('date')}>Date</button>}
                          {visibleColumns.bpm && <button className="w-16 hidden sm:block text-left" onClick={() => handleSortChange('bpm')}>BPM</button>}
                          {visibleColumns.duration && <button className="w-20 text-left" onClick={() => handleSortChange('duration')}>Duration</button>}
                          <div className="w-20">Actions</div>
                        </div>
                        {sortedTracks.map((track, index) => (
                          <div
                            key={track.id}
                            className={`px-4 py-3 hover:bg-gray-700 flex items-center gap-4 group ${
                              track.is_archived ? 'opacity-60' : ''
                            }`}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              setContextMenu({ x: e.clientX, y: e.clientY, track })
                            }}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/track-id', track.id)
                            }}
                          >
                            <div className="w-8 flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selectedTracks.has(track.id)}
                                onChange={() => toggleTrackSelection(track.id)}
                                className="rounded"
                              />
                            </div>
                            <div className="w-8 text-sm text-gray-400 text-right">{index + 1}</div>
                            <div className="flex-1 min-w-[200px]">
                              {editingRows.has(track.id) ? (
                                <input
                                  className="w-full bg-gray-700 rounded p-1 text-sm"
                                  value={(rowDrafts[track.id]?.title as string) ?? track.title}
                                  onChange={(e) => updateRowDraft(track.id, 'title', e.target.value)}
                                />
                              ) : (
                                <div className="font-medium text-white flex items-center gap-2">
                                  <span>{track.title}</span>
                                  {track.is_archived && (
                                    <span className="text-xs text-amber-300">Archived</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="w-32">
                              {editingRows.has(track.id) ? (
                                <input
                                  className="w-full bg-gray-700 rounded p-1 text-sm"
                                  value={(rowDrafts[track.id]?.artist as string) ?? track.artist}
                                  onChange={(e) => updateRowDraft(track.id, 'artist', e.target.value)}
                                />
                              ) : (
                                <div className="text-sm text-gray-400 truncate">{track.artist}</div>
                              )}
                            </div>
                            {visibleColumns.genre && (
                              <div className="w-24 text-xs text-gray-400 truncate hidden md:block" title={getTrackGenre(track)}>
                                {getTrackGenre(track) || '—'}
                              </div>
                            )}
                            {visibleColumns.subgenre && (
                              <div className="w-28 text-xs text-gray-400 truncate hidden lg:block" title={getTrackSubgenre(track)}>
                                {getTrackSubgenre(track) || '—'}
                              </div>
                            )}
                            {visibleColumns.drumStyle && (
                              <div className="w-28 text-xs text-gray-400 truncate hidden lg:block" title={getTrackDrumStyle(track)}>
                                {getTrackDrumStyle(track) || '—'}
                              </div>
                            )}
                            {visibleColumns.timeSignature && (
                              <div className="w-20 text-xs text-gray-400 font-mono hidden md:block">
                                {getTrackTimeSignature(track) || '—'}
                              </div>
                            )}
                            {visibleColumns.key && (
                              <div className="w-16 text-xs text-gray-400 font-mono hidden sm:block">
                                {editingRows.has(track.id) ? (
                                  <input
                                    className="w-full bg-gray-700 rounded p-1 text-xs"
                                    value={(rowDrafts[track.id]?.key_signature as string) ?? getTrackKey(track)}
                                    onChange={(e) => updateRowDraft(track.id, 'key_signature', e.target.value)}
                                  />
                                ) : (
                                  getTrackKey(track) || ''
                                )}
                              </div>
                            )}
                            {visibleColumns.scale && (
                              <div className="w-20 text-xs text-gray-400 hidden md:block">
                                {getTrackScale(track) || '—'}
                              </div>
                            )}
                            {visibleColumns.date && (
                              <div className="w-24 text-xs text-gray-400 hidden lg:block">
                                {getTrackDate(track) ? formatDate(getTrackDate(track)) : '—'}
                              </div>
                            )}
                            {visibleColumns.bpm && (
                              <div className="w-16 text-xs text-gray-400 font-mono hidden sm:block">
                                {editingRows.has(track.id) ? (
                                  <input
                                    type="number"
                                    className="w-full bg-gray-700 rounded p-1 text-xs"
                                    value={rowDrafts[track.id]?.bpm ?? track.bpm ?? ''}
                                    onChange={(e) => updateRowDraft(track.id, 'bpm', e.target.value ? parseFloat(e.target.value) : undefined)}
                                  />
                                ) : (
                                  track.bpm || '—'
                                )}
                              </div>
                            )}
                            {visibleColumns.duration && (
                              <div className="w-20 text-xs text-gray-400 font-mono">
                                {editingRows.has(track.id) ? (
                                  <input
                                    type="number"
                                    className="w-full bg-gray-700 rounded p-1 text-xs"
                                    value={rowDrafts[track.id]?.duration ?? track.duration ?? ''}
                                    onChange={(e) => updateRowDraft(track.id, 'duration', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                  />
                                ) : (
                                  track.duration ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}` : '—'
                                )}
                              </div>
                            )}
                            <div className="w-20 flex gap-2 opacity-0 group-hover:opacity-100">
                              {editingRows.has(track.id) ? (
                                <>
                                  <button
                                    onClick={() => saveRowEdit(track.id)}
                                    className="p-2 hover:bg-green-600 rounded"
                                    title="Save"
                                  >
                                    <FaSave className="text-sm" />
                                  </button>
                                  <button
                                    onClick={() => cancelRowEdit(track.id)}
                                    className="p-2 hover:bg-gray-600 rounded"
                                    title="Cancel"
                                  >
                                    <FaTimes className="text-sm" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startRowEdit(track)}
                                    className="p-2 hover:bg-gray-600 rounded"
                                    title="Inline Edit"
                                  >
                                    <FaEdit className="text-sm" />
                                  </button>
                                  <button
                                    onClick={() => openDrawerForTrack(track, 'details')}
                                    className="p-2 hover:bg-blue-600 rounded"
                                    title="Details"
                                  >
                                    <FaInfoCircle className="text-sm" />
                                  </button>
                                </>
                              )}
                              {track.is_archived ? (
                                <button
                                  onClick={() => handleRestoreTrack(track)}
                                  className="p-2 hover:bg-emerald-600 rounded"
                                  title="Restore"
                                >
                                  <FaSync className="text-sm" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleArchiveTrack(track)}
                                  className="p-2 hover:bg-amber-600 rounded"
                                  title="Archive"
                                >
                                  <FaTrash className="text-sm" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div 
                        className={`p-8 text-center border-2 border-dashed rounded-lg transition-colors ${
                          dragOverFileFolder === selectedFolder?.id 
                            ? 'border-green-400 bg-green-900/20 text-green-300' 
                            : 'border-gray-700 text-gray-400'
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const hasFiles = e.dataTransfer.types.includes('Files')
                          const hasFolderData = e.dataTransfer.types.includes('application/x-folder-id')
                          
                          if (hasFiles && !hasFolderData && selectedFolder) {
                            e.dataTransfer.dropEffect = 'copy'
                            setDragOverFileFolder(selectedFolder.id)
                          }
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          
                          console.log('Empty state drop:', {
                            selectedFolder: selectedFolder?.id,
                            files: e.dataTransfer.files.length
                          })
                          
                          if (!selectedFolder) {
                            alert('Please select a folder first')
                            return
                          }
                          
                          const folderId = e.dataTransfer.getData('application/x-folder-id')
                          if (folderId || draggedFolder) {
                            return
                          }

                          setDragOverFileFolder(null)
                          handleFileDrop(e, selectedFolder)
                        }}
                      >
                        {dragOverFileFolder === selectedFolder?.id ? (
                          <>
                            <FaUpload className="mx-auto mb-4 text-4xl text-green-400" />
                            <p className="text-green-300 font-semibold mb-2">Drop files here to upload</p>
                            <p className="text-gray-400 text-sm">Files will be added to: {selectedFolder.name}</p>
                          </>
                        ) : (
                          <>
                            <FaMusic className="mx-auto mb-4 text-4xl" />
                            <p className="mb-2">No tracks in this folder</p>
                            <p className="text-sm">Drag audio files here to upload</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div 
                className="bg-gray-800 rounded-lg p-16 text-center border-2 border-dashed border-gray-700 hover:border-gray-600 transition-colors"
                onDragOver={(e) => {
                  e.preventDefault()
                  if (e.dataTransfer.types.includes('Files')) {
                    e.dataTransfer.dropEffect = 'copy'
                  }
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const files = Array.from(e.dataTransfer.files).filter(file => {
                    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/aac']
                    return validTypes.includes(file.type) || file.name.match(/\.(mp3|wav|flac|m4a|ogg|aac)$/i)
                  })
                  if (files.length > 0) {
                    alert('Please select a folder first, then drag files onto it.')
                  }
                }}
              >
                <FaFolder className="mx-auto text-gray-600 mb-4 text-4xl" />
                <p className="text-gray-400 text-lg mb-2">Select a folder to view details</p>
                <p className="text-gray-500 text-sm">Or drag audio files onto any folder in the sidebar to upload</p>
              </div>
            )}
          </div>
        </div>

        {contextMenu && (
          <div
            className="fixed z-[1000] bg-gray-900 border border-gray-700 rounded shadow-xl py-1 text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800"
              onClick={() => {
                openDrawerForTrack(contextMenu.track, 'details')
                setContextMenu(null)
              }}
            >
              Open Details
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-800"
              onClick={() => {
                const selected = selectedTracks.size > 0 ? Array.from(selectedTracks) : []
                const trackIds = selected.includes(contextMenu.track.id)
                  ? selected
                  : [contextMenu.track.id, ...selected]
                setPendingAddTrackIds(trackIds)
                setPendingAddTrackId(getCanonicalTrackId(contextMenu.track.id))
                setDrawerTrack(contextMenu.track)
                setDrawerTab('playlists')
                setDrawerOpen(true)
                setContextMenu(null)
              }}
            >
              Add to Playlist
            </button>
            {contextMenu.track.is_archived ? (
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-800"
                onClick={() => {
                  handleRestoreTrack(contextMenu.track)
                  setContextMenu(null)
                }}
              >
                Restore
              </button>
            ) : (
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-800"
                onClick={() => {
                  handleArchiveTrack(contextMenu.track)
                  setContextMenu(null)
                }}
              >
                Archive
              </button>
            )}
          </div>
        )}

        {drawerOpen && drawerTrack && (
          <div className="fixed right-0 top-0 h-full w-[420px] bg-gray-900 border-l border-gray-700 z-[900] flex flex-col">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{drawerTrack.title}</div>
                <div className="text-xs text-gray-400">{drawerTrack.artist}</div>
              </div>
              <button className="p-2 hover:bg-gray-800 rounded" onClick={closeDrawer}>
                <FaTimes />
              </button>
            </div>
            <div className="px-4 py-2 border-b border-gray-800 flex gap-2">
              <button
                className={`px-3 py-2 rounded text-sm ${drawerTab === 'details' ? 'bg-blue-600' : 'bg-gray-800'}`}
                onClick={() => setDrawerTab('details')}
              >
                Details
              </button>
              <button
                className={`px-3 py-2 rounded text-sm ${drawerTab === 'playlists' ? 'bg-blue-600' : 'bg-gray-800'}`}
                onClick={() => setDrawerTab('playlists')}
              >
                Playlists
              </button>
              <button
                className={`px-3 py-2 rounded text-sm ${drawerTab === 'sonic' ? 'bg-blue-600' : 'bg-gray-800'}`}
                onClick={() => {
                  setDrawerTab('sonic')
                  loadSonicDna(drawerTrack.audioFileId)
                }}
              >
                Sonic DNA
              </button>
            </div>

            {drawerTab === 'details' && (
              <div className="p-4 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Title</label>
                  <input
                    className="w-full bg-gray-800 rounded p-2 text-sm"
                    value={drawerTrack.title}
                    onChange={(e) => setDrawerTrack({ ...drawerTrack, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Artist</label>
                  <input
                    className="w-full bg-gray-800 rounded p-2 text-sm"
                    value={drawerTrack.artist}
                    onChange={(e) => setDrawerTrack({ ...drawerTrack, artist: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">BPM</label>
                    <input
                      type="number"
                      className="w-full bg-gray-800 rounded p-2 text-sm"
                      value={drawerTrack.bpm ?? ''}
                      onChange={(e) => setDrawerTrack({ ...drawerTrack, bpm: e.target.value ? parseFloat(e.target.value) : undefined })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Key</label>
                    <input
                      className="w-full bg-gray-800 rounded p-2 text-sm"
                      value={drawerTrack.key_signature ?? ''}
                      onChange={(e) => setDrawerTrack({ ...drawerTrack, key_signature: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Duration (seconds)</label>
                  <input
                    type="number"
                    className="w-full bg-gray-800 rounded p-2 text-sm"
                    value={drawerTrack.duration ?? ''}
                    onChange={(e) => setDrawerTrack({ ...drawerTrack, duration: e.target.value ? parseInt(e.target.value, 10) : 0 })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-400">
                    Replace Artwork
                    <input
                      type="file"
                      accept="image/*"
                      className="block mt-2 text-xs"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        try {
                          const url = await uploadArtwork(file, drawerTrack)
                          setDrawerTrack({ ...drawerTrack, artwork: url })
                          if (selectedFolder) await handleFolderSelect(selectedFolder)
                        } catch (err: any) {
                          alert(err.message)
                        }
                      }}
                    />
                  </label>
                  <label className="text-xs text-gray-400">
                    Replace Audio File
                    <input
                      type="file"
                      accept="audio/*"
                      className="block mt-2 text-xs"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        try {
                          const url = await replaceAudioFile(file, drawerTrack)
                          setDrawerTrack({ ...drawerTrack, file: url })
                          if (selectedFolder) await handleFolderSelect(selectedFolder)
                        } catch (err: any) {
                          alert(err.message)
                        }
                      }}
                    />
                  </label>
                </div>
                <button
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                      onClick={async () => {
                    try {
                      const saved = await updateTrack(drawerTrack.id, drawerTrack)
                      const folderId = drawerTrack.folderId || selectedFolder?.id
                      if (folderId && drawerTrack.artwork) {
                        const busted = withArtworkCacheBust(drawerTrack.artwork)
                        emitFolderCatalogPatch(folderId, { artwork: busted })
                        invalidateMusicLibraryCache()
                        setTracks((prev) =>
                          prev.map((row) =>
                            row.folderId === folderId || row.id === drawerTrack.id
                              ? { ...row, artwork: busted }
                              : row,
                          ),
                        )
                        setFolders((prev) => stampLibraryCover(prev, folderId, busted))
                      }
                      if (selectedFolder) await handleFolderSelect(selectedFolder)
                      if (saved?.artwork) setDrawerTrack({ ...drawerTrack, artwork: saved.artwork })
                      alert('Saved')
                    } catch (err: any) {
                      alert(err.message)
                    }
                  }}
                >
                  Save Changes
                </button>
              </div>
            )}

            {drawerTab === 'playlists' && (
              <div className="p-4 space-y-4 overflow-y-auto">
                {pendingAddTrackIds.length > 0 && (
                  <div className="text-xs text-gray-400">
                    Adding {pendingAddTrackIds.length} track{pendingAddTrackIds.length === 1 ? '' : 's'} to playlists
                  </div>
                )}
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
                      const seedIds = pendingAddTrackIds.length > 0
                        ? pendingAddTrackIds.map(getCanonicalTrackId)
                        : pendingAddTrackId
                          ? [pendingAddTrackId]
                          : []
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
                  {playlists.map((playlist) => (
                    <div
                      key={playlist.id}
                      className="bg-gray-800 rounded p-3 flex items-center justify-between"
                      onDragOver={(e) => {
                        e.preventDefault()
                      }}
                      onDrop={async (e) => {
                        const trackId = e.dataTransfer.getData('text/track-id')
                        if (trackId) {
                          await addTrackToPlaylist(playlist.id, trackId)
                        }
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium">{playlist.name}</div>
                        <div className="text-xs text-gray-400">{playlist.trackIds.length} tracks</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-2 py-1 text-xs bg-blue-600 rounded"
                          onClick={async () => {
                            if (pendingAddTrackIds.length > 0) {
                              await addTracksToPlaylist(playlist.id, pendingAddTrackIds)
                            } else if (pendingAddTrackId) {
                              await addTrackToPlaylist(playlist.id, pendingAddTrackId)
                            }
                          }}
                        >
                          Add Selected
                        </button>
                        <button
                          className="px-2 py-1 text-xs bg-gray-700 rounded"
                          onClick={async () => {
                            const name = prompt('Rename playlist', playlist.name)
                            if (name && name.trim()) {
                              await updatePlaylist(playlist.id, { name: name.trim() })
                              setPlaylists((prev) => prev.map((p) => p.id === playlist.id ? { ...p, name: name.trim() } : p))
                            }
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="px-2 py-1 text-xs bg-amber-600 rounded"
                          onClick={async () => {
                            await deletePlaylist(playlist.id)
                            setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id))
                          }}
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {drawerTab === 'sonic' && (
              <div className="p-4 space-y-3 overflow-y-auto">
                {sonicDnaLoading ? (
                  <div className="text-sm text-gray-400">Loading Sonic DNA...</div>
                ) : (
                  <textarea
                    className="w-full h-[60vh] bg-gray-800 rounded p-2 text-xs font-mono"
                    value={sonicDnaText}
                    onChange={(e) => setSonicDnaText(e.target.value)}
                  />
                )}
                <button
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  onClick={saveSonicDna}
                >
                  Save Sonic DNA
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create Folder Modal */}
        {showCreateFolder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Create Folder</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-1">ID</label>
                  <input
                    type="text"
                    value={newFolder.id || ''}
                    onChange={(e) => setNewFolder({ ...newFolder, id: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2"
                    placeholder="folder-id"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Name</label>
                  <input
                    type="text"
                    value={newFolder.name || ''}
                    onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Type</label>
                  <select
                    value={newFolder.type || 'folder'}
                    onChange={(e) =>
                      setNewFolder({ ...newFolder, type: e.target.value as any })
                    }
                    className="w-full bg-gray-700 rounded p-2"
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
                    onChange={(e) =>
                      setNewFolder({ ...newFolder, parentId: e.target.value || null })
                    }
                    className="w-full bg-gray-700 rounded p-2"
                  >
                    <option value="">Root (No Parent)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newFolder.hidden || false}
                    onChange={(e) =>
                      setNewFolder({ ...newFolder, hidden: e.target.checked })
                    }
                    className="rounded"
                  />
                  <label>Private (hide from public site)</label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateFolderSubmit}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex-1"
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

        {/* Create Track Modal */}
        {showCreateTrack && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Create Track</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-1">ID</label>
                  <input
                    type="text"
                    value={newTrack.id || ''}
                    onChange={(e) => setNewTrack({ ...newTrack, id: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2"
                    placeholder="track-id"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Title</label>
                  <input
                    type="text"
                    value={newTrack.title || ''}
                    onChange={(e) => setNewTrack({ ...newTrack, title: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">File URL</label>
                  <input
                    type="text"
                    value={newTrack.file || ''}
                    onChange={(e) => setNewTrack({ ...newTrack, file: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2"
                  />
                </div>
                <div className="flex gap-2">
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

      </div>
    </div>
  )
}
