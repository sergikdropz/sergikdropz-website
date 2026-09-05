'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import { FaSearch, FaTimes, FaPlus, FaMusic, FaFolder, FaPlay, FaPause, FaEdit, FaTrash, FaSave, FaEye, FaEyeSlash, FaChevronRight, FaArrowLeft, FaStar, FaCheckSquare, FaSquare, FaBrain, FaSort, FaSortAlphaDown, FaSortAlphaUp, FaCog } from 'react-icons/fa'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import { useRouter } from 'next/navigation'
import {
  fetchMusicLibrary,
  fetchFolders,
  fetchAllTracksSummaryForHydration,
  fetchPlaylists,
  createFolder,
  updateFolder,
  deleteFolder,
  updateTrack,
  deleteTrack,
  rateTrack,
  recordTrackPlay,
  invalidateMusicLibraryCache,
  syncToDatabase,
  type FolderItem,
  type Track,
  type MusicLibraryData,
} from '@/utils/musicLibraryApi'
import SergBrowser from '@/components/music/SergBrowser'
import SmartPlaylistBuilder from '@/components/music/SmartPlaylistBuilder'
import StarRating from '@/components/music/StarRating'
import AdminMusicToolbar from '@/components/admin/AdminMusicToolbar'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import { filterVaultFolderTiles } from '@/lib/music-library/filter-vault-folder-tiles'

type ViewMode = 'vault' | 'browse'

export default function AdminMusicVault() {
  const { user, isAdmin, loading: authLoading } = useAdminAuth()
  const router = useRouter()
  const { playTrack, playQueue, currentTrack, isPlaying } = useMusicPlayer()

  const [libraryData, setLibraryData] = useState<MusicLibraryData | null>(null)
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('vault')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null)
  const [displayTracks, setDisplayTracks] = useState<Track[]>([])
  const [displayFolders, setDisplayFolders] = useState<FolderItem[]>([])
  const [folderPath, setFolderPath] = useState<FolderItem[]>([])
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set())
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Track>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [showSmartPlaylistBuilder, setShowSmartPlaylistBuilder] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: Track } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const rootVaultFolders = useMemo(
    () => filterVaultFolderTiles(libraryData?.folders || [], libraryData?.playlists || []),
    [libraryData]
  )

  const loadData = useCallback(async () => {
    setLoadingLibrary(true)
    try {
      const [lib, tracks] = await Promise.all([
        fetchMusicLibrary({ includeHidden: true, skipCache: true }),
        fetchAllTracksSummaryForHydration({ includeArchived: true }),
      ])
      setLibraryData(lib)
      setAllTracks(tracks)

      // Extract flat folder list
      const extractFolders = (items: FolderItem[]): FolderItem[] => {
        const result: FolderItem[] = []
        for (const item of items) {
          result.push(item)
          if (item.children) result.push(...extractFolders(item.children))
        }
        return result
      }
      const flatFolders = extractFolders(lib?.folders || [])
      setFolders(flatFolders)

      // Set initial display
      if (!selectedFolder) {
        setDisplayFolders(filterVaultFolderTiles(lib?.folders || [], lib?.playlists || []))
        setDisplayTracks([])
      }
    } catch (e) {
      console.error('Error loading admin vault data:', e)
    } finally {
      setLoadingLibrary(false)
    }
  }, [selectedFolder])

  useEffect(() => {
    if (isAdmin && !authLoading) loadData()
  }, [isAdmin, authLoading, loadData])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [contextMenu])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function navigateToFolder(folder: FolderItem) {
    setSelectedFolder(folder)
    const children = folder.children || []
    const tracks = folder.tracks || []
    if (children.length > 0) {
      setDisplayFolders(children)
      setDisplayTracks(tracks)
    } else {
      setDisplayFolders([])
      setDisplayTracks(tracks)
    }
    setFolderPath((prev) => [...prev, folder])
  }

  function navigateUp() {
    const newPath = [...folderPath]
    newPath.pop()
    const parent = newPath[newPath.length - 1] || null
    setFolderPath(newPath)
    setSelectedFolder(parent)
    if (parent) {
      setDisplayFolders(parent.children || [])
      setDisplayTracks(parent.tracks || [])
    } else {
      setDisplayFolders(rootVaultFolders)
      setDisplayTracks([])
    }
  }

  function navigateToRoot() {
    setFolderPath([])
    setSelectedFolder(null)
    setDisplayFolders(rootVaultFolders)
    setDisplayTracks([])
  }

  // Filter tracks by search
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return displayTracks
    const q = searchQuery.toLowerCase()
    return displayTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.genre?.toLowerCase().includes(q)
    )
  }, [displayTracks, searchQuery])

  // All tracks flat (for search across library)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || selectedFolder) return null
    const q = searchQuery.toLowerCase()
    return allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.genre?.toLowerCase().includes(q)
    )
  }, [searchQuery, allTracks, selectedFolder])

  const visibleTracks = searchResults ?? filteredTracks

  function toggleTrackSelection(id: string) {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllTracks() {
    if (selectedTrackIds.size === visibleTracks.length) {
      setSelectedTrackIds(new Set())
    } else {
      setSelectedTrackIds(new Set(visibleTracks.map((t) => t.id)))
    }
  }

  function startEditing(track: Track) {
    setEditingTrackId(track.id)
    setEditDraft({
      title: track.title,
      artist: track.artist,
      genre: track.genre,
      subgenre: track.subgenre,
      bpm: track.bpm,
      key_signature: track.key_signature,
      rating: track.rating,
      track_number: track.track_number,
      comments: track.comments,
    })
  }

  async function saveEdit() {
    if (!editingTrackId) return
    setSavingEdit(true)
    try {
      await updateTrack(editingTrackId, editDraft)
      showToast('Track updated')
      setEditingTrackId(null)
      setEditDraft({})
      invalidateMusicLibraryCache()
      loadData()
    } catch (e: any) {
      showToast(`Error: ${e.message}`)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleRate(trackId: string, rating: number) {
    await rateTrack(trackId, rating)
    setAllTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, rating } : t)))
    setDisplayTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, rating } : t)))
  }

  async function handleDeleteTrack(trackId: string) {
    if (!confirm('Archive this track?')) return
    try {
      await deleteTrack(trackId)
      showToast('Track archived')
      invalidateMusicLibraryCache()
      loadData()
    } catch (e: any) {
      showToast(`Error: ${e.message}`)
    }
  }

  async function handleBulkEdit(updates: Partial<Track>) {
    const ids = Array.from(selectedTrackIds)
    let success = 0
    for (const id of ids) {
      try {
        await updateTrack(id, updates)
        success++
      } catch {}
    }
    showToast(`Updated ${success}/${ids.length} tracks`)
    setSelectedTrackIds(new Set())
    invalidateMusicLibraryCache()
    loadData()
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedTrackIds)
    if (!confirm(`Archive ${ids.length} tracks?`)) return
    let success = 0
    for (const id of ids) {
      try {
        await deleteTrack(id)
        success++
      } catch {}
    }
    showToast(`Archived ${success}/${ids.length} tracks`)
    setSelectedTrackIds(new Set())
    invalidateMusicLibraryCache()
    loadData()
  }

  function handlePlayTrack(track: Track, idx: number) {
    playTrack(track as any, visibleTracks as any)
    recordTrackPlay(track.id, { source: 'admin' })
  }

  function handleContextMenu(e: React.MouseEvent, track: Track) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, track })
  }

  function formatDuration(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.round(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  if (authLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  const selectedTracksArr = allTracks.filter((t) => selectedTrackIds.has(t.id))

  return (
    <div
      className="min-h-screen text-white"
      style={{ paddingBottom: 'calc(1.5rem + var(--global-music-player-height, 0px))' }}
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
        {/* Admin Toolbar */}
        <AdminMusicToolbar
          onRefresh={loadData}
          folders={folders}
          selectedTracks={selectedTracksArr}
          onBulkEdit={handleBulkEdit}
          onBulkDelete={handleBulkDelete}
        />

        {/* Header — mirrors front-end vault */}
        <div className="mb-6">
          <div className="flex flex-col items-center justify-center mb-4 w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-1 font-six-caps text-center border border-yellow-400 text-yellow-400 px-3 py-1.5 rounded">
              SERGIK Music Vault
            </h1>

            {/* View toggle */}
            <div className="flex items-center space-x-1 bg-gray-900/40 border border-gray-700 rounded-lg p-0.5 mt-3">
              <button
                onClick={() => setViewMode('vault')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${
                  viewMode === 'vault' ? 'bg-yellow-500 text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                Vault
              </button>
              <button
                onClick={() => setViewMode('browse')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition ${
                  viewMode === 'browse' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Browse
              </button>
            </div>
          </div>

          {/* Search */}
          {viewMode === 'vault' && (
            <div className="relative max-w-2xl mx-auto">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tracks, artists, genres..."
                className="w-full pl-10 pr-10 py-2.5 bg-gray-800/40 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 text-sm"
                aria-label="Search library"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  aria-label="Clear search"
                >
                  <FaTimes />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Browse Mode — overflow-visible so the page scrolls (same as the public vault).
            A fixed-height overflow-hidden pane clipped the track list with no inner scroller. */}
        {viewMode === 'browse' && (
          <div className="w-full min-w-0 min-h-[240px] sm:min-h-[320px] rounded-xl border border-gray-800 bg-gray-900/30 overflow-visible [--music-lib-chrome-top:5.5rem] md:[--music-lib-chrome-top:1rem]">
            <SergBrowser adminMode />
          </div>
        )}

        {/* Vault Mode */}
        {viewMode === 'vault' && !loadingLibrary && (
          <>
            {/* Breadcrumb */}
            {folderPath.length > 0 && (
              <div className="flex items-center space-x-2 mb-4 text-sm">
                <button onClick={navigateToRoot} className="text-yellow-400 hover:text-yellow-300">Library</button>
                {folderPath.map((f, i) => (
                  <div key={f.id} className="flex items-center space-x-2">
                    <FaChevronRight className="w-2.5 h-2.5 text-gray-600" />
                    <button
                      onClick={() => {
                        const newPath = folderPath.slice(0, i + 1)
                        setFolderPath(newPath)
                        const target = newPath[newPath.length - 1]
                        setSelectedFolder(target)
                        setDisplayFolders(target.children || [])
                        setDisplayTracks(target.tracks || [])
                      }}
                      className={i === folderPath.length - 1 ? 'text-white font-medium' : 'text-gray-400 hover:text-white'}
                    >
                      {f.name}
                    </button>
                  </div>
                ))}
                <button onClick={navigateUp} className="ml-3 text-gray-500 hover:text-white text-xs flex items-center space-x-1">
                  <FaArrowLeft className="w-2.5 h-2.5" />
                  <span>Back</span>
                </button>
              </div>
            )}

            {/* Folder Grid (same as front-end vault) */}
            {displayFolders.length > 0 && (
              <div className="mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {displayFolders.map((folder) => {
                    const artwork = folder.artwork
                      ? resolveImageUrl(folder.artwork)
                      : folder.tracks?.find((t) => t.artwork)?.artwork
                        ? resolveImageUrl(folder.tracks.find((t) => t.artwork)!.artwork!)
                        : null
                    const trackCount = folder.tracks?.length || 0
                    const childCount = folder.children?.length || 0

                    return (
                      <div
                        key={folder.id}
                        onClick={() => navigateToFolder(folder)}
                        className="group cursor-pointer transition hover:scale-[1.02]"
                      >
                        <div className="relative aspect-square rounded-lg overflow-hidden shadow-xl bg-gray-700/40 border border-gray-600/50 group-hover:border-yellow-500/50 transition">
                          {artwork ? (
                            <Image
                              src={artwork}
                              alt={folder.name}
                              fill
                              className="object-cover"
                              unoptimized={shouldUnoptimizeImage(artwork)}
                              sizes="(max-width: 768px) 50vw, 20vw"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FaFolder className="w-12 h-12 text-gray-600" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                          {folder.hidden && (
                            <div className="absolute top-2 right-2 bg-red-600/80 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              HIDDEN
                            </div>
                          )}
                        </div>
                        <div className="mt-2 px-0.5">
                          <div className="font-medium text-sm truncate">{folder.name}</div>
                          <div className="text-xs text-gray-500">
                            {folder.type}{trackCount ? ` · ${trackCount} tracks` : ''}{childCount ? ` · ${childCount} folders` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Track Table */}
            {visibleTracks.length > 0 && (
              <div className="bg-gray-900/30 border border-gray-800 rounded-xl overflow-hidden">
                {/* Table header with select-all */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-950/50">
                  <div className="flex items-center space-x-3">
                    <button onClick={selectAllTracks} className="text-gray-500 hover:text-white" aria-label="Select all">
                      {selectedTrackIds.size === visibleTracks.length && visibleTracks.length > 0 ? (
                        <FaCheckSquare className="w-4 h-4 text-yellow-400" />
                      ) : (
                        <FaSquare className="w-4 h-4" />
                      )}
                    </button>
                    <span className="text-sm text-gray-400">{visibleTracks.length} tracks</span>
                  </div>
                  <button
                    onClick={() => {
                      if (visibleTracks.length > 0) {
                        playQueue(visibleTracks as any)
                        recordTrackPlay(visibleTracks[0].id, { source: 'admin' })
                      }
                    }}
                    className="flex items-center space-x-1.5 text-xs text-yellow-400 hover:text-yellow-300"
                  >
                    <FaPlay className="w-3 h-3" />
                    <span>Play All</span>
                  </button>
                </div>

                {/* Track rows */}
                <div className="divide-y divide-gray-800/30">
                  {visibleTracks.map((track, i) => {
                    const isEditing = editingTrackId === track.id
                    const isSelected = selectedTrackIds.has(track.id)
                    const isCurrent = currentTrack?.id === track.id

                    return (
                      <div
                        key={track.id}
                        className={`flex items-center px-4 py-2 hover:bg-gray-800/20 transition group ${
                          isCurrent ? 'bg-yellow-900/10' : ''
                        } ${isSelected ? 'bg-purple-900/10' : ''}`}
                        onContextMenu={(e) => handleContextMenu(e, track)}
                      >
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleTrackSelection(track.id)}
                          className="mr-3 text-gray-600 hover:text-white flex-shrink-0"
                          aria-label={`Select ${track.title}`}
                        >
                          {isSelected ? (
                            <FaCheckSquare className="w-3.5 h-3.5 text-yellow-400" />
                          ) : (
                            <FaSquare className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Track number / play button */}
                        <div className="w-8 text-center flex-shrink-0 relative">
                          <span className="text-xs text-gray-600 group-hover:invisible">
                            {track.track_number || i + 1}
                          </span>
                          <button
                            onClick={() => handlePlayTrack(track, i)}
                            className="absolute inset-0 flex items-center justify-center invisible group-hover:visible text-white"
                            aria-label={`Play ${track.title}`}
                          >
                            <FaPlay className="w-3 h-3" />
                          </button>
                          {isCurrent && isPlaying && (
                            <span className="absolute inset-0 flex items-center justify-center text-yellow-400 group-hover:invisible">
                              <span className="flex space-x-0.5">
                                <span className="w-0.5 h-3 bg-yellow-400 animate-pulse" />
                                <span className="w-0.5 h-2 bg-yellow-400 animate-pulse" style={{ animationDelay: '0.15s' }} />
                                <span className="w-0.5 h-3.5 bg-yellow-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Artwork */}
                        <div className="w-9 h-9 rounded overflow-hidden bg-gray-800 mr-3 flex-shrink-0">
                          {track.artwork ? (
                            <Image
                              src={resolveImageUrl(track.artwork)}
                              alt=""
                              width={36}
                              height={36}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FaMusic className="w-3 h-3 text-gray-700" />
                            </div>
                          )}
                        </div>

                        {/* Title + Artist */}
                        <div className="flex-1 min-w-0 mr-3">
                          {isEditing ? (
                            <div className="flex space-x-2">
                              <input
                                value={editDraft.title || ''}
                                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                                className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm w-1/2 outline-none focus:border-yellow-500"
                                aria-label="Edit title"
                              />
                              <input
                                value={editDraft.artist || ''}
                                onChange={(e) => setEditDraft((d) => ({ ...d, artist: e.target.value }))}
                                className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-sm w-1/2 outline-none focus:border-yellow-500"
                                aria-label="Edit artist"
                              />
                            </div>
                          ) : (
                            <>
                              <div className={`text-sm truncate ${isCurrent ? 'text-yellow-300 font-medium' : ''}`}>{track.title}</div>
                              <div className="text-xs text-gray-500 truncate">{track.artist}</div>
                            </>
                          )}
                        </div>

                        {/* Genre */}
                        <div className="w-24 text-xs text-gray-500 truncate mr-3 hidden md:block">
                          {isEditing ? (
                            <input
                              value={editDraft.genre || ''}
                              onChange={(e) => setEditDraft((d) => ({ ...d, genre: e.target.value }))}
                              className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs w-full outline-none"
                              aria-label="Edit genre"
                            />
                          ) : (
                            track.genre || '—'
                          )}
                        </div>

                        {/* BPM */}
                        <div className="w-14 text-xs text-gray-400 text-center font-mono mr-3 hidden lg:block">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editDraft.bpm ?? ''}
                              onChange={(e) => setEditDraft((d) => ({ ...d, bpm: e.target.value ? Number(e.target.value) : undefined }))}
                              className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs w-full text-center outline-none"
                              aria-label="Edit BPM"
                            />
                          ) : (
                            track.bpm || '—'
                          )}
                        </div>

                        {/* Key */}
                        <div className="w-12 text-xs text-gray-400 text-center mr-3 hidden lg:block">
                          {isEditing ? (
                            <input
                              value={editDraft.key_signature || ''}
                              onChange={(e) => setEditDraft((d) => ({ ...d, key_signature: e.target.value }))}
                              className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs w-full text-center outline-none"
                              aria-label="Edit key"
                            />
                          ) : (
                            track.key_signature || '—'
                          )}
                        </div>

                        {/* Rating */}
                        <div className="w-24 mr-3 hidden xl:block">
                          <StarRating
                            rating={track.rating || 0}
                            onRate={(r) => handleRate(track.id, r)}
                            size="sm"
                          />
                        </div>

                        {/* Play count */}
                        <div className="w-12 text-xs text-gray-600 text-center mr-3 hidden xl:block font-mono">
                          {track.play_count || 0}
                        </div>

                        {/* Duration */}
                        <div className="w-14 text-xs text-gray-500 text-right mr-3 font-mono">
                          {track.duration ? formatDuration(track.duration) : '—'}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          {isEditing ? (
                            <>
                              <button
                                onClick={saveEdit}
                                disabled={savingEdit}
                                className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition"
                                aria-label="Save"
                              >
                                <FaSave className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => { setEditingTrackId(null); setEditDraft({}) }}
                                className="p-1.5 text-gray-500 hover:bg-gray-800 rounded transition"
                                aria-label="Cancel"
                              >
                                <FaTimes className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditing(track)}
                                className="p-1.5 text-gray-600 hover:text-white hover:bg-gray-800 rounded transition opacity-0 group-hover:opacity-100"
                                aria-label="Edit"
                              >
                                <FaEdit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteTrack(track.id)}
                                className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition opacity-0 group-hover:opacity-100"
                                aria-label="Delete"
                              >
                                <FaTrash className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {displayFolders.length === 0 && visibleTracks.length === 0 && !loadingLibrary && (
              <div className="text-center py-16 text-gray-500">
                {searchQuery ? 'No tracks match your search' : 'This folder is empty'}
              </div>
            )}
          </>
        )}

        {loadingLibrary && viewMode === 'vault' && (
          <div className="text-center py-16 text-gray-400">Loading music library...</div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1.5 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <CtxItem label="Edit Track" onClick={() => { startEditing(contextMenu.track); setContextMenu(null) }} />
          <CtxItem label="Play" onClick={() => { handlePlayTrack(contextMenu.track, 0); setContextMenu(null) }} />
          <CtxItem label="Copy as JSON" onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(contextMenu.track, null, 2))
            showToast('Copied to clipboard')
            setContextMenu(null)
          }} />
          <div className="border-t border-gray-800 my-1" />
          <CtxItem label="Archive Track" danger onClick={() => { handleDeleteTrack(contextMenu.track.id); setContextMenu(null) }} />
        </div>
      )}

      {/* Smart Playlist Builder */}
      {showSmartPlaylistBuilder && (
        <SmartPlaylistBuilder
          onClose={() => setShowSmartPlaylistBuilder(false)}
          onCreated={() => showToast('Smart playlist created')}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed right-6 z-50 bg-green-900/90 border border-green-700 text-green-200 px-4 py-2 rounded-lg text-sm shadow-lg"
          style={{ bottom: 'calc(1.5rem + var(--global-music-player-height, 0px))' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-1.5 text-sm hover:bg-gray-800 transition ${
        danger ? 'text-red-400 hover:text-red-300' : 'text-gray-300 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}
