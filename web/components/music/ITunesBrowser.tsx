'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FaPlay, FaMusic, FaCompactDisc, FaUser, FaTags, FaList, FaTh, FaHistory, FaFire, FaStar, FaPlus, FaClock, FaChevronRight, FaChevronLeft, FaFolder } from 'react-icons/fa'
import { useMusicPlayer } from '@/contexts/MusicPlayerContext'
import StarRating from './StarRating'
import {
  fetchBrowse,
  fetchPlaylists,
  fetchTracks,
  rateTrack,
  recordTrackPlay,
  fetchSmartPlaylists,
  resolveSmartPlaylist,
  type Track,
  type BrowseView,
  type SmartPlaylist,
  type Playlist,
} from '@/utils/musicLibraryApi'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

interface ITunesBrowserProps {
  onClose?: () => void
}

type SortField = 'title' | 'artist' | 'genre' | 'bpm' | 'year' | 'rating' | 'play_count' | 'date_added' | 'last_played' | 'duration' | 'key' | 'energy'

type SongTableOptionalColumn = 'artist' | 'album' | 'genre' | 'bpm' | 'key' | 'rating' | 'play_count' | 'duration'

const SONG_TABLE_OPTIONAL_COLUMNS: SongTableOptionalColumn[] = [
  'artist',
  'album',
  'genre',
  'bpm',
  'key',
  'rating',
  'play_count',
  'duration',
]

const SONG_TABLE_COLUMNS_STORAGE_KEY = 'itunes-browser-songs-visible-columns'

const SONG_TABLE_COLUMN_LABELS: Record<SongTableOptionalColumn, string> = {
  artist: 'Artist',
  album: 'Album',
  genre: 'Genre',
  bpm: 'BPM',
  key: 'Key',
  rating: 'Rating',
  play_count: 'Plays',
  duration: 'Time',
}

function loadSongTableColumnVisibility(): Set<SongTableOptionalColumn> {
  if (typeof window === 'undefined') return new Set(SONG_TABLE_OPTIONAL_COLUMNS)
  try {
    const raw = localStorage.getItem(SONG_TABLE_COLUMNS_STORAGE_KEY)
    if (!raw) return new Set(SONG_TABLE_OPTIONAL_COLUMNS)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(SONG_TABLE_OPTIONAL_COLUMNS)
    const next = new Set<SongTableOptionalColumn>()
    for (const k of parsed) {
      if (typeof k === 'string' && SONG_TABLE_OPTIONAL_COLUMNS.includes(k as SongTableOptionalColumn)) {
        next.add(k as SongTableOptionalColumn)
      }
    }
    return next.size > 0 ? next : new Set(SONG_TABLE_OPTIONAL_COLUMNS)
  } catch {
    return new Set(SONG_TABLE_OPTIONAL_COLUMNS)
  }
}

const BROWSE_SIDEBAR_W_DEFAULT = 224 // matches previous w-56
const BROWSE_SIDEBAR_W_MIN = 176
const BROWSE_SIDEBAR_W_MAX = 480

export default function ITunesBrowser({ onClose }: ITunesBrowserProps) {
  const { playTrack, playQueue, currentTrack, isPlaying } = useMusicPlayer()

  const [view, setView] = useState<BrowseView>('songs')
  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<any[]>([])
  const [artists, setArtists] = useState<any[]>([])
  const [genres, setGenres] = useState<any[]>([])
  const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylist[]>([])
  const [curatedPlaylists, setCuratedPlaylists] = useState<Playlist[]>([])
  const [sidebarAlbums, setSidebarAlbums] = useState<any[]>([])
  const [activeSmartPlaylist, setActiveSmartPlaylist] = useState<string | null>(null)
  const [activeCuratedPlaylist, setActiveCuratedPlaylist] = useState<string | null>(null)
  const [activeSidebarAlbum, setActiveSidebarAlbum] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)

  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterGenre, setFilterGenre] = useState<string | null>(null)
  const [filterArtist, setFilterArtist] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [albumTracks, setAlbumTracks] = useState<Track[]>([])
  const [loadingAlbumTracks, setLoadingAlbumTracks] = useState(false)

  const [browseSidebarWidth, setBrowseSidebarWidth] = useState(BROWSE_SIDEBAR_W_DEFAULT)
  const [browseSidebarCollapsed, setBrowseSidebarCollapsed] = useState(false)
  const [isResizingBrowseSidebar, setIsResizingBrowseSidebar] = useState(false)
  const browseSidebarResizeStartRef = useRef({ x: 0, w: BROWSE_SIDEBAR_W_DEFAULT })

  const LIMIT = 100

  useEffect(() => {
    if (!isResizingBrowseSidebar || browseSidebarCollapsed) return
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - browseSidebarResizeStartRef.current.x
      const next = Math.min(
        BROWSE_SIDEBAR_W_MAX,
        Math.max(BROWSE_SIDEBAR_W_MIN, browseSidebarResizeStartRef.current.w + dx)
      )
      setBrowseSidebarWidth(next)
    }
    const onUp = () => setIsResizingBrowseSidebar(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingBrowseSidebar, browseSidebarCollapsed])

  const handleBrowseSidebarResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (browseSidebarCollapsed) return
    browseSidebarResizeStartRef.current = { x: e.clientX, w: browseSidebarWidth }
    setIsResizingBrowseSidebar(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Curated playlist selected — fetch its tracks
      if (activeCuratedPlaylist) {
        const pl = curatedPlaylists.find((p) => p.id === activeCuratedPlaylist)
        if (pl && pl.trackIds.length > 0) {
          const allTracks = await fetchTracks(undefined, { includeArchived: false })
          const trackMap = new Map(allTracks.map((t) => [t.id, t]))
          const resolved = pl.trackIds.map((id) => trackMap.get(id)).filter(Boolean) as Track[]
          setTracks(resolved)
          setTotal(resolved.length)
        } else {
          setTracks([])
          setTotal(0)
        }
        setLoading(false)
        return
      }

      // Sidebar album/EP selected — fetch its tracks directly by folder
      if (activeSidebarAlbum) {
        const folderTracks = await fetchTracks(activeSidebarAlbum, { includeArchived: false })
        setTracks(folderTracks)
        setTotal(folderTracks.length)
        setLoading(false)
        return
      }

      if (activeSmartPlaylist) {
        const result = await resolveSmartPlaylist(activeSmartPlaylist)
        setTracks(result.tracks || [])
        setTotal(result.tracks?.length || 0)
        setLoading(false)
        return
      }

      const data = await fetchBrowse({
        view,
        sort: sortField,
        dir: sortDir,
        genre: filterGenre || undefined,
        artist: filterArtist || undefined,
        search: searchQuery || undefined,
        limit: LIMIT,
        offset,
      })

      if (view === 'songs') {
        setTracks(data.tracks || [])
        setTotal(data.total || 0)
      } else if (view === 'albums') {
        setAlbums(data.albums || [])
      } else if (view === 'artists') {
        setArtists(data.artists || [])
        setTotal(data.total || 0)
      } else if (view === 'genres') {
        setGenres(data.genres || [])
      }
    } catch (err) {
      console.error('Browse error:', err)
    } finally {
      setLoading(false)
    }
  }, [view, sortField, sortDir, filterGenre, filterArtist, searchQuery, offset, activeSmartPlaylist, activeCuratedPlaylist, activeSidebarAlbum, curatedPlaylists])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    fetchSmartPlaylists().then(setSmartPlaylists)
    fetchPlaylists().then((pls) => setCuratedPlaylists(pls.filter((p) => !p.is_archived)))
    fetchBrowse({ view: 'albums', sort: 'title', dir: 'asc', limit: 100, offset: 0 })
      .then((data) => setSidebarAlbums(data.albums || []))
      .catch(() => {})
  }, [])

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setOffset(0)
  }

  function handlePlayTrack(track: Track, idx: number) {
    playTrack(track as any, tracks as any)
    recordTrackPlay(track.id, { source: activeSmartPlaylist ? 'smart_playlist' : 'browse' })
  }

  function handlePlayAll() {
    if (tracks.length) {
      playQueue(tracks as any)
      if (tracks[0]) recordTrackPlay(tracks[0].id, { source: 'browse' })
    }
  }

  async function handleRate(trackId: string, rating: number) {
    const ok = await rateTrack(trackId, rating)
    if (ok) {
      setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, rating } : t))
    }
  }

  function switchView(v: BrowseView) {
    setView(v)
    setActiveSmartPlaylist(null)
    setActiveCuratedPlaylist(null)
    setActiveSidebarAlbum(null)
    setSelectedAlbumId(null)
    setOffset(0)
    setFilterGenre(null)
    setFilterArtist(null)
  }

  async function openSmartPlaylist(id: string) {
    setActiveSmartPlaylist(id)
    setActiveCuratedPlaylist(null)
    setActiveSidebarAlbum(null)
    setView('songs')
    setOffset(0)
  }

  function openCuratedPlaylist(id: string) {
    setActiveCuratedPlaylist(id)
    setActiveSmartPlaylist(null)
    setActiveSidebarAlbum(null)
    setView('songs')
    setOffset(0)
  }

  function openSidebarAlbum(id: string) {
    setActiveSidebarAlbum(id)
    setActiveSmartPlaylist(null)
    setActiveCuratedPlaylist(null)
    setView('songs')
    setOffset(0)
  }

  async function openAlbum(albumId: string) {
    setSelectedAlbumId(albumId)
    setLoadingAlbumTracks(true)
    try {
      const folderTracks = await fetchTracks(albumId, { includeArchived: false })
      setAlbumTracks(folderTracks)
    } catch {
      setAlbumTracks([])
    } finally {
      setLoadingAlbumTracks(false)
    }
  }

  function handleGenreClick(genre: string) {
    setFilterGenre(genre)
    setView('songs')
    setActiveSmartPlaylist(null)
    setOffset(0)
  }

  function handleArtistClick(artist: string) {
    setFilterArtist(artist)
    setView('songs')
    setActiveSmartPlaylist(null)
    setOffset(0)
  }

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null
    return <span className="ml-1 text-purple-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const activePlaylistName = activeSmartPlaylist
    ? smartPlaylists.find((p) => p.id === activeSmartPlaylist)?.name
    : activeCuratedPlaylist
    ? curatedPlaylists.find((p) => p.id === activeCuratedPlaylist)?.name
    : activeSidebarAlbum
    ? sidebarAlbums.find((a: any) => a.id === activeSidebarAlbum)?.name
    : null

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div
        className="relative flex flex-shrink-0 min-h-0 border-r border-gray-800 bg-gray-950/50"
        style={{ width: browseSidebarCollapsed ? 44 : browseSidebarWidth }}
      >
        {browseSidebarCollapsed ? (
          <div className="flex flex-col items-center pt-3 w-full min-h-0">
            <button
              type="button"
              onClick={() => setBrowseSidebarCollapsed(false)}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
              aria-label="Expand library sidebar"
              title="Expand sidebar"
            >
              <FaChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
        <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Library section */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Library</div>
              <button
                type="button"
                onClick={() => setBrowseSidebarCollapsed(true)}
                className="flex-shrink-0 p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
                aria-label="Collapse library sidebar"
                title="Collapse sidebar"
              >
                <FaChevronLeft className="w-3 h-3" />
              </button>
            </div>
            <nav className="space-y-0.5">
              {([
                { id: 'songs' as BrowseView, icon: FaMusic, label: 'Songs' },
                { id: 'albums' as BrowseView, icon: FaCompactDisc, label: 'Albums' },
                { id: 'artists' as BrowseView, icon: FaUser, label: 'Artists' },
                { id: 'genres' as BrowseView, icon: FaTags, label: 'Genres' },
              ]).map((item) => (
                <button
                  key={item.id}
                  onClick={() => switchView(item.id)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition ${
                    view === item.id && !activeSmartPlaylist
                      ? 'bg-purple-600/20 text-purple-300'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Smart playlists */}
          {smartPlaylists.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Smart Playlists</div>
              <nav className="space-y-0.5">
                {smartPlaylists.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() => openSmartPlaylist(sp.id)}
                    className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition truncate ${
                      activeSmartPlaylist === sp.id
                        ? 'bg-purple-600/20 text-purple-300'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                  >
                    <SmartPlaylistIcon name={sp.name} />
                    <span className="truncate">{sp.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Curated Playlists */}
          {curatedPlaylists.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Playlists</div>
              <nav className="space-y-0.5">
                {curatedPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => openCuratedPlaylist(pl.id)}
                    className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition truncate ${
                      activeCuratedPlaylist === pl.id
                        ? 'bg-purple-600/20 text-purple-300'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                  >
                    <FaList className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
                    <span className="truncate">{pl.name}</span>
                    <span className="ml-auto text-[10px] text-gray-600 flex-shrink-0">{pl.trackIds.length}</span>
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Albums */}
          {sidebarAlbums.filter((a: any) => a.type === 'album').length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Singles & Loose Tracks Albums</div>
              <nav className="space-y-0.5">
                {sidebarAlbums.filter((a: any) => a.type === 'album').map((album: any) => (
                  <SidebarAlbumItem key={album.id} album={album} active={activeSidebarAlbum === album.id} onSelect={openSidebarAlbum} />
                ))}
              </nav>
            </div>
          )}

          {/* EPs */}
          {sidebarAlbums.filter((a: any) => a.type === 'ep').length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">EPs</div>
              <nav className="space-y-0.5">
                {sidebarAlbums.filter((a: any) => a.type === 'ep').map((album: any) => (
                  <SidebarAlbumItem key={album.id} album={album} active={activeSidebarAlbum === album.id} onSelect={openSidebarAlbum} />
                ))}
              </nav>
            </div>
          )}

          {/* Singles */}
          {sidebarAlbums.filter((a: any) => a.type === 'single').length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Singles</div>
              <nav className="space-y-0.5">
                {sidebarAlbums.filter((a: any) => a.type === 'single').map((album: any) => (
                  <SidebarAlbumItem key={album.id} album={album} active={activeSidebarAlbum === album.id} onSelect={openSidebarAlbum} />
                ))}
              </nav>
            </div>
          )}

          {/* Active filters */}
          {(filterGenre || filterArtist) && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Active Filters</div>
              <div className="space-y-1">
                {filterGenre && (
                  <div className="flex items-center justify-between bg-purple-900/20 px-3 py-1.5 rounded-md text-xs">
                    <span className="text-purple-300 truncate">Genre: {filterGenre}</span>
                    <button onClick={() => setFilterGenre(null)} className="text-gray-500 hover:text-white ml-2">×</button>
                  </div>
                )}
                {filterArtist && (
                  <div className="flex items-center justify-between bg-blue-900/20 px-3 py-1.5 rounded-md text-xs">
                    <span className="text-blue-300 truncate">Artist: {filterArtist}</span>
                    <button onClick={() => setFilterArtist(null)} className="text-gray-500 hover:text-white ml-2">×</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
        <div
          onPointerDown={handleBrowseSidebarResizeStart}
          className={`absolute right-0 top-0 z-10 h-full w-2 -mr-1 cursor-col-resize flex justify-center border-r border-transparent hover:border-purple-500/40 ${
            isResizingBrowseSidebar ? 'bg-purple-500/25 border-purple-400/50' : 'hover:bg-purple-500/10'
          }`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize library sidebar"
          title="Drag to resize"
        />
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Header bar */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">
              {activePlaylistName || (
                view === 'songs' ? 'Songs' :
                view === 'albums' ? (selectedAlbumId ? albums.find(a => a.id === selectedAlbumId)?.name || 'Album' : 'Albums') :
                view === 'artists' ? 'Artists' : 'Genres'
              )}
            </h2>
            {view === 'songs' && !activeSmartPlaylist && (
              <span className="text-sm text-gray-500">{total.toLocaleString()} tracks</span>
            )}
            {selectedAlbumId && (
              <button onClick={() => setSelectedAlbumId(null)} className="text-sm text-purple-400 hover:text-purple-300">
                ← Back to Albums
              </button>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setOffset(0) }}
              placeholder="Search..."
              className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-48 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
              aria-label="Search tracks"
            />
            {view === 'songs' && tracks.length > 0 && (
              <button
                onClick={handlePlayAll}
                className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
              >
                <FaPlay className="w-3 h-3" />
                <span>Play All</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-center py-16 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Songs View */}
              {(view === 'songs' || activeSmartPlaylist || activeCuratedPlaylist || activeSidebarAlbum) && (
                <SongsTable
                  tracks={tracks}
                  currentTrackId={currentTrack?.id}
                  isPlaying={isPlaying}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  onPlay={handlePlayTrack}
                  onRate={handleRate}
                  sortIcon={sortIcon}
                />
              )}

              {/* Albums View — grouped by type */}
              {view === 'albums' && !selectedAlbumId && (
                <div className="space-y-8">
                  <AlbumSection title="EPs" items={albums.filter((a: any) => a.type === 'ep')} onOpen={openAlbum} />
                  <AlbumSection title="Albums" items={albums.filter((a: any) => a.type === 'album')} onOpen={openAlbum} />
                  <AlbumSection title="Singles" items={albums.filter((a: any) => a.type === 'single')} onOpen={openAlbum} />
                  {albums.length === 0 && (
                    <div className="text-center py-12 text-gray-500">No albums found</div>
                  )}
                </div>
              )}

              {/* Album detail */}
              {view === 'albums' && selectedAlbumId && (
                loadingAlbumTracks ? (
                  <div className="text-center py-12 text-gray-500">Loading tracks...</div>
                ) : (
                  <SongsTable
                    tracks={albumTracks}
                    currentTrackId={currentTrack?.id}
                    isPlaying={isPlaying}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    onPlay={(track, idx) => {
                      playTrack(track as any, albumTracks as any)
                      recordTrackPlay(track.id, { source: 'album' })
                    }}
                    onRate={handleRate}
                    sortIcon={sortIcon}
                    showTrackNumber
                  />
                )
              )}

              {/* Artists View */}
              {view === 'artists' && (
                <div className="space-y-1">
                  {artists.map((artist) => (
                    <button
                      key={artist.name}
                      onClick={() => handleArtistClick(artist.name)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-800/30 transition text-left"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                          <FaUser className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <div className="font-medium">{artist.name}</div>
                          <div className="text-xs text-gray-500">{artist.trackCount} track{artist.trackCount !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <FaChevronRight className="w-3 h-3 text-gray-600" />
                    </button>
                  ))}
                  {artists.length === 0 && (
                    <div className="text-center py-12 text-gray-500">No artists found</div>
                  )}
                </div>
              )}

              {/* Genres View */}
              {view === 'genres' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {genres.map((genre) => (
                    <button
                      key={genre.name}
                      onClick={() => handleGenreClick(genre.name)}
                      className="bg-gradient-to-br from-purple-900/30 to-blue-900/20 border border-gray-800 rounded-lg p-4 hover:border-purple-600/50 transition text-left"
                    >
                      <div className="font-medium">{genre.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{genre.trackCount} track{genre.trackCount !== 1 ? 's' : ''}</div>
                    </button>
                  ))}
                  {genres.length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-500">
                      No genres found. Add genres to your tracks to see them here.
                    </div>
                  )}
                </div>
              )}

              {/* Pagination for songs */}
              {view === 'songs' && !activeSmartPlaylist && !activeCuratedPlaylist && !activeSidebarAlbum && total > LIMIT && (
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                      disabled={offset === 0}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setOffset(offset + LIMIT)}
                      disabled={offset + LIMIT >= total}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ===== Songs Table ===== */

function SongsTable({
  tracks,
  currentTrackId,
  isPlaying,
  sortField,
  sortDir,
  onSort,
  onPlay,
  onRate,
  sortIcon,
  showTrackNumber = false,
}: {
  tracks: Track[]
  currentTrackId?: string
  isPlaying: boolean
  sortField: SortField
  sortDir: 'asc' | 'desc'
  onSort: (field: SortField) => void
  onPlay: (track: Track, idx: number) => void
  onRate: (trackId: string, rating: number) => void
  sortIcon: (field: SortField) => React.ReactNode
  showTrackNumber?: boolean
}) {
  const [visibleOptional, setVisibleOptional] = useState<Set<SongTableOptionalColumn>>(() => loadSongTableColumnVisibility())
  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number } | null>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const [trackMenu, setTrackMenu] = useState<{ x: number; y: number; track: Track } | null>(null)
  const trackMenuRef = useRef<HTMLDivElement>(null)
  const [authUser, setAuthUser] = useState<{ isAdmin: boolean } | null>(null)
  const [fanPlaylists, setFanPlaylists] = useState<{ id: string; name: string }[]>([])
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(() => new Set())
  const [cartIds, setCartIds] = useState<Set<string>>(() => new Set())
  const [vaultFavoriteIds, setVaultFavoriteIds] = useState<Set<string>>(() => new Set())
  const [fanDataLoading, setFanDataLoading] = useState(false)
  const [fanActionBusy, setFanActionBusy] = useState(false)

  const loadFanLists = useCallback(async () => {
    const sr = await fetch('/api/auth/session', { credentials: 'include' })
    const sd = await sr.json().catch(() => ({}))
    if (!sr.ok || !sd.authenticated || !sd.user?.id) {
      setAuthUser(null)
      setFanPlaylists([])
      setWishlistIds(new Set())
      setCartIds(new Set())
      setVaultFavoriteIds(new Set())
      return
    }
    setAuthUser({ isAdmin: !!sd.isAdmin })
    setFanDataLoading(true)
    try {
      const [plRes, colRes] = await Promise.all([
        fetch('/api/fan/playlists', { credentials: 'include' }),
        fetch('/api/fan/library-collections', { credentials: 'include' }),
      ])
      if (plRes.ok) {
        const pj = await plRes.json().catch(() => ({}))
        const pls = (pj.playlists || []) as { id: string; name: string }[]
        setFanPlaylists(pls.map((p) => ({ id: p.id, name: p.name })))
      } else {
        setFanPlaylists([])
      }
      if (colRes.ok) {
        const cj = await colRes.json().catch(() => ({}))
        setWishlistIds(new Set((cj.wishlist || []) as string[]))
        setCartIds(new Set((cj.cart || []) as string[]))
        setVaultFavoriteIds(new Set((cj.vaultFavorites || []) as string[]))
      } else {
        setWishlistIds(new Set())
        setCartIds(new Set())
        setVaultFavoriteIds(new Set())
      }
    } finally {
      setFanDataLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFanLists()
  }, [loadFanLists])

  const col = (key: SongTableOptionalColumn) => visibleOptional.has(key)

  const toggleOptionalColumn = useCallback((key: SongTableOptionalColumn) => {
    setVisibleOptional((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size <= 1) return prev
        next.delete(key)
      } else {
        next.add(key)
      }
      try {
        localStorage.setItem(
          SONG_TABLE_COLUMNS_STORAGE_KEY,
          JSON.stringify(SONG_TABLE_OPTIONAL_COLUMNS.filter((k) => next.has(k)))
        )
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!trackMenu && !columnMenu) return
    const closeAll = () => {
      setTrackMenu(null)
      setColumnMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll()
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (trackMenuRef.current?.contains(t)) return
      if (columnMenuRef.current?.contains(t)) return
      closeAll()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [trackMenu, columnMenu])

  const openTrackMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    setColumnMenu(null)
    setTrackMenu({ x: e.clientX, y: e.clientY, track })
  }

  const onHeaderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setTrackMenu(null)
    setColumnMenu({ x: e.clientX, y: e.clientY })
  }

  const patchCollection = async (
    collection: 'wishlist' | 'cart' | 'vault_favorites',
    trackId: string,
    add: boolean
  ) => {
    setFanActionBusy(true)
    if (collection === 'wishlist') {
      setWishlistIds((s) => {
        const n = new Set(s)
        if (add) n.add(trackId)
        else n.delete(trackId)
        return n
      })
    } else if (collection === 'cart') {
      setCartIds((s) => {
        const n = new Set(s)
        if (add) n.add(trackId)
        else n.delete(trackId)
        return n
      })
    } else {
      setVaultFavoriteIds((s) => {
        const n = new Set(s)
        if (add) n.add(trackId)
        else n.delete(trackId)
        return n
      })
    }
    try {
      const res = await fetch('/api/fan/library-collections', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, trackId, add }),
      })
      if (!res.ok) await loadFanLists()
    } catch {
      await loadFanLists()
    } finally {
      setFanActionBusy(false)
    }
  }

  const addTrackToFanPlaylist = async (playlistId: string, trackId: string) => {
    setFanActionBusy(true)
    try {
      await fetch(`/api/fan/playlists/${playlistId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addTrackId: trackId }),
      })
    } finally {
      setFanActionBusy(false)
    }
    setTrackMenu(null)
  }

  const createPlaylistAndAddTrack = async (trackId: string) => {
    const name = typeof window !== 'undefined' ? window.prompt('New playlist name') : null
    if (!name?.trim()) return
    setFanActionBusy(true)
    try {
      const cr = await fetch('/api/fan/playlists', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const cj = await cr.json().catch(() => ({}))
      if (!cr.ok || !cj.playlist?.id) return
      await fetch(`/api/fan/playlists/${cj.playlist.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addTrackId: trackId }),
      })
      await loadFanLists()
    } finally {
      setFanActionBusy(false)
    }
    setTrackMenu(null)
  }

  if (!tracks.length) {
    return <div className="text-center py-12 text-gray-500">No tracks found</div>
  }

  return (
    <div className="overflow-x-auto relative">
      {trackMenu && (
        <div
          ref={trackMenuRef}
          aria-label="Track actions"
          className="fixed z-[200] max-h-[min(24rem,70vh)] w-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
          style={{ left: trackMenu.x, top: trackMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!authUser ? (
            <div className="px-3 py-2 text-sm text-gray-300">
              <p className="mb-2">
                Sign in to save tracks to your profile: wishlist, cart, personal playlists, and vault favorites.
              </p>
              <Link
                href={`/fan/login?next=${encodeURIComponent(
                  typeof window !== 'undefined'
                    ? `${window.location.pathname}${window.location.search || ''}`
                    : '/music-library'
                )}`}
                className="text-purple-400 hover:text-purple-300"
                onClick={() => setTrackMenu(null)}
              >
                Sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 truncate">
                {trackMenu.track.title}
              </div>
              <div className="border-t border-gray-800" />
              <button
                type="button"
                disabled={fanActionBusy || fanDataLoading}
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() => {
                  const t = trackMenu.track
                  void patchCollection('wishlist', t.id, !wishlistIds.has(t.id))
                }}
              >
                {wishlistIds.has(trackMenu.track.id) ? 'Remove from wishlist' : 'Add to wishlist'}
              </button>
              <button
                type="button"
                disabled={fanActionBusy || fanDataLoading}
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() => {
                  const t = trackMenu.track
                  void patchCollection('cart', t.id, !cartIds.has(t.id))
                }}
              >
                {cartIds.has(trackMenu.track.id) ? 'Remove from cart' : 'Add to cart'}
              </button>
              <button
                type="button"
                disabled={fanActionBusy || fanDataLoading}
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() => {
                  const t = trackMenu.track
                  void patchCollection('vault_favorites', t.id, !vaultFavoriteIds.has(t.id))
                }}
              >
                {vaultFavoriteIds.has(trackMenu.track.id)
                  ? 'Remove from vault favorites'
                  : 'Add to vault favorites'}
              </button>
              <div className="my-1 border-t border-gray-800" />
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Personal playlists
              </div>
              {fanPlaylists.length === 0 && (
                <p className="px-3 py-1 text-xs text-gray-500">No playlists yet — create one below.</p>
              )}
              {fanPlaylists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={fanActionBusy}
                  className="w-full truncate px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                  onClick={() => addTrackToFanPlaylist(p.id, trackMenu.track.id)}
                >
                  {`Add to "${p.name}"`}
                </button>
              ))}
              <button
                type="button"
                disabled={fanActionBusy}
                className="w-full px-3 py-2 text-left text-sm text-purple-300 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() => createPlaylistAndAddTrack(trackMenu.track.id)}
              >
                New playlist…
              </button>
            </>
          )}
        </div>
      )}
      {columnMenu && (
        <div
          ref={columnMenuRef}
          aria-label="Choose visible columns"
          className="fixed z-[201] min-w-[200px] rounded-lg border border-gray-700 bg-gray-900 py-2 shadow-xl"
          style={{ left: columnMenu.x, top: columnMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Columns</div>
          <div className="border-t border-gray-800 pt-1">
            {SONG_TABLE_OPTIONAL_COLUMNS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800/80"
              >
                <input
                  type="checkbox"
                  checked={visibleOptional.has(key)}
                  disabled={visibleOptional.has(key) && visibleOptional.size <= 1}
                  onChange={() => toggleOptionalColumn(key)}
                  className="rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                />
                <span>{SONG_TABLE_COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b border-gray-800 text-gray-500"
            onContextMenu={onHeaderContextMenu}
            title="Right-click to show or hide columns"
          >
            <th className="w-10 py-2 px-2 text-left">#</th>
            <th className="py-2 px-2 text-left cursor-pointer hover:text-white" onClick={() => onSort('title')}>
              Title{sortIcon('title')}
            </th>
            {col('artist') && (
              <th className="py-2 px-2 text-left cursor-pointer hover:text-white" onClick={() => onSort('artist')}>
                Artist{sortIcon('artist')}
              </th>
            )}
            {col('album') && (
              <th className="py-2 px-2 text-left">
                Album
              </th>
            )}
            {col('genre') && (
              <th className="py-2 px-2 text-left cursor-pointer hover:text-white" onClick={() => onSort('genre')}>
                Genre{sortIcon('genre')}
              </th>
            )}
            {col('bpm') && (
              <th className="py-2 px-2 text-center cursor-pointer hover:text-white" onClick={() => onSort('bpm')}>
                BPM{sortIcon('bpm')}
              </th>
            )}
            {col('key') && (
              <th className="py-2 px-2 text-center cursor-pointer hover:text-white" onClick={() => onSort('key')}>
                Key{sortIcon('key')}
              </th>
            )}
            {col('rating') && (
              <th className="py-2 px-2 text-center cursor-pointer hover:text-white" onClick={() => onSort('rating')}>
                Rating{sortIcon('rating')}
              </th>
            )}
            {col('play_count') && (
              <th className="py-2 px-2 text-center cursor-pointer hover:text-white" onClick={() => onSort('play_count')}>
                Plays{sortIcon('play_count')}
              </th>
            )}
            {col('duration') && (
              <th className="py-2 px-2 text-right cursor-pointer hover:text-white" onClick={() => onSort('duration')}>
                Time{sortIcon('duration')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, i) => {
            const isCurrent = currentTrackId === track.id
            return (
              <tr
                key={track.id}
                className={`border-b border-gray-800/30 hover:bg-gray-800/20 transition cursor-pointer group ${
                  isCurrent ? 'bg-purple-900/15' : ''
                }`}
                onDoubleClick={() => onPlay(track, i)}
                onContextMenu={(e) => openTrackMenu(e, track)}
              >
                <td className="py-2 px-2 text-gray-600 relative">
                  <span className="group-hover:invisible">
                    {showTrackNumber && track.track_number ? track.track_number : i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPlay(track, i)}
                    onContextMenu={(e) => openTrackMenu(e, track)}
                    className="absolute inset-0 flex items-center justify-center invisible group-hover:visible text-white"
                    aria-label={`Play ${track.title}`}
                  >
                    <FaPlay className="w-3 h-3" />
                  </button>
                  {isCurrent && isPlaying && (
                    <span
                      className="absolute inset-0 flex items-center justify-center text-purple-400 group-hover:invisible pointer-events-none"
                      aria-hidden
                    >
                      <span className="flex space-x-0.5">
                        <span className="w-0.5 h-3 bg-purple-400 animate-pulse" />
                        <span className="w-0.5 h-2 bg-purple-400 animate-pulse" style={{ animationDelay: '0.15s' }} />
                        <span className="w-0.5 h-3.5 bg-purple-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
                      </span>
                    </span>
                  )}
                </td>
                <td className="py-2 px-2" onContextMenu={(e) => openTrackMenu(e, track)}>
                  <div className="flex items-center space-x-2">
                    {track.artwork && (
                      <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-gray-800">
                        <Image
                          src={resolveImageUrl(track.artwork)}
                          alt=""
                          width={32}
                          height={32}
                          className="object-cover w-full h-full"
                        />
                      </div>
                    )}
                    <span className={`truncate max-w-[250px] ${isCurrent ? 'text-purple-300 font-medium' : ''}`}>
                      {track.title}
                    </span>
                  </div>
                </td>
                {col('artist') && (
                  <td className="py-2 px-2 text-gray-400 truncate max-w-[150px]">{track.artist}</td>
                )}
                {col('album') && (
                  <td className="py-2 px-2 text-gray-500 truncate max-w-[140px]">
                    {track.album ? (
                      <span className="flex items-center space-x-1">
                        {track.albumType === 'ep' && <span className="text-[9px] font-bold text-teal-500 bg-teal-500/10 px-1 rounded">EP</span>}
                        <span className="truncate">{track.album}</span>
                      </span>
                    ) : '—'}
                  </td>
                )}
                {col('genre') && (
                  <td className="py-2 px-2 text-gray-500 truncate max-w-[120px]">{track.genre || '—'}</td>
                )}
                {col('bpm') && (
                  <td className="py-2 px-2 text-center text-gray-400 font-mono text-xs">{track.bpm || '—'}</td>
                )}
                {col('key') && (
                  <td className="py-2 px-2 text-center text-gray-400 text-xs">{track.key_signature || '—'}</td>
                )}
                {col('rating') && (
                  <td className="py-2 px-2" onContextMenu={(e) => openTrackMenu(e, track)}>
                    <StarRating
                      rating={track.rating || 0}
                      onRate={(r) => onRate(track.id, r)}
                      size="sm"
                    />
                  </td>
                )}
                {col('play_count') && (
                  <td className="py-2 px-2 text-center text-gray-500 text-xs font-mono">
                    {track.play_count || 0}
                  </td>
                )}
                {col('duration') && (
                  <td className="py-2 px-2 text-right text-gray-500 text-xs font-mono">
                    {track.duration ? formatDuration(track.duration) : '—'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AlbumSection({ title, items, onOpen }: { title: string; items: any[]; onOpen: (id: string) => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((album) => (
          <button
            key={album.id}
            onClick={() => onOpen(album.id)}
            className="group text-left bg-gray-900/30 rounded-lg p-3 hover:bg-gray-800/40 transition"
          >
            <div className="aspect-square rounded-md overflow-hidden bg-gray-800 mb-2 relative">
              {album.artwork ? (
                <Image
                  src={resolveImageUrl(album.artwork)}
                  alt={album.name}
                  fill
                  className="object-cover"
                  sizes="200px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FaCompactDisc className="w-12 h-12 text-gray-700" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <FaPlay className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="truncate text-sm font-medium">{album.name}</div>
            <div className="truncate text-xs text-gray-400">{album.albumArtist}{album.year ? ` · ${album.year}` : ''}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function SidebarAlbumItem({ album, active, onSelect }: { album: any; active: boolean; onSelect: (id: string) => void }) {
  const iconColor =
    album.type === 'ep' ? 'text-teal-400' :
    album.type === 'single' ? 'text-pink-400' :
    'text-amber-400'

  return (
    <button
      onClick={() => onSelect(album.id)}
      className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-sm transition truncate ${
        active
          ? 'bg-purple-600/20 text-purple-300'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
      }`}
    >
      <FaCompactDisc className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
      <span className="truncate">{album.name}</span>
      {album.year && <span className="ml-auto text-[10px] text-gray-600 flex-shrink-0">{album.year}</span>}
    </button>
  )
}

function SmartPlaylistIcon({ name }: { name: string }) {
  const lower = name.toLowerCase()
  if (lower.includes('recent')) return <FaHistory className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
  if (lower.includes('most') || lower.includes('top')) return <FaFire className="w-3.5 h-3.5 flex-shrink-0 text-orange-400" />
  if (lower.includes('rated')) return <FaStar className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />
  if (lower.includes('energy') || lower.includes('high')) return <FaFire className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
  if (lower.includes('chill')) return <FaClock className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" />
  if (lower.includes('added')) return <FaPlus className="w-3.5 h-3.5 flex-shrink-0 text-green-400" />
  return <FaList className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
