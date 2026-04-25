/**
 * Music Library API Utilities
 * Handles fetching library data from API with JSON fallback
 */

import musicLibraryData from '@/data/music-library.json'

export interface Track {
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
  energy_level?: number
  danceability?: number
  sonic_dna?: any
  created_at?: string
  date?: string
  year?: number
  folder?: string
  metadata?: any
  is_archived?: boolean
  archived_at?: string
  genre?: string
  subgenre?: string
  album?: string
  albumType?: string
  track_number?: number
  disc_number?: number
  composer?: string
  rating?: number
  play_count?: number
  last_played_at?: string
  tags?: string[]
  comments?: string
  sort_artist?: string
}

export interface FolderItem {
  id: string
  name: string
  type: 'folder' | 'album' | 'ep' | 'single' | 'remix' | 'track'
  parentId: string | null
  children?: FolderItem[]
  tracks?: Track[]
  artwork?: string
  year?: number
  hidden?: boolean
  is_archived?: boolean
  archived_at?: string
}

export interface MusicLibraryData {
  description: string
  folders: FolderItem[]
  playlists: any[]
}

// Configuration: Set to true to use API, false to use JSON
// Default to true (use API) if env var is not set, to ensure database is used
const USE_API = process.env.NEXT_PUBLIC_USE_MUSIC_LIBRARY_API !== 'false'
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

// Lightweight in-memory cache for repeat visits (client-side)
let musicLibraryCache: { data: MusicLibraryData | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
}
const MUSIC_LIBRARY_CACHE_TTL_MS = 10 * 60_000

// Persistent cache (best-effort). Browser storage can be evicted; we just try to keep it.
const CACHE_VERSION = 'v10' // Increment when schema changes - added iTunes-style columns
const PERSIST_KEY = `sergik:musicLibraryCache:${CACHE_VERSION}`
const PERSIST_TTL_MS = 24 * 60 * 60_000

/**
 * Invalidate music library cache
 * Useful when schema changes or data is updated
 */
export function invalidateMusicLibraryCache(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PERSIST_KEY)
      musicLibraryCache = { data: null, expiresAt: 0 }
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Fetch music library data from API or fallback to JSON
 */
export interface FetchMusicLibraryOptions {
  includeHidden?: boolean
  skipCache?: boolean
}

export async function fetchMusicLibrary(options: FetchMusicLibraryOptions = {}): Promise<MusicLibraryData> {
  const { includeHidden = false, skipCache = false } = options
  
  // Clear ALL cache versions to ensure fresh data
  if (typeof window !== 'undefined') {
    try {
      const allCacheKeys = ['sergik:musicLibraryCache:v1', 'sergik:musicLibraryCache:v2', 'sergik:musicLibraryCache:v3', 'sergik:musicLibraryCache:v4', 'sergik:musicLibraryCache:v5', 'sergik:musicLibraryCache:v6', 'sergik:musicLibraryCache:v7', 'sergik:musicLibraryCache:v8']
      allCacheKeys.forEach(key => {
        window.localStorage.removeItem(key)
      })
      // Also clear in-memory cache
      musicLibraryCache = { data: null, expiresAt: 0 }
    } catch {
      // Ignore errors
    }
  }

  // Return cached data if fresh (skip cache for admin requests with includeHidden)
  if (!skipCache && !includeHidden && musicLibraryCache.data && Date.now() < musicLibraryCache.expiresAt) {
    return musicLibraryCache.data
  }

  // Try persistent cache first (repeat visitors avoid refetching the full library payload)
  // Only use cache for non-admin (public) requests
  if (!skipCache && !includeHidden && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(PERSIST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { data: MusicLibraryData; expiresAt: number }
        if (parsed?.data && typeof parsed.expiresAt === 'number' && Date.now() < parsed.expiresAt) {
          musicLibraryCache = { data: parsed.data, expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS }
          return parsed.data
        }
      }
    } catch {
      // Ignore storage errors (quota/private mode)
    }
  }

  debugIngest({
    location: 'musicLibraryApi.ts:51',
    message: 'fetchMusicLibrary entry',
    data: { useApi: USE_API },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run1',
    hypothesisId: 'D',
  })
  if (USE_API) {
    try {
      debugIngest({
        location: 'musicLibraryApi.ts:54',
        message: 'Fetching /api/music-library/sync',
        data: {},
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'D',
      })
      const params = new URLSearchParams()
      if (includeHidden) params.set('include_hidden', 'true')
      const url = `/api/music-library/sync${params.toString() ? '?' + params.toString() : ''}`
      const response = await fetch(url)
      debugIngest({
        location: 'musicLibraryApi.ts:56',
        message: 'Response received',
        data: {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'D',
      })
      if (response.ok) {
        const data = await response.json()
        debugIngest({
          location: 'musicLibraryApi.ts:59',
          message: 'fetchMusicLibrary success',
          data: { hasFolders: !!data.folders, foldersCount: data.folders?.length || 0 },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'D',
        })
        musicLibraryCache = {
          data,
          expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS,
        }

        // Best-effort persistent cache
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(
              PERSIST_KEY,
              JSON.stringify({ data, expiresAt: Date.now() + PERSIST_TTL_MS }),
            )
          } catch {
            // Ignore quota issues
          }
        }
        return data
      }
      debugIngest({
        location: 'musicLibraryApi.ts:62',
        message: 'API fetch failed, falling back to JSON',
        data: { status: response.status },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'D',
      })
      console.warn('API fetch failed, falling back to JSON')
    } catch (error: any) {
      debugIngest({
        location: 'musicLibraryApi.ts:65',
        message: 'API fetch error, falling back to JSON',
        data: { errorMessage: error?.message },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'E',
      })
      console.warn('API fetch error, falling back to JSON:', error)
    }
  }

  // Fallback to JSON
  debugIngest({
    location: 'musicLibraryApi.ts:68',
    message: 'Using JSON fallback',
    data: {},
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run1',
    hypothesisId: 'D',
  })
  const data = musicLibraryData as unknown as MusicLibraryData
  musicLibraryCache = {
    data,
    expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS,
  }
  return data
}

/**
 * Fetch folders from API
 */
export async function fetchFolders(
  includeHidden = false,
  includeArchived = false
): Promise<FolderItem[]> {
  if (USE_API) {
    try {
      const params = new URLSearchParams()
      if (includeHidden) params.set('includeHidden', 'true')
      if (includeArchived) params.set('includeArchived', 'true')
      const query = params.toString()
      const url = query ? `/api/music-library/folders?${query}` : '/api/music-library/folders'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        return data.folders || []
      }
    } catch (error) {
      console.error('Error fetching folders from API:', error)
    }
  }

  // Fallback: extract from JSON
  const data = musicLibraryData as unknown as MusicLibraryData
  return data.folders || []
}

/**
 * Fetch tracks from API
 */
export async function fetchTracks(
  folderId?: string,
  options?: { includeArchived?: boolean; includeFullData?: boolean }
): Promise<Track[]> {
  if (USE_API) {
    try {
      const params = new URLSearchParams()
      if (folderId) params.set('folderId', folderId)
      if (options?.includeArchived) params.set('includeArchived', 'true')
      const includeFullData = options?.includeFullData !== false
      if (includeFullData) params.set('includeFullData', 'true')
      const query = params.toString()
      const url = query ? `/api/music-library/tracks?${query}` : '/api/music-library/tracks'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        return data.tracks || []
      }
    } catch (error) {
      console.error('Error fetching tracks from API:', error)
    }
  }

  // Fallback: extract from JSON
  const data = musicLibraryData as unknown as MusicLibraryData
  const allTracks: Track[] = []

  function extractTracks(items: FolderItem[]) {
    items.forEach(item => {
      if (item.tracks) {
        if (!folderId || item.id === folderId) {
          allTracks.push(...item.tracks)
        }
      }
      if (item.children) {
        extractTracks(item.children)
      }
    })
  }

  extractTracks(data.folders || [])
  return allTracks
}

/**
 * Fetch tracks summary (optimized, no heavy Sonic DNA payloads)
 */
export async function fetchTracksSummary(
  folderId?: string,
  options?: { includeArchived?: boolean; limit?: number; offset?: number; search?: string }
): Promise<{ tracks: Track[]; total?: number; hasMore?: boolean }> {
  if (USE_API) {
    try {
      const params = new URLSearchParams()
      if (folderId) params.set('folderId', folderId)
      if (options?.includeArchived) params.set('includeArchived', 'true')
      if (options?.limit) params.set('limit', String(options.limit))
      if (options?.offset) params.set('offset', String(options.offset))
      if (options?.search) params.set('search', options.search)
      params.set('fields', 'basic,metadata,artwork')
      const query = params.toString()
      const url = query ? `/api/music-library/tracks-optimized?${query}` : '/api/music-library/tracks-optimized'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        return { tracks: data.tracks || [], total: data.total, hasMore: data.hasMore }
      }
    } catch (error) {
      console.error('Error fetching tracks summary from API:', error)
    }
  }

  // Fallback: extract from JSON (no pagination)
  const data = musicLibraryData as unknown as MusicLibraryData
  const allTracks: Track[] = []

  function extractTracks(items: FolderItem[]) {
    items.forEach(item => {
      if (item.tracks) {
        if (!folderId || item.id === folderId) {
          allTracks.push(...item.tracks)
        }
      }
      if (item.children) {
        extractTracks(item.children)
      }
    })
  }

  extractTracks(data.folders || [])
  return { tracks: allTracks }
}

/**
 * Create a folder via API
 */
export async function createFolder(folder: Partial<FolderItem>): Promise<FolderItem | null> {
  if (!USE_API) {
    console.warn('API not enabled, cannot create folder')
    return null
  }

  try {
    const response = await fetch('/api/music-library/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folder),
    })

    if (response.ok) {
      const data = await response.json()
      return data.folder
    }

    const error = await response.json()
    throw new Error(error.error || 'Failed to create folder')
  } catch (error: any) {
    console.error('Error creating folder:', error)
    throw error
  }
}

/**
 * Update a folder via API
 */
export async function updateFolder(
  id: string,
  updates: Partial<FolderItem>
): Promise<FolderItem | null> {
  if (!USE_API) {
    console.warn('API not enabled, cannot update folder')
    return null
  }

  try {
    const response = await fetch('/api/music-library/folders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.folder
    }

    const error = await response.json()
    throw new Error(error.error || 'Failed to update folder')
  } catch (error: any) {
    console.error('Error updating folder:', error)
    throw error
  }
}

/**
 * Delete a folder via API
 */
export async function deleteFolder(id: string): Promise<boolean> {
  if (!USE_API) {
    console.warn('API not enabled, cannot delete folder')
    return false
  }

  try {
    const response = await fetch(`/api/music-library/folders?id=${id}`, {
      method: 'DELETE',
    })

    return response.ok
  } catch (error) {
    console.error('Error deleting folder:', error)
    return false
  }
}

/**
 * Create a track via API
 */
export async function createTrack(track: Partial<Track> & { folderId?: string }): Promise<Track | null> {
  if (!USE_API) {
    console.warn('API not enabled, cannot create track')
    return null
  }

  try {
    const response = await fetch('/api/music-library/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    })

    if (response.ok) {
      const data = await response.json()
      return data.track
    }

    const error = await response.json()
    throw new Error(error.error || 'Failed to create track')
  } catch (error: any) {
    console.error('Error creating track:', error)
    throw error
  }
}

/**
 * Update a track via API
 */
export async function updateTrack(
  id: string,
  updates: Partial<Track>
): Promise<Track | null> {
  if (!USE_API) {
    throw new Error('Music library API is disabled. Set NEXT_PUBLIC_USE_MUSIC_LIBRARY_API=true to enable saving.')
  }

  try {
    const response = await fetch('/api/music-library/tracks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.track
    }

    const error = await response.json()
    throw new Error(error.error || 'Failed to update track')
  } catch (error: any) {
    console.error('Error updating track:', error)
    throw error
  }
}

/**
 * Delete a track via API
 */
export async function deleteTrack(id: string): Promise<boolean> {
  if (!USE_API) {
    console.warn('API not enabled, cannot delete track')
    return false
  }

  try {
    const response = await fetch(`/api/music-library/tracks?id=${id}`, {
      method: 'DELETE',
    })

    return response.ok
  } catch (error) {
    console.error('Error deleting track:', error)
    return false
  }
}

/**
 * Sync JSON to database
 */
export async function syncToDatabase(filePath?: string): Promise<any> {
  try {
    const response = await fetch('/api/music-library/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    })

    if (response.ok) {
      return await response.json()
    }

    const error = await response.json()
    throw new Error(error.error || 'Failed to sync')
  } catch (error: any) {
    console.error('Error syncing to database:', error)
    throw error
  }
}

export interface Playlist {
  id: string
  name: string
  description?: string
  artwork?: string
  trackIds: string[]
  createdAt: string
  is_archived?: boolean
  archived_at?: string
}

/**
 * Fetch playlists from API
 */
export async function fetchPlaylists(options?: { includeArchived?: boolean }): Promise<Playlist[]> {
  if (USE_API) {
    try {
      const params = new URLSearchParams()
      if (options?.includeArchived) params.set('includeArchived', 'true')
      const query = params.toString()
      const url = query ? `/api/music-library/playlists?${query}` : '/api/music-library/playlists'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        return data.playlists || []
      }
    } catch (error) {
      console.error('Error fetching playlists from API:', error)
    }
  }

  // Fallback: extract from JSON
  const data = musicLibraryData as unknown as MusicLibraryData
  return (data.playlists || []) as Playlist[]
}

/**
 * Create a playlist via API
 */
export async function createPlaylist(playlist: Partial<Playlist>): Promise<Playlist | null> {
  if (!USE_API) {
    console.warn('API not enabled, cannot create playlist')
    return null
  }

  try {
    const response = await fetch('/api/music-library/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlist),
    })

    if (response.ok) {
      const data = await response.json()
      return data.playlist
    }

    const error = await response.json()
    throw new Error(error.error || 'Failed to create playlist')
  } catch (error: any) {
    console.error('Error creating playlist:', error)
    throw error
  }
}

/**
 * Update a playlist via API
 */
export async function updatePlaylist(
  id: string,
  updates: Partial<Playlist>
): Promise<Playlist | null> {
  if (!USE_API) {
    console.warn('API not enabled, cannot update playlist')
    return null
  }

  try {
    const response = await fetch('/api/music-library/playlists', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.playlist
    }

    const error = await response.json()
    throw new Error(error.error || 'Failed to update playlist')
  } catch (error: any) {
    console.error('Error updating playlist:', error)
    throw error
  }
}

/**
 * Delete a playlist via API
 */
export async function deletePlaylist(id: string): Promise<boolean> {
  if (!USE_API) {
    console.warn('API not enabled, cannot delete playlist')
    return false
  }

  try {
    const response = await fetch(`/api/music-library/playlists?id=${id}`, {
      method: 'DELETE',
    })

    return response.ok
  } catch (error) {
    console.error('Error deleting playlist:', error)
    return false
  }
}

// ============================================
// iTunes-style browse, play tracking, ratings
// ============================================

export type BrowseView = 'songs' | 'albums' | 'artists' | 'genres'

export interface BrowseOptions {
  view: BrowseView
  sort?: string
  dir?: 'asc' | 'desc'
  genre?: string
  artist?: string
  search?: string
  limit?: number
  offset?: number
}

export async function fetchBrowse(options: BrowseOptions): Promise<any> {
  const params = new URLSearchParams()
  params.set('view', options.view)
  if (options.sort) params.set('sort', options.sort)
  if (options.dir) params.set('dir', options.dir)
  if (options.genre) params.set('genre', options.genre)
  if (options.artist) params.set('artist', options.artist)
  if (options.search) params.set('search', options.search)
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))

  const res = await fetch(`/api/music-library/browse?${params}`)
  if (!res.ok) throw new Error('Failed to fetch browse data')
  return res.json()
}

export async function recordTrackPlay(
  trackId: string,
  opts?: { fanId?: string; duration?: number; source?: string }
): Promise<void> {
  try {
    await fetch('/api/music-library/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackId,
        fanId: opts?.fanId,
        duration: opts?.duration,
        source: opts?.source || 'library',
      }),
    })
  } catch {
    // Fire-and-forget — don't block playback
  }
}

export async function rateTrack(trackId: string, rating: number): Promise<boolean> {
  try {
    const res = await fetch('/api/music-library/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId, rating }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchRecentlyPlayed(limit = 25): Promise<Track[]> {
  try {
    const res = await fetch(`/api/music-library/play?type=recent&limit=${limit}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.tracks || []
  } catch {
    return []
  }
}

export async function fetchMostPlayed(limit = 25): Promise<Track[]> {
  try {
    const res = await fetch(`/api/music-library/play?type=top&limit=${limit}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.tracks || []
  } catch {
    return []
  }
}

export interface SmartPlaylist {
  id: string
  name: string
  description?: string
  rules: any
  sort_by: string
  sort_dir: string
  max_tracks?: number
  is_system: boolean
  is_live: boolean
  created_at: string
}

export async function fetchSmartPlaylists(): Promise<SmartPlaylist[]> {
  try {
    const res = await fetch('/api/music-library/smart-playlists')
    if (!res.ok) return []
    const data = await res.json()
    return data.playlists || []
  } catch {
    return []
  }
}

export async function resolveSmartPlaylist(id: string): Promise<{ playlist: SmartPlaylist; tracks: Track[] }> {
  const res = await fetch(`/api/music-library/smart-playlists?id=${id}&resolve=true`)
  if (!res.ok) throw new Error('Failed to resolve smart playlist')
  return res.json()
}

export async function createSmartPlaylist(data: {
  name: string
  description?: string
  rules: any
  sort_by?: string
  sort_dir?: string
  max_tracks?: number
}): Promise<SmartPlaylist | null> {
  try {
    const res = await fetch('/api/music-library/smart-playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.playlist
  } catch {
    return null
  }
}

export async function deleteSmartPlaylist(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/music-library/smart-playlists?id=${id}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}
