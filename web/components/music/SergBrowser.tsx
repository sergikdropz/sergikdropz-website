// @ts-nocheck
'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FaPlay, FaMusic, FaCompactDisc, FaUser, FaTags, FaList, FaTh, FaBars, FaHistory, FaFire, FaStar, FaPlus, FaMinus, FaClock, FaChevronRight, FaChevronLeft, FaChevronUp, FaChevronDown, FaFolder, FaEdit, FaTrash, FaCopy, FaExternalLinkAlt, FaGripVertical, FaEye, FaEyeSlash, FaBolt, FaFileAlt, FaSync, FaImage, FaUpload, FaTimes, FaRandom, FaClone, FaSortAlphaDown, FaSortAmountDown, FaInfoCircle } from 'react-icons/fa'
import { createdDateFromTrack } from '@/lib/music-library/track-created-date'
import StarRating from './StarRating'
import {
  fetchBrowse,
  fetchBrowseSongsAll,
  fetchFolders,
  fetchPlaylists,
  fetchTracks,
  fetchTracksByIds,
  fetchTracksSummary,
  fetchAllTracksSummaryForHydration,
  extractTracksFromJsonByAlbumName,
  peekCachedMusicLibrary,
  rateTrack,
  recordTrackPlay,
  fetchSmartPlaylists,
  resolveSmartPlaylist,
  updateTrack,
  updatePlaylist,
  createPlaylist,
  deletePlaylist,
  updateFolder,
  createFolder,
  invalidateMusicLibraryCache,
  linkDroppedFilesToPlaylist,
  PlaylistDropTooLargeError,
  type Track,
  type BrowseView,
  type SmartPlaylist,
  type Playlist,
  type FolderItem,
} from '@/utils/musicLibraryApi'
import { sonicDnaCompletenessPercent, sonicDnaStatusLabel } from '@/lib/audio/sonic-dna-quality'
import { applySonicDnaAnalysisToTrack, displayTrackBpm, displayTrackGenre, displayTrackKey, displayTrackSubgenre, keySignatureFromSonicDnaReport } from '@/lib/audio/track-display'
import { genrePickerModel, applyPreferredGenreToSonicDna, preferredGenreDirective, subgenresForGenre } from '@/lib/audio/groove-class-options'
import { appendSonicDnaLookupParams } from '@/lib/audio/sonic-dna-query'
import SonicDnaReportModal from '@/components/music/SonicDnaReportModal'
import PlaylistDropProgress, {
  type PlaylistDropItem,
} from '@/components/music/PlaylistDropProgress'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { catalogArtworkForRelease, collectEpCoverTiles, dedupeArtworkByReleaseLabel } from '@/lib/ep-cover-art'
import { analyzeBeatCountFromUrl, formatClock, formatBpmAccuracyNote, recordTapTempo, scoreBpmSuggestionAccuracy, tapTempoDelta, TAP_TEMPO_MIN_INTERVALS, TAP_TEMPO_RESET_MS, TAP_TEMPO_SECTION_BEATS, type BeatCountCandidate, type BpmAccuracyScore } from '@/lib/audio/beat-count'
import { analyzeRootKeyFromUrl, pickBestKeyFromSources, type RankedKeyPick } from '@/lib/audio/root-key'
import {
  formatBytesMb,
  formatDurationClock,
  isConvertibleOversizeAudio,
  isWithinDirectIngestLimit,
  maxDirectBytesForDuration,
  PLAYLIST_DROP_MAX_DIRECT_BYTES,
  probeAudioFileDuration,
} from '@/lib/audio/playlist-drop-limits'
import {
  stripArtworkCacheBust,
  withArtworkCacheBust,
  normalizeArtworkPatch,
  isUploadedFolderArtwork,
  isImageFile,
  artworkUploadRejectReason,
  folderIdFromPlaylistId,
  playlistIdForFolder,
  isCollectionPlaylist,
  catalogItemMatchesCoverEvent,
  playerTrackMatchesCoverEvent,
  stampAllTrackArtwork,
  applyEpArtworkToFolderTracks,
  collectLibraryCoverPool,
  assignCrateMosaicCovers,
  subscribeCatalogSync,
  emitCatalogSync,
  type CatalogSyncEvent,
} from '@/lib/catalog-sync'
import { useCatalogSync } from '@/contexts/CatalogSyncContext'
import { useMusicPlayer, type PlayerSource } from '@/contexts/MusicPlayerContext'
import { readCatalogRandomSetting } from '@/lib/audio/catalog-random'
import {
  COLUMN_SORT_FIELD,
  SONG_TABLE_COLUMN_LABELS,
  SONG_TABLE_COLUMNS_STORAGE_KEY,
  SONG_TABLE_OPTIONAL_COLUMNS,
  columnHeaderAlign,
  columnHeaderLabel,
  columnHeaderUppercase,
  loadSongTableColumnOrder,
  loadSongTableColumnVisibility,
  loadSongTableSort,
  reorderColumns,
  saveSongTableColumnOrder,
  saveSongTableSort,
  sortSongTableTracks,
  visibleColumnOrder,
  visibleSelectionRangeIds,
  type SongTableOptionalColumn,
  type SongTableReorderableColumn,
  type SongTableSortField,
} from '@/lib/music-vault/song-table-columns'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'
import PopupMenuDragHeader from '@/components/ui/PopupMenuDragHeader'

interface SergBrowserProps {
  onClose?: () => void
  /** Admin catalog tools (edit/archive). Defaults to true on /admin routes. */
  adminMode?: boolean
  /** Controlled search from parent (e.g. Music Vault). Hides the inline search when set. */
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
}

type SortField = SongTableSortField
const ALBUM_LAYOUT_STORAGE_KEY = 'serg-browser-albums-layout'
const LEGACY_ALBUM_LAYOUT_STORAGE_KEY = 'itunes-browser-albums-layout'
const EP_COVER_CHOICES = collectEpCoverTiles()

type AlbumLayout = 'list' | 'tiles'

function loadAlbumLayout(): AlbumLayout {
  if (typeof window === 'undefined') return 'tiles'
  try {
    const saved =
      localStorage.getItem(ALBUM_LAYOUT_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_ALBUM_LAYOUT_STORAGE_KEY)
    if (saved === 'tiles' || saved === 'list') {
      localStorage.setItem(ALBUM_LAYOUT_STORAGE_KEY, saved)
      return saved
    }
    return 'tiles'
  } catch {
    return 'tiles'
  }
}

const BROWSE_SIDEBAR_W_DEFAULT = 224 // matches previous w-56
const BROWSE_SIDEBAR_W_MIN = 176
const BROWSE_SIDEBAR_W_MAX = 480

/** Last SongsTable the user clicked — scopes ⌘A / Escape when many album tables are on screen. */
let activeSongsTableId: string | null = null
let songsTableIdSeq = 0

type AlbumTile = {
  id: string
  name: string
  type: string
  artwork?: string
  year?: number
  albumArtist?: string
  hidden?: boolean
}

function firstArtworkSrc(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Full created/export date (YYYY-MM-DD) from the date_created column or metadata. */
function trackDateCreatedIso(track: Pick<Track, 'metadata' | 'year' | 'date_created'>): string {
  return createdDateFromTrack(track) || ''
}

function isLocalCoverUrl(src: string): boolean {
  const resolved = resolveImageUrl(src)
  return resolved.startsWith('/images/') || resolved.startsWith('/audio/')
}

function folderArtworkSrc(album: Pick<AlbumTile, 'name' | 'artwork'>, tracks: Track[] = []): string {
  // Explicit folder/album cover always wins — never let track/catalog art override a set cover.
  const explicit = typeof album.artwork === 'string' ? album.artwork.trim() : ''
  if (explicit) return explicit
  const values = [
    ...tracks.map((track) => track.artwork),
    catalogArtworkForRelease(album.name),
  ]
  const usable = values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return usable.find(isLocalCoverUrl) || firstArtworkSrc(...usable)
}

function withResolvedArtwork(tile: AlbumTile, tracks: Track[] = []): AlbumTile {
  const resolved = folderArtworkSrc(tile, tracks)
  return {
    ...tile,
    artwork: resolved || undefined,
  }
}

/** Keep freshly uploaded covers when a subsequent browse/cache load still has catalog/track fallbacks. */
function mergeAlbumTilesPreservingUploads(incoming: AlbumTile[], previous: AlbumTile[]): AlbumTile[] {
  if (!previous.length) return incoming
  const prevById = new Map(previous.map((tile) => [tile.id, tile]))
  return incoming.map((tile) => {
    const prev = prevById.get(tile.id)
    if (!prev?.artwork) return tile
    if (!isUploadedFolderArtwork(prev.artwork)) return tile
    if (isUploadedFolderArtwork(tile.artwork)) {
      const incoming = tile.artwork || ''
      const previous = prev.artwork
      if (stripArtworkCacheBust(incoming) === stripArtworkCacheBust(previous)) {
        const keepLiveBust = /[?&]v=/.test(previous) && !/[?&]v=/.test(incoming)
        return keepLiveBust ? { ...tile, artwork: previous } : tile
      }
      return { ...tile, artwork: incoming || previous }
    }
    return { ...tile, artwork: prev.artwork }
  })
}

type FolderMeta = {
  hidden: boolean
  type: string
}

const EP_PARENT_FOLDER_ID = 'folder-eps'

function flattenFolderRows(items: FolderItem[] | any[]): any[] {
  const out: any[] = []
  const walk = (nodes: any[]) => {
    for (const item of nodes || []) {
      out.push(item)
      if (Array.isArray(item.children) && item.children.length) walk(item.children)
    }
  }
  walk(items)
  return out
}

async function ensureFolderAsRelease(
  folderId: string,
  type: 'ep' | 'album',
  seed: { name: string; artwork?: string; year?: number; albumArtist?: string }
) {
  const parentId = type === 'ep' ? EP_PARENT_FOLDER_ID : null
  const payload: Partial<FolderItem> = {
    name: seed.name,
    type,
    hidden: false,
    parentId,
    artwork: seed.artwork,
    year: seed.year,
    albumArtist: seed.albumArtist,
  }
  try {
    await updateFolder(folderId, payload)
  } catch {
    await createFolder({
      id: folderId,
      ...payload,
    })
  }
}

const ALBUM_EP_TYPES = new Set(['album', 'ep'])

/** Display groups. Folder `type: album` is a crate (vibe collection), not a commercial LP. */
const CATALOG_SECTIONS: { type: string; label: string; blurb?: string }[] = [
  { type: 'ep', label: 'EPs' },
  {
    type: 'album',
    label: 'Crates',
    blurb: 'Vibe collections of loose singles — assigned or waiting for an EP — tuned to one mood.',
  },
]

function collectAlbumAndEpTiles(items: FolderItem[] | any[]): AlbumTile[] {
  const out: AlbumTile[] = []
  const seen = new Set<string>()

  const walk = (nodes: any[]) => {
    for (const item of nodes || []) {
      const type = String(item?.type || '')
      if (ALBUM_EP_TYPES.has(type) && item?.id && !seen.has(item.id)) {
        seen.add(item.id)
        const firstTrack = Array.isArray(item.tracks) ? item.tracks[0] : undefined
        out.push({
          id: item.id,
          name: item.name,
          type,
          artwork:
            firstArtworkSrc(item.artwork, item.artwork_url) ||
            firstArtworkSrc(firstTrack?.artwork, firstTrack?.artwork_url) ||
            undefined,
          year: item.year,
          albumArtist: item.albumArtist || item.album_artist || item.metadata?.album_artist || 'SERGIK',
          hidden: !!(item.hidden || item.is_hidden),
        })
      }
      if (Array.isArray(item.children) && item.children.length) walk(item.children)
    }
  }

  walk(items)
  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'ep' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function toAlbumTiles(albums: any[]): AlbumTile[] {
  return (albums || [])
    .filter((a) => ALBUM_EP_TYPES.has(String(a?.type || '')))
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      artwork:
        firstArtworkSrc(a.artwork, a.artwork_url) || undefined,
      year: a.year,
      albumArtist: a.albumArtist || a.album_artist || a.metadata?.album_artist || 'SERGIK',
      hidden: !!(a.hidden || a.is_hidden),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'ep' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

const SERGIK_PLAYLIST_DRAG_MIME = 'application/x-sergik-playlist-tracks'
const SERGIK_ARTWORK_DRAG_MIME = 'application/x-sergik-artwork-url'

function dataTransferHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types || []).includes('Files')
}

function playlistDragHasTracks(dt: DataTransfer | null): boolean {
  if (!dt) return false
  const types = Array.from(dt.types || [])
  if (types.includes(SERGIK_PLAYLIST_DRAG_MIME)) return true
  // Chrome/Safari often omit custom MIME from `types` during dragover; row drags also set text/plain.
  return types.includes('text/plain') && !types.includes('Files')
}

function parsePlaylistDragTrackIds(raw: string): string[] {
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
  } catch {
    /* csv fallback */
  }
  return raw.split(',').map((part) => part.trim()).filter(Boolean)
}

type ArtworkChoice = { id: string; src: string; label: string }

function imageFileFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null
  const files = Array.from(dt.files || [])
  return files.find(isImageFile) || null
}

function artworkUrlFromDataTransfer(dt: DataTransfer | null): string | null {
  if (!dt) return null
  const custom = dt.getData(SERGIK_ARTWORK_DRAG_MIME)?.trim()
  if (custom) return custom
  const uriList = dt.getData('text/uri-list')?.trim()
  const plain = dt.getData('text/plain')?.trim()
  const raw = (uriList || plain || '').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
  if (!raw || raw.startsWith('file:')) return null
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw
  return null
}

function dataTransferHasArtworkPayload(dt: DataTransfer | null): boolean {
  if (!dt) return false
  const types = Array.from(dt.types || [])
  if (types.includes(SERGIK_ARTWORK_DRAG_MIME)) return true
  if (types.includes('Files')) return true
  if (types.includes('text/uri-list')) return true
  return false
}

/** Files list is empty during dragover — pick dropEffect from types, not files. */
function artworkDropEffect(dt: DataTransfer): DataTransfer['dropEffect'] {
  const types = Array.from(dt.types || [])
  if (types.includes('Files') || types.includes(SERGIK_ARTWORK_DRAG_MIME)) return 'copy'
  if (types.includes('text/uri-list')) return 'link'
  return 'copy'
}

/** Move selected tracks so they land before `targetIndex` in the original list. */
function reorderTracksByIds(list: Track[], movingIds: string[], targetIndex: number): Track[] {
  const idSet = new Set(movingIds)
  const moving = list.filter((t) => idSet.has(t.id))
  if (!moving.length) return list
  const rest = list.filter((t) => !idSet.has(t.id))
  const targetId = list[targetIndex]?.id
  let insertAt = targetId ? rest.findIndex((t) => t.id === targetId) : rest.length
  if (insertAt < 0) insertAt = rest.length
  return [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)]
}

function withAlbumName(tracks: Track[], albumName?: string): Track[] {
  if (!albumName) return tracks
  return tracks.map((track) => ({ ...track, album: track.album || albumName }))
}

function withEpArtworkOnCrateTracks(
  grouped: Record<string, Track[]>,
  albums: Array<Pick<AlbumTile, 'id' | 'name' | 'type' | 'artwork'>>,
): Record<string, Track[]> {
  const crateFolderIds = new Set(albums.filter((album) => album.type === 'album').map((album) => album.id))
  const crateNames = new Set(albums.filter((album) => album.type === 'album').map((album) => album.name))
  if (!crateFolderIds.size) return grouped
  return applyEpArtworkToFolderTracks(grouped, albums, { crateFolderIds, crateNames })
}

function withTrackOrder(tracks: Track[]): Track[] {
  return tracks.map((track, index) => ({
    ...track,
    display_order: index,
    track_number: index + 1,
  }))
}

function dedupeTracksById(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  return tracks.filter((track) => {
    if (!track?.id || seen.has(track.id)) return false
    seen.add(track.id)
    return true
  })
}

const FOLDER_TRACK_PAGE = 200

async function loadTracksForAlbumFolder(
  folderId: string,
  playlistTrackIds: string[] = [],
  albumName?: string,
): Promise<Track[]> {
  try {
    const first = await fetchTracksSummary(folderId, {
      includeArchived: false,
      limit: FOLDER_TRACK_PAGE,
      offset: 0,
    })
    const tracks = [...(first.tracks || [])]
    let offset = tracks.length
    let hasMore = Boolean(first.hasMore)
    while (hasMore && tracks.length < 800) {
      const next = await fetchTracksSummary(folderId, {
        includeArchived: false,
        limit: FOLDER_TRACK_PAGE,
        offset,
      })
      const batch = next.tracks || []
      tracks.push(...batch)
      offset += batch.length
      hasMore = Boolean(next.hasMore) && batch.length > 0
    }
    if (tracks.length) return dedupeTracksById(tracks)
  } catch {
    /* try slower / local fallbacks */
  }

  const cached = tracksGroupedFromCachedLibrary()[folderId]
  if (cached?.length) return cached

  if (playlistTrackIds.length) {
    const byIds = await fetchTracksByIds(playlistTrackIds)
    if (byIds.length) return byIds
  }

  try {
    const folderTracks = await fetchTracks(folderId, { includeArchived: false, includeFullData: false })
    if (folderTracks.length) return folderTracks
  } catch {
    /* ignore */
  }

  if (albumName) {
    const byName = await extractTracksFromJsonByAlbumName(albumName)
    if (byName.length) return byName
  }

  return []
}

function walkCachedFolders(items: FolderItem[] | any[] | undefined, visit: (folder: any) => void) {
  if (!items) return
  for (const folder of items) {
    visit(folder)
    if (folder.children?.length) walkCachedFolders(folder.children, visit)
  }
}

/** Instant seed from vault sync cache (no network). */
function tracksFromCachedLibrary(): Track[] {
  const data = peekCachedMusicLibrary()
  if (!data?.folders?.length) return []
  const out: Track[] = []
  const seen = new Set<string>()
  walkCachedFolders(data.folders, (folder) => {
    for (const track of folder.tracks || []) {
      if (!track?.id || seen.has(track.id)) continue
      seen.add(track.id)
      out.push({
        ...track,
        folderId: track.folderId || folder.id,
      })
    }
  })
  return out
}

/** Stale music-library.json often has Unknown/None stubs — treat as unhydrated. */
function trackHasStubCatalog(track: Track): boolean {
  const key = String(track.key_signature || '').trim().toLowerCase()
  const genre = String(track.genre || '').trim().toLowerCase()
  const stubKey = !key || key === 'unknown' || key === 'n/a' || key === 'none' || key === '—'
  const stubGenre = !genre || genre === 'unknown' || genre === 'n/a' || genre === 'none' || genre === '—'
  return stubKey && stubGenre
}

function folderNeedsLiveCatalogHydration(tracks: Track[] | undefined): boolean {
  if (!tracks?.length) return true
  const sample = tracks.slice(0, 12)
  const stubs = sample.filter(trackHasStubCatalog).length
  return stubs >= Math.ceil(sample.length * 0.5)
}

function tracksGroupedFromCachedLibrary(): Record<string, Track[]> {
  const data = peekCachedMusicLibrary()
  if (!data?.folders?.length) return {}
  const grouped: Record<string, Track[]> = {}
  walkCachedFolders(data.folders, (folder) => {
    if (!folder?.id || !folder.tracks?.length) return
    const seen = new Set<string>()
    const deduped = folder.tracks.filter((track: Track) => {
      if (!track?.id || seen.has(track.id)) return false
      seen.add(track.id)
      return true
    })
    grouped[folder.id] = withAlbumName(
      [...deduped].sort(
        (a: Track, b: Track) =>
          (a.display_order ?? a.track_number ?? 0) - (b.display_order ?? b.track_number ?? 0)
      ),
      folder.name
    )
  })
  return grouped
}

function albumTilesFromCachedLibrary(): AlbumTile[] {
  const data = peekCachedMusicLibrary()
  if (!data?.folders?.length) return []
  return collectAlbumAndEpTiles(data.folders)
}

async function loadAlbumAndEpTilesFromLibrary(includeHidden = false): Promise<AlbumTile[]> {
  const cached = albumTilesFromCachedLibrary()
  if (cached.length && !includeHidden) return cached
  try {
    const fromApi = collectAlbumAndEpTiles(await fetchFolders(includeHidden))
    if (fromApi.length) return fromApi
  } catch {
    /* catalog JSON fallback */
  }
  const json = await import('@/data/music-library.json')
  const folders = (json as any).folders || (json as any).default?.folders || []
  return collectAlbumAndEpTiles(folders)
}

function mergeAlbumTiles(...lists: AlbumTile[][]): AlbumTile[] {
  const map = new Map<string, AlbumTile>()
  for (const list of lists) {
    for (const tile of list) {
      if (!tile?.id) continue
      const prev = map.get(tile.id)
      map.set(tile.id, {
        ...prev,
        ...tile,
        artwork: firstArtworkSrc(tile.artwork, prev?.artwork) || undefined,
        hidden: !!(tile.hidden ?? prev?.hidden),
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'ep' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

async function loadVisibleAlbumAndEpTiles(): Promise<AlbumTile[]> {
  const fromFolders = await loadAlbumAndEpTilesFromLibrary(false).catch(() => [] as AlbumTile[])
  try {
    const data = await fetchBrowse({ view: 'albums', sort: 'title', dir: 'asc', limit: 500, offset: 0 })
    return mergeAlbumTiles(toAlbumTiles(data.albums || []), fromFolders).filter((t) => !t.hidden)
  } catch {
    return fromFolders.filter((t) => !t.hidden)
  }
}

/** Admin catalog: include private folders; public: visible only. */
async function loadCatalogAlbumAndEpTiles(includePrivate: boolean): Promise<AlbumTile[]> {
  if (!includePrivate) return loadVisibleAlbumAndEpTiles()
  const fromFolders = await loadAlbumAndEpTilesFromLibrary(true).catch(() => [] as AlbumTile[])
  try {
    const data = await fetchBrowse({ view: 'albums', sort: 'title', dir: 'asc', limit: 500, offset: 0 })
    return mergeAlbumTiles(fromFolders, toAlbumTiles(data.albums || []))
  } catch {
    return fromFolders
  }
}

/** Library nav: alphabetical by label (Crates & EPs, Artists, Genres, Songs). */
const BROWSE_LIBRARY_NAV: { id: BrowseView; icon: typeof FaMusic; label: string }[] = [
  { id: 'albums', icon: FaCompactDisc, label: 'Crates & EPs' },
  { id: 'artists', icon: FaUser, label: 'Artists' },
  { id: 'genres', icon: FaTags, label: 'Genres' },
  { id: 'songs', icon: FaMusic, label: 'Songs' },
]

export default function SergBrowser({
  onClose,
  adminMode,
  searchQuery: controlledSearchQuery,
  onSearchQueryChange,
}: SergBrowserProps) {
  const pathname = usePathname()
  const isAdminCatalog = adminMode ?? pathname.startsWith('/admin')
  const {
    playTrack,
    playQueue,
    currentTrack,
    isPlaying,
    seekTo,
    queue,
    isQueuePanelOpen,
    toggleQueuePanel,
    setQueuePanelHost,
  } = useMusicPlayer()
  const { onRemoteVersionChange } = useCatalogSync()

  const queuePanelHostElRef = useRef<HTMLDivElement | null>(null)

  // Stable host registration — ignore transient ref(null) so the panel doesn't
  // jump back to the floating player dock during SergBrowser re-renders.
  const assignQueuePanelHost = useCallback(
    (node: HTMLDivElement | null) => {
      queuePanelHostElRef.current = node
      if (node) setQueuePanelHost(node)
    },
    [setQueuePanelHost],
  )

  useLayoutEffect(() => {
    if (queuePanelHostElRef.current) {
      setQueuePanelHost(queuePanelHostElRef.current)
    }
    return () => setQueuePanelHost(null)
  }, [setQueuePanelHost])

  const [view, setView] = useState<BrowseView>('albums')
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

  const initialSort = loadSongTableSort()
  const [sortField, setSortField] = useState<SortField>(() => initialSort.field)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => initialSort.dir)
  const [filterGenre, setFilterGenre] = useState<string | null>(null)
  const [filterArtist, setFilterArtist] = useState<string | null>(null)
  const [internalSearchQuery, setInternalSearchQuery] = useState('')
  const searchControlled = controlledSearchQuery !== undefined
  const searchQuery = searchControlled ? controlledSearchQuery : internalSearchQuery
  const setSearchQuery = (value: string) => {
    if (searchControlled) onSearchQueryChange?.(value)
    else setInternalSearchQuery(value)
  }

  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const selectedAlbumIdRef = useRef<string | null>(null)
  selectedAlbumIdRef.current = selectedAlbumId
  const albumsRef = useRef<AlbumTile[]>([])
  albumsRef.current = albums
  const [albumLayout, setAlbumLayout] = useState<AlbumLayout>(loadAlbumLayout)
  const [albumTracks, setAlbumTracks] = useState<Track[]>([])
  const [albumTracksByFolder, setAlbumTracksByFolder] = useState<Record<string, Track[]>>({})
  const [folderMeta, setFolderMeta] = useState<Record<string, FolderMeta>>({})
  const [loadingAlbumTracks, setLoadingAlbumTracks] = useState(false)
  const [albumTracksHydrating, setAlbumTracksHydrating] = useState(false)
  const loadGenRef = useRef(0)
  /** Keep list painted during background catalog refreshes (e.g. after play/grid persist). */
  const hasBrowseContentRef = useRef(false)

  const [browseSidebarWidth, setBrowseSidebarWidth] = useState(BROWSE_SIDEBAR_W_DEFAULT)
  const [browseSidebarCollapsed, setBrowseSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  )
  const [isResizingBrowseSidebar, setIsResizingBrowseSidebar] = useState(false)
  const browseSidebarResizeStartRef = useRef({ x: 0, w: BROWSE_SIDEBAR_W_DEFAULT })
  const curatedPlaylistsRef = useRef(curatedPlaylists)
  const sidebarAlbumsRef = useRef(sidebarAlbums)
  const activeCuratedPlaylistRef = useRef(activeCuratedPlaylist)
  curatedPlaylistsRef.current = curatedPlaylists
  sidebarAlbumsRef.current = sidebarAlbums
  activeCuratedPlaylistRef.current = activeCuratedPlaylist
  const [playlistsSectionMenu, setPlaylistsSectionMenu] = useState<{ x: number; y: number } | null>(null)
  const [playlistCreateOpen, setPlaylistCreateOpen] = useState(false)
  const [playlistCreateDraft, setPlaylistCreateDraft] = useState({ name: '', description: '' })
  const [playlistCreateBusy, setPlaylistCreateBusy] = useState(false)
  const [playlistCreateError, setPlaylistCreateError] = useState<string | null>(null)
  const [playlistDropActive, setPlaylistDropActive] = useState(false)
  const [playlistDropBusy, setPlaylistDropBusy] = useState(false)
  const [playlistDropNotice, setPlaylistDropNotice] = useState<string | null>(null)
  const [playlistDropPendingConvert, setPlaylistDropPendingConvert] = useState<File[] | null>(null)
  const [playlistDropItems, setPlaylistDropItems] = useState<PlaylistDropItem[]>([])
  const [sidebarPlaylistDragOverId, setSidebarPlaylistDragOverId] = useState<string | null>(null)
  const [sidebarTrackDragActive, setSidebarTrackDragActive] = useState(false)
  const [sidebarPlaylistNotice, setSidebarPlaylistNotice] = useState<string | null>(null)
  const playlistsSectionMenuRef = useRef<HTMLDivElement>(null)
  const playlistsSectionMenuClamp = useClampedFixedMenuPosition(
    !!playlistsSectionMenu,
    playlistsSectionMenu,
    { width: 224, height: 200 },
    { externalRef: playlistsSectionMenuRef },
  )
  const playlistCreateRef = useRef<HTMLDivElement>(null)

  // Prefer collapsed library nav on phones (more room for albums/tracks).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => {
      if (mq.matches) setBrowseSidebarCollapsed(true)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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
    const gen = ++loadGenRef.current
    const stillCurrent = () => loadGenRef.current === gen
    const showBlockingLoader = () => {
      if (!hasBrowseContentRef.current) setLoading(true)
    }
    try {
      // Curated playlist selected — fetch its tracks (reuse the same audio file across playlists)
      if (activeCuratedPlaylist) {
        showBlockingLoader()
        const pl = curatedPlaylistsRef.current.find((p) => p.id === activeCuratedPlaylist)
        const ids = pl?.trackIds || []
        let resolved: Track[] = ids.length ? await fetchTracksByIds(ids) : []
        if (resolved.length < ids.length) {
          const folderId = pl?.id?.startsWith('playlist-') ? pl.id.slice('playlist-'.length) : ''
          if (folderId) {
            const folderTracks = await fetchTracks(folderId, { includeArchived: false, includeFullData: false })
            const seen = new Set(resolved.map((t) => t.id))
            for (const track of folderTracks) {
              if (!seen.has(track.id)) {
                resolved.push(track)
                seen.add(track.id)
              }
            }
            if (ids.length) {
              const byId = new Map(resolved.map((t) => [t.id, t]))
              const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Track[]
              if (ordered.length) resolved = ordered
            }
          }
        }
        // Keep playlist Album column filled even if a lean payload omitted folder join.
        if (pl?.name) {
          resolved = resolved.map((t) =>
            t.album
              ? t
              : { ...t, album: pl.name, albumType: t.albumType || 'playlist' },
          )
        }
        setTracks(resolved)
        setTotal(resolved.length)
        setLoading(false)
        return
      }

      // Sidebar album/EP selected — fetch its tracks directly by folder
      if (activeSidebarAlbum) {
        showBlockingLoader()
        const pl = curatedPlaylistsRef.current.find(
          (p) => p.id === playlistIdForFolder(activeSidebarAlbum) || p.id === activeSidebarAlbum
        )
        const albumName = sidebarAlbumsRef.current.find((a: any) => a.id === activeSidebarAlbum)?.name
        const folderTracks = await loadTracksForAlbumFolder(
          activeSidebarAlbum,
          pl?.trackIds || [],
          albumName,
        )
        setTracks(withAlbumName(folderTracks, albumName))
        setTotal(folderTracks.length)
        setLoading(false)
        return
      }

      if (activeSmartPlaylist) {
        showBlockingLoader()
        const result = await resolveSmartPlaylist(activeSmartPlaylist)
        setTracks(result.tracks || [])
        setTotal(result.tracks?.length || 0)
        setLoading(false)
        return
      }

      if (view === 'songs') {
        const noFilters = !filterGenre && !filterArtist && !searchQuery
        const applySongFilters = (list: Track[]) => {
          let next = list
          if (filterGenre) {
            next = next.filter((t) => String(t.genre || '') === filterGenre)
          }
          if (filterArtist) {
            const artistQ = filterArtist.toLowerCase()
            next = next.filter((t) => String(t.artist || '').toLowerCase().includes(artistQ))
          }
          if (searchQuery) {
            const q = searchQuery.trim().toLowerCase()
            next = next.filter(
              (t) =>
                String(t.title || '').toLowerCase().includes(q) ||
                String(t.artist || '').toLowerCase().includes(q) ||
                String(t.album || '').toLowerCase().includes(q),
            )
          }
          return next
        }
        const seeded = tracksFromCachedLibrary()
        if (seeded.length) {
          const filtered = applySongFilters(seeded)
          if (filtered.length || noFilters) {
            setTracks(filtered)
            setTotal(filtered.length)
            setLoading(false)
          } else {
            showBlockingLoader()
          }
        } else {
          showBlockingLoader()
        }
        try {
          const hydrated = await fetchAllTracksSummaryForHydration({ includeArchived: false })
          const filtered = applySongFilters(hydrated)
          if (filtered.length || hydrated.length) {
            setTracks(filtered)
            setTotal(filtered.length)
            setLoading(false)
            return
          }
        } catch {
          /* fall through to browse */
        }
        const data = await fetchBrowseSongsAll({
          sort: sortField,
          dir: sortDir,
          genre: filterGenre || undefined,
          artist: filterArtist || undefined,
          search: searchQuery || undefined,
        })
        setTracks(data.tracks || [])
        setTotal(data.total || 0)
        setLoading(false)
        return
      }

      if (view === 'albums') {
        const cachedTiles = albumTilesFromCachedLibrary().map((tile) => withResolvedArtwork(tile))
        const cachedGrouped = tracksGroupedFromCachedLibrary()
        if (cachedTiles.length) {
          setAlbums(
            isAdminCatalog ? cachedTiles : cachedTiles.filter((t) => !t.hidden),
          )
          // Public can seed from cache. Admin waits for API merge so private EPs aren't shown as 0 tracks.
          if (!isAdminCatalog && Object.keys(cachedGrouped).length) {
            setAlbumTracksByFolder(cachedGrouped)
            setAlbums((prev) => prev.map((tile) => withResolvedArtwork(tile, cachedGrouped[tile.id] || [])))
          }
          const cacheMisses = cachedTiles.some((tile) => !(cachedGrouped[tile.id] && cachedGrouped[tile.id].length > 0))
          if (cacheMisses) setAlbumTracksHydrating(true)
          setLoading(false)
        } else {
          showBlockingLoader()
        }
      } else {
        showBlockingLoader()
      }

      const data = await fetchBrowse({
        view,
        sort: sortField,
        dir: sortDir,
        genre: filterGenre || undefined,
        artist: filterArtist || undefined,
        search: searchQuery || undefined,
        limit: view === 'albums' ? 500 : 200,
      })

      if (view === 'albums') {
        let tiles = toAlbumTiles(data.albums || []).map((tile) => withResolvedArtwork(tile))
        if (!searchQuery.trim()) {
          const fromFolders = await loadAlbumAndEpTilesFromLibrary(isAdminCatalog).catch(
            () => [] as AlbumTile[],
          )
          tiles = mergeAlbumTiles(isAdminCatalog ? fromFolders : tiles, isAdminCatalog ? tiles : fromFolders).map(
            (tile) => withResolvedArtwork(tile),
          )
          if (!isAdminCatalog) tiles = tiles.filter((t) => !t.hidden)
        } else if (tiles.length === 0) {
          tiles = await loadAlbumAndEpTilesFromLibrary(isAdminCatalog)
          const q = searchQuery.trim().toLowerCase()
          tiles = tiles
            .filter(
              (a) =>
                (isAdminCatalog || !a.hidden) &&
                (a.name.toLowerCase().includes(q) ||
                  (a.albumArtist || '').toLowerCase().includes(q)),
            )
            .map((tile) => withResolvedArtwork(tile))
        } else if (!isAdminCatalog) {
          tiles = tiles.filter((t) => !t.hidden)
        }
        setAlbums((prev) => mergeAlbumTilesPreservingUploads(tiles, prev as AlbumTile[]))

        let grouped = tracksGroupedFromCachedLibrary()
        const paintGrouped = (next: Record<string, Track[]>) => {
          if (!stillCurrent()) return
          const stamped = withEpArtworkOnCrateTracks(next, tiles)
          setAlbumTracksByFolder(stamped)
          setAlbums((prev) =>
            prev.map((tile) => {
              const resolved = withResolvedArtwork(tile, stamped[tile.id] || [])
              if (isUploadedFolderArtwork(tile.artwork)) {
                return { ...resolved, artwork: tile.artwork }
              }
              return resolved
            }),
          )
        }
        // Instant paint from cache, but never trust stub Unknown/None catalog as final.
        if (Object.keys(grouped).length) paintGrouped(grouped)

        const tilesNeedingHydration = tiles.filter((tile) =>
          folderNeedsLiveCatalogHydration(grouped[tile.id]),
        )
        if (tilesNeedingHydration.length) {
          setAlbumTracksHydrating(true)
          const BATCH = 6
          for (let i = 0; i < tilesNeedingHydration.length; i += BATCH) {
            if (!stillCurrent()) return
            const slice = tilesNeedingHydration.slice(i, i + BATCH)
            const fills = await Promise.all(
              slice.map(async (tile) => {
                const pl = curatedPlaylistsRef.current.find(
                  (p) =>
                    p.id === playlistIdForFolder(tile.id) ||
                    p.id === tile.id ||
                    folderIdFromPlaylistId(p.id) === tile.id,
                )
                const loaded = await loadTracksForAlbumFolder(tile.id, pl?.trackIds || [], tile.name)
                return loaded.length ? ([tile.id, withAlbumName(loaded, tile.name)] as const) : null
              }),
            )
            for (const fill of fills) {
              if (fill) grouped[fill[0]] = fill[1]
            }
            paintGrouped(grouped)
          }
        }
        if (stillCurrent()) setAlbumTracksHydrating(false)

        // Background overlay so admin edits aren't stuck on the first folder page.
        void fetchAllTracksSummaryForHydration({
          includeArchived: false,
          shouldPause: () => Boolean((window as any).__sergikVaultPlaybackBusy),
        })
          .then((allTracks) => {
            if (!stillCurrent() || !allTracks.length) return
            const fromApi: Record<string, Track[]> = Object.fromEntries(
              Object.entries(grouped).map(([folderId, list]) => [folderId, [...list]]),
            )
            for (const track of allTracks) {
              const folderId =
                track.folderId || (track as { folder_id?: string }).folder_id || ''
              if (!folderId) continue
              ;(fromApi[folderId] ||= []).push(track)
            }
            for (const folderId of Object.keys(fromApi)) {
              const byId = new Map<string, Track>()
              for (const t of fromApi[folderId]) {
                if (!t?.id) continue
                const prev = byId.get(t.id)
                if (!prev) {
                  byId.set(t.id, t)
                  continue
                }
                // Prefer live catalog over stale JSON Unknown/None stubs.
                byId.set(t.id, trackHasStubCatalog(prev) && !trackHasStubCatalog(t) ? t : prev)
              }
              fromApi[folderId] = [...byId.values()]
              fromApi[folderId].sort(
                (a, b) =>
                  (a.display_order ?? a.track_number ?? 0) - (b.display_order ?? b.track_number ?? 0),
              )
              const tile = tiles.find((t) => t.id === folderId)
              fromApi[folderId] = tile
                ? withAlbumName(fromApi[folderId], tile.name)
                : fromApi[folderId]
            }
            grouped = fromApi
            paintGrouped(fromApi)
          })
          .catch(() => {})
      } else if (view === 'artists') {
        setArtists(data.artists || [])
        setTotal(data.total || 0)
      } else if (view === 'genres') {
        setGenres(data.genres || [])
      }
    } catch (err) {
      console.error('Browse error:', err)
      if (view === 'albums') {
        try {
          setAlbums(
            (await loadAlbumAndEpTilesFromLibrary(isAdminCatalog))
              .filter((t) => isAdminCatalog || !t.hidden)
              .map((tile) => withResolvedArtwork(tile)),
          )
        } catch {
          setAlbums([])
        }
      }
    } finally {
      if (stillCurrent()) {
        setLoading(false)
        if (view !== 'albums') setAlbumTracksHydrating(false)
      }
    }
  }, [view, sortField, sortDir, filterGenre, filterArtist, searchQuery, activeSmartPlaylist, activeCuratedPlaylist, activeSidebarAlbum, isAdminCatalog])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    hasBrowseContentRef.current =
      albums.length > 0 ||
      tracks.length > 0 ||
      albumTracks.length > 0 ||
      Object.keys(albumTracksByFolder).length > 0 ||
      artists.length > 0 ||
      genres.length > 0
  }, [albums.length, tracks.length, albumTracks.length, albumTracksByFolder, artists.length, genres.length])

  useEffect(() => {
    return onRemoteVersionChange(() => {
      invalidateMusicLibraryCache()
      void loadData()
    })
  }, [onRemoteVersionChange, loadData])

  useEffect(() => {
    fetchSmartPlaylists().then(setSmartPlaylists)
    fetchPlaylists({ includeHidden: isAdminCatalog }).then((pls) =>
      setCuratedPlaylists(pls.filter((p) => !p.is_archived)),
    )
    loadCatalogAlbumAndEpTiles(isAdminCatalog)
      .then((tiles) =>
        setSidebarAlbums((prev) =>
          mergeAlbumTilesPreservingUploads(
            tiles.map((tile) => withResolvedArtwork(tile)),
            prev as AlbumTile[],
          ),
        ),
      )
      .catch(() => {
        loadAlbumAndEpTilesFromLibrary(isAdminCatalog)
          .then((tiles) =>
            setSidebarAlbums((prev) =>
              mergeAlbumTilesPreservingUploads(
                tiles.map((tile) => withResolvedArtwork(tile)),
                prev as AlbumTile[],
              ),
            ),
          )
          .catch(() => {})
      })
  }, [isAdminCatalog])

  useEffect(() => {
    if (!isAdminCatalog) return
    fetchFolders(true)
      .then((rows) => {
        const next: Record<string, FolderMeta> = {}
        for (const row of flattenFolderRows(rows)) {
          if (!row?.id) continue
          next[row.id] = {
            hidden: !!(row.hidden || row.is_hidden),
            type: String(row.type || 'folder'),
          }
        }
        setFolderMeta(next)
      })
      .catch(() => {})
  }, [isAdminCatalog])

  function handleSort(field: SortField) {
    if (sortField === field) {
      const nextDir = sortDir === 'asc' ? 'desc' : 'asc'
      setSortDir(nextDir)
      saveSongTableSort(field, nextDir)
    } else {
      setSortField(field)
      setSortDir('asc')
      saveSongTableSort(field, 'asc')
    }
  }

  const browsePlayerSource = useCallback((): PlayerSource => {
    if (activeCuratedPlaylist) return { type: 'playlist', id: activeCuratedPlaylist }
    if (activeSmartPlaylist) return { type: 'playlist', id: activeSmartPlaylist }
    if (activeSidebarAlbum) return { type: 'folder', id: activeSidebarAlbum }
    if (selectedAlbumId) return { type: 'folder', id: selectedAlbumId }
    return null
  }, [activeCuratedPlaylist, activeSmartPlaylist, activeSidebarAlbum, selectedAlbumId])

  function handlePlayTrack(track: Track, idx: number) {
    const source = browsePlayerSource()
    const startQueue = readCatalogRandomSetting() ? [track] : tracks
    playTrack(track as any, startQueue as any, source)
    recordTrackPlay(track.id, { source: activeSmartPlaylist ? 'smart_playlist' : 'browse' })
  }

  async function handleRate(trackId: string, rating: number) {
    const ok = await rateTrack(trackId, rating)
    if (ok) {
      setTracks((prev) => prev.map((t) => t.id === trackId ? { ...t, rating } : t))
    }
  }

  const applyTrackPatch = useCallback((updated: Track) => {
    const folderId = updated.folderId || (updated as Track & { folder_id?: string }).folder_id
    const artwork = updated.artwork || (updated as Track & { artwork_url?: string }).artwork_url
    let artworkChanged = false
    const merge = (list: Track[]) => {
      const existing = list.find((t) => t.id === updated.id)
      if (
        existing &&
        artwork &&
        stripArtworkCacheBust(existing.artwork || '') !== stripArtworkCacheBust(artwork)
      ) {
        artworkChanged = true
      }
      const next = list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
      if (!artworkChanged || !folderId) return next
      const inCollection = next.some((t) => playerTrackMatchesCoverEvent(t, { folderId }))
      return inCollection ? stampAllTrackArtwork(next, artwork) : next
    }
    setTracks((prev) => merge(prev))
    setAlbumTracks((prev) => merge(prev))
    setAlbumTracksByFolder((prev) => {
      const next: Record<string, Track[]> = {}
      for (const [k, v] of Object.entries(prev)) {
        const merged = merge(v)
        next[k] =
          artworkChanged && folderId && catalogItemMatchesCoverEvent({ id: k }, folderId)
            ? stampAllTrackArtwork(merged, artwork)
            : merged
      }
      return next
    })
    if (artworkChanged && folderId && artwork) {
      emitCatalogSync({
        entity: 'folder',
        entityId: folderId,
        patch: { artwork },
      })
    }
  }, [])

  const applyTrackArchived = useCallback((trackId: string) => {
    const drop = (list: Track[]) => list.filter((t) => t.id !== trackId)
    setTracks((prev) => drop(prev))
    setAlbumTracks((prev) => drop(prev))
    setAlbumTracksByFolder((prev) => {
      const next: Record<string, Track[]> = {}
      for (const [k, v] of Object.entries(prev)) next[k] = drop(v)
      return next
    })
  }, [])

  const applyTrackRemovedFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId))
    setTotal((prev) => Math.max(0, prev - 1))
    setCuratedPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) } : p
      )
    )
    invalidateMusicLibraryCache()
  }, [])

  const applyTracksRemovedFromPlaylist = useCallback((playlistId: string, trackIds: string[]) => {
    if (!trackIds.length) return
    const drop = new Set(trackIds)
    setTracks((prev) => prev.filter((t) => !drop.has(t.id)))
    setTotal((prev) => Math.max(0, prev - trackIds.length))
    setCuratedPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((id) => !drop.has(id)) } : p
      )
    )
    invalidateMusicLibraryCache()
  }, [])

  const addTracksToCuratedPlaylist = useCallback(async (playlistId: string, ids: string[]) => {
    const unique = Array.from(new Set(ids.map(String).filter(Boolean)))
    if (!unique.length) return
    const playlist = curatedPlaylistsRef.current.find((p) => p.id === playlistId)
    if (!playlist) return
    const next = [...playlist.trackIds]
    let added = 0
    for (const id of unique) {
      if (!next.includes(id)) {
        next.push(id)
        added += 1
      }
    }
    if (!added) {
      setSidebarPlaylistNotice(`Already in “${playlist.name}”`)
      return
    }
    curatedPlaylistsRef.current = curatedPlaylistsRef.current.map((p) =>
      p.id === playlistId ? { ...p, trackIds: next } : p,
    )
    setCuratedPlaylists(curatedPlaylistsRef.current)
    try {
      await updatePlaylist(playlistId, { trackIds: next })
      invalidateMusicLibraryCache()
      emitCatalogSync({
        entity: 'playlist',
        entityId: playlistId,
        playlistId,
        patch: { trackIds: next },
      })
      setSidebarPlaylistNotice(
        added === 1
          ? `Added 1 track to “${playlist.name}”`
          : `Added ${added} tracks to “${playlist.name}”`,
      )
    } catch (err: any) {
      setSidebarPlaylistNotice(err?.message || 'Failed to add to playlist')
    }
  }, [])

  const applyPlaylistReorder = useCallback(async (playlistId: string, orderedIds: string[]) => {
    setCuratedPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, trackIds: orderedIds } : p))
    )
    setTracks((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]))
      const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Track[]
      return ordered.length ? ordered : prev
    })
    try {
      await updatePlaylist(playlistId, { trackIds: orderedIds })
      invalidateMusicLibraryCache()
    } catch (err) {
      console.error('Failed to persist playlist order', err)
    }
  }, [])

  const patchPlaylistDropItem = useCallback((id: string, patch: Partial<PlaylistDropItem>) => {
    setPlaylistDropItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }, [])

  const applyPlaylistDropResultIncremental = useCallback(
    async (playlistId: string, result: Awaited<ReturnType<typeof linkDroppedFilesToPlaylist>>) => {
      if (result.trackIds?.length) {
        setCuratedPlaylists((prev) =>
          prev.map((p) => (p.id === playlistId ? { ...p, trackIds: result.trackIds } : p)),
        )
      }
      const newIds = [
        ...result.added,
        ...result.created.map((row) => row.trackId),
      ].filter(Boolean)
      if (!newIds.length) return
      invalidateMusicLibraryCache()
      const fetched = await fetchTracksByIds(newIds)
      if (!fetched.length) return
      setTracks((prev) => {
        const seen = new Set(prev.map((track) => track.id))
        const extra = fetched.filter((track) => !seen.has(track.id))
        if (!extra.length) return prev
        const next = [...prev, ...extra]
        setTotal(next.length)
        return next
      })
    },
    [],
  )

  const runPlaylistFileDrop = useCallback(
    async (files: File[], convertToMp3: boolean, playlistId?: string) => {
      const targetId = playlistId || activeCuratedPlaylist
      if (!isAdminCatalog || !targetId || playlistDropBusy) return
      if (!files.length) return
      if (targetId !== activeCuratedPlaylist) openCuratedPlaylist(targetId)

      const items: PlaylistDropItem[] = files.map((file, index) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        name: file.name,
        sizeLabel: formatBytesMb(file.size),
        state: 'queued',
        percent: 0,
      }))
      setPlaylistDropItems(items)
      setPlaylistDropBusy(true)
      setPlaylistDropNotice(null)
      setPlaylistDropPendingConvert(null)

      let added = 0
      let created = 0
      let failed = 0
      let lastTrackIds: string[] = []

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const itemId = items[i].id
          patchPlaylistDropItem(itemId, {
            state: convertToMp3 ? 'converting' : 'uploading',
            percent: convertToMp3 ? 6 : 3,
            detail: convertToMp3 ? '320kbps MP3' : undefined,
          })
          try {
            const result = await linkDroppedFilesToPlaylist(targetId, [file], {
              convertToMp3,
              onUploadProgress: (ratio) => {
                const capped = Math.max(0, Math.min(1, ratio))
                const percent = convertToMp3
                  ? Math.round(8 + capped * 52)
                  : Math.round(4 + capped * 72)
                patchPlaylistDropItem(itemId, {
                  state: capped < 1 ? (convertToMp3 ? 'converting' : 'uploading') : 'processing',
                  percent,
                  detail: capped < 1 ? `${Math.round(capped * 100)}% uploaded` : 'Writing vault…',
                })
              },
            })
            lastTrackIds = result.trackIds || lastTrackIds
            if (result.ingestFailed.length) {
              failed += 1
              patchPlaylistDropItem(itemId, {
                state: 'failed',
                percent: 100,
                detail: result.ingestFailed[0]?.error || 'Ingest failed',
              })
            } else if (result.created.length) {
              created += 1
              added += result.added.length
              patchPlaylistDropItem(itemId, {
                state: 'added',
                percent: 100,
                detail: result.converted?.length ? 'Converted & ingested' : 'Ingested into vault',
              })
              await applyPlaylistDropResultIncremental(targetId, result)
            } else if (result.added.length) {
              added += result.added.length
              patchPlaylistDropItem(itemId, {
                state: 'added',
                percent: 100,
                detail: 'Added to playlist',
              })
              await applyPlaylistDropResultIncremental(targetId, result)
            } else if (result.alreadyInPlaylist.length) {
              patchPlaylistDropItem(itemId, {
                state: 'exists',
                percent: 100,
                detail: 'Already in playlist',
              })
            } else if (result.unmatched.length) {
              failed += 1
              patchPlaylistDropItem(itemId, {
                state: 'failed',
                percent: 100,
                detail: result.unmatched[0]?.reason || 'Could not match',
              })
            } else {
              patchPlaylistDropItem(itemId, {
                state: 'matched',
                percent: 100,
                detail: 'Matched existing vault track',
              })
            }
          } catch (err: any) {
            if (
              (err instanceof PlaylistDropTooLargeError || err?.code === 'FILE_TOO_LARGE') &&
              err?.convertible
            ) {
              setPlaylistDropPendingConvert(files.slice(i))
              setPlaylistDropNotice(err.message)
              for (let j = i; j < items.length; j++) {
                patchPlaylistDropItem(items[j].id, {
                  state: j === i ? 'failed' : 'queued',
                  percent: j === i ? 100 : 0,
                  detail: j === i ? err.message : 'Waiting for convert',
                })
              }
              return
            }
            failed += 1
            patchPlaylistDropItem(itemId, {
              state: 'failed',
              percent: 100,
              detail: err?.message || 'Drop failed',
            })
          }
        }

        const parts: string[] = []
        if (created) parts.push(`Ingested ${created} new into vault`)
        if (added) parts.push(`Added ${added} to playlist`)
        if (!created && !added) parts.push('No new tracks added')
        if (failed) parts.push(`${failed} failed to ingest`)
        setPlaylistDropNotice(parts.join(' · '))
        if (lastTrackIds.length) {
          setCuratedPlaylists((prev) =>
            prev.map((p) => (p.id === targetId ? { ...p, trackIds: lastTrackIds } : p)),
          )
        }
      } finally {
        setPlaylistDropBusy(false)
        setPlaylistDropActive(false)
      }
    },
    [
      isAdminCatalog,
      activeCuratedPlaylist,
      playlistDropBusy,
      applyPlaylistDropResultIncremental,
      patchPlaylistDropItem,
    ],
  )

  const handlePlaylistFileDrop = useCallback(
    async (fileList: FileList | File[], playlistId?: string) => {
      const targetId = playlistId || activeCuratedPlaylist
      if (!isAdminCatalog || !targetId || playlistDropBusy) return
      const files = Array.from(fileList)
      if (!files.length) return
      if (playlistId && playlistId !== activeCuratedPlaylist) openCuratedPlaylist(playlistId)

      const maybeLarge = files.filter((f) => f.size > PLAYLIST_DROP_MAX_DIRECT_BYTES)
      if (maybeLarge.length) {
        setPlaylistDropNotice('Checking track length for large files…')
        const needsConvert: File[] = []
        const blocked: { file: File; durationSec: number | null; maxBytes: number }[] = []

        for (const file of maybeLarge) {
          const durationSec = await probeAudioFileDuration(file)
          if (isWithinDirectIngestLimit(file.size, durationSec)) continue
          if (isConvertibleOversizeAudio(file.name, file.size, durationSec)) {
            needsConvert.push(file)
          } else {
            blocked.push({
              file,
              durationSec,
              maxBytes: maxDirectBytesForDuration(durationSec),
            })
          }
        }

        if (blocked.length) {
          setPlaylistDropPendingConvert(null)
          setPlaylistDropNotice(
            blocked
              .map(({ file, durationSec, maxBytes }) => {
                const dur =
                  durationSec != null ? ` · ${formatDurationClock(durationSec)}` : ''
                return `${file.name} (${formatBytesMb(file.size)}${dur}, limit ${formatBytesMb(maxBytes)}) cannot be auto-converted`
              })
              .join('; '),
          )
          setPlaylistDropActive(false)
          return
        }

        if (needsConvert.length) {
          setPlaylistDropPendingConvert(files)
          setPlaylistDropNotice(
            needsConvert
              .map((f) => `${f.name} (${formatBytesMb(f.size)})`)
              .join(', ') +
              ` exceed${needsConvert.length === 1 ? 's' : ''} the duration-based size budget. Convert to high-quality MP3 (320kbps) to continue.`,
          )
          setPlaylistDropActive(false)
          return
        }
        // All large files fit their duration budget — upload as-is
      }

      await runPlaylistFileDrop(files, false, targetId)
    },
    [isAdminCatalog, activeCuratedPlaylist, playlistDropBusy, runPlaylistFileDrop],
  )

  const applyCatalogEvent = useCallback((event: CatalogSyncEvent) => {
    const folderId = event.folderId
    const playlistId = event.playlistId
    const patch = event.patch
    const artworkInPatch = Object.prototype.hasOwnProperty.call(patch, 'artwork')
    const syncedArtwork = artworkInPatch
      ? normalizeArtworkPatch(patch.artwork ?? null)
      : undefined

    if (folderId) {
      const tilePatch: Partial<AlbumTile> = {}
      if (patch.name !== undefined) tilePatch.name = patch.name
      if (patch.type === 'album' || patch.type === 'ep') tilePatch.type = patch.type
      if (patch.year !== undefined) tilePatch.year = patch.year ?? undefined
      if (patch.albumArtist !== undefined) tilePatch.albumArtist = patch.albumArtist
      if (patch.hidden !== undefined) tilePatch.hidden = patch.hidden
      if (artworkInPatch) tilePatch.artwork = syncedArtwork

      if (Object.keys(tilePatch).length) {
        const mergeTiles = (list: AlbumTile[]) =>
          list.map((a) =>
            catalogItemMatchesCoverEvent(a, folderId) ? { ...a, ...tilePatch } : a,
          )
        setAlbums((prev) => mergeTiles(prev))
        setSidebarAlbums((prev) => mergeTiles(prev as AlbumTile[]))
      }

      if (patch.name) {
        setAlbumTracks((prev) =>
          prev.map((t) =>
            playerTrackMatchesCoverEvent(t, { folderId }) ? { ...t, album: patch.name } : t,
          ),
        )
        setAlbumTracksByFolder((prev) => {
          let changed = false
          const next: Record<string, Track[]> = {}
          for (const [id, group] of Object.entries(prev)) {
            if (!catalogItemMatchesCoverEvent({ id }, folderId)) {
              next[id] = group
              continue
            }
            changed = true
            next[id] = group.map((t) => ({ ...t, album: patch.name }))
          }
          return changed ? next : prev
        })
      }

      // Systemic cover: editing art always stamps every track in the collection.
      if (artworkInPatch) {
        const stampCollectionList = (list: Track[]) => {
          if (!list.length) return list
          const openAlbum = selectedAlbumIdRef.current
          if (openAlbum && catalogItemMatchesCoverEvent({ id: openAlbum }, folderId)) {
            return stampAllTrackArtwork(list, syncedArtwork)
          }
          const belongs = list.some((t) => playerTrackMatchesCoverEvent(t, { folderId }))
          return belongs ? stampAllTrackArtwork(list, syncedArtwork) : list
        }
        setTracks((prev) => stampCollectionList(prev))
        setAlbumTracks((prev) => stampCollectionList(prev))
        setAlbumTracksByFolder((prev) => {
          let changed = false
          const next: Record<string, Track[]> = {}
          for (const [id, group] of Object.entries(prev)) {
            const groupMatch =
              catalogItemMatchesCoverEvent({ id, artwork: group[0]?.artwork }, folderId) ||
              group.some((t) => playerTrackMatchesCoverEvent(t, { folderId }))
            if (!groupMatch) {
              next[id] = group
              continue
            }
            const stamped = stampAllTrackArtwork(group, syncedArtwork)
            if (stamped !== group) changed = true
            next[id] = stamped
          }
          const rematched = withEpArtworkOnCrateTracks(next, albumsRef.current)
          return rematched !== prev || changed ? rematched : prev
        })
      }

      if (patch.hidden !== undefined) {
        setFolderMeta((prev) => ({
          ...prev,
          [folderId]: { hidden: patch.hidden!, type: prev[folderId]?.type || patch.type || 'folder' },
        }))
      }
    }

    if (playlistId || folderId) {
      setCuratedPlaylists((prev) =>
        prev.map((p) => {
          const linked =
            (playlistId && p.id === playlistId) ||
            (folderId &&
              (p.id === playlistIdForFolder(folderId) ||
                p.id === folderId ||
                folderIdFromPlaylistId(p.id) === folderId))
          if (!linked) return p
          return {
            ...p,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
            ...(patch.trackIds !== undefined ? { trackIds: patch.trackIds } : {}),
            ...(artworkInPatch ? { artwork: syncedArtwork } : {}),
          }
        }),
      )
    }

    if (patch.trackIds && playlistId && activeCuratedPlaylistRef.current === playlistId) {
      const ids = patch.trackIds
      void fetchTracksByIds(ids).then((loaded) => {
        if (activeCuratedPlaylistRef.current !== playlistId) return
        setTracks(loaded)
        setTotal(loaded.length)
      })
    }
  }, [])

  useEffect(() => subscribeCatalogSync(applyCatalogEvent), [applyCatalogEvent])

  const applyFolderPatch = useCallback((id: string, patch: Partial<AlbumTile>) => {
    emitCatalogSync({
      entity: 'folder',
      entityId: id,
      patch: {
        name: patch.name,
        artwork: Object.prototype.hasOwnProperty.call(patch, 'artwork') ? patch.artwork ?? null : undefined,
        type: patch.type,
        year: patch.year ?? undefined,
        albumArtist: patch.albumArtist,
        hidden: patch.hidden,
      },
    })
  }, [])

  const applyFolderArchived = useCallback((id: string) => {
    emitCatalogSync({
      entity: 'folder',
      entityId: id,
      patch: { is_archived: true, hidden: true },
    })
    setAlbums((prev) => prev.filter((a) => a.id !== id))
    setSidebarAlbums((prev) => prev.filter((a: AlbumTile) => a.id !== id))
    setAlbumTracksByFolder((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSelectedAlbumId((current) => (current === id ? null : current))
    setActiveSidebarAlbum((current) => (current === id ? null : current))
    setCuratedPlaylists((prev) =>
      prev.filter((p) => p.id !== playlistIdForFolder(id) && folderIdFromPlaylistId(p.id) !== id),
    )
  }, [])

  const applyFolderTracks = useCallback((folderId: string, nextTracks: Track[]) => {
    const ordered = withTrackOrder(nextTracks)
    setAlbumTracksByFolder((prev) => ({ ...prev, [folderId]: ordered }))
    setAlbumTracks((prev) => (selectedAlbumId === folderId ? ordered : prev))
    setTracks((prev) => (activeSidebarAlbum === folderId ? ordered : prev))
    const playlistId = playlistIdForFolder(folderId)
    const ids = ordered.map((t) => t.id)
    setCuratedPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId || p.id === folderId ? { ...p, trackIds: ids } : p))
    )
  }, [selectedAlbumId, activeSidebarAlbum])

  const applyFolderVisibility = useCallback((id: string, hidden: boolean) => {
    emitCatalogSync({
      entity: 'folder',
      entityId: id,
      patch: { hidden },
    })
  }, [])

  const applyAddedToLibrary = useCallback((tile: AlbumTile) => {
    setFolderMeta((prev) => ({
      ...prev,
      [tile.id]: { hidden: false, type: tile.type },
    }))
    const upsert = (list: AlbumTile[]) => {
      const exists = list.some((a) => a.id === tile.id)
      const next = exists ? list.map((a) => (a.id === tile.id ? { ...a, ...tile, hidden: false } : a)) : [...list, { ...tile, hidden: false }]
      return next.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'ep' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }
    setAlbums((prev) => upsert(prev))
    setSidebarAlbums((prev) => upsert(prev as AlbumTile[]))
  }, [])

  function switchView(v: BrowseView) {
    setView(v)
    setActiveSmartPlaylist(null)
    setActiveCuratedPlaylist(null)
    setActiveSidebarAlbum(null)
    setSelectedAlbumId(null)
    setFilterGenre(null)
    setFilterArtist(null)
  }

  async function openSmartPlaylist(id: string) {
    setActiveSmartPlaylist(id)
    setActiveCuratedPlaylist(null)
    setActiveSidebarAlbum(null)
    setView('songs')
  }

  function openCuratedPlaylist(id: string) {
    setActiveCuratedPlaylist(id)
    setActiveSmartPlaylist(null)
    setActiveSidebarAlbum(null)
    setView('songs')
    setPlaylistDropActive(false)
    if (!playlistDropBusy) {
      setPlaylistDropNotice(null)
      setPlaylistDropItems([])
    }
  }

  function openSidebarAlbum(id: string) {
    setActiveSidebarAlbum(id)
    setActiveSmartPlaylist(null)
    setActiveCuratedPlaylist(null)
    setView('songs')
  }

  const openPlaylistsSectionMenu = (e: React.MouseEvent) => {
    if (!isAdminCatalog) return
    e.preventDefault()
    e.stopPropagation()
    setPlaylistCreateError(null)
    setPlaylistsSectionMenu({ x: e.clientX, y: e.clientY })
  }

  const refreshCuratedPlaylists = async () => {
    setPlaylistsSectionMenu(null)
    try {
      const pls = await fetchPlaylists({ includeHidden: isAdminCatalog })
      setCuratedPlaylists(pls.filter((p) => !p.is_archived))
    } catch {
      /* ignore */
    }
  }

  const openNewPlaylistDialog = () => {
    setPlaylistsSectionMenu(null)
    setPlaylistCreateDraft({ name: '', description: '' })
    setPlaylistCreateError(null)
    setPlaylistCreateOpen(true)
  }

  const submitNewPlaylist = async () => {
    const name = playlistCreateDraft.name.trim()
    if (!name) {
      setPlaylistCreateError('Name is required')
      return
    }
    setPlaylistCreateBusy(true)
    setPlaylistCreateError(null)
    try {
      const created = await createPlaylist({
        id: `playlist-${Date.now()}`,
        name,
        description: playlistCreateDraft.description.trim() || undefined,
        trackIds: [],
      })
      if (!created) throw new Error('Failed to create playlist')
      setCuratedPlaylists((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
      invalidateMusicLibraryCache()
      setPlaylistCreateOpen(false)
      openCuratedPlaylist(created.id)
    } catch (err: any) {
      setPlaylistCreateError(err?.message || 'Failed to create playlist')
    } finally {
      setPlaylistCreateBusy(false)
    }
  }

  useEffect(() => {
    if (!playlistsSectionMenu && !playlistCreateOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (playlistCreateOpen) {
        setPlaylistCreateOpen(false)
        return
      }
      setPlaylistsSectionMenu(null)
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (playlistCreateRef.current?.contains(t)) return
      if (playlistCreateOpen) {
        setPlaylistCreateOpen(false)
        return
      }
      if (playlistsSectionMenuRef.current?.contains(t)) return
      setPlaylistsSectionMenu(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [playlistsSectionMenu, playlistCreateOpen])

  useEffect(() => {
    const clear = () => {
      setSidebarPlaylistDragOverId(null)
      setSidebarTrackDragActive(false)
    }
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [])

  useEffect(() => {
    if (!sidebarPlaylistNotice) return
    const timer = window.setTimeout(() => setSidebarPlaylistNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [sidebarPlaylistNotice])

  function setPersistedAlbumLayout(next: AlbumLayout) {
    setAlbumLayout(next)
    if (next === 'list') setSelectedAlbumId(null)
    try {
      localStorage.setItem(ALBUM_LAYOUT_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  async function openAlbum(albumId: string) {
    setSelectedAlbumId(albumId)
    const albumName = albums.find((a) => a.id === albumId)?.name
    const cached = albumTracksByFolder[albumId]
    const withCrateEpArt = (list: Track[]) =>
      withEpArtworkOnCrateTracks({ [albumId]: list }, albums)[albumId] || list
    if (cached?.length) {
      setAlbumTracks(withCrateEpArt(withAlbumName(cached, albumName)))
      setLoadingAlbumTracks(false)
      return
    }
    setLoadingAlbumTracks(true)
    try {
      const pl = curatedPlaylists.find(
        (p) => p.id === playlistIdForFolder(albumId) || p.id === albumId
      )
      const folderTracks = await loadTracksForAlbumFolder(albumId, pl?.trackIds || [], albumName)
      setAlbumTracks(withCrateEpArt(withAlbumName(folderTracks, albumName)))
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
  }

  function handleArtistClick(artist: string) {
    setFilterArtist(artist)
    setView('songs')
    setActiveSmartPlaylist(null)
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

  const sidebarPlaylists = useMemo(() => {
    const releaseFolderIds = new Set<string>()
    const releaseNames = new Set<string>()

    for (const album of sidebarAlbums) {
      const type = String(album?.type || '')
      if (type !== 'ep' && type !== 'album') continue
      if (album?.id) releaseFolderIds.add(String(album.id))
      if (typeof album?.name === 'string' && album.name.trim()) {
        releaseNames.add(album.name.trim().toLowerCase())
      }
    }

    for (const [folderId, meta] of Object.entries(folderMeta)) {
      if (meta.type === 'ep' || meta.type === 'album') {
        releaseFolderIds.add(folderId)
      }
    }

    return curatedPlaylists.filter((pl) => {
      if (!isAdminCatalog && (isCollectionPlaylist(pl) || pl.hidden)) return false
      const folderId = folderIdFromPlaylistId(pl.id)
      if (releaseFolderIds.has(folderId)) return false
      const meta = folderMeta[folderId]
      if (meta?.type === 'ep' || meta?.type === 'album') return false
      const nameKey = typeof pl.name === 'string' ? pl.name.trim().toLowerCase() : ''
      if (nameKey && releaseNames.has(nameKey)) return false
      return true
    })
  }, [curatedPlaylists, folderMeta, isAdminCatalog, sidebarAlbums])

  return (
    <div className="relative flex w-full items-stretch sm:min-h-[320px]">
      {/* Sidebar — omitted from layout when collapsed so the list fills full width */}
      {!browseSidebarCollapsed && (
      <div
        className="relative flex flex-shrink-0 flex-col border-r border-gray-800 bg-gray-950/50 sticky top-[var(--music-lib-chrome-top,4rem)] z-[9] self-start max-h-[calc(100dvh-var(--music-lib-chrome-top,4rem)-var(--global-music-player-height,7rem)-0.5rem)] overflow-y-auto overscroll-contain"
        style={{ width: browseSidebarWidth }}
      >
        <div className="min-w-0 flex-1">
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
              {BROWSE_LIBRARY_NAV.map((item) => (
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

          {/* Curated Playlists */}
          {(isAdminCatalog || sidebarPlaylists.length > 0) && (
            <div
              onContextMenu={isAdminCatalog ? openPlaylistsSectionMenu : undefined}
              onDragEnter={
                isAdminCatalog
                  ? (e) => {
                      if (
                        !playlistDragHasTracks(e.dataTransfer) &&
                        !dataTransferHasFiles(e.dataTransfer)
                      ) {
                        return
                      }
                      e.preventDefault()
                      setSidebarTrackDragActive(true)
                    }
                  : undefined
              }
              onDragOver={
                isAdminCatalog
                  ? (e) => {
                      if (
                        !playlistDragHasTracks(e.dataTransfer) &&
                        !dataTransferHasFiles(e.dataTransfer)
                      ) {
                        return
                      }
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'copy'
                      setSidebarTrackDragActive(true)
                    }
                  : undefined
              }
              className={
                sidebarTrackDragActive
                  ? 'rounded-md ring-1 ring-purple-400/40 bg-purple-950/20'
                  : undefined
              }
            >
              <div
                className={`text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 ${
                  isAdminCatalog ? 'cursor-context-menu select-none' : ''
                }`}
                title={isAdminCatalog ? 'Right-click for playlist actions · Drop tracks to add' : undefined}
              >
                Playlists
              </div>
              {sidebarTrackDragActive && isAdminCatalog && (
                <p className="mb-1.5 px-3 text-[11px] text-purple-300">Drop on a playlist to add</p>
              )}
              {sidebarPlaylistNotice && (
                <p className="mb-1.5 px-3 text-[11px] text-teal-400">{sidebarPlaylistNotice}</p>
              )}
              <nav className="space-y-0.5">
                {sidebarPlaylists.length === 0 && isAdminCatalog && (
                  <p className="px-3 py-1.5 text-[11px] text-gray-600">
                    No playlists yet — right-click to create
                  </p>
                )}
                {sidebarPlaylists.map((pl) => {
                  const folderId = folderIdFromPlaylistId(pl.id)
                  const meta = folderMeta[folderId]
                  const acceptTrackDrop = isAdminCatalog
                    ? {
                        onDragEnter: (e: React.DragEvent) => {
                          if (
                            !playlistDragHasTracks(e.dataTransfer) &&
                            !dataTransferHasFiles(e.dataTransfer)
                          ) {
                            return
                          }
                          e.preventDefault()
                          e.stopPropagation()
                          setSidebarTrackDragActive(true)
                          setSidebarPlaylistDragOverId(pl.id)
                        },
                        onDragOver: (e: React.DragEvent) => {
                          if (
                            !playlistDragHasTracks(e.dataTransfer) &&
                            !dataTransferHasFiles(e.dataTransfer)
                          ) {
                            return
                          }
                          e.preventDefault()
                          e.stopPropagation()
                          e.dataTransfer.dropEffect = 'copy'
                          if (sidebarPlaylistDragOverId !== pl.id) setSidebarPlaylistDragOverId(pl.id)
                        },
                        onDragLeave: (e: React.DragEvent) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setSidebarPlaylistDragOverId((id) => (id === pl.id ? null : id))
                          }
                        },
                        onDrop: (e: React.DragEvent) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setSidebarPlaylistDragOverId(null)
                          setSidebarTrackDragActive(false)
                          if (e.dataTransfer.files?.length) {
                            void handlePlaylistFileDrop(e.dataTransfer.files, pl.id)
                            return
                          }
                          const raw =
                            e.dataTransfer.getData(SERGIK_PLAYLIST_DRAG_MIME) ||
                            e.dataTransfer.getData('text/plain')
                          const ids = parsePlaylistDragTrackIds(raw)
                          if (ids.length) void addTracksToCuratedPlaylist(pl.id, ids)
                        },
                      }
                    : undefined
                  const button = (
                    <button
                      data-playlist-id={pl.id}
                      onClick={() => openCuratedPlaylist(pl.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition truncate ${
                        sidebarPlaylistDragOverId === pl.id
                          ? 'bg-purple-600/30 text-purple-100 ring-1 ring-inset ring-purple-400/70'
                          : activeCuratedPlaylist === pl.id
                          ? 'bg-purple-600/20 text-purple-300'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      }`}
                    >
                      <SidebarArtTile src={pl.artwork} alt={pl.name} />
                      <span className="truncate">{pl.name}</span>
                      {isAdminCatalog && (pl.hidden || meta?.hidden) && (
                        <FaEyeSlash className="h-3 w-3 flex-shrink-0 text-red-400" title="Private" />
                      )}
                      <span className="ml-auto text-[10px] text-gray-600 flex-shrink-0">{pl.trackIds.length}</span>
                    </button>
                  )
                  return (
                    <div key={pl.id} {...acceptTrackDrop}>
                    {isAdminCatalog ? (
                    <AdminPlaylistChrome
                      playlist={pl}
                      folderHidden={!!(pl.hidden || meta?.hidden)}
                      folderType={meta?.type}
                      onPlay={() => openCuratedPlaylist(pl.id)}
                      onPlayAll={async () => {
                        openCuratedPlaylist(pl.id)
                        const loaded = pl.trackIds.length ? await fetchTracksByIds(pl.trackIds) : []
                        if (loaded.length) playQueue(loaded as any, 0, { type: 'playlist', id: pl.id })
                      }}
                      onShufflePlay={async () => {
                        openCuratedPlaylist(pl.id)
                        const loaded = pl.trackIds.length ? await fetchTracksByIds(pl.trackIds) : []
                        const shuffled = [...loaded].sort(() => Math.random() - 0.5)
                        if (shuffled.length) playQueue(shuffled as any, 0, { type: 'playlist', id: pl.id })
                      }}
                      onRequestNewPlaylist={openNewPlaylistDialog}
                      onPlaylistUpdated={(updated) => {
                        emitCatalogSync({
                          entity: 'playlist',
                          entityId: updated.id,
                          patch: {
                            name: updated.name,
                            description: updated.description,
                            artwork: Object.prototype.hasOwnProperty.call(updated, 'artwork')
                              ? updated.artwork ?? null
                              : undefined,
                            hidden: updated.hidden,
                            trackIds: updated.trackIds,
                          },
                        })
                        if (activeCuratedPlaylist === updated.id) {
                          void fetchTracksByIds(updated.trackIds || []).then((loaded) => {
                            setTracks(loaded)
                            setTotal(loaded.length)
                          })
                        }
                      }}
                      onPlaylistDuplicated={(created) => {
                        setCuratedPlaylists((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
                        openCuratedPlaylist(created.id)
                      }}
                      onPlaylistArchived={(id) => {
                        setCuratedPlaylists((prev) => prev.filter((p) => p.id !== id))
                        setActiveCuratedPlaylist((current) => (current === id ? null : current))
                      }}
                      onVisibilityChange={applyFolderVisibility}
                      onAddedToLibrary={applyAddedToLibrary}
                      onTracksReordered={applyFolderTracks}
                    >
                      {button}
                    </AdminPlaylistChrome>
                    ) : (
                      button
                    )}
                    </div>
                  )
                })}
              </nav>
            </div>
          )}

          {/* EPs */}
          {sidebarAlbums.filter((a: any) => a.type === 'ep' && (isAdminCatalog || !a.hidden)).length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">EPs</div>
              <nav className="space-y-0.5">
                {sidebarAlbums
                  .filter((a: any) => a.type === 'ep' && (isAdminCatalog || !(a.hidden || folderMeta[a.id]?.hidden)))
                  .map((album: any) => (
                  <AdminFolderChrome
                    key={album.id}
                    album={album}
                    enabled={isAdminCatalog}
                    hidden={!!(album.hidden || folderMeta[album.id]?.hidden)}
                    tracks={albumTracksByFolder[album.id] || []}
                    onUpdated={applyFolderPatch}
                    onArchived={applyFolderArchived}
                    onTracksReordered={applyFolderTracks}
                    onVisibilityChange={applyFolderVisibility}
                    onAddedToLibrary={applyAddedToLibrary}
                    onPlayAll={() => openSidebarAlbum(album.id)}
                  >
                    <SidebarAlbumItem
                      album={{ ...album, hidden: !!(album.hidden || folderMeta[album.id]?.hidden) }}
                      tracks={albumTracksByFolder[album.id] || []}
                      active={activeSidebarAlbum === album.id}
                      onSelect={openSidebarAlbum}
                      showPrivateBadge={isAdminCatalog && !!(album.hidden || folderMeta[album.id]?.hidden)}
                    />
                  </AdminFolderChrome>
                ))}
              </nav>
            </div>
          )}

          {/* Crates (folder type album — vibe collections of loose singles) */}
          {sidebarAlbums.filter((a: any) => a.type === 'album' && (isAdminCatalog || !a.hidden)).length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Crates</div>
              <nav className="space-y-0.5">
                {sidebarAlbums
                  .filter((a: any) => a.type === 'album' && (isAdminCatalog || !(a.hidden || folderMeta[a.id]?.hidden)))
                  .map((album: any) => (
                  <AdminFolderChrome
                    key={album.id}
                    album={album}
                    enabled={isAdminCatalog}
                    hidden={!!(album.hidden || folderMeta[album.id]?.hidden)}
                    tracks={albumTracksByFolder[album.id] || []}
                    onUpdated={applyFolderPatch}
                    onArchived={applyFolderArchived}
                    onTracksReordered={applyFolderTracks}
                    onVisibilityChange={applyFolderVisibility}
                    onAddedToLibrary={applyAddedToLibrary}
                    onPlayAll={() => openSidebarAlbum(album.id)}
                  >
                    <SidebarAlbumItem
                      album={{ ...album, hidden: !!(album.hidden || folderMeta[album.id]?.hidden) }}
                      tracks={albumTracksByFolder[album.id] || []}
                      active={activeSidebarAlbum === album.id}
                      onSelect={openSidebarAlbum}
                      showPrivateBadge={isAdminCatalog && !!(album.hidden || folderMeta[album.id]?.hidden)}
                    />
                  </AdminFolderChrome>
                ))}
              </nav>
            </div>
          )}

          {/* Singles */}
          {sidebarAlbums.filter((a: any) => a.type === 'single' && (isAdminCatalog || !a.hidden)).length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Singles</div>
              <nav className="space-y-0.5">
                {sidebarAlbums
                  .filter((a: any) => a.type === 'single' && (isAdminCatalog || !(a.hidden || folderMeta[a.id]?.hidden)))
                  .map((album: any) => (
                  <AdminFolderChrome
                    key={album.id}
                    album={album}
                    enabled={isAdminCatalog}
                    hidden={!!(album.hidden || folderMeta[album.id]?.hidden)}
                    tracks={albumTracksByFolder[album.id] || []}
                    onUpdated={applyFolderPatch}
                    onArchived={applyFolderArchived}
                    onTracksReordered={applyFolderTracks}
                    onVisibilityChange={applyFolderVisibility}
                    onAddedToLibrary={applyAddedToLibrary}
                    onPlayAll={() => openSidebarAlbum(album.id)}
                  >
                    <SidebarAlbumItem
                      album={{ ...album, hidden: !!(album.hidden || folderMeta[album.id]?.hidden) }}
                      tracks={albumTracksByFolder[album.id] || []}
                      active={activeSidebarAlbum === album.id}
                      onSelect={openSidebarAlbum}
                      showPrivateBadge={isAdminCatalog && !!(album.hidden || folderMeta[album.id]?.hidden)}
                    />
                  </AdminFolderChrome>
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
      </div>
      )}

      {/* Main content — grows with crates / track lists */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header bar + docked queue host — pins under site nav (same offset mobile + desktop) */}
        <div className="sticky top-[var(--music-lib-chrome-top,4rem)] z-[11] shrink-0 bg-gray-950 [contain:layout_paint]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-2 border-b border-gray-800 bg-gray-950 px-3 py-2.5 sm:px-5 sm:py-3">
            <div className="flex min-w-0 items-center gap-2 justify-self-start">
              {browseSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setBrowseSidebarCollapsed(false)}
                  className="flex shrink-0 items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                  aria-label="Expand library sidebar"
                  title="Expand sidebar"
                >
                  <FaChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
              {selectedAlbumId ? (
                <button
                  type="button"
                  onClick={() => setSelectedAlbumId(null)}
                  className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-purple-400 transition-colors hover:text-purple-300"
                  aria-label="Back to Crates & EPs"
                >
                  <span aria-hidden>←</span>
                  <span className="hidden sm:inline">Back</span>
                </button>
              ) : view === 'albums' && !activeSmartPlaylist && !activeCuratedPlaylist && !activeSidebarAlbum ? (
                <div
                  className="flex flex-shrink-0 overflow-hidden rounded-lg border border-gray-700"
                  role="group"
                  aria-label="Crates & EPs layout"
                >
                  <button
                    type="button"
                    onClick={() => setPersistedAlbumLayout('tiles')}
                    className={`p-2 transition ${
                      albumLayout === 'tiles'
                        ? 'bg-purple-600/30 text-purple-200'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                    aria-pressed={albumLayout === 'tiles'}
                    title="Tile view"
                  >
                    <FaTh className="h-3.5 w-3.5" />
                    <span className="sr-only">Tile view</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPersistedAlbumLayout('list')}
                    className={`p-2 transition ${
                      albumLayout === 'list'
                        ? 'bg-purple-600/30 text-purple-200'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                    aria-pressed={albumLayout === 'list'}
                    title="List view"
                  >
                    <FaList className="h-3.5 w-3.5" />
                    <span className="sr-only">List view</span>
                  </button>
                </div>
              ) : null}
            </div>

            <h2
              className={`min-w-0 max-w-[min(100%,14rem)] sm:max-w-none truncate text-center text-base sm:text-lg font-semibold justify-self-center ${
                isAdminCatalog && activeCuratedPlaylist ? 'cursor-context-menu' : ''
              }`}
              title={
                isAdminCatalog && activeCuratedPlaylist
                  ? 'Right-click for playlist actions'
                  : undefined
              }
              onContextMenu={
                isAdminCatalog && activeCuratedPlaylist
                  ? (e) => {
                      e.preventDefault()
                      const el = document.querySelector(
                        `[data-playlist-id="${CSS.escape(activeCuratedPlaylist)}"]`,
                      ) as HTMLElement | null
                      if (el) {
                        el.dispatchEvent(
                          new MouseEvent('contextmenu', {
                            bubbles: true,
                            cancelable: true,
                            clientX: e.clientX,
                            clientY: e.clientY,
                          }),
                        )
                      }
                    }
                  : undefined
              }
            >
              {selectedAlbumId
                ? albums.find((a) => a.id === selectedAlbumId)?.name || 'Album'
                : activePlaylistName || (
                    view === 'songs' ? 'Songs' :
                    view === 'albums' ? 'Crates & EPs' :
                    view === 'artists' ? 'Artists' : 'Genres'
                  )}
            </h2>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 justify-self-end">
              {view === 'songs' && !activeSmartPlaylist && !selectedAlbumId && (
                <span className="hidden sm:inline text-sm text-gray-500">{total.toLocaleString()} tracks</span>
              )}
              {!searchControlled && (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="bg-gray-800/50 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white w-[7.5rem] sm:w-48 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                  aria-label="Search tracks"
                />
              )}
              <button
                type="button"
                onClick={toggleQueuePanel}
                className={`relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-2 transition-colors touch-manipulation ${
                  isQueuePanelOpen
                    ? 'bg-purple-600/30 text-purple-200'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
                title="Queue"
                aria-label="Queue"
                aria-pressed={isQueuePanelOpen}
              >
                <FaBars className="h-3.5 w-3.5" />
                {queue.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-500 px-0.5 text-[10px] text-white">
                    {queue.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          <div
            ref={assignQueuePanelHost}
            className="w-full empty:hidden bg-black border-b border-gray-800"
            data-queue-panel-host=""
          />
        </div>

        <div className="p-3 sm:p-5">
          {loading ? (
            <div className="text-center py-16 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Songs View */}
              {(view === 'songs' || activeSmartPlaylist || activeCuratedPlaylist || activeSidebarAlbum) && (
                <>
                  {isAdminCatalog && activeCuratedPlaylist && playlistDropNotice && (
                    <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <p>{playlistDropNotice}</p>
                      {playlistDropPendingConvert && playlistDropPendingConvert.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={playlistDropBusy}
                            className="rounded-md bg-purple-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                            onClick={() =>
                              void runPlaylistFileDrop(playlistDropPendingConvert, true)
                            }
                          >
                            {playlistDropBusy
                              ? 'Converting…'
                              : 'Convert to high-quality MP3 & upload'}
                          </button>
                          <button
                            type="button"
                            disabled={playlistDropBusy}
                            className="rounded-md px-2.5 py-1 text-[11px] text-amber-200/80 underline hover:text-amber-100 disabled:opacity-50"
                            onClick={() => {
                              setPlaylistDropPendingConvert(null)
                              setPlaylistDropNotice(null)
                              setPlaylistDropItems([])
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {!playlistDropPendingConvert && (
                        <button
                          type="button"
                          className="mt-1 text-amber-300/80 underline hover:text-amber-200"
                          onClick={() => {
                            setPlaylistDropNotice(null)
                            setPlaylistDropItems([])
                          }}
                        >
                          dismiss
                        </button>
                      )}
                    </div>
                  )}
                  <SongsTable
                  tracks={tracks}
                  currentTrackId={currentTrack?.id}
                  isPlaying={isPlaying}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  playerSource={browsePlayerSource()}
                  onPlay={handlePlayTrack}
                  onRate={handleRate}
                  sortIcon={sortIcon}
                  adminCatalog={isAdminCatalog}
                  onTrackUpdated={applyTrackPatch}
                  onTrackArchived={applyTrackArchived}
                  playlistContext={
                    activeCuratedPlaylist
                      ? (() => {
                          const pl = curatedPlaylists.find((p) => p.id === activeCuratedPlaylist)
                          return pl ? { id: pl.id, name: pl.name } : null
                        })()
                      : null
                  }
                  onTrackRemovedFromPlaylist={applyTrackRemovedFromPlaylist}
                  onTracksRemovedFromPlaylist={applyTracksRemovedFromPlaylist}
                  onPlaylistReorder={
                    isAdminCatalog && activeCuratedPlaylist ? applyPlaylistReorder : undefined
                  }
                  acceptVaultFileDrop={Boolean(isAdminCatalog && activeCuratedPlaylist)}
                  vaultDropActive={playlistDropActive}
                  vaultDropBusy={playlistDropBusy}
                  vaultDropItems={playlistDropItems}
                  onVaultDropActiveChange={setPlaylistDropActive}
                  onVaultFilesDropped={handlePlaylistFileDrop}
                />
                </>
              )}

              {/* Crates & EPs — list of tracks per crate/release, or cover tiles */}
              {view === 'albums' && !selectedAlbumId && (
                albums.length > 0 ? (
                  albumLayout === 'tiles' ? (
                    <AlbumSection
                      items={albums}
                      tracksByFolder={albumTracksByFolder}
                      tracksHydrating={albumTracksHydrating}
                      onOpen={openAlbum}
                      adminCatalog={isAdminCatalog}
                      onFolderUpdated={applyFolderPatch}
                      onFolderArchived={applyFolderArchived}
                      onTracksReordered={applyFolderTracks}
                      onVisibilityChange={applyFolderVisibility}
                      onAddedToLibrary={applyAddedToLibrary}
                    />
                  ) : (
                    <AlbumCatalog
                      items={albums}
                      tracksByFolder={albumTracksByFolder}
                      tracksHydrating={albumTracksHydrating}
                      currentTrackId={currentTrack?.id}
                      isPlaying={isPlaying}
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={handleSort}
                      onRate={handleRate}
                      sortIcon={sortIcon}
                      adminCatalog={isAdminCatalog}
                      onTrackUpdated={applyTrackPatch}
                      onTrackArchived={applyTrackArchived}
                      onFolderUpdated={applyFolderPatch}
                      onFolderArchived={applyFolderArchived}
                      onTracksReordered={applyFolderTracks}
                      onVisibilityChange={applyFolderVisibility}
                      onAddedToLibrary={applyAddedToLibrary}
                      onPlayGroup={(group, track) => {
                        const folderId = track.folderId || group[0]?.folderId
                        const source = folderId ? { type: 'folder' as const, id: folderId } : browsePlayerSource()
                        const startQueue = readCatalogRandomSetting() ? [track] : group
                        playTrack(track as any, startQueue as any, source)
                        recordTrackPlay(track.id, { source: 'album' })
                      }}
                    />
                  )
                ) : (
                  <div className="text-center py-12 text-gray-500">No crates or EPs found</div>
                )
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
                      const source = selectedAlbumId ? { type: 'folder' as const, id: selectedAlbumId } : undefined
                      const startQueue = readCatalogRandomSetting() ? [track] : albumTracks
                      playTrack(track as any, startQueue as any, source)
                      recordTrackPlay(track.id, { source: 'album' })
                    }}
                    onRate={handleRate}
                    sortIcon={sortIcon}
                    showTrackNumber
                    adminCatalog={isAdminCatalog}
                    playerSource={selectedAlbumId ? { type: 'folder', id: selectedAlbumId } : null}
                    onTrackUpdated={applyTrackPatch}
                    onTrackArchived={applyTrackArchived}
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
            </>
          )}
        </div>
      </div>

      {playlistsSectionMenu && isAdminCatalog && (
        <div
          ref={playlistsSectionMenuClamp.ref}
          {...playlistsSectionMenuClamp.rootProps}
          role="menu"
          aria-label="Playlist section actions"
          className="fixed w-56 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          style={playlistsSectionMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader title="Playlists" headerProps={playlistsSectionMenuClamp.headerProps} />
          <div className="py-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={openNewPlaylistDialog}
          >
            <FaPlus className="h-3 w-3 text-gray-500" />
            New playlist
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => void refreshCuratedPlaylists()}
          >
            <FaSync className="h-3 w-3 text-gray-500" />
            Refresh playlists
          </button>
          <Link
            href="/admin/music-library"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => setPlaylistsSectionMenu(null)}
          >
            <FaExternalLinkAlt className="h-3 w-3 text-gray-500" />
            Open Music Library
          </Link>
          </div>
        </div>
      )}

      {playlistCreateOpen && isAdminCatalog && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="New playlist"
        >
          <div
            ref={playlistCreateRef}
            className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-sm font-semibold text-white">New playlist</div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Name
            </label>
            <input
              autoFocus
              className="mb-3 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
              value={playlistCreateDraft.name}
              onChange={(e) => setPlaylistCreateDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewPlaylist()
              }}
              placeholder="Playlist name"
            />
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Description
            </label>
            <input
              className="mb-3 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
              value={playlistCreateDraft.description}
              onChange={(e) => setPlaylistCreateDraft((d) => ({ ...d, description: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewPlaylist()
              }}
              placeholder="Optional"
            />
            {playlistCreateError && (
              <p className="mb-3 text-xs text-red-400">{playlistCreateError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
                onClick={() => setPlaylistCreateOpen(false)}
                disabled={playlistCreateBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                onClick={() => void submitNewPlaylist()}
                disabled={playlistCreateBusy}
              >
                {playlistCreateBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ===== Bulk track edit (multi-select) ===== */

type BulkEditFieldKey =
  | 'artist'
  | 'genre'
  | 'subgenre'
  | 'bpm'
  | 'key_signature'
  | 'year'
  | 'dateCreated'
  | 'dateReleased'

type BulkFieldAnalysis = {
  uniform: boolean
  value: string
  mixedCount: number
  summary: string
  values: string[]
}

type BulkTrackSelectionAnalysis = {
  fields: Record<BulkEditFieldKey, BulkFieldAnalysis>
  dominantGenre: { value: string; count: number } | null
  dominantArtist: { value: string; count: number } | null
}

type BulkEditDraft = Record<BulkEditFieldKey, string>

function analyzeBulkField(rawValues: string[]): BulkFieldAnalysis {
  const nonEmpty = rawValues.map((v) => v.trim()).filter(Boolean)
  const unique = [...new Set(nonEmpty)]
  if (unique.length === 0) {
    return { uniform: true, value: '', mixedCount: 0, summary: 'Empty on all tracks', values: [] }
  }
  if (unique.length === 1) {
    return { uniform: true, value: unique[0], mixedCount: 1, summary: unique[0], values: unique }
  }
  return {
    uniform: false,
    value: '',
    mixedCount: unique.length,
    summary: `Mixed (${unique.length} values)`,
    values: unique,
  }
}

function dominantBulkValue(values: string[]): { value: string; count: number } | null {
  const counts = new Map<string, number>()
  for (const v of values) {
    const key = v.trim()
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let best: { value: string; count: number } | null = null
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count }
  }
  return best
}

function analyzeBulkTrackSelection(tracks: Track[]): BulkTrackSelectionAnalysis {
  const genreValues = tracks.map((t) => displayTrackGenre(t) || t.genre || '')
  const artistValues = tracks.map((t) => t.artist || '')
  return {
    fields: {
      artist: analyzeBulkField(artistValues),
      genre: analyzeBulkField(genreValues),
      subgenre: analyzeBulkField(tracks.map((t) => displayTrackSubgenre(t) || t.subgenre || '')),
      bpm: analyzeBulkField(tracks.map((t) => (t.bpm != null ? String(t.bpm) : ''))),
      key_signature: analyzeBulkField(tracks.map((t) => displayTrackKey(t) || t.key_signature || '')),
      year: analyzeBulkField(tracks.map((t) => (t.year != null ? String(t.year) : ''))),
      dateCreated: analyzeBulkField(tracks.map((t) => trackDateCreatedIso(t))),
      dateReleased: analyzeBulkField(tracks.map((t) => (t.date ? String(t.date).slice(0, 10) : ''))),
    },
    dominantGenre: dominantBulkValue(genreValues),
    dominantArtist: dominantBulkValue(artistValues),
  }
}

function bulkDraftFromAnalysis(analysis: BulkTrackSelectionAnalysis): BulkEditDraft {
  const f = analysis.fields
  return {
    artist: f.artist.uniform ? f.artist.value : '',
    genre: f.genre.uniform ? f.genre.value : '',
    subgenre: f.subgenre.uniform ? f.subgenre.value : '',
    bpm: f.bpm.uniform ? f.bpm.value : '',
    key_signature: f.key_signature.uniform ? f.key_signature.value : '',
    year: f.year.uniform ? f.year.value : '',
    dateCreated: f.dateCreated.uniform ? f.dateCreated.value : '',
    dateReleased: f.dateReleased.uniform ? f.dateReleased.value : '',
  }
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
  adminCatalog = false,
  loading = false,
  onTrackUpdated,
  onTrackArchived,
  playlistContext = null,
  onTrackRemovedFromPlaylist,
  onTracksRemovedFromPlaylist,
  onPlaylistReorder,
  acceptVaultFileDrop = false,
  vaultDropActive = false,
  vaultDropBusy = false,
  vaultDropItems = [],
  onVaultDropActiveChange,
  onVaultFilesDropped,
  playerSource = null,
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
  adminCatalog?: boolean
  loading?: boolean
  onTrackUpdated?: (track: Track) => void
  onTrackArchived?: (trackId: string) => void
  playlistContext?: { id: string; name: string } | null
  onTrackRemovedFromPlaylist?: (playlistId: string, trackId: string) => void
  onTracksRemovedFromPlaylist?: (playlistId: string, trackIds: string[]) => void
  onPlaylistReorder?: (playlistId: string, orderedTrackIds: string[]) => void | Promise<void>
  /** Admin: drop OS audio — match vault or auto-ingest, then populate playlist */
  acceptVaultFileDrop?: boolean
  vaultDropActive?: boolean
  vaultDropBusy?: boolean
  vaultDropItems?: PlaylistDropItem[]
  onVaultDropActiveChange?: (active: boolean) => void
  onVaultFilesDropped?: (files: FileList | File[]) => void
  playerSource?: PlayerSource
}) {
  const { playNext, addToQueue, playQueue } = useMusicPlayer()
  const [visibleOptional, setVisibleOptional] = useState<Set<SongTableOptionalColumn>>(() => loadSongTableColumnVisibility())
  const [columnOrder, setColumnOrder] = useState<SongTableReorderableColumn[]>(() => loadSongTableColumnOrder())
  const columnDragRef = useRef<SongTableReorderableColumn | null>(null)
  const [columnDragOver, setColumnDragOver] = useState<SongTableReorderableColumn | null>(null)
  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number } | null>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const [trackMenu, setTrackMenu] = useState<{ x: number; y: number; track: Track } | null>(null)
  const trackMenuRef = useRef<HTMLDivElement>(null)
  const trackMenuClamp = useClampedFixedMenuPosition(
    !!trackMenu,
    trackMenu,
    { width: 288, height: 480 },
    { externalRef: trackMenuRef },
  )
  const columnMenuClamp = useClampedFixedMenuPosition(
    !!columnMenu,
    columnMenu,
    { width: 200, height: 320 },
    { externalRef: columnMenuRef },
  )
  const editModalRef = useRef<HTMLDivElement>(null)
  const bulkEditModalRef = useRef<HTMLDivElement>(null)
  const tapTempoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dnaReportRef = useRef<HTMLDivElement>(null)
  const [authUser, setAuthUser] = useState<{ isAdmin: boolean } | null>(null)
  const [fanPlaylists, setFanPlaylists] = useState<{ id: string; name: string }[]>([])
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(() => new Set())
  const [cartIds, setCartIds] = useState<Set<string>>(() => new Set())
  const [vaultFavoriteIds, setVaultFavoriteIds] = useState<Set<string>>(() => new Set())
  const [fanDataLoading, setFanDataLoading] = useState(false)
  const [fanActionBusy, setFanActionBusy] = useState(false)
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [editTrack, setEditTrack] = useState<Track | null>(null)
  const [editDraft, setEditDraft] = useState({
    title: '',
    artist: '',
    genre: '',
    subgenre: '',
    bpm: '',
    key_signature: '',
    dateCreated: '',
    dateReleased: '',
    artwork: '',
  })
  const [editArtBusy, setEditArtBusy] = useState(false)
  const editArtFileRef = useRef<HTMLInputElement>(null)
  const editArtBlobRef = useRef<string | null>(null)
  const [catalogPlaylists, setCatalogPlaylists] = useState<Playlist[] | null>(null)
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false)
  const [removeFromPlaylistConfirm, setRemoveFromPlaylistConfirm] = useState(false)
  const [dnaProgress, setDnaProgress] = useState<Record<string, SonicDnaProgress>>({})
  const [dnaNotice, setDnaNotice] = useState<string | null>(null)
  const [dnaReportTrack, setDnaReportTrack] = useState<Track | null>(null)
  const [bpmDetecting, setBpmDetecting] = useState(false)
  const [bpmCandidates, setBpmCandidates] = useState<BeatCountCandidate[]>([])
  const [bpmAccuracyScores, setBpmAccuracyScores] = useState<BpmAccuracyScore[]>([])
  const [beatCountNote, setBeatCountNote] = useState<string | null>(null)
  const [tapTempoTaps, setTapTempoTaps] = useState<number[]>([])
  const [tapTempoBpm, setTapTempoBpm] = useState<number | null>(null)
  const [tapTempoAverageBpm, setTapTempoAverageBpm] = useState<number | null>(null)
  const [tapTempoSectionBeat, setTapTempoSectionBeat] = useState(0)
  const [tapTempoSectionsCompleted, setTapTempoSectionsCompleted] = useState(0)
  const [tapTempoSectionBpms, setTapTempoSectionBpms] = useState<number[]>([])
  const [tapTempoJitterMs, setTapTempoJitterMs] = useState<number | null>(null)
  const [tapTempoConfidence, setTapTempoConfidence] = useState(0)
  const [keyDetecting, setKeyDetecting] = useState(false)
  const [keyCandidates, setKeyCandidates] = useState<RankedKeyPick[]>([])
  const [keyNote, setKeyNote] = useState<string | null>(null)
  const [toplineCandidates, setToplineCandidates] = useState<RankedKeyPick[]>([])
  const [toplineNote, setToplineNote] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const tableRootRef = useRef<HTMLDivElement>(null)
  const tableIdRef = useRef(`songs-table-${++songsTableIdSeq}`)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [reorderBusy, setReorderBusy] = useState(false)
  const [yearFillBusy, setYearFillBusy] = useState(false)
  const [yearFillNote, setYearFillNote] = useState<string | null>(null)
  const [releaseDateBusy, setReleaseDateBusy] = useState(false)
  const [releaseDateNote, setReleaseDateNote] = useState<string | null>(null)
  const [bulkEditTracks, setBulkEditTracks] = useState<Track[] | null>(null)
  const [bulkEditAnalysis, setBulkEditAnalysis] = useState<BulkTrackSelectionAnalysis | null>(null)
  const [bulkEditDraft, setBulkEditDraft] = useState<BulkEditDraft>({
    artist: '',
    genre: '',
    subgenre: '',
    bpm: '',
    key_signature: '',
    year: '',
    dateCreated: '',
    dateReleased: '',
  })
  const [bulkEditTouched, setBulkEditTouched] = useState<Set<BulkEditFieldKey>>(() => new Set())
  const [bulkEditNote, setBulkEditNote] = useState<string | null>(null)
  const rowDragActiveRef = useRef(false)

  const playlistOrganize = Boolean(playlistContext && onPlaylistReorder)

  useEffect(() => {
    setSelectedIds(new Set())
    setSelectionAnchorId(null)
  }, [playlistContext?.id, tracks.length])

  const markTableActive = useCallback(() => {
    activeSongsTableId = tableIdRef.current
  }, [])

  const fanListsInFlightRef = useRef(false)

  const loadFanLists = useCallback(async () => {
    if (adminCatalog) {
      setAuthUser({ isAdmin: true })
      return
    }
    if (fanListsInFlightRef.current) return
    fanListsInFlightRef.current = true
    try {
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
        if (plRes.status === 401 || colRes.status === 401) {
          setFanPlaylists([])
          setWishlistIds(new Set())
          setCartIds(new Set())
          setVaultFavoriteIds(new Set())
          return
        }
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
    } finally {
      fanListsInFlightRef.current = false
    }
  }, [adminCatalog])

  useEffect(() => {
    void loadFanLists()
  }, [loadFanLists])

  const orderedVisibleColumns = useMemo(
    () => visibleColumnOrder(columnOrder, visibleOptional, adminCatalog),
    [columnOrder, visibleOptional, adminCatalog]
  )

  const displayTracks = useMemo(() => {
    const sorted = sortSongTableTracks(tracks, sortField, sortDir)
    const seen = new Set<string>()
    return sorted.filter((track) => {
      if (!track.id || seen.has(track.id)) return false
      seen.add(track.id)
      return true
    })
  }, [tracks, sortField, sortDir])

  const selectedTracks = useMemo(
    () => displayTracks.filter((t) => selectedIds.has(t.id)),
    [displayTracks, selectedIds],
  )
  const selectedCount = selectedTracks.length

  const onColumnDragStart = useCallback((colKey: SongTableReorderableColumn) => (e: React.DragEvent) => {
    columnDragRef.current = colKey
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', colKey)
  }, [])

  const onColumnDragOver = useCallback((colKey: SongTableReorderableColumn) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setColumnDragOver(colKey)
  }, [])

  const onColumnDragLeave = useCallback(() => {
    setColumnDragOver(null)
  }, [])

  const onColumnDrop = useCallback(
    (target: SongTableReorderableColumn) => (e: React.DragEvent) => {
      e.preventDefault()
      const from = columnDragRef.current
      columnDragRef.current = null
      setColumnDragOver(null)
      if (!from || from === target) return
      setColumnOrder((prev) => {
        const next = reorderColumns(prev, from, target)
        saveSongTableColumnOrder(next)
        return next
      })
    },
    []
  )

  const onColumnDragEnd = useCallback(() => {
    columnDragRef.current = null
    setColumnDragOver(null)
  }, [])

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
    if (!editTrack) return
    const next = tracks.find((row) => row.id === editTrack.id)
    if (!next) return
    setEditTrack((current) => {
      if (!current || current.id !== next.id) return current
      if (
        current.sonic_dna === next.sonic_dna &&
        current.sonic_dna_status === next.sonic_dna_status &&
        current.artwork === next.artwork &&
        current.bpm === next.bpm &&
        current.genre === next.genre &&
        current.subgenre === next.subgenre &&
        current.key_signature === next.key_signature &&
        current.date === next.date &&
        current.year === next.year
      ) {
        return current
      }
      return { ...current, ...next }
    })
  }, [tracks, editTrack?.id])

  useEffect(() => {
    if (!trackMenu && !columnMenu && !editTrack && !dnaReportTrack && !bulkEditTracks) return
    const closeAll = () => {
      setTrackMenu(null)
      setColumnMenu(null)
      setPlaylistPickerOpen(false)
      setRemoveFromPlaylistConfirm(false)
      setAdminError(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dnaReportTrack) {
        setDnaReportTrack(null)
        return
      }
      if (bulkEditTracks) {
        setBulkEditTracks(null)
        setBulkEditAnalysis(null)
        setBulkEditTouched(new Set())
        setBulkEditNote(null)
        return
      }
      if (editTrack) {
        setEditTrack(null)
        return
      }
      closeAll()
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (dnaReportRef.current?.contains(t)) return
      if (dnaReportTrack) {
        setDnaReportTrack(null)
        return
      }
      if (bulkEditModalRef.current?.contains(t)) return
      if (bulkEditTracks) {
        setBulkEditTracks(null)
        setBulkEditAnalysis(null)
        setBulkEditTouched(new Set())
        setBulkEditNote(null)
        return
      }
      if (editModalRef.current?.contains(t)) return
      if (editTrack) {
        setEditTrack(null)
        return
      }
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
  }, [trackMenu, columnMenu, editTrack, dnaReportTrack, bulkEditTracks])

  const genrePicker = useMemo(
    () => (editTrack ? genrePickerModel(editTrack, editDraft.genre) : null),
    [editTrack, editDraft.genre],
  )
  const bulkGenrePicker = useMemo(() => {
    if (!bulkEditTracks?.length) return null
    return genrePickerModel(bulkEditTracks[0], bulkEditDraft.genre)
  }, [bulkEditTracks, bulkEditDraft.genre])
  const bulkSelectionAnalysis = useMemo(
    () => (selectedCount > 1 ? analyzeBulkTrackSelection(selectedTracks) : null),
    [selectedCount, selectedTracks],
  )

  const touchBulkField = useCallback((key: BulkEditFieldKey, value: string) => {
    setBulkEditDraft((d) => ({ ...d, [key]: value }))
    setBulkEditTouched((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  const openBulkEditModal = (targets: Track[]) => {
    if (targets.length < 2) return
    const analysis = analyzeBulkTrackSelection(targets)
    setBulkEditAnalysis(analysis)
    setBulkEditTracks(targets)
    setBulkEditDraft(bulkDraftFromAnalysis(analysis))
    setBulkEditTouched(new Set())
    setBulkEditNote(null)
    setAdminError(null)
    setTrackMenu(null)
  }

  const applyBulkTrackUpdate = async (
    track: Track,
    touched: Set<BulkEditFieldKey>,
    draft: BulkEditDraft,
  ): Promise<Track | null> => {
    const updates: Partial<Track> = {}
    let nextMetadata: Record<string, unknown> | undefined
    let genreChanged = false
    let sonicDna = track.sonic_dna

    if (touched.has('artist')) updates.artist = draft.artist.trim()
    if (touched.has('bpm')) {
      const bpmRaw = draft.bpm.trim()
      updates.bpm = bpmRaw === '' ? undefined : Number(bpmRaw)
    }
    if (touched.has('key_signature')) {
      updates.key_signature = draft.key_signature.trim() || undefined
    }
    if (touched.has('year')) {
      const yearRaw = draft.year.trim()
      updates.year = yearRaw === '' ? (null as unknown as undefined) : Number(yearRaw)
    }
    if (touched.has('dateReleased')) {
      updates.date = (draft.dateReleased.trim() || null) as string | undefined
    }
    if (touched.has('dateCreated')) {
      const dateCreatedRaw = draft.dateCreated.trim()
      const prevMeta =
        track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
          ? (track.metadata as Record<string, unknown>)
          : {}
      nextMetadata = {
        ...prevMeta,
        ...(dateCreatedRaw
          ? {
              original_date: dateCreatedRaw,
              original_date_source:
                typeof prevMeta.original_date_source === 'string'
                  ? prevMeta.original_date_source
                  : 'manual',
            }
          : {}),
      }
      const yearFromDate = dateCreatedRaw ? Number(dateCreatedRaw.slice(0, 4)) : undefined
      if (yearFromDate && Number.isFinite(yearFromDate)) {
        updates.year = yearFromDate
      }
      updates.metadata = nextMetadata
      if (dateCreatedRaw) updates.date_created = dateCreatedRaw
    }
    if (touched.has('genre') || touched.has('subgenre')) {
      const genre = (touched.has('genre') ? draft.genre : displayTrackGenre(track) || track.genre || '').trim()
      const subgenre = (touched.has('subgenre') ? draft.subgenre : displayTrackSubgenre(track) || track.subgenre || '').trim()
      const prevGenre = (displayTrackGenre(track) || track.genre || '').trim()
      const prevSub = (displayTrackSubgenre(track) || track.subgenre || '').trim()
      genreChanged = genre !== prevGenre || subgenre !== prevSub
      updates.genre = genre || undefined
      updates.subgenre = subgenre || undefined
      if (genreChanged) {
        if (!sonicDna) {
          const params = new URLSearchParams()
          appendSonicDnaLookupParams(params, {
            libraryTrackId: track.id,
            audioFileId: track.audioFileId,
            file: track.file,
            title: track.title,
          })
          const res = await fetch(`/api/audio/sonic-dna?${params.toString()}`, { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok) sonicDna = data.sonicDNA || sonicDna
        }
        sonicDna = applyPreferredGenreToSonicDna(sonicDna, genre, subgenre)
        updates.sonic_dna = sonicDna
      }
    }

    if (!Object.keys(updates).length) return null

    const saved = await updateTrack(track.id, updates)
    const nextTrack =
      saved ||
      ({
        ...track,
        ...updates,
        sonic_dna: updates.sonic_dna ?? track.sonic_dna,
        metadata: updates.metadata ?? track.metadata,
      } as Track)
    onTrackUpdated?.(nextTrack)
    if (genreChanged && (updates.genre || updates.subgenre)) {
      await runTrackSonicDna(
        nextTrack,
        preferredGenreDirective(updates.genre || '', updates.subgenre || ''),
      )
    }
    return nextTrack
  }

  const saveBulkEdit = async () => {
    if (!bulkEditTracks?.length || bulkEditTouched.size === 0) {
      setAdminError('Change at least one field to apply a bulk edit')
      return
    }
    const touched = bulkEditTouched
    const draft = bulkEditDraft
    if (touched.has('bpm') && draft.bpm.trim() !== '' && !Number.isFinite(Number(draft.bpm.trim()))) {
      setAdminError('BPM must be a number')
      return
    }
    if (touched.has('year') && draft.year.trim() !== '' && !Number.isFinite(Number(draft.year.trim()))) {
      setAdminError('Year must be a number')
      return
    }
    if (touched.has('dateCreated') && draft.dateCreated.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dateCreated.trim())) {
      setAdminError('Date created must be YYYY-MM-DD')
      return
    }
    if (touched.has('dateReleased') && draft.dateReleased.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dateReleased.trim())) {
      setAdminError('Date released must be YYYY-MM-DD')
      return
    }

    setAdminBusy(true)
    setAdminError(null)
    setBulkEditNote(null)
    let updated = 0
    try {
      for (const track of bulkEditTracks) {
        const result = await applyBulkTrackUpdate(track, touched, draft)
        if (result) updated += 1
      }
      invalidateMusicLibraryCache()
      setBulkEditNote(`Updated ${updated} of ${bulkEditTracks.length} tracks`)
      if (updated > 0) {
        setBulkEditTracks(null)
        setBulkEditAnalysis(null)
        setBulkEditTouched(new Set())
      }
    } catch (err: any) {
      setAdminError(err?.message || 'Bulk edit failed')
    } finally {
      setAdminBusy(false)
    }
  }

  const quickUnifyBulkField = async (field: 'genre' | 'artist', value: string, targets: Track[]) => {
    if (!value.trim() || targets.length < 2) return
    setAdminBusy(true)
    setAdminError(null)
    try {
      const draft: BulkEditDraft = {
        artist: '',
        genre: '',
        subgenre: '',
        bpm: '',
        key_signature: '',
        year: '',
        dateCreated: '',
        dateReleased: '',
      }
      draft[field] = value.trim()
      const touched = new Set<BulkEditFieldKey>([field])
      let updated = 0
      for (const track of targets) {
        const result = await applyBulkTrackUpdate(track, touched, draft)
        if (result) updated += 1
      }
      invalidateMusicLibraryCache()
      setDnaNotice(`Set ${field} to “${value.trim()}” on ${updated} tracks`)
      setTrackMenu(null)
    } catch (err: any) {
      setAdminError(err?.message || `Failed to unify ${field}`)
    } finally {
      setAdminBusy(false)
    }
  }

  const openTrackMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    setColumnMenu(null)
    setPlaylistPickerOpen(false)
    setRemoveFromPlaylistConfirm(false)
    setAdminError(null)
    setDnaNotice(null)
    // iTunes-like: right-click on unselected row selects only that row
    setSelectedIds((prev) => {
      if (prev.has(track.id) && prev.size > 0) return prev
      return new Set([track.id])
    })
    markTableActive()
    setSelectionAnchorId(track.id)
    setTrackMenu({ x: e.clientX, y: e.clientY, track })
    if (adminCatalog) {
      void fetchSonicDnaProgress(track).then((progress) => {
        setDnaProgress((prev) => ({ ...prev, [track.id]: progress }))
      }).catch(() => {})
    }
  }

  const selectTrackAt = useCallback(
    (index: number, e: React.MouseEvent) => {
      const track = displayTracks[index]
      if (!track) return
      markTableActive()
      if (e.shiftKey) e.preventDefault()
      if (e.metaKey || e.ctrlKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(track.id)) next.delete(track.id)
          else next.add(track.id)
          return next
        })
        setSelectionAnchorId(track.id)
        return
      }
      if (e.shiftKey && selectionAnchorId) {
        setSelectedIds(new Set(visibleSelectionRangeIds(displayTracks, index, selectionAnchorId)))
        return
      }
      setSelectedIds(new Set([track.id]))
      setSelectionAnchorId(track.id)
    },
    [displayTracks, selectionAnchorId, markTableActive],
  )

  const selectAllTracks = useCallback(() => {
    setSelectedIds(new Set(displayTracks.map((t) => t.id)))
    setSelectionAnchorId(displayTracks[0]?.id ?? null)
  }, [displayTracks])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectionAnchorId(null)
  }, [])

  const persistPlaylistOrder = useCallback(
    async (nextTracks: Track[]) => {
      if (!playlistContext || !onPlaylistReorder) return
      setReorderBusy(true)
      try {
        await onPlaylistReorder(
          playlistContext.id,
          nextTracks.map((t) => t.id),
        )
      } finally {
        setReorderBusy(false)
      }
    },
    [playlistContext, onPlaylistReorder],
  )

  const onRowDragStart = (e: React.DragEvent, index: number, track: Track) => {
    const origin = e.target as HTMLElement | null
    if (origin?.closest('input, button, a, textarea, select')) {
      e.preventDefault()
      return
    }
    markTableActive()
    const ids = selectedIds.has(track.id) && selectedIds.size > 0
      ? displayTracks.filter((t) => selectedIds.has(t.id)).map((t) => t.id)
      : [track.id]
    if (!selectedIds.has(track.id)) {
      setSelectedIds(new Set([track.id]))
      setSelectionAnchorId(track.id)
    }
    if (playlistOrganize) rowDragActiveRef.current = true
    e.dataTransfer.setData(SERGIK_PLAYLIST_DRAG_MIME, JSON.stringify(ids))
    e.dataTransfer.setData('text/plain', ids.join(','))
    e.dataTransfer.effectAllowed = playlistOrganize ? 'copyMove' : 'copy'
  }

  const onRowDragOver = (e: React.DragEvent, index: number) => {
    if (!playlistOrganize) return
    if (
      !e.dataTransfer.types.includes(SERGIK_PLAYLIST_DRAG_MIME) &&
      !rowDragActiveRef.current
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) setDragOverIndex(index)
  }

  const onRowDrop = async (e: React.DragEvent, index: number) => {
    if (!playlistOrganize) return
    const raw =
      e.dataTransfer.getData(SERGIK_PLAYLIST_DRAG_MIME) ||
      e.dataTransfer.getData('text/plain')
    if (!raw) return
    e.preventDefault()
    e.stopPropagation()
    setDragOverIndex(null)
    rowDragActiveRef.current = false
    let movingIds: string[] = []
    try {
      const parsed = JSON.parse(raw)
      movingIds = Array.isArray(parsed) ? parsed.map(String) : raw.split(',').filter(Boolean)
    } catch {
      movingIds = raw.split(',').filter(Boolean)
    }
    if (!movingIds.length) return
    const targetTrack = displayTracks[index]
    const targetIndex = targetTrack ? tracks.findIndex((t) => t.id === targetTrack.id) : index
    const next = reorderTracksByIds(tracks, movingIds, targetIndex >= 0 ? targetIndex : index)
    const same =
      next.length === tracks.length && next.every((t, i) => t.id === tracks[i]?.id)
    if (same) return
    await persistPlaylistOrder(next)
  }

  const onRowDragEnd = () => {
    rowDragActiveRef.current = false
    setDragOverIndex(null)
  }

  const menuTargetTracks = selectedCount > 0 ? selectedTracks : trackMenu ? [trackMenu.track] : []

  const playSelection = () => {
    if (!menuTargetTracks.length) return
    playQueue(menuTargetTracks as any, 0, playerSource ?? undefined)
    setTrackMenu(null)
  }

  const playSelectionNext = () => {
    if (!menuTargetTracks.length) return
    playNext(menuTargetTracks as any)
    setTrackMenu(null)
  }

  const addSelectionToUpNext = () => {
    for (const t of menuTargetTracks) addToQueue(t as any)
    setTrackMenu(null)
  }

  const removeSelectionFromPlaylist = async () => {
    if (!playlistContext || !menuTargetTracks.length) return
    setAdminBusy(true)
    try {
      const ids = menuTargetTracks.map((t) => t.id)
      const list = catalogPlaylists || (await fetchPlaylists({ includeArchived: false }))
      const playlist = list.find((p) => p.id === playlistContext.id)
      if (!playlist) throw new Error('Playlist not found')
      const drop = new Set(ids)
      const nextTrackIds = playlist.trackIds.filter((id) => !drop.has(id))
      await updatePlaylist(playlistContext.id, { trackIds: nextTrackIds })
      if (onTracksRemovedFromPlaylist) {
        onTracksRemovedFromPlaylist(playlistContext.id, ids)
      } else {
        for (const id of ids) onTrackRemovedFromPlaylist?.(playlistContext.id, id)
      }
      invalidateMusicLibraryCache()
      setSelectedIds(new Set())
      setTrackMenu(null)
      setRemoveFromPlaylistConfirm(false)
    } catch (err: any) {
      setAdminError(err?.message || 'Failed to remove from playlist')
    } finally {
      setAdminBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeSongsTableId !== tableIdRef.current) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && displayTracks.length) {
        e.preventDefault()
        selectAllTracks()
        return
      }
      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && playlistContext && selectedCount > 0) {
        e.preventDefault()
        setRemoveFromPlaylistConfirm(true)
        if (!trackMenu && selectedTracks[0]) {
          setTrackMenu({ x: 120, y: 120, track: selectedTracks[0] })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    displayTracks.length,
    selectAllTracks,
    clearSelection,
    playlistContext,
    selectedCount,
    selectedTracks,
    trackMenu,
  ])

  useEffect(() => {
    const processingIds = Object.entries(dnaProgress)
      .filter(([, value]) => value.status === 'processing')
      .map(([id]) => id)
    if (!processingIds.length) return
    const tracksById = new Map(tracks.map((t) => [t.id, t]))
    const timer = window.setInterval(() => {
      void Promise.all(
        processingIds.map(async (id) => {
          const track = tracksById.get(id)
          if (!track) return
          const progress = await fetchSonicDnaProgress(track)
          setDnaProgress((prev) => ({ ...prev, [id]: progress }))
          if (
            progress.sonicDNA &&
            progress.status !== 'processing' &&
            (progress.status === 'completed' || progress.status === 'partial')
          ) {
            const next = applySonicDnaAnalysisToTrack(track, {
              sonicDna: progress.sonicDNA,
              status: progress.status,
            })
            onTrackUpdated?.(next)
            setDnaReportTrack((current) => (current?.id === id ? { ...current, ...next } : current))
          }
        }),
      )
    }, 2500)
    return () => window.clearInterval(timer)
  }, [dnaProgress, tracks, onTrackUpdated])

  const runTrackSonicDna = async (track: Track, directive?: string) => {
    const current = trackSonicDnaProgress(track, dnaProgress[track.id])
    if (current.status === 'completed' && !directive) {
      const ok =
        typeof window === 'undefined' ||
        window.confirm(`Re-run Sonic DNA analysis for “${track.title}”? Current state is ${current.percent}%.`)
      if (!ok) return
    }
    setAdminBusy(true)
    setAdminError(null)
    setDnaNotice(null)
    try {
      const data = await runCollectionSonicDna({
        libraryTrackId: track.id,
        collectionName: track.title,
        collectionType: 'track',
        directive,
      })
      setDnaProgress((prev) => ({
        ...prev,
        [track.id]: { status: 'processing', percent: 8, jobId: data.jobId || data.jobIds?.[0] || null },
      }))
      setDnaNotice(data.message || 'Queued Sonic DNA v2 analysis')
      onTrackUpdated?.({ ...track, sonic_dna_status: 'processing' })
      return data
    } catch (err: any) {
      setAdminError(err?.message || 'Failed to start Sonic DNA analysis')
      throw err
    } finally {
      setAdminBusy(false)
    }
  }

  const fillYearsFromOriginalDates = async (
    ids: string[],
    opts?: { onlyMissing?: boolean; force?: boolean; applyToEditDraftIds?: string[] },
  ) => {
    if (!ids.length) return []
    setYearFillBusy(true)
    setYearFillNote(null)
    setAdminError(null)
    try {
      const onlyMissing = opts?.onlyMissing ?? false
      const res = await fetch('/api/music-library/tracks/fill-original-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackIds: ids,
          onlyMissing,
          force: opts?.force ?? !onlyMissing,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to fill original dates')
      const updated = (data.updated || []) as {
        trackId: string
        year: number
        date: string
        source: string
      }[]
      const applyIds = new Set(opts?.applyToEditDraftIds || [])
      for (const row of updated) {
        const existing = tracks.find((t) => t.id === row.trackId)
        if (existing) {
          const prevMeta =
            existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
              ? (existing.metadata as Record<string, unknown>)
              : {}
          onTrackUpdated?.({
            ...existing,
            year: row.year,
            metadata: {
              ...prevMeta,
              original_date: row.date,
              original_date_source: row.source,
            },
          })
        }
        if (applyIds.has(row.trackId)) {
          setEditDraft((d) => ({ ...d, dateCreated: row.date.slice(0, 10) }))
          setEditTrack((t) => {
            if (!t || t.id !== row.trackId) return t
            const prevMeta =
              t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
                ? (t.metadata as Record<string, unknown>)
                : {}
            return {
              ...t,
              year: row.year,
              metadata: {
                ...prevMeta,
                original_date: row.date,
                original_date_source: row.source,
              },
            }
          })
        }
      }
      const note =
        updated.length > 0
          ? `Set created date for ${updated.length} from Exports SERGIK${
              data.exportFileCount ? ` (${data.exportFileCount} export files)` : ''
            }`
          : data.skippedCount
            ? 'No export matches (or dates already from Exports)'
            : 'No changes'
      setYearFillNote(note)
      invalidateMusicLibraryCache()
      setTrackMenu(null)
      return updated
    } catch (err: any) {
      setAdminError(err?.message || 'Failed to fill original dates')
      return []
    } finally {
      setYearFillBusy(false)
    }
  }

  const pullStudioReleaseDates = async (
    ids: string[],
    opts?: { onlyMissing?: boolean; applyToEditDraftIds?: string[] },
  ) => {
    if (!ids.length) return []
    setReleaseDateBusy(true)
    setReleaseDateNote(null)
    setAdminError(null)
    try {
      const res = await fetch('/api/music-library/tracks/pull-studio-release-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackIds: ids,
          apply: true,
          onlyMissing: opts?.onlyMissing ?? false,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to pull studio release dates')
      const updated = (data.updated || []) as {
        trackId: string
        date: string
        releaseTitle: string
        status: string
      }[]
      const applyIds = new Set(opts?.applyToEditDraftIds || [])
      for (const row of updated) {
        const existing = tracks.find((t) => t.id === row.trackId)
        if (existing) {
          onTrackUpdated?.({ ...existing, date: row.date })
        }
        if (applyIds.has(row.trackId)) {
          setEditDraft((d) => ({ ...d, dateReleased: row.date.slice(0, 10) }))
          setEditTrack((t) => (t && t.id === row.trackId ? { ...t, date: row.date } : t))
        }
      }
      const note =
        updated.length > 0
          ? `Set release date for ${updated.length} from Release Studio (${updated[0]?.status})`
          : data.suggestions?.length
            ? 'Studio release found but not applied'
            : 'No delivered/live Release Studio date linked'
      setReleaseDateNote(note)
      invalidateMusicLibraryCache()
      setTrackMenu(null)
      return updated
    } catch (err: any) {
      setAdminError(err?.message || 'Failed to pull studio release dates')
      return []
    } finally {
      setReleaseDateBusy(false)
    }
  }

  const openEditModal = (track: Track) => {
    if (editArtBlobRef.current) {
      URL.revokeObjectURL(editArtBlobRef.current)
      editArtBlobRef.current = null
    }
    setEditArtBusy(false)
    setEditDraft({
      title: track.title || '',
      artist: track.artist || '',
      genre: displayTrackGenre(track) || track.genre || '',
      subgenre: displayTrackSubgenre(track) || track.subgenre || '',
      bpm: track.bpm != null ? String(track.bpm) : '',
      key_signature: displayTrackKey(track) || track.key_signature || '',
      dateCreated: trackDateCreatedIso(track),
      dateReleased: track.date ? String(track.date).slice(0, 10) : '',
      artwork: track.artwork || '',
    })
    setAdminError(null)
    setYearFillNote(null)
    setReleaseDateNote(null)
    setBpmDetecting(false)
    setBpmCandidates([])
    setBpmAccuracyScores([])
    setBeatCountNote(null)
    setTapTempoTaps([])
    setTapTempoBpm(null)
    setTapTempoAverageBpm(null)
    setTapTempoSectionBeat(0)
    setTapTempoSectionsCompleted(0)
    setTapTempoSectionBpms([])
    setTapTempoJitterMs(null)
    setTapTempoConfidence(0)
    setKeyDetecting(false)
    setKeyCandidates([])
    setKeyNote(null)
    setToplineCandidates([])
    setToplineNote(null)
    if (tapTempoTimeoutRef.current) {
      clearTimeout(tapTempoTimeoutRef.current)
      tapTempoTimeoutRef.current = null
    }
    setEditTrack(track)
    setTrackMenu(null)
    void redetectEditKey(track)
    if (!trackDateCreatedIso(track) || !String((track.metadata as any)?.original_date_source || '').startsWith('export_folder')) {
      void fillYearsFromOriginalDates([track.id], {
        onlyMissing: false,
        force: true,
        applyToEditDraftIds: [track.id],
      })
    }
    if (!track.date) {
      void pullStudioReleaseDates([track.id], {
        onlyMissing: true,
        applyToEditDraftIds: [track.id],
      })
    }
  }

  const redetectEditBpm = async () => {
    if (!editTrack) return
    const audioUrl = editTrack.file
    if (!audioUrl) {
      setAdminError('No audio file on this track to analyze')
      return
    }
    setBpmDetecting(true)
    setAdminError(null)
    try {
      const measured = Number((editTrack as any).sonic_dna?.measured?.bpm)
      const current = Number(editDraft.bpm)
      const tapRef =
        tapTempoAverageBpm ??
        tapTempoBpm ??
        (tapTempoSectionBpms.length ? tapTempoSectionBpms[tapTempoSectionBpms.length - 1] : null)
      const result = await analyzeBeatCountFromUrl(audioUrl, [
        Number.isFinite(measured) ? measured : undefined,
        Number.isFinite(current) ? current : undefined,
        typeof tapRef === 'number' && Number.isFinite(tapRef) ? tapRef : undefined,
      ])
      if (!result.chosen && result.bpm == null) {
        setAdminError('Could not count beats on this file. Use tap tempo or Sonic DNA analysis.')
        return
      }
      const scored = scoreBpmSuggestionAccuracy(result.candidates.length ? result.candidates : [
        result.chosen || { bpm: result.bpm as number, hits: 0, expected: 0, lock: 0 },
      ], {
        tapBpm: typeof tapRef === 'number' ? tapRef : null,
        measuredBpm: Number.isFinite(measured) ? measured : null,
      })
      const best = scored[0]
      const next = best
        ? { bpm: best.bpm, hits: best.hits, expected: best.expected, lock: best.scanLock }
        : result.chosen || { bpm: result.bpm as number, hits: 0, expected: 0, lock: 0 }
      setEditDraft((d) => ({ ...d, bpm: String(next.bpm) }))
      setBpmCandidates(result.candidates)
      setBpmAccuracyScores(scored)
      const span = `${formatClock(result.windowSec)} full track`
      const dropHint =
        result.dropSec > 0 ? ` · first drop ${formatClock(result.dropSec)}` : ''
      const accuracyHint = formatBpmAccuracyNote(best)
      setBeatCountNote(
        [
          `Scan ${next.bpm} BPM`,
          accuracyHint || (next.expected > 0 ? `counted ${next.hits}/${next.expected}` : `${result.onsetCount} onsets`),
          span + dropHint,
        ]
          .filter(Boolean)
          .join(' · '),
      )
    } catch (err: any) {
      setAdminError(err?.message || 'Beat count failed')
    } finally {
      setBpmDetecting(false)
    }
  }

  /** Admin-only 16-beat section tap tempo — never touches playback. */
  const handleEditTapTempo = () => {
    if (!adminCatalog) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const result = recordTapTempo(tapTempoTaps, now, {
      sectionBpms: tapTempoSectionBpms,
      sectionsCompleted: tapTempoSectionsCompleted,
    })
    setTapTempoTaps(result.taps)
    setTapTempoBpm(result.bpm)
    setTapTempoAverageBpm(result.averageBpm)
    setTapTempoSectionBeat(result.sectionBeat)
    setTapTempoSectionsCompleted(result.sectionsCompleted)
    setTapTempoSectionBpms(result.sectionBpms)
    setTapTempoJitterMs(result.jitterMs)
    setTapTempoConfidence(result.confidence)

    const catalogBpm =
      Number(editDraft.bpm) ||
      Number(editTrack?.bpm) ||
      Number((editTrack as any)?.sonic_dna?.measured?.bpm) ||
      null
    const displayBpm = result.averageBpm ?? result.bpm
    const delta = tapTempoDelta(displayBpm, catalogBpm)
    const measured = Number((editTrack as any)?.sonic_dna?.measured?.bpm)
    const measuredDelta = tapTempoDelta(displayBpm, Number.isFinite(measured) ? measured : null)

    if (result.bpm == null && result.averageBpm == null) {
      setBeatCountNote(
        `Tap · beat ${result.sectionBeat}/${TAP_TEMPO_SECTION_BEATS} — keep a steady kick (BPM after ${TAP_TEMPO_MIN_INTERVALS + 1}+ taps)`,
      )
    } else {
      const jitter = result.jitterMs != null ? ` · ±${result.jitterMs.toFixed(1)} ms` : ''
      const sectionLabel =
        result.sectionsCompleted > 0
          ? ` · ${result.sectionsCompleted}×16 locked`
          : ` · beat ${result.sectionBeat}/${TAP_TEMPO_SECTION_BEATS}`
      const avgLabel =
        result.averageBpm != null && result.bpm != null && result.averageBpm !== result.bpm
          ? ` · avg ${result.averageBpm.toFixed(1)}`
          : ''
      const deltaLabel =
        delta == null ? '' : ` · Δ ${delta > 0 ? '+' : ''}${delta.toFixed(1)} vs catalog`
      const measuredLabel =
        measuredDelta == null
          ? ''
          : ` · Δ ${measuredDelta > 0 ? '+' : ''}${measuredDelta.toFixed(1)} vs measured`
      setBeatCountNote(
        `Tap · ${(displayBpm as number).toFixed(1)} BPM${sectionLabel}${avgLabel}${jitter}${deltaLabel}${measuredLabel}`,
      )
      // Write once the active section is stable enough (half section or a full lock)
      if (
        (result.confidence >= 0.45 && result.sectionBeat >= 8) ||
        result.sectionsCompleted >= 1
      ) {
        setEditDraft((d) => ({ ...d, bpm: (displayBpm as number).toFixed(1) }))
      }
    }

    if (tapTempoTimeoutRef.current) clearTimeout(tapTempoTimeoutRef.current)
    tapTempoTimeoutRef.current = setTimeout(() => {
      setTapTempoTaps([])
      setTapTempoSectionBeat(0)
      setTapTempoJitterMs(null)
      setTapTempoConfidence(0)
      // Keep completed section BPMs + average through the idle gap for refresh accuracy
    }, TAP_TEMPO_RESET_MS)
  }

  const redetectEditKey = async (track = editTrack) => {
    if (!track) return
    setKeyDetecting(true)
    setAdminError(null)
    try {
      let dna = track.sonic_dna
      const params = new URLSearchParams()
      appendSonicDnaLookupParams(params, {
        libraryTrackId: track.id,
        audioFileId: track.audioFileId,
        file: track.file,
        title: track.title,
      })
      const res = await fetch(`/api/audio/sonic-dna?${params.toString()}`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { sonicDNA?: unknown }
      if (res.ok && data.sonicDNA) dna = data.sonicDNA

      const reportKey = keySignatureFromSonicDnaReport(dna)
      const audioUrl = track.file
      const chroma = audioUrl ? await analyzeRootKeyFromUrl(audioUrl).catch(() => null) : null
      const dnaPick =
        reportKey?.key && reportKey.candidates[0]
          ? { candidate: reportKey.candidates[0], lock: reportKey.confidence, unpitched: reportKey.unpitched }
          : reportKey?.key
            ? {
                candidate: {
                  key: reportKey.key,
                  root: reportKey.root || reportKey.key,
                  scale: reportKey.scale || 'minor',
                  score: reportKey.confidence,
                  camelot: reportKey.camelot,
                },
                lock: reportKey.confidence,
                unpitched: reportKey.unpitched,
              }
            : null

      const best = pickBestKeyFromSources({
        dna: dnaPick,
        root: chroma,
        topline: chroma?.topline || null,
      })
      const chosen = best.chosen
      if (!chosen) {
        setAdminError('Could not read a pitch center. Run Sonic DNA analysis first.')
        return
      }

      setEditDraft((d) => ({ ...d, key_signature: chosen.key }))
      const rootPicks = best.candidates.filter((item) => item.source !== 'topline')
      const toplinePicks = best.candidates.filter((item) => item.source === 'topline')
      setKeyCandidates(rootPicks)
      setToplineCandidates(toplinePicks)
      const lock = Math.round(chosen.lock * 100)
      const sourceLabel = chosen.source === 'dna' ? 'Sonic DNA' : chosen.source === 'topline' ? 'topline' : 'root'
      setKeyNote(
        `Auto-picked ${chosen.key}${chosen.camelot ? ` · ${chosen.camelot}` : ''} (${lock}%) from ${sourceLabel}`,
      )
      const topAlt = toplinePicks[0]
      setToplineNote(
        topAlt
          ? `${topAlt.key}${topAlt.camelot ? ` · ${topAlt.camelot}` : ''} (${Math.round(topAlt.lock * 100)}%)${
              chosen.source === 'topline' ? ' · selected' : ''
            }`
          : null,
      )
    } catch (err: any) {
      setAdminError(err?.message || 'Key detection failed')
    } finally {
      setKeyDetecting(false)
    }
  }

  const uploadEditArtwork = async (file: File) => {
    if (!editTrack) return
    const reject = artworkUploadRejectReason(file)
    if (reject) {
      setAdminError(reject)
      return
    }
    if (editArtBlobRef.current) {
      URL.revokeObjectURL(editArtBlobRef.current)
      editArtBlobRef.current = null
    }
    const localPreview = URL.createObjectURL(file)
    editArtBlobRef.current = localPreview
    setEditDraft((d) => ({ ...d, artwork: localPreview }))
    setEditArtBusy(true)
    setAdminError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('trackId', editTrack.id)
      if (editTrack.audioFileId) formData.append('audioFileId', editTrack.audioFileId)
      if (editTrack.folderId) formData.append('folderId', editTrack.folderId)
      const res = await fetch('/api/audio/artwork', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Artwork upload failed')
      if (!data.artworkUrl) throw new Error('Upload did not return an artwork URL')
      const artworkUrl = stripArtworkCacheBust(String(data.artworkUrl))
      const busted = withArtworkCacheBust(artworkUrl)
      setEditDraft((d) => ({ ...d, artwork: busted }))
      setEditTrack((current) => (current ? { ...current, artwork: busted } : current))
      onTrackUpdated?.({ ...editTrack, artwork: busted, folderId: editTrack.folderId || data.folderId })
    } catch (err: any) {
      setEditDraft((d) =>
        d.artwork === localPreview ? { ...d, artwork: editTrack.artwork || '' } : d,
      )
      setAdminError(err?.message || 'Artwork upload failed')
    } finally {
      setEditArtBusy(false)
      if (editArtFileRef.current) editArtFileRef.current.value = ''
    }
  }

  const saveTrackEdit = async () => {
    if (!editTrack) return
    const bpmRaw = editDraft.bpm.trim()
    const dateCreatedRaw = editDraft.dateCreated.trim()
    const dateReleasedRaw = editDraft.dateReleased.trim()
    const bpm = bpmRaw === '' ? undefined : Number(bpmRaw)
    const year = dateCreatedRaw ? Number(dateCreatedRaw.slice(0, 4)) : undefined
    if (bpmRaw && !Number.isFinite(bpm)) {
      setAdminError('BPM must be a number')
      return
    }
    if (dateCreatedRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateCreatedRaw)) {
      setAdminError('Date created must be YYYY-MM-DD')
      return
    }
    if (dateCreatedRaw && !Number.isFinite(year)) {
      setAdminError('Date created year is invalid')
      return
    }
    if (dateReleasedRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateReleasedRaw)) {
      setAdminError('Date released must be YYYY-MM-DD')
      return
    }
    setAdminBusy(true)
    setAdminError(null)
    try {
      const genre = editDraft.genre.trim()
      const subgenre = editDraft.subgenre.trim()
      const prevGenre = (displayTrackGenre(editTrack) || editTrack.genre || '').trim()
      const prevSub = (displayTrackSubgenre(editTrack) || editTrack.subgenre || '').trim()
      const genreChanged = genre !== prevGenre || subgenre !== prevSub

      let sonicDna = editTrack.sonic_dna
      if (genreChanged) {
        if (!sonicDna) {
          const params = new URLSearchParams()
          appendSonicDnaLookupParams(params, {
            libraryTrackId: editTrack.id,
            audioFileId: editTrack.audioFileId,
            file: editTrack.file,
            title: editTrack.title,
          })
          const res = await fetch(`/api/audio/sonic-dna?${params.toString()}`, { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok) sonicDna = data.sonicDNA || sonicDna
        }
        sonicDna = applyPreferredGenreToSonicDna(sonicDna, genre, subgenre)
      }

      const prevMeta =
        editTrack.metadata && typeof editTrack.metadata === 'object' && !Array.isArray(editTrack.metadata)
          ? (editTrack.metadata as Record<string, unknown>)
          : {}
      const nextMetadata = {
        ...prevMeta,
        ...(dateCreatedRaw
          ? {
              original_date: dateCreatedRaw,
              original_date_source:
                typeof prevMeta.original_date_source === 'string'
                  ? prevMeta.original_date_source
                  : 'manual',
            }
          : {}),
      }

      const artworkToSave = stripArtworkCacheBust(editDraft.artwork)
      const prevArtwork = stripArtworkCacheBust(editTrack.artwork || '')
      const artworkChanged = artworkToSave !== prevArtwork
      const saved = await updateTrack(editTrack.id, {
        title: editDraft.title.trim(),
        artist: editDraft.artist.trim(),
        genre: genre || undefined,
        subgenre: subgenre || undefined,
        bpm,
        key_signature: editDraft.key_signature.trim() || undefined,
        year: (year ?? null) as unknown as number | undefined,
        date: (dateReleasedRaw || null) as string | undefined,
        date_created: (dateCreatedRaw || undefined) as string | undefined,
        metadata: nextMetadata,
        ...(genreChanged ? { sonic_dna: sonicDna } : {}),
        ...(artworkChanged ? { artwork: artworkToSave || null } : {}),
      })
      invalidateMusicLibraryCache()
      const nextTrack = {
        ...editTrack,
        title: editDraft.title.trim(),
        artist: editDraft.artist.trim(),
        genre: genre || editTrack.genre,
        subgenre: subgenre || editTrack.subgenre,
        bpm,
        key_signature: editDraft.key_signature.trim() || editTrack.key_signature,
        year,
        date: dateReleasedRaw || undefined,
        metadata: nextMetadata,
        sonic_dna: genreChanged ? sonicDna : editTrack.sonic_dna,
        artwork: artworkChanged
          ? artworkToSave || undefined
          : editDraft.artwork || editTrack.artwork,
      }
      onTrackUpdated?.(nextTrack)
      if (dnaReportTrack?.id === nextTrack.id) {
        setDnaReportTrack({
          ...dnaReportTrack,
          ...nextTrack,
          sonic_dna: genreChanged ? sonicDna : nextTrack.sonic_dna || dnaReportTrack.sonic_dna,
          genre: genre || nextTrack.genre,
          subgenre: subgenre || nextTrack.subgenre,
        })
      }
      if (genreChanged && (genre || subgenre)) {
        // Local encyclopedia already force-refilled for the new class; queue a guided rewrite for prose depth.
        await runTrackSonicDna(nextTrack, preferredGenreDirective(genre, subgenre))
      }
      setEditTrack(null)
    } catch (err: any) {
      setAdminError(err?.message || 'Failed to save track')
    } finally {
      setAdminBusy(false)
    }
  }

  const archiveTrack = async (track: Track) => {
    if (typeof window !== 'undefined' && !window.confirm(`Archive “${track.title}”? It stays in the library but is hidden from browse.`)) {
      return
    }
    setAdminBusy(true)
    setAdminError(null)
    try {
      await updateTrack(track.id, {
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      invalidateMusicLibraryCache()
      onTrackArchived?.(track.id)
      setTrackMenu(null)
    } catch (err: any) {
      setAdminError(err?.message || 'Failed to archive track')
    } finally {
      setAdminBusy(false)
    }
  }

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* ignore */
    }
    setTrackMenu(null)
  }

  const ensureCatalogPlaylists = async () => {
    if (catalogPlaylists) return catalogPlaylists
    try {
      const list = await fetchPlaylists({ includeArchived: false })
      setCatalogPlaylists(list)
      return list
    } catch {
      setCatalogPlaylists([])
      return []
    }
  }

  const addTrackToCatalogPlaylist = async (playlistId: string, trackId: string) => {
    const ids =
      selectedIds.has(trackId) && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [trackId]
    setAdminBusy(true)
    setAdminError(null)
    try {
      const list = await fetchPlaylists({ includeArchived: false })
      setCatalogPlaylists(list)
      const playlist = list.find((p) => p.id === playlistId)
      if (!playlist) throw new Error('Playlist not found')
      const next = [...playlist.trackIds]
      for (const id of ids) {
        if (!next.includes(id)) next.push(id)
      }
      if (next.length === playlist.trackIds.length) {
        setTrackMenu(null)
        return
      }
      await updatePlaylist(playlistId, { trackIds: next })
      setCatalogPlaylists((prev) =>
        (prev || []).map((p) => (p.id === playlistId ? { ...p, trackIds: next } : p))
      )
      emitCatalogSync({
        entity: 'playlist',
        entityId: playlistId,
        playlistId,
        patch: { trackIds: next },
      })
      setTrackMenu(null)
    } catch (err: any) {
      setAdminError(err?.message || 'Failed to add to playlist')
    } finally {
      setAdminBusy(false)
    }
  }

  const removeTrackFromCatalogPlaylist = async (_playlistId: string, _trackId: string) => {
    await removeSelectionFromPlaylist()
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
    if (loading && !(acceptVaultFileDrop && vaultDropItems.length)) {
      return <div className="text-center py-12 text-gray-500">Loading tracks...</div>
    }
    if (acceptVaultFileDrop && playlistContext) {
      return (
        <div
          className={`relative rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            vaultDropActive
              ? 'border-purple-400 bg-purple-500/10'
              : vaultDropBusy || vaultDropItems.length
                ? 'border-purple-500/40 bg-gray-900/40'
                : 'border-gray-700 bg-gray-900/30 hover:border-gray-600'
          }`}
          onDragEnter={(e) => {
            e.preventDefault()
            if (e.dataTransfer.types.includes('Files')) onVaultDropActiveChange?.(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (e.dataTransfer.types.includes('Files')) e.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              onVaultDropActiveChange?.(false)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            onVaultDropActiveChange?.(false)
            if (e.dataTransfer.files?.length) onVaultFilesDropped?.(e.dataTransfer.files)
          }}
        >
          {vaultDropItems.length ? (
            <PlaylistDropProgress items={vaultDropItems} playlistName={playlistContext.name} />
          ) : (
            <>
              <FaUpload className="mx-auto mb-3 h-8 w-8 text-gray-500" />
              <p className="text-base text-gray-200">
                {vaultDropBusy
                  ? 'Adding to vault & playlist…'
                  : `Drop tracks into “${playlistContext.name}”`}
              </p>
              <p className="mt-2 max-w-md mx-auto text-sm text-gray-500">
                Drop audio from your computer. Existing vault tracks are matched by path/name;
                new files are copied into <code className="text-gray-400">web/public/audio</code> and added to the library.
                Files over 80MB are allowed when track length justifies the size (high-res WAV budget);
                denser files can be converted to 320kbps MP3 on drop.
              </p>
            </>
          )}
        </div>
      )
    }
    return <div className="text-center py-12 text-gray-500">No tracks found</div>
  }

  return (
    <div
      ref={tableRootRef}
      className={`overflow-x-auto relative select-none ${
        acceptVaultFileDrop && vaultDropActive
          ? 'ring-2 ring-purple-400/60 ring-offset-2 ring-offset-gray-950 rounded-lg'
          : ''
      }`}
      onPointerDown={markTableActive}
      onDragEnter={
        acceptVaultFileDrop
          ? (e) => {
              e.preventDefault()
              if (e.dataTransfer.types.includes('Files')) onVaultDropActiveChange?.(true)
            }
          : undefined
      }
      onDragOver={
        acceptVaultFileDrop
          ? (e) => {
              if (
                rowDragActiveRef.current ||
                e.dataTransfer.types.includes(SERGIK_PLAYLIST_DRAG_MIME)
              ) {
                return
              }
              e.preventDefault()
              if (e.dataTransfer.types.includes('Files')) e.dataTransfer.dropEffect = 'copy'
            }
          : undefined
      }
      onDragLeave={
        acceptVaultFileDrop
          ? (e) => {
              e.preventDefault()
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                onVaultDropActiveChange?.(false)
              }
            }
          : undefined
      }
      onDrop={
        acceptVaultFileDrop
          ? (e) => {
              if (
                rowDragActiveRef.current ||
                e.dataTransfer.types.includes(SERGIK_PLAYLIST_DRAG_MIME)
              ) {
                return
              }
              e.preventDefault()
              onVaultDropActiveChange?.(false)
              if (e.dataTransfer.files?.length) onVaultFilesDropped?.(e.dataTransfer.files)
            }
          : undefined
      }
    >
      {acceptVaultFileDrop && vaultDropItems.length > 0 && (
        <div className="mb-3 rounded-xl border border-purple-500/30 bg-gray-950/80 px-3 py-3">
          <PlaylistDropProgress
            items={vaultDropItems}
            playlistName={playlistContext?.name}
            compact
          />
        </div>
      )}
      {acceptVaultFileDrop && vaultDropActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-purple-950/70">
          <p className="text-sm font-medium text-purple-100">
            Drop to add to vault & playlist
          </p>
        </div>
      )}
      {trackMenu && (
        <div
          ref={trackMenuClamp.ref}
          {...trackMenuClamp.rootProps}
          role="menu"
          aria-label={adminCatalog ? 'Admin track actions' : 'Track actions'}
          className="fixed w-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          style={trackMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader
            title={
              adminCatalog
                ? selectedCount > 1
                  ? `${selectedCount} songs selected`
                  : trackMenu.track.title
                : trackMenu.track.title
            }
            headerProps={trackMenuClamp.headerProps}
          />
          <div className="py-1">
          {adminCatalog ? (
            <>
              {adminError && (
                <p className="px-3 py-1.5 text-xs text-red-400">{adminError}</p>
              )}
              {dnaNotice && (
                <p className="px-3 py-1.5 text-xs text-amber-300">{dnaNotice}</p>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={playSelection}
              >
                <FaPlay className="h-3 w-3 text-gray-500" />
                {selectedCount > 1 ? `Play ${selectedCount} Songs` : 'Play'}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={playSelectionNext}
              >
                <FaPlay className="h-3 w-3 text-purple-400" />
                Play Next
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={addSelectionToUpNext}
              >
                <FaPlus className="h-3 w-3 text-gray-500" />
                Add to Up Next
              </button>
              {selectedCount > 1 && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                  onClick={() => openBulkEditModal(selectedTracks)}
                >
                  <FaEdit className="h-3 w-3 text-purple-400" />
                  Edit {selectedCount} Songs…
                </button>
              )}
              {selectedCount > 1 && bulkSelectionAnalysis?.dominantGenre &&
                !bulkSelectionAnalysis.fields.genre.uniform && (
                <button
                  type="button"
                  disabled={adminBusy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                  onClick={() =>
                    void quickUnifyBulkField(
                      'genre',
                      bulkSelectionAnalysis.dominantGenre!.value,
                      selectedTracks,
                    )
                  }
                >
                  <FaTags className="h-3 w-3 text-teal-400" />
                  <span className="min-w-0">
                    Unify genre → {bulkSelectionAnalysis.dominantGenre.value}
                    <span className="block text-[11px] text-gray-500">
                      {bulkSelectionAnalysis.dominantGenre.count} of {selectedCount} tracks
                    </span>
                  </span>
                </button>
              )}
              {selectedCount > 1 && bulkSelectionAnalysis?.dominantArtist &&
                !bulkSelectionAnalysis.fields.artist.uniform &&
                bulkSelectionAnalysis.dominantArtist.count < selectedCount && (
                <button
                  type="button"
                  disabled={adminBusy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                  onClick={() =>
                    void quickUnifyBulkField(
                      'artist',
                      bulkSelectionAnalysis.dominantArtist!.value,
                      selectedTracks,
                    )
                  }
                >
                  <FaUser className="h-3 w-3 text-teal-400" />
                  <span className="min-w-0">
                    Unify artist → {bulkSelectionAnalysis.dominantArtist.value}
                    <span className="block text-[11px] text-gray-500">
                      {bulkSelectionAnalysis.dominantArtist.count} of {selectedCount} tracks
                    </span>
                  </span>
                </button>
              )}
              {selectedCount <= 1 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => openEditModal(trackMenu.track)}
              >
                <FaEdit className="h-3 w-3 text-gray-500" />
                Get Info
              </button>
              )}
              {selectedCount <= 1 && (() => {
                const dna = trackSonicDnaProgress(trackMenu.track, dnaProgress[trackMenu.track.id])
                return (
                  <button
                    type="button"
                    disabled={adminBusy || dna.status === 'processing'}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                    onClick={() => void runTrackSonicDna(trackMenu.track)}
                  >
                    <FaBolt className="h-3 w-3 text-amber-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block">Run Sonic DNA analysis</span>
                      <span className="block text-[11px] text-gray-500">
                        {sonicDnaStatusLabel(dna.status)} · {dna.percent}%
                      </span>
                    </span>
                  </button>
                )
              })()}
              {selectedCount <= 1 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => {
                  setDnaReportTrack(trackMenu.track)
                  setTrackMenu(null)
                }}
              >
                <FaFileAlt className="h-3 w-3 text-purple-300" />
                Open Sonic DNA report
              </button>
              )}
              {selectedCount <= 1 && (
              <Link
                href="/admin/music-library"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => setTrackMenu(null)}
              >
                <FaExternalLinkAlt className="h-3 w-3 text-gray-500" />
                Open in Music Library
              </Link>
              )}
              {selectedCount <= 1 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => void copyText(trackMenu.track.id)}
              >
                <FaCopy className="h-3 w-3 text-gray-500" />
                Copy track ID
              </button>
              )}
              {selectedCount <= 1 && trackMenu.track.file && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                  onClick={() => void copyText(trackMenu.track.file)}
                >
                  <FaCopy className="h-3 w-3 text-gray-500" />
                  Copy audio URL
                </button>
              )}
              {selectedCount <= 1 && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => void copyText(JSON.stringify(trackMenu.track, null, 2))}
              >
                <FaCopy className="h-3 w-3 text-gray-500" />
                Copy as JSON
              </button>
              )}
              <div className="my-1 border-t border-gray-800" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => {
                  selectAllTracks()
                  setTrackMenu(null)
                }}
              >
                Select All
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                  onClick={() => {
                    clearSelection()
                    setTrackMenu(null)
                  }}
                >
                  Deselect All
                </button>
              )}
              <button
                type="button"
                disabled={yearFillBusy || adminBusy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() =>
                  void fillYearsFromOriginalDates(
                    selectedCount > 0
                      ? Array.from(selectedIds)
                      : trackMenu
                        ? [trackMenu.track.id]
                        : [],
                    { onlyMissing: false, force: true },
                  )
                }
              >
                <FaSync className={`h-3 w-3 text-gray-500 ${yearFillBusy ? 'animate-spin' : ''}`} />
                {selectedCount > 1
                  ? `Rescan Date Created from Exports (${selectedCount})`
                  : 'Rescan Date Created from Exports'}
              </button>
              <button
                type="button"
                disabled={releaseDateBusy || adminBusy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() =>
                  void pullStudioReleaseDates(
                    selectedCount > 0
                      ? Array.from(selectedIds)
                      : trackMenu
                        ? [trackMenu.track.id]
                        : [],
                    { onlyMissing: true },
                  )
                }
              >
                <FaSync
                  className={`h-3 w-3 text-gray-500 ${releaseDateBusy ? 'animate-spin' : ''}`}
                />
                {selectedCount > 1
                  ? `Pull Date Released from Studio (${selectedCount})`
                  : 'Pull Date Released from Studio'}
              </button>
              <div className="my-1 border-t border-gray-800" />
              <button
                type="button"
                disabled={adminBusy}
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() => {
                  setPlaylistPickerOpen((open) => !open)
                  void ensureCatalogPlaylists()
                }}
              >
                {playlistPickerOpen
                  ? 'Hide playlists'
                  : selectedCount > 1
                    ? `Add ${selectedCount} Songs to Playlist…`
                    : 'Add to playlist…'}
              </button>
              {playlistPickerOpen && (
                <div className="max-h-40 overflow-y-auto border-t border-gray-800/80">
                  {catalogPlaylists === null && (
                    <p className="px-3 py-1.5 text-xs text-gray-500">Loading playlists…</p>
                  )}
                  {catalogPlaylists && catalogPlaylists.length === 0 && (
                    <p className="px-3 py-1.5 text-xs text-gray-500">No playlists</p>
                  )}
                  {(catalogPlaylists || []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={adminBusy}
                      className="w-full truncate px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800/80 disabled:opacity-50"
                      onClick={() => void addTrackToCatalogPlaylist(p.id, trackMenu.track.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {playlistContext && (
                <>
                  <div className="my-1 border-t border-gray-800" />
                  {!removeFromPlaylistConfirm ? (
                    <button
                      type="button"
                      disabled={adminBusy}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-300 hover:bg-gray-800/80 disabled:opacity-50"
                      onClick={() => setRemoveFromPlaylistConfirm(true)}
                    >
                      <FaMinus className="h-3 w-3" />
                      {selectedCount > 1
                        ? `Remove ${selectedCount} Songs from Playlist`
                        : 'Remove from playlist'}
                    </button>
                  ) : (
                    <div className="px-3 py-2">
                      <p className="mb-2 text-xs text-gray-400">
                        Remove {selectedCount > 1 ? `${selectedCount} songs` : 'this song'} from
                        &ldquo;{playlistContext.name}&rdquo;? Tracks stay in the library.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={adminBusy}
                          className="flex-1 rounded-md border border-gray-700 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-800/80 disabled:opacity-50"
                          onClick={() => setRemoveFromPlaylistConfirm(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={adminBusy}
                          className="flex-1 rounded-md bg-red-600/90 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                          onClick={() => void removeSelectionFromPlaylist()}
                        >
                          Yes, remove
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="my-1 border-t border-gray-800" />
              <button
                type="button"
                disabled={adminBusy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                onClick={() => void archiveTrack(trackMenu.track)}
              >
                <FaTrash className="h-3 w-3" />
                Archive track
              </button>
            </>
          ) : !authUser ? (
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
        </div>
      )}
      {columnMenu && (
        <div
          ref={columnMenuClamp.ref}
          {...columnMenuClamp.rootProps}
          aria-label="Choose visible columns"
          className="fixed min-w-[200px] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          style={columnMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader title="Columns" headerProps={columnMenuClamp.headerProps} />
          <div className="py-2">
          <p className="px-3 pb-2 text-[10px] leading-snug text-gray-500">
            Drag headers to reorder · Click header to sort
          </p>
          <div className="border-t border-gray-800 pt-1">
            {SONG_TABLE_OPTIONAL_COLUMNS.slice()
              .sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b))
              .map((key) => (
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
        </div>
      )}
      {editTrack && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4">
          <div
            ref={editModalRef}
            role="dialog"
            aria-labelledby="edit-track-title"
            className="max-h-[min(90vh,44rem)] w-full max-w-lg overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
          >
            <h3 id="edit-track-title" className="mb-4 text-lg font-semibold text-white">
              Edit track
            </h3>
            <div className="max-h-[min(70vh,36rem)] space-y-3 overflow-y-auto overscroll-y-contain pr-1">
              <div className="space-y-2">
                <span className="block text-xs text-gray-400">Cover art</span>
                <p className="text-[10px] leading-snug text-gray-500">
                  Updates this track and every sibling in the same folder/EP.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => editArtFileRef.current?.click()}
                    disabled={editArtBusy || adminBusy}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-gray-800"
                    aria-label="Change cover art"
                  >
                    {editDraft.artwork ? (
                      <CoverArt
                        src={editDraft.artwork}
                        alt={editDraft.title || editTrack.title}
                        sizes="96px"
                        iconClassName="h-8 w-8 text-gray-600"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-gray-500">
                        <FaImage className="h-7 w-7" />
                      </span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      ref={editArtFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadEditArtwork(file)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => editArtFileRef.current?.click()}
                      disabled={editArtBusy || adminBusy}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:border-purple-500 hover:text-white disabled:opacity-50"
                    >
                      <FaUpload className="h-3 w-3" />
                      {editArtBusy ? 'Uploading…' : 'Upload cover'}
                    </button>
                    {editDraft.artwork && (
                      <button
                        type="button"
                        onClick={() => setEditDraft((d) => ({ ...d, artwork: '' }))}
                        disabled={editArtBusy || adminBusy}
                        className="block text-[11px] text-gray-500 hover:text-gray-300"
                      >
                        Remove cover
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <label className="block text-xs text-gray-400">
                Title
                <input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Artist
                <input
                  value={editDraft.artist}
                  onChange={(e) => setEditDraft((d) => ({ ...d, artist: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">
                  Genre
                  <select
                    value={editDraft.genre}
                    onChange={(e) => {
                      const genre = e.target.value
                      setEditDraft((d) => ({
                        ...d,
                        genre,
                        subgenre: subgenresForGenre(genre).includes(d.subgenre) ? d.subgenre : '',
                      }))
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  >
                    <option value="">Select genre</option>
                    {genrePicker?.suggested.length ? (
                      <optgroup label="Suggested from drums / groove">
                        {genrePicker.suggested.map((option) => (
                          <option key={`suggest-${option.value}`} value={option.value}>
                            {option.hint ? `${option.value} — ${option.hint}` : option.value}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {genrePicker?.groups.map((group) => (
                      <optgroup key={group.family} label={group.family}>
                        {group.genres.map((genre) => (
                          <option key={`${group.family}-${genre}`} value={genre}>
                            {genre}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-gray-400">
                  Subgenre
                  <select
                    value={editDraft.subgenre}
                    onChange={(e) => setEditDraft((d) => ({ ...d, subgenre: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  >
                    <option value="">Select subgenre</option>
                    {genrePicker?.subgenres.map((subgenre) => (
                      <option key={subgenre} value={subgenre}>
                        {subgenre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[10px] leading-snug text-gray-500">
                Full encyclopedia parents and 150+ subgenres. Saving a preferred genre refreshes Sonic DNA copy from that label.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">
                  BPM
                  <div className="mt-1 flex gap-1">
                    <input
                      value={editDraft.bpm}
                      onChange={(e) => setEditDraft((d) => ({ ...d, bpm: e.target.value }))}
                      inputMode="decimal"
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      title={
                        tapTempoAverageBpm != null || tapTempoBpm != null
                          ? `Scan entire track, then score suggestions vs tap (${(tapTempoAverageBpm ?? tapTempoBpm)!.toFixed(1)}) and measured DNA`
                          : 'Scan entire track for BPM, then score suggestions vs tap tempo + measured DNA'
                      }
                      aria-label="Scan entire track for BPM and score accuracy"
                      disabled={bpmDetecting || adminBusy || !editTrack.file}
                      onClick={() => void redetectEditBpm()}
                      className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaSync className={`h-3.5 w-3.5 ${bpmDetecting ? 'animate-spin' : ''}`} />
                    </button>
                    {adminCatalog && (
                      <button
                        type="button"
                        title={`Tap each beat — BPM updates every tap in ${TAP_TEMPO_SECTION_BEATS}-beat sections (does not change playback)`}
                        aria-label={`Admin tap tempo, ${TAP_TEMPO_SECTION_BEATS}-beat sections`}
                        onClick={handleEditTapTempo}
                        className={`inline-flex h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg border px-2 text-[11px] font-semibold uppercase tracking-wide ${
                          tapTempoSectionBeat > 0 || tapTempoSectionsCompleted > 0
                            ? tapTempoConfidence >= 0.55 || tapTempoSectionsCompleted > 0
                              ? 'border-emerald-500 bg-emerald-500/20 text-white'
                              : 'border-purple-500 bg-purple-500/20 text-white'
                            : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-purple-500 hover:text-white'
                        }`}
                      >
                        {tapTempoSectionBeat > 0
                          ? `${tapTempoSectionBeat}/${TAP_TEMPO_SECTION_BEATS}`
                          : 'Tap'}
                      </button>
                    )}
                  </div>
                  {beatCountNote && (
                    <span className="mt-1 block text-[10px] leading-snug text-gray-500">
                      {beatCountNote}
                    </span>
                  )}
                  {bpmAccuracyScores.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {bpmAccuracyScores.map((score) => (
                        <button
                          key={score.bpm}
                          type="button"
                          title={formatBpmAccuracyNote(score)}
                          onClick={() => {
                            setEditDraft((d) => ({ ...d, bpm: String(score.bpm) }))
                            setBeatCountNote(`Suggestion ${score.bpm} · ${formatBpmAccuracyNote(score)}`)
                          }}
                          className={`rounded-md border px-2 py-0.5 text-[11px] ${
                            String(score.bpm) === editDraft.bpm.trim()
                              ? 'border-purple-500 bg-purple-500/20 text-white'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {score.bpm}
                          <span className="ml-1 text-[10px] text-gray-500">
                            {Math.round(score.accuracy * 100)}%
                            {score.tapAgree != null ? ` · tap ${Math.round(score.tapAgree * 100)}%` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {bpmAccuracyScores.length <= 1 && bpmCandidates.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {bpmCandidates.map((candidate) => (
                        <button
                          key={candidate.bpm}
                          type="button"
                          onClick={() => {
                            setEditDraft((d) => ({ ...d, bpm: String(candidate.bpm) }))
                            setBeatCountNote(
                              `Full-track scan · counted ${candidate.hits}/${candidate.expected} beats at ${candidate.bpm}`,
                            )
                          }}
                          className={`rounded-md border px-2 py-0.5 text-[11px] ${
                            String(candidate.bpm) === editDraft.bpm.trim()
                              ? 'border-purple-500 bg-purple-500/20 text-white'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {candidate.bpm}
                          <span className="ml-1 text-[10px] text-gray-500">
                            {candidate.hits}/{candidate.expected}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label className="block text-xs text-gray-400">
                  Key
                  <div className="mt-1 flex gap-1">
                    <input
                      value={editDraft.key_signature}
                      onChange={(e) => setEditDraft((d) => ({ ...d, key_signature: e.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      title="Auto-pick the best key from Sonic DNA and audio"
                      aria-label="Auto-pick the best key from Sonic DNA and audio"
                      disabled={keyDetecting || adminBusy}
                      onClick={() => void redetectEditKey()}
                      className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaSync className={`h-3.5 w-3.5 ${keyDetecting ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {keyNote && (
                    <span className="mt-1 block text-[10px] leading-snug text-gray-500">{keyNote}</span>
                  )}
                  {keyCandidates.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {keyCandidates.map((candidate) => (
                        <button
                          key={candidate.key}
                          type="button"
                          onClick={() => {
                            setEditDraft((d) => ({ ...d, key_signature: candidate.key }))
                            setKeyNote(
                              `Root ${candidate.root} · ${candidate.key}${candidate.camelot ? ` · ${candidate.camelot}` : ''}`,
                            )
                          }}
                          className={`rounded-md border px-2 py-0.5 text-[11px] ${
                            candidate.key === editDraft.key_signature.trim()
                              ? 'border-purple-500 bg-purple-500/20 text-white'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {candidate.key}
                          {candidate.camelot ? (
                            <span className="ml-1 text-[10px] text-gray-500">{candidate.camelot}</span>
                          ) : null}
                          <span className="ml-1 text-[10px] text-gray-500">{Math.round(candidate.lock * 100)}%</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {(toplineNote || toplineCandidates.length > 0) && (
                    <div className="mt-2 rounded-lg border border-gray-800 bg-gray-950/50 px-2 py-1.5">
                      <span className="block text-[10px] uppercase tracking-wide text-gray-500">Topline</span>
                      {toplineNote && (
                        <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{toplineNote}</span>
                      )}
                      {toplineCandidates.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {toplineCandidates.map((candidate) => (
                            <button
                              key={`topline-${candidate.key}`}
                              type="button"
                              title="Use this topline key"
                              onClick={() => {
                                setEditDraft((d) => ({ ...d, key_signature: candidate.key }))
                                setToplineNote(
                                  `${candidate.key}${candidate.camelot ? ` · ${candidate.camelot}` : ''} · applied`,
                                )
                              }}
                              className={`rounded-md border px-2 py-0.5 text-[11px] ${
                                candidate.key === editDraft.key_signature.trim()
                                  ? 'border-yellow-500 bg-yellow-500/15 text-white'
                                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                              }`}
                            >
                              {candidate.key}
                              {candidate.camelot ? (
                                <span className="ml-1 text-[10px] text-gray-500">{candidate.camelot}</span>
                              ) : null}
                              <span className="ml-1 text-[10px] text-gray-500">{Math.round(candidate.lock * 100)}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </label>
                <label className="block text-xs text-gray-400">
                  Date created
                  <div className="mt-1 flex gap-1">
                    <input
                      type="date"
                      value={editDraft.dateCreated}
                      onChange={(e) => setEditDraft((d) => ({ ...d, dateCreated: e.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 [color-scheme:dark]"
                    />
                    <button
                      type="button"
                      title="Pull root creation date from Exports SERGIK"
                      aria-label="Fill date created from Exports SERGIK"
                      disabled={yearFillBusy || adminBusy || !editTrack}
                      onClick={() =>
                        editTrack &&
                        void fillYearsFromOriginalDates([editTrack.id], {
                          onlyMissing: false,
                          force: true,
                          applyToEditDraftIds: [editTrack.id],
                        })
                      }
                      className="inline-flex h-[38px] shrink-0 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-[11px] text-gray-300 hover:border-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaSync className={`h-3 w-3 ${yearFillBusy ? 'animate-spin' : ''}`} />
                      Exports
                    </button>
                  </div>
                  <span className="mt-1 block text-[10px] leading-snug text-gray-500">
                    Root creation day from /Volumes/SERGIK/Exports SERGIK (not vault import day).
                  </span>
                  {yearFillNote && (
                    <span className="mt-1 block text-[10px] text-teal-400">{yearFillNote}</span>
                  )}
                </label>
                <label className="block text-xs text-gray-400">
                  Date released
                  <div className="mt-1 flex gap-1">
                    <input
                      type="date"
                      value={editDraft.dateReleased}
                      onChange={(e) => setEditDraft((d) => ({ ...d, dateReleased: e.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 [color-scheme:dark]"
                    />
                    <button
                      type="button"
                      title="Pull from Release Studio when delivered/live"
                      aria-label="Pull date released from Release Studio"
                      disabled={releaseDateBusy || adminBusy || !editTrack}
                      onClick={() =>
                        editTrack &&
                        void pullStudioReleaseDates([editTrack.id], {
                          onlyMissing: false,
                          applyToEditDraftIds: [editTrack.id],
                        })
                      }
                      className="inline-flex h-[38px] shrink-0 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-[11px] text-gray-300 hover:border-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaSync className={`h-3 w-3 ${releaseDateBusy ? 'animate-spin' : ''}`} />
                      Studio
                    </button>
                  </div>
                  <span className="mt-1 block text-[10px] leading-snug text-gray-500">
                    Internet distribution date after Release Studio prereqs are complete (delivered/live).
                  </span>
                  {releaseDateNote && (
                    <span className="mt-1 block text-[10px] text-teal-400">{releaseDateNote}</span>
                  )}
                </label>
              </div>
              {adminError && <p className="text-xs text-red-400">{adminError}</p>}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-purple-200 hover:bg-purple-500/10 disabled:opacity-50"
                onClick={() => setDnaReportTrack(editTrack)}
                disabled={adminBusy}
              >
                <FaFileAlt className="h-3 w-3" />
                Sonic DNA report
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                  onClick={() => setEditTrack(null)}
                  disabled={adminBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                  onClick={() => void saveTrackEdit()}
                  disabled={adminBusy || !editDraft.title.trim()}
                >
                  {adminBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {bulkEditTracks && bulkEditAnalysis && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4">
          <div
            ref={bulkEditModalRef}
            role="dialog"
            aria-labelledby="bulk-edit-title"
            className="flex max-h-[min(90vh,720px)] w-full max-w-xl flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
          >
            <div className="border-b border-gray-800 px-5 py-4">
              <h3 id="bulk-edit-title" className="text-lg font-semibold text-white">
                Edit {bulkEditTracks.length} songs
              </h3>
              <p className="mt-1 text-xs text-gray-400">
                Only fields you change are applied to every selected track. Mixed values stay unchanged until you pick one.
              </p>
              <ul className="mt-2 max-h-16 space-y-0.5 overflow-y-auto text-[11px] text-gray-500">
                {bulkEditTracks.slice(0, 8).map((t) => (
                  <li key={t.id} className="truncate">
                    {t.title}
                    {t.artist ? ` · ${t.artist}` : ''}
                  </li>
                ))}
                {bulkEditTracks.length > 8 && (
                  <li className="text-gray-600">+ {bulkEditTracks.length - 8} more</li>
                )}
              </ul>
              {(bulkEditAnalysis.dominantGenre && !bulkEditAnalysis.fields.genre.uniform) ||
              (bulkEditAnalysis.dominantArtist && !bulkEditAnalysis.fields.artist.uniform) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bulkEditAnalysis.dominantGenre && !bulkEditAnalysis.fields.genre.uniform && (
                    <button
                      type="button"
                      className="rounded-md border border-teal-500/40 px-2 py-1 text-[11px] text-teal-200 hover:bg-teal-500/10"
                      onClick={() => touchBulkField('genre', bulkEditAnalysis.dominantGenre!.value)}
                    >
                      Use common genre: {bulkEditAnalysis.dominantGenre.value} (
                      {bulkEditAnalysis.dominantGenre.count}/{bulkEditTracks.length})
                    </button>
                  )}
                  {bulkEditAnalysis.dominantArtist && !bulkEditAnalysis.fields.artist.uniform && (
                    <button
                      type="button"
                      className="rounded-md border border-teal-500/40 px-2 py-1 text-[11px] text-teal-200 hover:bg-teal-500/10"
                      onClick={() => touchBulkField('artist', bulkEditAnalysis.dominantArtist!.value)}
                    >
                      Use common artist: {bulkEditAnalysis.dominantArtist.value} (
                      {bulkEditAnalysis.dominantArtist.count}/{bulkEditTracks.length})
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <label className="block text-xs text-gray-400">
                <span className="flex items-center gap-2">
                  Artist
                  {!bulkEditAnalysis.fields.artist.uniform && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                      {bulkEditAnalysis.fields.artist.summary}
                    </span>
                  )}
                  {bulkEditTouched.has('artist') && (
                    <span className="text-[10px] text-purple-300">will update</span>
                  )}
                </span>
                <input
                  value={bulkEditDraft.artist}
                  placeholder={
                    bulkEditAnalysis.fields.artist.uniform
                      ? undefined
                      : bulkEditAnalysis.fields.artist.summary
                  }
                  onChange={(e) => touchBulkField('artist', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 placeholder:text-gray-600"
                />
                {!bulkEditAnalysis.fields.artist.uniform && bulkEditAnalysis.fields.artist.values.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {bulkEditAnalysis.fields.artist.values.slice(0, 6).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => touchBulkField('artist', v)}
                        className="rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300 hover:border-gray-500"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">
                  <span className="flex items-center gap-2">
                    Genre
                    {!bulkEditAnalysis.fields.genre.uniform && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                        {bulkEditAnalysis.fields.genre.summary}
                      </span>
                    )}
                    {bulkEditTouched.has('genre') && (
                      <span className="text-[10px] text-purple-300">will update</span>
                    )}
                  </span>
                  <select
                    value={bulkEditDraft.genre}
                    onChange={(e) => {
                      const genre = e.target.value
                      touchBulkField('genre', genre)
                      if (
                        bulkEditDraft.subgenre &&
                        !subgenresForGenre(genre).includes(bulkEditDraft.subgenre)
                      ) {
                        touchBulkField('subgenre', '')
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  >
                    <option value="">
                      {bulkEditAnalysis.fields.genre.uniform ? 'Select genre' : 'Keep mixed / pick one…'}
                    </option>
                    {bulkGenrePicker?.suggested.length ? (
                      <optgroup label="Suggested from drums / groove">
                        {bulkGenrePicker.suggested.map((option) => (
                          <option key={`bulk-suggest-${option.value}`} value={option.value}>
                            {option.hint ? `${option.value} — ${option.hint}` : option.value}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {bulkGenrePicker?.groups.map((group) => (
                      <optgroup key={group.family} label={group.family}>
                        {group.genres.map((genre) => (
                          <option key={`bulk-${group.family}-${genre}`} value={genre}>
                            {genre}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-gray-400">
                  <span className="flex items-center gap-2">
                    Subgenre
                    {!bulkEditAnalysis.fields.subgenre.uniform && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                        {bulkEditAnalysis.fields.subgenre.summary}
                      </span>
                    )}
                    {bulkEditTouched.has('subgenre') && (
                      <span className="text-[10px] text-purple-300">will update</span>
                    )}
                  </span>
                  <select
                    value={bulkEditDraft.subgenre}
                    onChange={(e) => touchBulkField('subgenre', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  >
                    <option value="">
                      {bulkEditAnalysis.fields.subgenre.uniform ? 'Select subgenre' : 'Keep mixed / pick one…'}
                    </option>
                    {bulkGenrePicker?.subgenres.map((subgenre) => (
                      <option key={subgenre} value={subgenre}>
                        {subgenre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">
                  <span className="flex items-center gap-2">
                    BPM
                    {!bulkEditAnalysis.fields.bpm.uniform && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                        {bulkEditAnalysis.fields.bpm.summary}
                      </span>
                    )}
                    {bulkEditTouched.has('bpm') && (
                      <span className="text-[10px] text-purple-300">will update</span>
                    )}
                  </span>
                  <input
                    value={bulkEditDraft.bpm}
                    placeholder={
                      bulkEditAnalysis.fields.bpm.uniform ? undefined : bulkEditAnalysis.fields.bpm.summary
                    }
                    inputMode="decimal"
                    onChange={(e) => touchBulkField('bpm', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 placeholder:text-gray-600"
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  <span className="flex items-center gap-2">
                    Key
                    {!bulkEditAnalysis.fields.key_signature.uniform && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                        {bulkEditAnalysis.fields.key_signature.summary}
                      </span>
                    )}
                    {bulkEditTouched.has('key_signature') && (
                      <span className="text-[10px] text-purple-300">will update</span>
                    )}
                  </span>
                  <input
                    value={bulkEditDraft.key_signature}
                    placeholder={
                      bulkEditAnalysis.fields.key_signature.uniform
                        ? undefined
                        : bulkEditAnalysis.fields.key_signature.summary
                    }
                    onChange={(e) => touchBulkField('key_signature', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 placeholder:text-gray-600"
                  />
                </label>
              </div>
              <label className="block text-xs text-gray-400">
                <span className="flex items-center gap-2">
                  Year
                  {!bulkEditAnalysis.fields.year.uniform && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                      {bulkEditAnalysis.fields.year.summary}
                    </span>
                  )}
                  {bulkEditTouched.has('year') && (
                    <span className="text-[10px] text-purple-300">will update</span>
                  )}
                </span>
                <input
                  value={bulkEditDraft.year}
                  placeholder={
                    bulkEditAnalysis.fields.year.uniform ? undefined : bulkEditAnalysis.fields.year.summary
                  }
                  inputMode="numeric"
                  onChange={(e) => touchBulkField('year', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 placeholder:text-gray-600"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">
                  <span className="flex items-center gap-2">
                    Date created
                    {!bulkEditAnalysis.fields.dateCreated.uniform && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                        {bulkEditAnalysis.fields.dateCreated.summary}
                      </span>
                    )}
                    {bulkEditTouched.has('dateCreated') && (
                      <span className="text-[10px] text-purple-300">will update</span>
                    )}
                  </span>
                  <div className="mt-1 flex gap-1">
                    <input
                      type="date"
                      value={bulkEditDraft.dateCreated}
                      onChange={(e) => touchBulkField('dateCreated', e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 [color-scheme:dark]"
                    />
                    <button
                      type="button"
                      title="Rescan Date Created from Exports for all selected"
                      disabled={yearFillBusy || adminBusy}
                      onClick={() =>
                        void fillYearsFromOriginalDates(
                          bulkEditTracks.map((t) => t.id),
                          { onlyMissing: false, force: true },
                        )
                      }
                      className="inline-flex h-[38px] shrink-0 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-[11px] text-gray-300 hover:border-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaSync className={`h-3 w-3 ${yearFillBusy ? 'animate-spin' : ''}`} />
                      Exports
                    </button>
                  </div>
                </label>
                <label className="block text-xs text-gray-400">
                  <span className="flex items-center gap-2">
                    Date released
                    {!bulkEditAnalysis.fields.dateReleased.uniform && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                        {bulkEditAnalysis.fields.dateReleased.summary}
                      </span>
                    )}
                    {bulkEditTouched.has('dateReleased') && (
                      <span className="text-[10px] text-purple-300">will update</span>
                    )}
                  </span>
                  <div className="mt-1 flex gap-1">
                    <input
                      type="date"
                      value={bulkEditDraft.dateReleased}
                      onChange={(e) => touchBulkField('dateReleased', e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 [color-scheme:dark]"
                    />
                    <button
                      type="button"
                      title="Pull Date Released from Release Studio for all selected"
                      disabled={releaseDateBusy || adminBusy}
                      onClick={() =>
                        void pullStudioReleaseDates(bulkEditTracks.map((t) => t.id), {
                          onlyMissing: true,
                        })
                      }
                      className="inline-flex h-[38px] shrink-0 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 text-[11px] text-gray-300 hover:border-purple-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaSync className={`h-3 w-3 ${releaseDateBusy ? 'animate-spin' : ''}`} />
                      Studio
                    </button>
                  </div>
                </label>
              </div>
              {adminError && <p className="text-xs text-red-400">{adminError}</p>}
              {bulkEditNote && <p className="text-xs text-teal-400">{bulkEditNote}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-5 py-4">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                onClick={() => {
                  setBulkEditTracks(null)
                  setBulkEditAnalysis(null)
                  setBulkEditTouched(new Set())
                  setBulkEditNote(null)
                }}
                disabled={adminBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                onClick={() => void saveBulkEdit()}
                disabled={adminBusy || bulkEditTouched.size === 0}
              >
                {adminBusy ? 'Applying…' : `Apply to ${bulkEditTracks.length} tracks`}
              </button>
            </div>
          </div>
        </div>
      )}
      {dnaReportTrack && (
        <SonicDnaReportModal
          track={dnaReportTrack}
          dialogRef={dnaReportRef}
          adminMode
          onClose={() => setDnaReportTrack(null)}
          onSaved={(updated) => {
            onTrackUpdated?.(updated)
            setDnaReportTrack(updated)
            setEditTrack((current) => (current?.id === updated.id ? { ...current, ...updated } : current))
            setDnaProgress((prev) => ({
              ...prev,
              [updated.id]: {
                status: updated.sonic_dna_status || 'completed',
                percent: sonicDnaCompletenessPercent(
                  updated.sonic_dna_status || 'completed',
                  updated.sonic_dna,
                ),
              },
            }))
            invalidateMusicLibraryCache()
          }}
          onQueueAnalysis={(item, directive) => runTrackSonicDna(item, directive)}
        />
      )}
      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-100">
          <span className="font-medium">
            {selectedCount} selected
            {reorderBusy ? ' · saving order…' : ''}
          </span>
          <button
            type="button"
            className="rounded-md bg-purple-600 px-2 py-1 text-white hover:bg-purple-500"
            onClick={playSelection}
          >
            Play
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-600 px-2 py-1 hover:bg-gray-800"
            onClick={playSelectionNext}
          >
            Play Next
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-600 px-2 py-1 hover:bg-gray-800"
            onClick={addSelectionToUpNext}
          >
            Up Next
          </button>
          {playlistContext && (
            <button
              type="button"
              className="rounded-md border border-amber-500/40 px-2 py-1 text-amber-200 hover:bg-amber-500/10"
              onClick={() => {
                setRemoveFromPlaylistConfirm(true)
                if (selectedTracks[0]) {
                  setTrackMenu({ x: 160, y: 160, track: selectedTracks[0] })
                }
              }}
            >
              Remove
            </button>
          )}
          {adminCatalog && selectedCount > 1 && (
            <button
              type="button"
              className="rounded-md border border-purple-500/40 px-2 py-1 text-purple-100 hover:bg-purple-500/10"
              onClick={() => openBulkEditModal(selectedTracks)}
            >
              Edit {selectedCount}
            </button>
          )}
          <button
            type="button"
            className="ml-auto text-purple-200/80 underline hover:text-purple-100"
            onClick={clearSelection}
          >
            Clear
          </button>
          {adminCatalog && (
            <span className="w-full text-[11px] text-purple-200/70 sm:w-auto sm:ml-0">
              Drag onto a sidebar playlist to add
            </span>
          )}
        </div>
      )}
      {playlistOrganize && (
        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span>
            Drag rows to reorder or onto a sidebar playlist · ⌘/Ctrl-click and Shift-click to multi-select · ⌘/Ctrl-A select all
          </span>
          {adminCatalog && (
            <>
              <button
                type="button"
                disabled={yearFillBusy || !tracks.length}
                className="text-purple-300/90 underline hover:text-purple-200 disabled:opacity-50"
                onClick={() =>
                  void fillYearsFromOriginalDates(
                    tracks.map((t) => t.id),
                    { onlyMissing: false, force: true },
                  )
                }
              >
                {yearFillBusy ? 'Scanning Exports…' : 'Rescan created dates from Exports SERGIK'}
              </button>
              <button
                type="button"
                disabled={releaseDateBusy || !tracks.length}
                className="text-purple-300/90 underline hover:text-purple-200 disabled:opacity-50"
                onClick={() =>
                  void pullStudioReleaseDates(
                    tracks.map((t) => t.id),
                    { onlyMissing: true },
                  )
                }
              >
                {releaseDateBusy
                  ? 'Pulling release dates…'
                  : 'Pull missing release dates from Studio'}
              </button>
              {(yearFillNote || releaseDateNote) && !editTrack && (
                <span className="text-teal-400">{yearFillNote || releaseDateNote}</span>
              )}
            </>
          )}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b border-gray-800 text-gray-500"
            onContextMenu={onHeaderContextMenu}
            title="Drag headers to reorder · Click to sort · Right-click to show or hide columns"
          >
            {playlistOrganize && (
              <th className="w-8 py-2 px-1 text-center" aria-label="Drag row">
                <FaGripVertical className="mx-auto h-3 w-3 opacity-40" />
              </th>
            )}
            <th className="w-8 py-2 px-1 text-center">
              <input
                type="checkbox"
                checked={displayTracks.length > 0 && selectedCount === displayTracks.length}
                ref={(el) => {
                  if (el) el.indeterminate = selectedCount > 0 && selectedCount < displayTracks.length
                }}
                title={selectedCount === displayTracks.length ? 'Deselect all' : 'Select all'}
                aria-label={selectedCount === displayTracks.length ? 'Deselect all' : 'Select all'}
                className="rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                onClick={(e) => e.stopPropagation()}
                onChange={() =>
                  selectedCount === displayTracks.length ? clearSelection() : selectAllTracks()
                }
              />
            </th>
            <th
              className={`w-10 py-2 px-2 text-left cursor-pointer hover:text-white ${
                sortField === 'track_number' ? 'text-purple-300' : ''
              }`}
              title="Sort by track number"
              onClick={() => onSort('track_number')}
            >
              <span className="inline-flex items-center gap-1 select-none">
                #{sortIcon('track_number')}
              </span>
            </th>
            {orderedVisibleColumns.map((colKey) => {
              const align = columnHeaderAlign(colKey)
              const sortableField = COLUMN_SORT_FIELD[colKey]
              const isActive = sortableField != null && sortField === sortableField
              const alignClass =
                align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
              const upper = columnHeaderUppercase(colKey)
              const label = columnHeaderLabel(colKey)
              return (
                <th
                  key={colKey}
                  draggable
                  onDragStart={onColumnDragStart(colKey)}
                  onDragOver={onColumnDragOver(colKey)}
                  onDragLeave={onColumnDragLeave}
                  onDrop={onColumnDrop(colKey)}
                  onDragEnd={onColumnDragEnd}
                  className={`py-2 px-2 ${alignClass} ${
                    columnDragOver === colKey ? 'bg-purple-900/30 ring-1 ring-inset ring-purple-500/40' : ''
                  } ${sortableField ? 'cursor-pointer hover:text-white' : ''}`}
                  onClick={sortableField ? () => onSort(sortableField) : undefined}
                >
                  <span
                    className={`inline-flex max-w-full items-center gap-1 select-none ${
                      upper ? 'text-[11px] uppercase tracking-wide' : ''
                    } ${isActive ? 'text-purple-300' : ''}`}
                  >
                    <FaGripVertical
                      className="h-3 w-3 shrink-0 cursor-grab opacity-30"
                      aria-hidden
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="truncate">{label}</span>
                    {sortableField ? sortIcon(sortableField) : null}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {displayTracks.map((track, i) => {
            const isCurrent = currentTrackId === track.id
            const isSelected = selectedIds.has(track.id)
            return (
              <tr
                key={track.id}
                draggable
                onDragStart={(e) => onRowDragStart(e, i, track)}
                onDragOver={(e) => onRowDragOver(e, i)}
                onDrop={(e) => void onRowDrop(e, i)}
                onDragEnd={onRowDragEnd}
                className={`border-b border-gray-800/30 transition cursor-grab active:cursor-grabbing group ${
                  isSelected
                    ? 'bg-purple-600/25'
                    : isCurrent
                      ? 'bg-purple-900/15'
                      : 'hover:bg-gray-800/20'
                } ${dragOverIndex === i ? 'border-t-2 border-t-purple-400' : ''}`}
                onClick={(e) => selectTrackAt(i, e)}
                onDoubleClick={() => onPlay(track, i)}
                onContextMenu={(e) => openTrackMenu(e, track)}
              >
                {playlistOrganize && (
                  <td className="py-2 px-1 text-center text-gray-600">
                    <FaGripVertical className="mx-auto h-3 w-3 opacity-50 group-hover:opacity-100" />
                  </td>
                )}
                <td
                  className="py-2 px-1 text-center"
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    title={isSelected ? `Deselect ${track.title}` : `Select ${track.title}`}
                    aria-label={isSelected ? `Deselect ${track.title}` : `Select ${track.title}`}
                    className="rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (e.shiftKey) {
                        selectTrackAt(i, e)
                        return
                      }
                      markTableActive()
                      setSelectedIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(track.id)) next.delete(track.id)
                        else next.add(track.id)
                        return next
                      })
                      setSelectionAnchorId(track.id)
                    }}
                    onChange={() => {
                      /* click handler owns selection; keep this controlled */
                    }}
                  />
                </td>
                <td className="py-2 px-2 text-gray-600 relative">
                  <span className="group-hover:invisible">
                    {showTrackNumber && track.track_number
                      ? track.track_number
                      : sortField === 'track_number'
                        ? track.track_number ?? track.display_order ?? i + 1
                        : i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlay(track, i)
                    }}
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
                {orderedVisibleColumns.map((colKey) => {
                  switch (colKey) {
                    case 'title':
                      return (
                        <td key={colKey} className="py-2 px-2" onContextMenu={(e) => openTrackMenu(e, track)}>
                          <div className="flex items-center space-x-2">
                            {track.artwork && (
                              <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-gray-800">
                                <CoverArt src={track.artwork} alt="" sizes="32px" iconClassName="w-3.5 h-3.5 text-gray-600" />
                              </div>
                            )}
                            <span className={`truncate max-w-[250px] ${isCurrent ? 'text-purple-300 font-medium' : ''}`}>
                              {track.title}
                            </span>
                          </div>
                        </td>
                      )
                    case 'dna': {
                      const dna = trackSonicDnaProgress(track, dnaProgress[track.id])
                      return (
                        <td
                          key={colKey}
                          className="py-2 px-2 text-center text-[11px] font-mono text-gray-400"
                          title={`${sonicDnaStatusLabel(dna.status)} — open report`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDnaReportTrack(track)
                          }}
                        >
                          <span className={dna.status === 'completed' ? 'text-emerald-400' : dna.status === 'processing' ? 'text-amber-300' : dna.status === 'failed' ? 'text-red-400' : ''}>
                            {dna.percent}%
                          </span>
                        </td>
                      )
                    }
                    case 'artist':
                      return (
                        <td key={colKey} className="py-2 px-2 text-gray-400 truncate max-w-[150px]">{track.artist}</td>
                      )
                    case 'album':
                      return (
                        <td key={colKey} className="py-2 px-2 text-gray-500 truncate max-w-[140px]">
                          {track.album ? (
                            <span className="flex items-center space-x-1">
                              {track.albumType === 'ep' && <span className="text-[9px] font-bold text-teal-500 bg-teal-500/10 px-1 rounded">EP</span>}
                              <span className="truncate">{track.album}</span>
                            </span>
                          ) : '—'}
                        </td>
                      )
                    case 'genre':
                      return (
                        <td key={colKey} className="py-2 px-2 text-gray-500 truncate max-w-[120px]">{displayTrackGenre(track) || '—'}</td>
                      )
                    case 'subgenre':
                      return (
                        <td key={colKey} className="py-2 px-2 text-gray-500 truncate max-w-[140px]">{displayTrackSubgenre(track) || '—'}</td>
                      )
                    case 'bpm':
                      return (
                        <td key={colKey} className="py-2 px-2 text-center text-gray-400 font-mono text-xs">{displayTrackBpm(track) ?? '—'}</td>
                      )
                    case 'key':
                      return (
                        <td key={colKey} className="py-2 px-2 text-center text-gray-400 text-xs">{displayTrackKey(track) || '—'}</td>
                      )
                    case 'year':
                      return (
                        <td key={colKey} className="py-2 px-2 text-center text-gray-500 text-xs font-mono">
                          {track.year ||
                            (() => {
                              const created = track.date_created || trackDateCreatedIso(track)
                              return created ? created.slice(0, 4) : null
                            })() ||
                            '—'}
                        </td>
                      )
                    case 'date':
                      return (
                        <td key={colKey} className="py-2 px-2 text-gray-500 text-xs font-mono whitespace-nowrap">
                          {track.date ? String(track.date).slice(0, 10) : '—'}
                        </td>
                      )
                    case 'date_created':
                      return (
                        <td key={colKey} className="py-2 px-2 text-gray-500 text-xs font-mono whitespace-nowrap">
                          {track.date_created || trackDateCreatedIso(track) || '—'}
                        </td>
                      )
                    case 'rating':
                      return (
                        <td
                          key={colKey}
                          className="py-2 px-2"
                          onClick={(e) => e.stopPropagation()}
                          onContextMenu={(e) => openTrackMenu(e, track)}
                        >
                          <StarRating
                            rating={track.rating || 0}
                            onRate={(r) => onRate(track.id, r)}
                            size="sm"
                          />
                        </td>
                      )
                    case 'play_count':
                      return (
                        <td key={colKey} className="py-2 px-2 text-center text-gray-500 text-xs font-mono">
                          {track.play_count || 0}
                        </td>
                      )
                    case 'duration':
                      return (
                        <td key={colKey} className="py-2 px-2 text-right text-gray-500 text-xs font-mono">
                          {track.duration ? formatDuration(track.duration) : '—'}
                        </td>
                      )
                    default:
                      return null
                  }
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

async function runCollectionSonicDna(opts: {
  folderId?: string
  playlistId?: string
  libraryTrackId?: string
  collectionName: string
  collectionType: string
  directive?: string
}) {
  const res = await fetch('/api/audio/analyze-collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...opts, force: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Failed to start Sonic DNA analysis')
  return data as {
    queued: number
    total: number
    message?: string
    jobId?: string | null
    jobIds?: string[]
  }
}

type SonicDnaProgress = { status: string; percent: number; jobId?: string | null; sonicDNA?: unknown }

function trackSonicDnaProgress(track: Track, override?: SonicDnaProgress | null): SonicDnaProgress {
  if (override) return override
  const status = track.sonic_dna_status || 'pending'
  return {
    status,
    percent: sonicDnaCompletenessPercent(status, track.sonic_dna),
  }
}

async function fetchSonicDnaProgress(track: Track): Promise<SonicDnaProgress> {
  const params = new URLSearchParams()
  appendSonicDnaLookupParams(params, {
    libraryTrackId: track.id,
    audioFileId: track.audioFileId,
    file: track.file,
    title: track.title,
  })
  const res = await fetch(`/api/audio/sonic-dna?${params.toString()}`, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  const status = typeof data.status === 'string' ? data.status : track.sonic_dna_status || 'pending'
  const percent =
    typeof data.percent === 'number'
      ? data.percent
      : sonicDnaCompletenessPercent(status, data.sonicDNA || track.sonic_dna)
  return { status, percent, sonicDNA: data.sonicDNA || null }
}

function ChooseExistingArtworkPanel({
  choices,
  selectedSrc,
  busy = false,
  onSelect,
  onUploadFile,
  onPreview,
  onClear,
  onBrowseUpload,
  onUploadError,
}: {
  choices: ArtworkChoice[]
  selectedSrc: string
  busy?: boolean
  onSelect: (src: string) => void
  onUploadFile: (file: File) => void
  onPreview: (src: string) => void
  onClear?: () => void
  onBrowseUpload: () => void
  onUploadError?: (message: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [ctx, setCtx] = useState<{
    x: number
    y: number
    kind: 'choice' | 'panel'
    choice?: ArtworkChoice
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const artMenuClamp = useClampedFixedMenuPosition(
    !!ctx,
    ctx ? { x: ctx.x, y: ctx.y } : null,
    { width: 208, height: 220 },
    { externalRef: menuRef },
  )
  const dragDepth = useRef(0)

  useEffect(() => {
    if (!ctx) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtx(null)
    }
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setCtx(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [ctx])

  const openChoiceMenu = (e: React.MouseEvent, choice: ArtworkChoice) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, kind: 'choice', choice })
  }

  const openPanelMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({ x: e.clientX, y: e.clientY, kind: 'panel' })
  }

  const copyUrl = async (src: string) => {
    const url = resolveImageUrl(src) || src
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* ignore */
    }
    setCtx(null)
  }

  const openExternal = (src: string) => {
    const url = resolveImageUrl(src) || src
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    setCtx(null)
  }

  return (
    <div
      className={`mt-3 rounded-lg border p-2 transition-colors ${
        dragOver
          ? 'border-purple-500 bg-purple-950/30 ring-1 ring-purple-500/40'
          : 'border-gray-700 bg-gray-950/60'
      }`}
      onContextMenu={openPanelMenu}
      onDragEnter={(e) => {
        if (!dataTransferHasArtworkPayload(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        dragDepth.current += 1
        setDragOver(true)
      }}
      onDragOver={(e) => {
        if (!dataTransferHasArtworkPayload(e.dataTransfer)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = artworkDropEffect(e.dataTransfer)
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        e.stopPropagation()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        dragDepth.current = 0
        setDragOver(false)
        if (busy) return
        const file = imageFileFromDataTransfer(e.dataTransfer)
        if (file) {
          onUploadFile(file)
          return
        }
        const url = artworkUrlFromDataTransfer(e.dataTransfer)
        if (url) {
          onSelect(url)
          return
        }
        const dropped = Array.from(e.dataTransfer.files || [])
        if (dropped.length) {
          onUploadError?.('Please drop an image file (JPG, PNG, GIF, WebP, …)')
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Choose existing artwork
        </div>
        <span className="text-[10px] text-gray-600">
          {busy ? 'Uploading…' : dragOver ? 'Drop to use' : 'Right-click · drop image'}
        </span>
      </div>
      {choices.length === 0 ? (
        <p className="px-1 py-3 text-center text-xs text-gray-500">
          No artwork found — drop an image here or right-click to upload
        </p>
      ) : (
        <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
          {choices.map((choice) => {
            const selected = resolveImageUrl(selectedSrc) === resolveImageUrl(choice.src)
            return (
              <button
                key={choice.id}
                type="button"
                title={choice.label}
                draggable={!busy}
                onClick={() => onSelect(choice.src)}
                onContextMenu={(e) => openChoiceMenu(e, choice)}
                onDragStart={(e) => {
                  const url = resolveImageUrl(choice.src) || choice.src
                  e.dataTransfer.setData(SERGIK_ARTWORK_DRAG_MIME, choice.src)
                  e.dataTransfer.setData('text/uri-list', url)
                  e.dataTransfer.setData('text/plain', url)
                  e.dataTransfer.effectAllowed = 'copyLink'
                }}
                className={`relative aspect-square cursor-grab overflow-hidden rounded-md border active:cursor-grabbing ${
                  selected
                    ? 'border-purple-400 ring-1 ring-purple-400'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                <CoverArt src={choice.src} alt={choice.label} sizes="72px" iconClassName="h-5 w-5 text-gray-600" />
              </button>
            )
          })}
        </div>
      )}
      {ctx && (
        <div
          ref={artMenuClamp.ref}
          {...artMenuClamp.rootProps}
          role="menu"
          aria-label="Artwork actions"
          className="fixed w-52 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          style={artMenuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader
            title={ctx.kind === 'choice' && ctx.choice ? ctx.choice.label : 'Artwork'}
            headerProps={artMenuClamp.headerProps}
          />
          <div className="py-1">
          {ctx.kind === 'choice' && ctx.choice ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => {
                  onSelect(ctx.choice!.src)
                  setCtx(null)
                }}
              >
                <FaImage className="h-3 w-3 text-gray-500" />
                Use as cover
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => {
                  onPreview(ctx.choice!.src)
                  setCtx(null)
                }}
              >
                <FaEye className="h-3 w-3 text-gray-500" />
                Preview
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => void copyUrl(ctx.choice!.src)}
              >
                <FaCopy className="h-3 w-3 text-gray-500" />
                Copy image URL
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
                onClick={() => openExternal(ctx.choice!.src)}
              >
                <FaExternalLinkAlt className="h-3 w-3 text-gray-500" />
                Open in new tab
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
                onClick={() => {
                  onBrowseUpload()
                  setCtx(null)
                }}
              >
                <FaUpload className="h-3 w-3 text-gray-500" />
                Upload image…
              </button>
              {onClear && selectedSrc.trim() && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/80 disabled:opacity-50"
                  onClick={() => {
                    onClear()
                    setCtx(null)
                  }}
                >
                  <FaTimes className="h-3 w-3 text-gray-500" />
                  Clear cover
                </button>
              )}
              <p className="border-t border-gray-800 px-3 py-2 text-[10px] leading-snug text-gray-500">
                Drop an image file onto this panel to upload and set as cover.
              </p>
            </>
          )}
          </div>
        </div>
      )}
    </div>
  )
}

function AdminFolderChrome({
  album,
  enabled = false,
  children,
  tracks = [],
  hidden = false,
  onUpdated,
  onArchived,
  onTracksReordered,
  onVisibilityChange,
  onAddedToLibrary,
  onPlayAll,
}: {
  album: AlbumTile
  enabled?: boolean
  children: React.ReactNode
  tracks?: Track[]
  hidden?: boolean
  onUpdated?: (id: string, patch: Partial<AlbumTile>) => void
  onArchived?: (id: string) => void
  onTracksReordered?: (folderId: string, tracks: Track[]) => void
  onVisibilityChange?: (id: string, hidden: boolean) => void
  onAddedToLibrary?: (tile: AlbumTile) => void
  onPlayAll?: () => void
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<{
    name: string
    type: 'album' | 'ep'
    year: string
    albumArtist: string
    artwork: string
  }>({
    name: album.name,
    type: album.type === 'album' ? 'album' : 'ep',
    year: album.year != null ? String(album.year) : '',
    albumArtist: album.albumArtist || '',
    artwork: folderArtworkSrc(album, tracks),
  })
  const [orderedTracks, setOrderedTracks] = useState<Track[]>(tracks)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [chooseArtOpen, setChooseArtOpen] = useState(false)
  const [artViewerOpen, setArtViewerOpen] = useState(false)
  const [artViewerSrc, setArtViewerSrc] = useState<string | null>(null)
  const [artBusy, setArtBusy] = useState(false)
  const [artPreviewBlob, setArtPreviewBlob] = useState<string | null>(null)
  const [coverDragOver, setCoverDragOver] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuClamp = useClampedFixedMenuPosition(
    !!menu,
    menu,
    { width: 256, height: 420 },
    { externalRef: menuRef },
  )
  const editRef = useRef<HTMLDivElement>(null)
  const artFileRef = useRef<HTMLInputElement>(null)
  const artViewerRef = useRef<HTMLDivElement>(null)
  const coverDragDepth = useRef(0)
  const artPreviewBlobRef = useRef<string | null>(null)

  useEffect(() => {
    artPreviewBlobRef.current = artPreviewBlob
  }, [artPreviewBlob])

  useEffect(() => {
    return () => {
      const blob = artPreviewBlobRef.current
      if (blob) URL.revokeObjectURL(blob)
    }
  }, [])

  useEffect(() => {
    if (editOpen) return
    const blob = artPreviewBlobRef.current
    if (!blob) return
    URL.revokeObjectURL(blob)
    artPreviewBlobRef.current = null
    setArtPreviewBlob(null)
  }, [editOpen])

  useEffect(() => {
    if (!menu && !editOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (artViewerOpen) {
        setArtViewerOpen(false)
        setArtViewerSrc(null)
        return
      }
      if (chooseArtOpen) {
        setChooseArtOpen(false)
        return
      }
      if (editOpen) {
        setEditOpen(false)
        return
      }
      setMenu(null)
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (artViewerOpen) {
        if (artViewerRef.current?.contains(t)) return
        setArtViewerOpen(false)
        setArtViewerSrc(null)
        return
      }
      // Edit folder closes via backdrop click only (file picker must not dismiss it).
      if (editOpen) return
      if (menuRef.current?.contains(t)) return
      setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [menu, editOpen, chooseArtOpen, artViewerOpen])

  const artChoices = useMemo(() => {
    const seen = new Set<string>()
    const choices: ArtworkChoice[] = []
    const add = (id: string, src: string | undefined, label: string) => {
      if (!src?.trim()) return
      const key = resolveImageUrl(src).split('?')[0]
      if (!key || seen.has(key)) return
      seen.add(key)
      choices.push({ id, src, label })
    }
    add(`current-${album.id}`, folderArtworkSrc(album, orderedTracks), album.name)
    for (const track of orderedTracks) add(`track-${track.id}`, track.artwork, track.title)
    for (const tile of EP_COVER_CHOICES) add(tile.id, tile.src, tile.alt)
    return dedupeArtworkByReleaseLabel(choices)
  }, [album.id, album.artwork, album.name, orderedTracks])

  if (!enabled) return <>{children}</>

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setError(null)
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const openEdit = () => {
    setDraft({
      name: album.name,
      type: album.type === 'album' ? 'album' : 'ep',
      year: album.year != null ? String(album.year) : '',
      albumArtist: album.albumArtist || '',
      artwork: folderArtworkSrc(album, tracks),
    })
    setOrderedTracks(tracks)
    setDragIndex(null)
    setDragOverIndex(null)
    setChooseArtOpen(false)
    setArtViewerOpen(false)
    setArtViewerSrc(null)
    setCoverDragOver(false)
    setError(null)
    if (artPreviewBlobRef.current) {
      URL.revokeObjectURL(artPreviewBlobRef.current)
      artPreviewBlobRef.current = null
    }
    setArtPreviewBlob(null)
    setEditOpen(true)
    setMenu(null)
    void fetchTracks(album.id, { includeArchived: false, includeFullData: false })
      .then((loaded) => {
        setOrderedTracks(loaded)
        setDraft((d) => {
          if (d.artwork.trim()) return d
          const fromTracks = folderArtworkSrc(album, loaded)
          return fromTracks ? { ...d, artwork: fromTracks } : d
        })
      })
      .catch(() => {})
  }

  const moveTrack = (from: number, to: number) => {
    if (to < 0 || to >= orderedTracks.length || from === to) return
    setOrderedTracks((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* ignore */
    }
    setMenu(null)
  }

  const selectArtwork = (src: string) => {
    setDraft((d) => ({ ...d, artwork: withArtworkCacheBust(src) || src }))
    setChooseArtOpen(false)
    setError(null)
  }

  const openFolderArtViewer = (src?: string) => {
    const next = (src || draft.artwork.trim() || folderArtworkSrc(album, orderedTracks) || '').trim()
    if (!next) return
    setArtViewerSrc(next)
    setArtViewerOpen(true)
  }

  const applyCoverDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    coverDragDepth.current = 0
    setCoverDragOver(false)
    if (artBusy) return
    const file = imageFileFromDataTransfer(e.dataTransfer)
    if (file) {
      void uploadFolderArtwork(file)
      return
    }
    const url = artworkUrlFromDataTransfer(e.dataTransfer)
    if (url) {
      selectArtwork(url)
      return
    }
    if (Array.from(e.dataTransfer.files || []).length) {
      setError('Please drop an image file (JPG, PNG, GIF, WebP, …)')
    }
  }

  const uploadFolderArtwork = async (file: File) => {
    const reject = artworkUploadRejectReason(file)
    if (reject) {
      setError(reject)
      return
    }
    if (artPreviewBlobRef.current) {
      URL.revokeObjectURL(artPreviewBlobRef.current)
      artPreviewBlobRef.current = null
    }
    const localPreview = URL.createObjectURL(file)
    artPreviewBlobRef.current = localPreview
    setArtPreviewBlob(localPreview)
    setArtBusy(true)
    setError(null)
    setDraft((d) => ({ ...d, artwork: localPreview }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folderId', album.id)
      const res = await fetch('/api/audio/artwork', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Artwork upload failed')
      if (!data.artworkUrl) throw new Error('Upload did not return an artwork URL')
      const artworkUrl = stripArtworkCacheBust(String(data.artworkUrl))
      const busted = withArtworkCacheBust(artworkUrl)
      setDraft((d) => ({ ...d, artwork: busted }))
      onUpdated?.(album.id, { artwork: busted })
      setChooseArtOpen(false)
    } catch (err: any) {
      setDraft((d) => (d.artwork === localPreview ? { ...d, artwork: folderArtworkSrc(album, orderedTracks) } : d))
      if (artPreviewBlobRef.current === localPreview) {
        URL.revokeObjectURL(localPreview)
        artPreviewBlobRef.current = null
        setArtPreviewBlob(null)
      }
      setError(err?.message || 'Artwork upload failed')
    } finally {
      setArtBusy(false)
      if (artFileRef.current) artFileRef.current.value = ''
    }
  }

  const saveEdit = async () => {
    const yearRaw = draft.year.trim()
    const year = yearRaw === '' ? undefined : Number(yearRaw)
    if (yearRaw && !Number.isFinite(year)) {
      setError('Year must be a number')
      return
    }
    if (!draft.name.trim()) {
      setError('Name is required')
      return
    }
    if (draft.artwork.startsWith('blob:')) {
      setError('Artwork is still uploading — wait a moment, then Save')
      return
    }
    const artworkToSave = stripArtworkCacheBust(draft.artwork) || null
    setBusy(true)
    setError(null)
    try {
      await updateFolder(album.id, {
        name: draft.name.trim(),
        type: draft.type,
        year,
        albumArtist: draft.albumArtist.trim() || undefined,
        artwork: artworkToSave,
      })
      if (orderedTracks.length) {
        await Promise.all(
          orderedTracks.map((track, index) =>
            updateTrack(track.id, {
              display_order: index,
              track_number: index + 1,
            })
          )
        )
      }
      try {
        await updatePlaylist(playlistIdForFolder(album.id), {
          ...(orderedTracks.length ? { trackIds: orderedTracks.map((track) => track.id) } : {}),
          artwork: artworkToSave || '',
        })
      } catch {
        /* collection playlist may not exist */
      }
      if (orderedTracks.length) {
        onTracksReordered?.(album.id, withAlbumName(withTrackOrder(orderedTracks), draft.name.trim()))
      }
      invalidateMusicLibraryCache()
      onUpdated?.(album.id, {
        name: draft.name.trim(),
        type: draft.type,
        year,
        albumArtist: draft.albumArtist.trim() || 'SERGIK',
        artwork: artworkToSave ? withArtworkCacheBust(artworkToSave) : undefined,
      })
      setEditOpen(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to save folder')
    } finally {
      setBusy(false)
    }
  }

  const archiveFolder = async () => {
    if (typeof window !== 'undefined' && !window.confirm(`Archive “${album.name}”? It stays in the library but is hidden from browse.`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateFolder(album.id, {
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      invalidateMusicLibraryCache()
      onArchived?.(album.id)
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to archive folder')
    } finally {
      setBusy(false)
    }
  }

  const setPublicVisibility = async (nextPrivate: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await updateFolder(album.id, { hidden: nextPrivate })
      invalidateMusicLibraryCache()
      onVisibilityChange?.(album.id, nextPrivate)
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to update visibility')
    } finally {
      setBusy(false)
    }
  }

  const addToLibrary = async (type: 'ep' | 'album') => {
    setBusy(true)
    setError(null)
    try {
      await ensureFolderAsRelease(album.id, type, {
        name: album.name,
        artwork: album.artwork,
        year: album.year,
        albumArtist: album.albumArtist,
      })
      invalidateMusicLibraryCache()
      onAddedToLibrary?.({
        ...album,
        type,
        hidden: false,
      })
      onUpdated?.(album.id, { type, hidden: false })
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to add to library')
    } finally {
      setBusy(false)
    }
  }

  const runSonicDna = async () => {
    const kind = album.type === 'album' ? 'album' : album.type === 'ep' ? 'EP' : 'collection'
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Run Sonic DNA analysis on all tracks in “${album.name}”? This re-analyzes the ${kind} in the background.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const data = await runCollectionSonicDna({
        folderId: album.id,
        collectionName: album.name,
        collectionType: album.type || 'folder',
      })
      setNotice(data.message || `Queued ${data.queued} tracks`)
    } catch (err: any) {
      setError(err?.message || 'Failed to start Sonic DNA analysis')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="w-full" onContextMenu={openMenu}>{children}</div>
      {menu && (
        <div
          ref={menuClamp.ref}
          {...menuClamp.rootProps}
          role="menu"
          aria-label="Admin folder actions"
          className="fixed w-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          style={menuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader title={album.name} headerProps={menuClamp.headerProps} />
          <div className="py-1">
          {error && <p className="px-3 py-1.5 text-xs text-red-400">{error}</p>}
          {notice && <p className="px-3 py-1.5 text-xs text-teal-400">{notice}</p>}
          {onPlayAll && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
              onClick={() => {
                onPlayAll()
                setMenu(null)
              }}
            >
              <FaPlay className="h-3 w-3 text-gray-500" />
              Play all
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={openEdit}
          >
            <FaEdit className="h-3 w-3 text-gray-500" />
            Edit folder
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void runSonicDna()}
          >
            <FaBolt className="h-3 w-3 text-amber-400" />
            {busy ? 'Queuing analysis…' : 'Run Sonic DNA analysis'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void setPublicVisibility(!hidden)}
          >
            {hidden ? <FaEye className="h-3 w-3 text-gray-500" /> : <FaEyeSlash className="h-3 w-3 text-gray-500" />}
            {hidden ? 'Make public' : 'Make private'}
          </button>
          {album.type !== 'ep' && (
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
              onClick={() => void addToLibrary('ep')}
            >
              <FaCompactDisc className="h-3 w-3 text-gray-500" />
              Add to EP library
            </button>
          )}
          {album.type !== 'album' && (
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
              onClick={() => void addToLibrary('album')}
            >
              <FaCompactDisc className="h-3 w-3 text-gray-500" />
              Add to album library
            </button>
          )}
          <Link
            href="/admin/music-library"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => setMenu(null)}
          >
            <FaExternalLinkAlt className="h-3 w-3 text-gray-500" />
            Open in Music Library
          </Link>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => void copyText(album.id)}
          >
            <FaCopy className="h-3 w-3 text-gray-500" />
            Copy folder ID
          </button>
          {album.artwork && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
              onClick={() => void copyText(album.artwork || '')}
            >
              <FaCopy className="h-3 w-3 text-gray-500" />
              Copy artwork URL
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => void copyText(JSON.stringify(album, null, 2))}
          >
            <FaCopy className="h-3 w-3 text-gray-500" />
            Copy as JSON
          </button>
          <div className="my-1 border-t border-gray-800" />
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50"
            onClick={() => void archiveFolder()}
          >
            <FaTrash className="h-3 w-3" />
            Archive folder
          </button>
          </div>
        </div>
      )}
      {editOpen && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !artBusy && !busy) setEditOpen(false)
          }}
        >
          <div
            ref={editRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-folder-${album.id}`}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id={`edit-folder-${album.id}`} className="mb-4 text-lg font-semibold text-white">
              Edit folder
            </h3>
            <div className="space-y-3">
              <label className="block text-xs text-gray-400">
                Name
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">
                  Type
                  <select
                    value={draft.type}
                    onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as 'album' | 'ep' }))}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  >
                    <option value="ep">EP</option>
                    <option value="album">Album</option>
                  </select>
                </label>
                <label className="block text-xs text-gray-400">
                  Year
                  <input
                    value={draft.year}
                    onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  />
                </label>
              </div>
              <label className="block text-xs text-gray-400">
                Album artist
                <input
                  value={draft.albumArtist}
                  onChange={(e) => setDraft((d) => ({ ...d, albumArtist: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </label>
              <div>
                <span className="block text-xs text-gray-400">Cover art</span>
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    className={`relative h-36 w-36 flex-shrink-0 overflow-hidden rounded-lg border bg-gray-800 transition-colors ${
                      coverDragOver
                        ? 'border-purple-500 ring-1 ring-purple-500/50'
                        : 'border-gray-700'
                    }`}
                    onClick={() => openFolderArtViewer()}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const src = draft.artwork.trim() || folderArtworkSrc(album, orderedTracks)
                      if (src) openFolderArtViewer(src)
                      else artFileRef.current?.click()
                    }}
                    onDragEnter={(e) => {
                      if (!dataTransferHasArtworkPayload(e.dataTransfer)) return
                      e.preventDefault()
                      e.stopPropagation()
                      coverDragDepth.current += 1
                      setCoverDragOver(true)
                    }}
                    onDragOver={(e) => {
                      if (!dataTransferHasArtworkPayload(e.dataTransfer)) return
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = artworkDropEffect(e.dataTransfer)
                      setCoverDragOver(true)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      coverDragDepth.current = Math.max(0, coverDragDepth.current - 1)
                      if (coverDragDepth.current === 0) setCoverDragOver(false)
                    }}
                    onDrop={applyCoverDrop}
                    aria-label={
                      draft.artwork.trim() || folderArtworkSrc(album, orderedTracks)
                        ? 'View cover art'
                        : 'Drop cover art here'
                    }
                  >
                    <CoverArt
                      src={draft.artwork.trim() || folderArtworkSrc(album, orderedTracks) || undefined}
                      fallbackSrc={
                        artPreviewBlob && !draft.artwork.startsWith('blob:') ? artPreviewBlob : undefined
                      }
                      alt={`${draft.name || album.name} cover art`}
                      sizes="144px"
                      iconClassName="h-10 w-10 text-gray-600"
                    />
                    {coverDragOver && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Drop to set
                      </span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      ref={artFileRef}
                      type="file"
                      accept="image/*,.heic,.heif,.avif"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadFolderArtwork(file)
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                        onClick={() => setChooseArtOpen((open) => !open)}
                        disabled={artBusy}
                      >
                        <FaImage className="h-3 w-3" />
                        Choose
                      </button>
                      {draft.artwork.trim() || folderArtworkSrc(album, orderedTracks) ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                          onClick={() => artFileRef.current?.click()}
                          disabled={artBusy}
                        >
                          <FaSync className="h-3 w-3" />
                          {artBusy ? 'Uploading…' : 'Replace'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                          onClick={() => artFileRef.current?.click()}
                          disabled={artBusy}
                        >
                          <FaUpload className="h-3 w-3" />
                          {artBusy ? 'Uploading…' : 'Add'}
                        </button>
                      )}
                      {draft.artwork.trim() && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
                          onClick={() => setDraft((d) => ({ ...d, artwork: '' }))}
                          disabled={artBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <label className="block text-xs text-gray-500">
                      Artwork URL
                      <input
                        value={draft.artwork}
                        onChange={(e) => setDraft((d) => ({ ...d, artwork: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                      />
                    </label>
                  </div>
                </div>
                {chooseArtOpen && (
                  <ChooseExistingArtworkPanel
                    choices={artChoices}
                    selectedSrc={draft.artwork}
                    busy={artBusy}
                    onSelect={selectArtwork}
                    onUploadFile={(file) => void uploadFolderArtwork(file)}
                    onPreview={(src) => openFolderArtViewer(src)}
                    onClear={() => setDraft((d) => ({ ...d, artwork: '' }))}
                    onBrowseUpload={() => artFileRef.current?.click()}
                    onUploadError={setError}
                  />
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Track order</span>
                  {orderedTracks.length > 1 && (
                    <span className="text-[10px] text-gray-500">Drag or use arrows</span>
                  )}
                </div>
                {orderedTracks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500">
                    No tracks in this folder
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-700 divide-y divide-gray-800">
                    {orderedTracks.map((track, index) => (
                      <li
                        key={track.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (dragOverIndex !== index) setDragOverIndex(index)
                        }}
                        onDragEnd={() => {
                          setDragIndex(null)
                          setDragOverIndex(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragIndex != null) moveTrack(dragIndex, index)
                          setDragIndex(null)
                          setDragOverIndex(null)
                        }}
                        className={`flex items-center gap-2 px-2 py-1.5 ${
                          dragIndex === index
                            ? 'opacity-50 bg-gray-800'
                            : dragOverIndex === index
                              ? 'bg-purple-900/30 border-t-2 border-purple-500'
                              : 'hover:bg-gray-800/60'
                        }`}
                      >
                        <FaGripVertical className="h-3 w-3 flex-shrink-0 cursor-grab text-gray-600" />
                        <span className="w-5 flex-shrink-0 text-xs tabular-nums text-gray-500">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{track.title}</span>
                        <div className="flex flex-shrink-0">
                          <button
                            type="button"
                            aria-label={`Move ${track.title} up`}
                            disabled={index === 0 || busy}
                            className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                            onClick={() => moveTrack(index, index - 1)}
                          >
                            <FaChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${track.title} down`}
                            disabled={index === orderedTracks.length - 1 || busy}
                            className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                            onClick={() => moveTrack(index, index + 1)}
                          >
                            <FaChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                onClick={() => setEditOpen(false)}
                disabled={busy || artBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                onClick={() => void saveEdit()}
                disabled={busy || artBusy || !draft.name.trim()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {artViewerOpen && (artViewerSrc || draft.artwork.trim() || folderArtworkSrc(album, orderedTracks)) && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4">
          <div
            ref={artViewerRef}
            className="relative aspect-square w-full max-w-md overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
          >
            <CoverArt
              src={artViewerSrc || draft.artwork.trim() || folderArtworkSrc(album, orderedTracks)}
              fallbackSrc={
                artPreviewBlob && !draft.artwork.startsWith('blob:') ? artPreviewBlob : undefined
              }
              alt={`${draft.name || album.name} cover art`}
              sizes="448px"
              iconClassName="h-16 w-16 text-gray-600"
            />
            <button
              type="button"
              aria-label="Close cover art"
              className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
              onClick={() => {
                setArtViewerOpen(false)
                setArtViewerSrc(null)
              }}
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function AdminPlaylistChrome({
  playlist,
  folderHidden = false,
  folderType,
  children,
  onPlay,
  onPlayAll,
  onShufflePlay,
  onRequestNewPlaylist,
  onPlaylistUpdated,
  onPlaylistDuplicated,
  onPlaylistArchived,
  onVisibilityChange,
  onAddedToLibrary,
  onTracksReordered,
}: {
  playlist: Playlist
  folderHidden?: boolean
  folderType?: string
  children: React.ReactNode
  onPlay: () => void
  onPlayAll?: () => void | Promise<void>
  onShufflePlay?: () => void | Promise<void>
  onRequestNewPlaylist?: () => void
  onPlaylistUpdated?: (playlist: Playlist) => void
  onPlaylistDuplicated?: (playlist: Playlist) => void
  onPlaylistArchived?: (id: string) => void
  onVisibilityChange?: (id: string, hidden: boolean) => void
  onAddedToLibrary?: (tile: AlbumTile) => void
  onTracksReordered?: (folderId: string, tracks: Track[]) => void
}) {
  const folderId = folderIdFromPlaylistId(playlist.id)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    name: playlist.name,
    description: playlist.description || '',
    artwork: playlist.artwork || '',
    hidden: folderHidden || !!playlist.hidden,
    libraryType: (folderType === 'album' || folderType === 'ep' ? folderType : 'playlist') as 'playlist' | 'ep' | 'album',
  })
  const [orderedTracks, setOrderedTracks] = useState<Track[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [trackSearch, setTrackSearch] = useState('')
  const [searchHits, setSearchHits] = useState<Track[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [chooseArtOpen, setChooseArtOpen] = useState(false)
  const [artViewerOpen, setArtViewerOpen] = useState(false)
  const [artViewerSrc, setArtViewerSrc] = useState<string | null>(null)
  const [artBusy, setArtBusy] = useState(false)
  const [artPreviewBlob, setArtPreviewBlob] = useState<string | null>(null)
  const [coverDragOver, setCoverDragOver] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuClamp = useClampedFixedMenuPosition(
    !!menu,
    menu,
    { width: 288, height: 480 },
    { externalRef: menuRef },
  )
  const editRef = useRef<HTMLDivElement>(null)
  const artFileRef = useRef<HTMLInputElement>(null)
  const artViewerRef = useRef<HTMLDivElement>(null)
  const coverDragDepth = useRef(0)
  const artPreviewBlobRef = useRef<string | null>(null)

  useEffect(() => {
    artPreviewBlobRef.current = artPreviewBlob
  }, [artPreviewBlob])

  useEffect(() => {
    return () => {
      const blob = artPreviewBlobRef.current
      if (blob) URL.revokeObjectURL(blob)
    }
  }, [])

  useEffect(() => {
    if (editOpen) return
    const blob = artPreviewBlobRef.current
    if (!blob) return
    URL.revokeObjectURL(blob)
    artPreviewBlobRef.current = null
    setArtPreviewBlob(null)
  }, [editOpen])

  const playlistCoverSrc = useMemo(() => {
    return firstArtworkSrc(draft.artwork, playlist.artwork, ...orderedTracks.map((t) => t.artwork))
  }, [draft.artwork, playlist.artwork, orderedTracks])

  const artChoices = useMemo(() => {
    const seen = new Set<string>()
    const choices: ArtworkChoice[] = []
    const add = (id: string, src: string | undefined, label: string) => {
      if (!src?.trim()) return
      const key = resolveImageUrl(src).split('?')[0]
      if (!key || seen.has(key)) return
      seen.add(key)
      choices.push({ id, src, label })
    }
    add(`current-${playlist.id}`, draft.artwork || playlist.artwork, playlist.name)
    for (const track of orderedTracks) add(`track-${track.id}`, track.artwork, track.title)
    for (const tile of EP_COVER_CHOICES) add(tile.id, tile.src, tile.alt)
    return dedupeArtworkByReleaseLabel(choices)
  }, [playlist.id, playlist.artwork, playlist.name, draft.artwork, orderedTracks])

  useEffect(() => {
    if (!menu && !editOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (artViewerOpen) {
        setArtViewerOpen(false)
        setArtViewerSrc(null)
        return
      }
      if (chooseArtOpen) {
        setChooseArtOpen(false)
        return
      }
      if (editOpen) {
        setEditOpen(false)
        return
      }
      setMenu(null)
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (artViewerOpen) {
        if (artViewerRef.current?.contains(t)) return
        setArtViewerOpen(false)
        setArtViewerSrc(null)
        return
      }
      // Edit playlist closes via backdrop click only (file picker must not dismiss it).
      if (editOpen) return
      if (menuRef.current?.contains(t)) return
      setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [menu, editOpen, chooseArtOpen, artViewerOpen])

  useEffect(() => {
    const q = trackSearch.trim()
    if (!editOpen || q.length < 2) {
      setSearchHits([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearchBusy(true)
      try {
        const data = await fetchBrowse({ view: 'songs', search: q, limit: 8, offset: 0 })
        if (cancelled) return
        const hits = ((data.tracks || []) as Track[]).filter(
          (t) => !orderedTracks.some((existing) => existing.id === t.id)
        )
        setSearchHits(hits)
      } catch {
        if (!cancelled) setSearchHits([])
      } finally {
        if (!cancelled) setSearchBusy(false)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trackSearch, editOpen, orderedTracks])

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setError(null)
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* ignore */
    }
    setMenu(null)
  }

  const openEditor = () => {
    setDraft({
      name: playlist.name,
      description: playlist.description || '',
      artwork: playlist.artwork || '',
      hidden: folderHidden || !!playlist.hidden,
      libraryType: folderType === 'album' || folderType === 'ep' ? folderType : 'playlist',
    })
    setTrackSearch('')
    setSearchHits([])
    setDragIndex(null)
    setDragOverIndex(null)
    setChooseArtOpen(false)
    setArtViewerOpen(false)
    setArtViewerSrc(null)
    setCoverDragOver(false)
    setError(null)
    if (artPreviewBlobRef.current) {
      URL.revokeObjectURL(artPreviewBlobRef.current)
      artPreviewBlobRef.current = null
    }
    setArtPreviewBlob(null)
    setEditOpen(true)
    setMenu(null)
    setTracksLoading(true)
    void fetchTracksByIds(playlist.trackIds)
      .then((loaded) => {
        const byId = new Map(loaded.map((t) => [t.id, t]))
        setOrderedTracks(playlist.trackIds.map((id) => byId.get(id)).filter(Boolean) as Track[])
      })
      .catch(() => setOrderedTracks([]))
      .finally(() => setTracksLoading(false))
  }

  const selectArtwork = (src: string) => {
    setDraft((d) => ({ ...d, artwork: withArtworkCacheBust(src) || src }))
    setChooseArtOpen(false)
    setError(null)
  }

  const openPlaylistArtViewer = (src?: string) => {
    const next = (src || playlistCoverSrc || '').trim()
    if (!next) return
    setArtViewerSrc(next)
    setArtViewerOpen(true)
  }

  const applyPlaylistCoverDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    coverDragDepth.current = 0
    setCoverDragOver(false)
    if (artBusy) return
    const file = imageFileFromDataTransfer(e.dataTransfer)
    if (file) {
      void uploadPlaylistArtwork(file)
      return
    }
    const url = artworkUrlFromDataTransfer(e.dataTransfer)
    if (url) {
      selectArtwork(url)
      return
    }
    if (Array.from(e.dataTransfer.files || []).length) {
      setError('Please drop an image file (JPG, PNG, GIF, WebP, …)')
    }
  }

  const uploadPlaylistArtwork = async (file: File) => {
    const reject = artworkUploadRejectReason(file)
    if (reject) {
      setError(reject)
      return
    }
    if (artPreviewBlobRef.current) {
      URL.revokeObjectURL(artPreviewBlobRef.current)
      artPreviewBlobRef.current = null
    }
    const localPreview = URL.createObjectURL(file)
    artPreviewBlobRef.current = localPreview
    setArtPreviewBlob(localPreview)
    setArtBusy(true)
    setError(null)
    setDraft((d) => ({ ...d, artwork: localPreview }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folderId', folderId || `playlist-${playlist.id}`)
      const res = await fetch('/api/audio/artwork', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Artwork upload failed')
      if (!data.artworkUrl) throw new Error('Upload did not return an artwork URL')
      const artworkUrl = stripArtworkCacheBust(String(data.artworkUrl))
      const busted = withArtworkCacheBust(artworkUrl)
      setDraft((d) => ({ ...d, artwork: busted }))
      onPlaylistUpdated?.({ ...playlist, artwork: busted })
      setChooseArtOpen(false)
    } catch (err: any) {
      setDraft((d) =>
        d.artwork === localPreview ? { ...d, artwork: playlist.artwork || '' } : d
      )
      if (artPreviewBlobRef.current === localPreview) {
        URL.revokeObjectURL(localPreview)
        artPreviewBlobRef.current = null
        setArtPreviewBlob(null)
      }
      setError(err?.message || 'Artwork upload failed')
    } finally {
      setArtBusy(false)
      if (artFileRef.current) artFileRef.current.value = ''
    }
  }

  const moveTrack = (from: number, to: number) => {
    if (to < 0 || to >= orderedTracks.length || from === to) return
    setOrderedTracks((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const removeTrack = (trackId: string) => {
    setOrderedTracks((prev) => prev.filter((t) => t.id !== trackId))
  }

  const addTrack = (track: Track) => {
    setOrderedTracks((prev) => (prev.some((t) => t.id === track.id) ? prev : [...prev, track]))
    setSearchHits((prev) => prev.filter((t) => t.id !== track.id))
    setTrackSearch('')
  }

  const saveEdit = async () => {
    if (!draft.name.trim()) {
      setError('Name is required')
      return
    }
    if (draft.artwork.startsWith('blob:')) {
      setError('Artwork is still uploading — wait a moment, then Save')
      return
    }
    const artworkToSave = stripArtworkCacheBust(draft.artwork)
    setBusy(true)
    setError(null)
    try {
      const nextIds = orderedTracks.map((t) => t.id)
      const saved = await updatePlaylist(playlist.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        artwork: artworkToSave,
        trackIds: nextIds,
        hidden: draft.hidden,
      })
      const nextPlaylist = {
        ...(saved || playlist),
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        artwork: artworkToSave ? withArtworkCacheBust(artworkToSave) : undefined,
        trackIds: nextIds,
        hidden: draft.hidden,
      }
      onPlaylistUpdated?.(nextPlaylist)

      if (draft.libraryType === 'ep' || draft.libraryType === 'album') {
        await ensureFolderAsRelease(folderId, draft.libraryType, {
          name: draft.name.trim(),
          artwork: artworkToSave || playlist.artwork,
        })
        await updateFolder(folderId, { hidden: draft.hidden })
        if (orderedTracks.length) {
          await Promise.all(
            orderedTracks.map((track, index) =>
              updateTrack(track.id, {
                folderId,
                display_order: index,
                track_number: index + 1,
              })
            )
          )
          onTracksReordered?.(folderId, withAlbumName(withTrackOrder(orderedTracks), draft.name.trim()))
        }
        onVisibilityChange?.(folderId, draft.hidden)
        if (!draft.hidden) {
          onAddedToLibrary?.({
            id: folderId,
            name: draft.name.trim(),
            type: draft.libraryType,
            artwork: artworkToSave || playlist.artwork,
            albumArtist: 'SERGIK',
            hidden: false,
          })
        }
      } else {
        onVisibilityChange?.(folderId, draft.hidden)
      }

      invalidateMusicLibraryCache()
      setEditOpen(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to save playlist')
    } finally {
      setBusy(false)
    }
  }

  const setPublicVisibility = async (nextPrivate: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const saved = await updatePlaylist(playlist.id, {
        name: playlist.name,
        artwork: playlist.artwork,
        hidden: nextPrivate,
      })
      invalidateMusicLibraryCache()
      onVisibilityChange?.(folderId, nextPrivate)
      onPlaylistUpdated?.(saved || { ...playlist, hidden: nextPrivate })
      setDraft((d) => ({ ...d, hidden: nextPrivate }))
      setMenu(null)
      setNotice(nextPrivate ? 'Now private (admin only)' : 'Now public')
    } catch (err: any) {
      setError(err?.message || 'Failed to update visibility')
    } finally {
      setBusy(false)
    }
  }

  const addToLibrary = async (type: 'ep' | 'album') => {
    setBusy(true)
    setError(null)
    try {
      await ensureFolderAsRelease(folderId, type, {
        name: playlist.name,
        artwork: playlist.artwork,
      })
      if (playlist.trackIds.length) {
        await Promise.all(
          playlist.trackIds.map((trackId, index) =>
            updateTrack(trackId, {
              folderId,
              display_order: index,
              track_number: index + 1,
            })
          )
        )
      }
      invalidateMusicLibraryCache()
      onAddedToLibrary?.({
        id: folderId,
        name: playlist.name,
        type,
        artwork: playlist.artwork,
        albumArtist: 'SERGIK',
        hidden: false,
      })
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to add to library')
    } finally {
      setBusy(false)
    }
  }

  const archivePlaylist = async () => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove “${playlist.name}” from playlists? (can be restored later)`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updatePlaylist(playlist.id, {
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      invalidateMusicLibraryCache()
      onPlaylistArchived?.(playlist.id)
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to remove playlist')
    } finally {
      setBusy(false)
    }
  }

  const hardDeletePlaylist = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Permanently delete “${playlist.name}”? This cannot be undone. Tracks stay in the library.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const ok = await deletePlaylist(playlist.id, { hard: true })
      if (!ok) throw new Error('Delete failed')
      invalidateMusicLibraryCache()
      onPlaylistArchived?.(playlist.id)
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to delete playlist')
    } finally {
      setBusy(false)
    }
  }

  const renamePlaylist = async () => {
    setMenu(null)
    const next = typeof window !== 'undefined'
      ? window.prompt('Rename playlist', playlist.name)
      : null
    if (next === null) return
    const name = next.trim()
    if (!name || name === playlist.name) return
    setBusy(true)
    setError(null)
    try {
      const saved = await updatePlaylist(playlist.id, { name })
      const updated = saved || { ...playlist, name }
      onPlaylistUpdated?.(updated)
      try {
        await updateFolder(folderId, { name })
      } catch {
        /* standalone playlist may not have a folder */
      }
      invalidateMusicLibraryCache()
    } catch (err: any) {
      setError(err?.message || 'Failed to rename')
    } finally {
      setBusy(false)
    }
  }

  const duplicatePlaylist = async () => {
    setBusy(true)
    setError(null)
    try {
      const stamp = Date.now()
      const created = await createPlaylist({
        id: `playlist-${stamp}`,
        name: `${playlist.name} (copy)`,
        description: playlist.description,
        artwork: playlist.artwork,
        trackIds: [...playlist.trackIds],
      })
      if (!created) throw new Error('Failed to duplicate')
      invalidateMusicLibraryCache()
      onPlaylistDuplicated?.(created)
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to duplicate playlist')
    } finally {
      setBusy(false)
    }
  }

  const persistTrackOrder = async (nextIds: string[], noticeText: string) => {
    setBusy(true)
    setError(null)
    try {
      const saved = await updatePlaylist(playlist.id, { trackIds: nextIds })
      const updated = saved || { ...playlist, trackIds: nextIds }
      onPlaylistUpdated?.(updated)
      invalidateMusicLibraryCache()
      setNotice(noticeText)
      setMenu(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to update track order')
    } finally {
      setBusy(false)
    }
  }

  const clearAllTracks = async () => {
    if (!playlist.trackIds.length) {
      setMenu(null)
      return
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Clear all ${playlist.trackIds.length} tracks from “${playlist.name}”? Tracks stay in the library.`)
    ) {
      return
    }
    await persistTrackOrder([], 'Playlist cleared')
  }

  const shuffleTrackOrder = async () => {
    if (playlist.trackIds.length < 2) {
      setMenu(null)
      return
    }
    const next = [...playlist.trackIds]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    await persistTrackOrder(next, 'Shuffled track order')
  }

  const sortTracks = async (mode: 'title' | 'bpm') => {
    if (playlist.trackIds.length < 2) {
      setMenu(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const loaded = await fetchTracksByIds(playlist.trackIds)
      const byId = new Map(loaded.map((t) => [t.id, t]))
      const ordered = [...playlist.trackIds]
        .map((id) => byId.get(id))
        .filter(Boolean) as Track[]
      ordered.sort((a, b) => {
        if (mode === 'bpm') {
          const ba = Number(displayTrackBpm(a) || 0)
          const bb = Number(displayTrackBpm(b) || 0)
          if (ba !== bb) return ba - bb
        }
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
      })
      const nextIds = ordered.map((t) => t.id)
      // Keep any unresolved IDs at the end
      for (const id of playlist.trackIds) {
        if (!nextIds.includes(id)) nextIds.push(id)
      }
      await persistTrackOrder(
        nextIds,
        mode === 'bpm' ? 'Sorted by BPM' : 'Sorted A–Z by title',
      )
    } catch (err: any) {
      setError(err?.message || 'Failed to sort tracks')
      setBusy(false)
    }
  }

  const copySetlist = async () => {
    try {
      const loaded = playlist.trackIds.length ? await fetchTracksByIds(playlist.trackIds) : []
      const byId = new Map(loaded.map((t) => [t.id, t]))
      const lines = playlist.trackIds.map((id, i) => {
        const t = byId.get(id)
        if (!t) return `${i + 1}. ${id}`
        const bpm = displayTrackBpm(t)
        const key = displayTrackKey(t)
        const meta = [bpm ? `${bpm} BPM` : null, key || null].filter(Boolean).join(' · ')
        return `${i + 1}. ${t.artist || 'SERGIK'} — ${t.title}${meta ? ` (${meta})` : ''}`
      })
      const text = [`# ${playlist.name}`, '', ...lines].join('\n')
      await navigator.clipboard.writeText(text)
      setNotice('Setlist copied')
    } catch {
      setError('Failed to copy setlist')
    }
    setMenu(null)
  }

  const runSonicDna = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Run Sonic DNA analysis on all tracks in “${playlist.name}”? This re-analyzes the playlist in the background.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const data = await runCollectionSonicDna({
        folderId,
        playlistId: playlist.id,
        collectionName: playlist.name,
        collectionType: folderType === 'ep' || folderType === 'album' ? folderType : 'playlist',
      })
      setNotice(data.message || `Queued ${data.queued} tracks`)
    } catch (err: any) {
      setError(err?.message || 'Failed to start Sonic DNA analysis')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="w-full" onContextMenu={openMenu}>{children}</div>
      {menu && (
        <div
          ref={menuClamp.ref}
          {...menuClamp.rootProps}
          role="menu"
          aria-label="Admin playlist actions"
          className="fixed w-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          style={menuClamp.style}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PopupMenuDragHeader
            title={
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{playlist.name}</span>
                <span className="shrink-0 font-normal normal-case tracking-normal text-gray-600">
                  {playlist.trackIds.length} track{playlist.trackIds.length === 1 ? '' : 's'}
                </span>
              </span>
            }
            headerProps={menuClamp.headerProps}
          />
          <div className="py-1">
          {error && <p className="px-3 py-1.5 text-xs text-red-400">{error}</p>}
          {notice && <p className="px-3 py-1.5 text-xs text-teal-400">{notice}</p>}

          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => {
              onPlay()
              setMenu(null)
            }}
          >
            <FaPlay className="h-3 w-3 text-gray-500" />
            Open playlist
          </button>
          {onPlayAll && (
            <button
              type="button"
              disabled={busy || !playlist.trackIds.length}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
              onClick={() => {
                void onPlayAll()
                setMenu(null)
              }}
            >
              <FaPlay className="h-3 w-3 text-purple-400" />
              Play all
            </button>
          )}
          {onShufflePlay && (
            <button
              type="button"
              disabled={busy || playlist.trackIds.length < 2}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
              onClick={() => {
                void onShufflePlay()
                setMenu(null)
              }}
            >
              <FaRandom className="h-3 w-3 text-gray-500" />
              Shuffle play
            </button>
          )}

          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            Edit
          </div>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void renamePlaylist()}
          >
            <FaEdit className="h-3 w-3 text-gray-500" />
            Rename…
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={openEditor}
          >
            <FaList className="h-3 w-3 text-gray-500" />
            Edit tracks &amp; details…
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void duplicatePlaylist()}
          >
            <FaClone className="h-3 w-3 text-gray-500" />
            Duplicate playlist
          </button>
          {onRequestNewPlaylist && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
              onClick={() => {
                setMenu(null)
                onRequestNewPlaylist()
              }}
            >
              <FaPlus className="h-3 w-3 text-gray-500" />
              New playlist
            </button>
          )}

          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            Arrange
          </div>
          <button
            type="button"
            disabled={busy || playlist.trackIds.length < 2}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void shuffleTrackOrder()}
          >
            <FaRandom className="h-3 w-3 text-gray-500" />
            Shuffle order
          </button>
          <button
            type="button"
            disabled={busy || playlist.trackIds.length < 2}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void sortTracks('title')}
          >
            <FaSortAlphaDown className="h-3 w-3 text-gray-500" />
            Sort A–Z by title
          </button>
          <button
            type="button"
            disabled={busy || playlist.trackIds.length < 2}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void sortTracks('bpm')}
          >
            <FaSortAmountDown className="h-3 w-3 text-gray-500" />
            Sort by BPM
          </button>
          <button
            type="button"
            disabled={busy || !playlist.trackIds.length}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void clearAllTracks()}
          >
            <FaMinus className="h-3 w-3 text-gray-500" />
            Clear all tracks
          </button>

          <div className="my-1 border-t border-gray-800" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            Creative
          </div>
          <button
            type="button"
            disabled={busy || !playlist.trackIds.length}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void runSonicDna()}
          >
            <FaBolt className="h-3 w-3 text-amber-400" />
            {busy ? 'Queuing analysis…' : 'Run Sonic DNA on playlist'}
          </button>
          <button
            type="button"
            disabled={!playlist.trackIds.length}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void copySetlist()}
          >
            <FaFileAlt className="h-3 w-3 text-gray-500" />
            Copy setlist
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void setPublicVisibility(!folderHidden)}
          >
            {folderHidden ? <FaEye className="h-3 w-3 text-gray-500" /> : <FaEyeSlash className="h-3 w-3 text-gray-500" />}
            {folderHidden ? 'Make public' : 'Make private'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void addToLibrary('ep')}
          >
            <FaCompactDisc className="h-3 w-3 text-gray-500" />
            {folderType === 'ep' && !folderHidden ? 'Refresh EP library listing' : 'Promote to EP'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80 disabled:opacity-50"
            onClick={() => void addToLibrary('album')}
          >
            <FaCompactDisc className="h-3 w-3 text-gray-500" />
            {folderType === 'album' && !folderHidden ? 'Refresh album library listing' : 'Promote to album'}
          </button>

          <div className="my-1 border-t border-gray-800" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => void copyText(playlist.id)}
          >
            <FaCopy className="h-3 w-3 text-gray-500" />
            Copy playlist ID
          </button>
          <Link
            href="/admin/music-library"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800/80"
            onClick={() => setMenu(null)}
          >
            <FaExternalLinkAlt className="h-3 w-3 text-gray-500" />
            Open in Music Library
          </Link>

          <div className="my-1 border-t border-gray-800" />
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50"
            onClick={() => void archivePlaylist()}
          >
            <FaTrash className="h-3 w-3" />
            Remove playlist
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500/90 hover:bg-red-950/40 disabled:opacity-50"
            onClick={() => void hardDeletePlaylist()}
          >
            <FaTimes className="h-3 w-3" />
            Delete permanently
          </button>
          </div>
        </div>
      )}
      {editOpen && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !artBusy && !busy) setEditOpen(false)
          }}
        >
          <div
            ref={editRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-playlist-${playlist.id}`}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id={`edit-playlist-${playlist.id}`} className="mb-4 text-lg font-semibold text-white">
              Edit playlist
            </h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs text-gray-400">Playlist artwork</span>
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    className={`relative h-36 w-36 flex-shrink-0 overflow-hidden rounded-lg border bg-gray-800 transition-colors ${
                      coverDragOver
                        ? 'border-purple-500 ring-1 ring-purple-500/50'
                        : 'border-gray-700'
                    }`}
                    onClick={() => openPlaylistArtViewer()}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (playlistCoverSrc) openPlaylistArtViewer(playlistCoverSrc)
                      else artFileRef.current?.click()
                    }}
                    onDragEnter={(e) => {
                      if (!dataTransferHasArtworkPayload(e.dataTransfer)) return
                      e.preventDefault()
                      e.stopPropagation()
                      coverDragDepth.current += 1
                      setCoverDragOver(true)
                    }}
                    onDragOver={(e) => {
                      if (!dataTransferHasArtworkPayload(e.dataTransfer)) return
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = artworkDropEffect(e.dataTransfer)
                      setCoverDragOver(true)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      coverDragDepth.current = Math.max(0, coverDragDepth.current - 1)
                      if (coverDragDepth.current === 0) setCoverDragOver(false)
                    }}
                    onDrop={applyPlaylistCoverDrop}
                    aria-label={playlistCoverSrc ? 'View playlist artwork' : 'Drop playlist artwork here'}
                  >
                    <CoverArt
                      src={playlistCoverSrc || undefined}
                      fallbackSrc={
                        artPreviewBlob && !draft.artwork.startsWith('blob:') ? artPreviewBlob : undefined
                      }
                      alt={`${draft.name || playlist.name} artwork`}
                      sizes="144px"
                      iconClassName="h-10 w-10 text-gray-600"
                    />
                    {coverDragOver && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Drop to set
                      </span>
                    )}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      ref={artFileRef}
                      type="file"
                      accept="image/*,.heic,.heif,.avif"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void uploadPlaylistArtwork(file)
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                        onClick={() => setChooseArtOpen((open) => !open)}
                        disabled={artBusy}
                      >
                        <FaImage className="h-3 w-3" />
                        Choose
                      </button>
                      {playlistCoverSrc ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                          onClick={() => artFileRef.current?.click()}
                          disabled={artBusy}
                        >
                          <FaSync className="h-3 w-3" />
                          {artBusy ? 'Uploading…' : 'Replace'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                          onClick={() => artFileRef.current?.click()}
                          disabled={artBusy}
                        >
                          <FaUpload className="h-3 w-3" />
                          {artBusy ? 'Uploading…' : 'Add'}
                        </button>
                      )}
                      {draft.artwork.trim() && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
                          onClick={() => setDraft((d) => ({ ...d, artwork: '' }))}
                          disabled={artBusy}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <label className="block text-xs text-gray-500">
                      Artwork URL
                      <input
                        value={draft.artwork}
                        onChange={(e) => setDraft((d) => ({ ...d, artwork: e.target.value }))}
                        placeholder="https://… or /images/…"
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                      />
                    </label>
                  </div>
                </div>
                {chooseArtOpen && (
                  <ChooseExistingArtworkPanel
                    choices={artChoices}
                    selectedSrc={draft.artwork}
                    busy={artBusy}
                    onSelect={selectArtwork}
                    onUploadFile={(file) => void uploadPlaylistArtwork(file)}
                    onPreview={(src) => openPlaylistArtViewer(src)}
                    onClear={() => setDraft((d) => ({ ...d, artwork: '' }))}
                    onBrowseUpload={() => artFileRef.current?.click()}
                    onUploadError={setError}
                  />
                )}
              </div>
              <label className="block text-xs text-gray-400">
                Name
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Description
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full resize-y rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-400">
                  Catalog listing
                  <select
                    value={draft.libraryType}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, libraryType: e.target.value as 'playlist' | 'ep' | 'album' }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  >
                    <option value="playlist">Playlist only</option>
                    <option value="ep">EP library</option>
                    <option value="album">Album library</option>
                  </select>
                </label>
                <div className="flex flex-col justify-end gap-1">
                  <span className="text-xs text-gray-400">Visibility</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDraft((d) => ({ ...d, hidden: !d.hidden }))}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition disabled:opacity-50 ${
                      draft.hidden
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20'
                    }`}
                    aria-pressed={!draft.hidden}
                  >
                    {draft.hidden ? <FaEyeSlash className="h-3.5 w-3.5" /> : <FaEye className="h-3.5 w-3.5" />}
                    {draft.hidden ? 'Private' : 'Public'}
                  </button>
                </div>
              </div>
              <p className="text-[10px] leading-snug text-gray-500">
                {draft.hidden
                  ? 'Private playlists stay in admin but are hidden from the public music library.'
                  : 'Public playlists appear in the public music library Playlists section.'}
              </p>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Tracks ({orderedTracks.length})</span>
                  {orderedTracks.length > 1 && (
                    <span className="text-[10px] text-gray-500">Drag or use arrows</span>
                  )}
                </div>
                <label className="mb-2 block">
                  <span className="sr-only">Add tracks</span>
                  <input
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    placeholder="Search to add a track…"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                  />
                </label>
                {trackSearch.trim().length >= 2 && (
                  <ul className="mb-2 max-h-32 overflow-y-auto rounded-lg border border-gray-700">
                    {searchBusy && <li className="px-3 py-2 text-xs text-gray-500">Searching…</li>}
                    {!searchBusy && searchHits.length === 0 && (
                      <li className="px-3 py-2 text-xs text-gray-500">No matching tracks</li>
                    )}
                    {searchHits.map((track) => (
                      <li key={track.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-800"
                          onClick={() => addTrack(track)}
                        >
                          <FaPlus className="h-3 w-3 flex-shrink-0 text-purple-400" />
                          <span className="truncate">{track.title}</span>
                          <span className="ml-auto truncate text-xs text-gray-500">{track.artist}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {tracksLoading ? (
                  <p className="rounded-lg border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500">
                    Loading tracks…
                  </p>
                ) : orderedTracks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500">
                    No tracks yet — search above to add some
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto rounded-lg border border-gray-700 divide-y divide-gray-800">
                    {orderedTracks.map((track, index) => (
                      <li
                        key={track.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (dragOverIndex !== index) setDragOverIndex(index)
                        }}
                        onDragEnd={() => {
                          setDragIndex(null)
                          setDragOverIndex(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragIndex != null) moveTrack(dragIndex, index)
                          setDragIndex(null)
                          setDragOverIndex(null)
                        }}
                        className={`flex items-center gap-2 px-2 py-1.5 ${
                          dragIndex === index
                            ? 'opacity-50 bg-gray-800'
                            : dragOverIndex === index
                              ? 'bg-purple-900/30 border-t-2 border-purple-500'
                              : 'hover:bg-gray-800/60'
                        }`}
                      >
                        <FaGripVertical className="h-3 w-3 flex-shrink-0 cursor-grab text-gray-600" />
                        <span className="w-5 flex-shrink-0 text-xs tabular-nums text-gray-500">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{track.title}</span>
                        <div className="flex flex-shrink-0">
                          <button
                            type="button"
                            aria-label={`Move ${track.title} up`}
                            disabled={index === 0 || busy}
                            className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                            onClick={() => moveTrack(index, index - 1)}
                          >
                            <FaChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${track.title} down`}
                            disabled={index === orderedTracks.length - 1 || busy}
                            className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                            onClick={() => moveTrack(index, index + 1)}
                          >
                            <FaChevronDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${track.title}`}
                            disabled={busy}
                            className="rounded p-1 text-gray-500 hover:bg-red-950/50 hover:text-red-400 disabled:opacity-30"
                            onClick={() => removeTrack(track.id)}
                          >
                            <FaTrash className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                onClick={() => setEditOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
                onClick={() => void saveEdit()}
                disabled={busy || !draft.name.trim()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {artViewerOpen && (artViewerSrc || playlistCoverSrc) && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4">
          <div
            ref={artViewerRef}
            className="relative aspect-square w-full max-w-md overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
          >
            <CoverArt
              src={artViewerSrc || playlistCoverSrc}
              fallbackSrc={
                artPreviewBlob && !draft.artwork.startsWith('blob:') ? artPreviewBlob : undefined
              }
              alt={`${draft.name || playlist.name} artwork`}
              sizes="448px"
              iconClassName="h-16 w-16 text-gray-600"
            />
            <button
              type="button"
              aria-label="Close playlist artwork"
              className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
              onClick={() => {
                setArtViewerOpen(false)
                setArtViewerSrc(null)
              }}
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function CrateCoverMosaic({ covers }: { covers: string[] }) {
  if (!covers.length) {
    return <CoverArt src={undefined} alt="" sizes="200px" />
  }
  const cells = Array.from({ length: 9 }, (_, index) => covers[index] || '')
  return (
    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-px bg-black">
      {cells.map((src, index) =>
        src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <div key={`empty-${index}`} className="h-full w-full bg-gray-900" />
        ),
      )}
    </div>
  )
}

function AlbumSection({
  items,
  tracksByFolder,
  tracksHydrating = false,
  onOpen,
  adminCatalog = false,
  onFolderUpdated,
  onFolderArchived,
  onTracksReordered,
  onVisibilityChange,
  onAddedToLibrary,
}: {
  items: AlbumTile[]
  tracksByFolder: Record<string, Track[]>
  tracksHydrating?: boolean
  onOpen: (id: string) => void
  adminCatalog?: boolean
  onFolderUpdated?: (id: string, patch: Partial<AlbumTile>) => void
  onFolderArchived?: (id: string) => void
  onTracksReordered?: (folderId: string, tracks: Track[]) => void
  onVisibilityChange?: (id: string, hidden: boolean) => void
  onAddedToLibrary?: (tile: AlbumTile) => void
}) {
  const libraryCoverPool = useMemo(() => {
    const urls: Array<string | null | undefined> = []
    for (const item of items) {
      urls.push(item.artwork, catalogArtworkForRelease(item.name))
    }
    for (const tracks of Object.values(tracksByFolder)) {
      for (const track of tracks) urls.push(track.artwork)
    }
    for (const tile of EP_COVER_CHOICES) urls.push(tile.src)
    return collectLibraryCoverPool(urls)
  }, [items, tracksByFolder])

  const crateMosaics = useMemo(() => {
    const crateIds = items.filter((item) => item.type === 'album').map((item) => item.id)
    return assignCrateMosaicCovers(libraryCoverPool, crateIds)
  }, [items, libraryCoverPool])

  if (items.length === 0) return null
  return (
    <div className="space-y-8">
      {CATALOG_SECTIONS.map(({ type, label, blurb }) => {
        const groupItems = items.filter((item) => item.type === type)
        if (!groupItems.length) return null
        return (
          <div key={type}>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{label}</h3>
            {blurb ? <p className="mt-1 mb-3 text-xs text-gray-500 max-w-2xl">{blurb}</p> : <div className="mb-3" />}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {groupItems.map((album) => {
                const trackCount = tracksByFolder[album.id]?.length || 0
                return (
                  <AdminFolderChrome
                    key={album.id}
                    album={album}
                    enabled={adminCatalog}
                    hidden={!!album.hidden}
                    tracks={tracksByFolder[album.id] || []}
                    onUpdated={onFolderUpdated}
                    onArchived={onFolderArchived}
                    onTracksReordered={onTracksReordered}
                    onVisibilityChange={onVisibilityChange}
                    onAddedToLibrary={onAddedToLibrary}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(album.id)}
                      className="group w-full text-left bg-gray-900/30 rounded-lg p-3 hover:bg-gray-800/40 transition"
                    >
                      <div className="aspect-square rounded-md overflow-hidden bg-gray-800 mb-2 relative">
                        {album.type === 'album' ? (
                          <CrateCoverMosaic covers={crateMosaics[album.id] || []} />
                        ) : (
                          <CoverArt
                            src={album.artwork || folderArtworkSrc(album, tracksByFolder[album.id] || [])}
                            fallbackSrc={catalogArtworkForRelease(album.name)}
                            alt={album.name}
                            sizes="200px"
                          />
                        )}
                        {album.type === 'ep' && (
                          <span className="absolute top-1.5 left-1.5 text-[9px] font-bold tracking-wide text-teal-200 bg-teal-600/80 px-1.5 py-0.5 rounded">
                            EP
                          </span>
                        )}
                        {adminCatalog && (
                          <span className="absolute top-1.5 right-1.5">
                            <CatalogVisibilityBadge isPrivate={!!album.hidden} size="sm" />
                          </span>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <FaPlay className="w-8 h-8 text-white" />
                        </div>
                      </div>
                      <div className="truncate text-sm font-medium">{album.name}</div>
                      <div className="truncate text-xs text-gray-400">
                        {album.albumArtist || 'SERGIK'}
                        {album.year ? ` · ${album.year}` : ''}
                        {album.type === 'ep' ? ' · EP' : ''}
                      </div>
                      <div className="truncate text-xs text-gray-500 mt-0.5">
                        {trackCount > 0
                          ? `${trackCount} track${trackCount === 1 ? '' : 's'}`
                          : tracksHydrating
                            ? 'Loading tracks…'
                            : `0 tracks`}
                      </div>
                    </button>
                  </AdminFolderChrome>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CatalogVisibilityBadge({
  isPrivate,
  size = 'md',
}: {
  isPrivate: boolean
  size?: 'sm' | 'md'
}) {
  const label = isPrivate ? 'Private' : 'Public'
  const tip = isPrivate
    ? 'Private — visible in admin only, hidden from the public site'
    : 'Public — visible on the public music library'
  const color = isPrivate
    ? 'border-red-500/50 bg-red-500/15 text-red-300'
    : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
  const iconCls = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
  const textCls = size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border font-semibold uppercase tracking-wide ${color} ${textCls}`}
      title={tip}
      aria-label={tip}
    >
      <FaInfoCircle className={iconCls} aria-hidden />
      {isPrivate ? <FaEyeSlash className={iconCls} aria-hidden /> : <FaEye className={iconCls} aria-hidden />}
      {label}
    </span>
  )
}

function AlbumCatalog({
  items,
  tracksByFolder,
  tracksHydrating = false,
  currentTrackId,
  isPlaying,
  sortField,
  sortDir,
  onSort,
  onPlayGroup,
  onRate,
  sortIcon,
  adminCatalog = false,
  onTrackUpdated,
  onTrackArchived,
  onFolderUpdated,
  onFolderArchived,
  onTracksReordered,
  onVisibilityChange,
  onAddedToLibrary,
}: {
  items: AlbumTile[]
  tracksByFolder: Record<string, Track[]>
  tracksHydrating?: boolean
  currentTrackId?: string
  isPlaying: boolean
  sortField: SortField
  sortDir: 'asc' | 'desc'
  onSort: (field: SortField) => void
  onPlayGroup: (group: Track[], track: Track) => void
  onRate: (trackId: string, rating: number) => void
  sortIcon: (field: SortField) => React.ReactNode
  adminCatalog?: boolean
  onTrackUpdated?: (track: Track) => void
  onTrackArchived?: (trackId: string) => void
  onFolderUpdated?: (id: string, patch: Partial<AlbumTile>) => void
  onFolderArchived?: (id: string) => void
  onTracksReordered?: (folderId: string, tracks: Track[]) => void
  onVisibilityChange?: (id: string, hidden: boolean) => void
  onAddedToLibrary?: (tile: AlbumTile) => void
}) {
  const tracksWithEpArt = useMemo(
    () => withEpArtworkOnCrateTracks(tracksByFolder, items),
    [tracksByFolder, items],
  )
  return (
    <div className="space-y-10">
      {CATALOG_SECTIONS.map(({ type, label, blurb }) => {
        const groupItems = items.filter((item) => item.type === type)
        if (!groupItems.length) return null
        return (
          <div key={type} className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{label}</h3>
              {blurb ? <p className="mt-1 text-xs text-gray-500 max-w-2xl">{blurb}</p> : null}
            </div>
            {groupItems.map((album) => {
              const group = tracksWithEpArt[album.id] || []
              return (
                <section key={album.id} className="space-y-3">
                  <AdminFolderChrome
                    album={album}
                    enabled={adminCatalog}
                    hidden={!!album.hidden}
                    tracks={group}
                    onUpdated={onFolderUpdated}
                    onArchived={onFolderArchived}
                    onTracksReordered={onTracksReordered}
                    onVisibilityChange={onVisibilityChange}
                    onAddedToLibrary={onAddedToLibrary}
                    onPlayAll={group[0] ? () => onPlayGroup(group, group[0]) : undefined}
                  >
                    <div className={`flex items-center gap-3 ${adminCatalog ? 'cursor-context-menu rounded-md pr-2 hover:bg-gray-800/30' : ''}`}>
                      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-gray-800">
                        <CoverArt
                          src={album.artwork || folderArtworkSrc(album, group)}
                          fallbackSrc={catalogArtworkForRelease(album.name)}
                          alt=""
                          sizes="56px"
                          iconClassName="h-6 w-6 text-gray-600"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{album.name}</div>
                        <div className="truncate text-xs text-gray-400">
                          {album.albumArtist || 'SERGIK'}
                          {album.year ? ` · ${album.year}` : ''}
                          {album.type === 'ep' ? ' · EP' : ''}
                          {` · ${
                            group.length > 0
                              ? `${group.length} track${group.length === 1 ? '' : 's'}`
                              : tracksHydrating
                                ? 'loading…'
                                : '0 tracks'
                          }`}
                        </div>
                      </div>
                      {adminCatalog && <CatalogVisibilityBadge isPrivate={!!album.hidden} />}
                    </div>
                  </AdminFolderChrome>
                  <SongsTable
                    tracks={group}
                    loading={tracksHydrating && group.length === 0}
                    currentTrackId={currentTrackId}
                    isPlaying={isPlaying}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                    onPlay={(track) => onPlayGroup(group, track)}
                    onRate={onRate}
                    sortIcon={sortIcon}
                    showTrackNumber
                    adminCatalog={adminCatalog}
                    playerSource={{ type: 'folder', id: album.id }}
                    onTrackUpdated={onTrackUpdated}
                    onTrackArchived={onTrackArchived}
                  />
                </section>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function CoverArt({
  src,
  fallbackSrc,
  alt = '',
  sizes,
  iconClassName = 'w-12 h-12 text-gray-700',
}: {
  src?: string | null
  fallbackSrc?: string | null
  alt?: string
  sizes: string
  iconClassName?: string
}) {
  const candidates = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const push = (raw?: string | null) => {
      if (!raw?.trim()) return
      const trimmed = raw.trim()
      // blob: previews from an in-progress upload — use as-is
      if (trimmed.startsWith('blob:')) {
        if (seen.has(trimmed)) return
        seen.add(trimmed)
        out.push(trimmed)
        return
      }
      const bustMatch = trimmed.match(/[?&]v=([^&]+)/)
      let next = resolveImageUrl(trimmed)
      if (!next) return
      if (next.startsWith('/images/') || next.startsWith('/audio/')) {
        const base = next.split('?')[0]
        // Prefer caller bust (fresh upload) so overwritten files actually refresh
        next = bustMatch
          ? `${base}?v=${bustMatch[1]}`
          : isUploadedFolderArtwork(base)
            ? withArtworkCacheBust(base)
            : `${base}?v=20260820c`
      }
      if (seen.has(next)) return
      seen.add(next)
      out.push(next)
    }
    push(src)
    push(fallbackSrc)
    return out
  }, [src, fallbackSrc])

  // Remount when the candidate list changes so an aborted blob load cannot
  // fire onError and skip the replacement URL (empty disc icon).
  return (
    <CoverArtFrame
      key={candidates.join('|')}
      candidates={candidates}
      alt={alt}
      sizes={sizes}
      iconClassName={iconClassName}
    />
  )
}

function CoverArtFrame({
  candidates,
  alt,
  sizes,
  iconClassName,
}: {
  candidates: string[]
  alt: string
  sizes: string
  iconClassName: string
}) {
  const [index, setIndex] = useState(0)
  const url = candidates[index]
  if (!url) {
    return (
      <div className="relative h-full w-full flex items-center justify-center">
        <FaCompactDisc className={iconClassName} />
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        sizes={sizes}
        onError={() => setIndex((current) => current + 1)}
      />
    </div>
  )
}

function SidebarArtTile({ src, alt }: { src?: string; alt: string }) {
  return (
    <span className="relative w-8 h-8 rounded-sm overflow-hidden flex-shrink-0 bg-gray-800 shadow-sm ring-1 ring-white/10">
      <CoverArt src={src} alt="" sizes="32px" iconClassName="w-3.5 h-3.5 text-gray-600" />
      <span className="sr-only">{alt}</span>
    </span>
  )
}

function SidebarAlbumItem({
  album,
  tracks = [],
  active,
  onSelect,
  showPrivateBadge = false,
}: {
  album: AlbumTile
  tracks?: Track[]
  active: boolean
  onSelect: (id: string) => void
  showPrivateBadge?: boolean
}) {
  const isPrivate = !!(album.hidden || showPrivateBadge)
  return (
    <button
      onClick={() => onSelect(album.id)}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition ${
        active
          ? 'bg-purple-600/20 text-purple-300'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
      }`}
    >
      <SidebarArtTile src={album.artwork || folderArtworkSrc(album, tracks)} alt={album.name} />
      <span className="min-w-0 flex-1 truncate">{album.name}</span>
      {isPrivate && (
        <FaEyeSlash className="h-3 w-3 flex-shrink-0 text-red-400" title="Private" />
      )}
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
