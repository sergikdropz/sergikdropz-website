/**
 * Music Library API Utilities
 * Handles fetching library data from API with JSON fallback
 */

import { normalizeVaultAudioUrl } from '@/utils/normalizeVaultAudioUrl'
import { resolveImageUrl } from '@/utils/resolveImageUrl'

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
  /** YYYY-MM-DD file/export create date (from metadata.original_date). */
  date_created?: string
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
  display_order?: number
  sonic_dna_status?: 'pending' | 'processing' | 'partial' | 'completed' | 'failed' | string | null
}

function normalizeTrackMedia(t: Track) {
  if (t.file) t.file = normalizeVaultAudioUrl(t.file)
  if (t.artwork) t.artwork = resolveImageUrl(t.artwork)
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
  albumArtist?: string
}

export interface MusicLibraryData {
  description: string
  folders: FolderItem[]
  playlists: any[]
}

/** Lazy-load catalog JSON only when API fallback is needed (~293KB — keep out of main client graph). */
let jsonLibraryCache: MusicLibraryData | null = null
let jsonLibraryPromise: Promise<MusicLibraryData> | null = null

async function loadJsonLibrary(): Promise<MusicLibraryData> {
  if (jsonLibraryCache) return jsonLibraryCache
  if (!jsonLibraryPromise) {
    jsonLibraryPromise = import('@/data/music-library.json').then((mod) => {
      const data = (mod.default ?? mod) as unknown as MusicLibraryData
      jsonLibraryCache = data
      return data
    })
  }
  return jsonLibraryPromise
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
let musicLibraryCache: { data: MusicLibraryData | null; expiresAt: number; version: number } = {
  data: null,
  expiresAt: 0,
  version: 0,
}
let purgedOldCacheKeys = false
const MUSIC_LIBRARY_CACHE_TTL_MS = 10 * 60_000

// Persistent cache (best-effort). Browser storage can be evicted; we just try to keep it.
const CACHE_VERSION = 'v15' // v15: persist date_created / year / catalog_overrides across refresh
const PERSIST_KEY = `sergik:musicLibraryCache:${CACHE_VERSION}`
const CACHE_VERSION_NUM = parseInt(CACHE_VERSION.replace(/^v/i, ''), 10) || 0
const PERSIST_TTL_MS = 24 * 60 * 60_000
const CATALOG_VERSION_TTL_MS = 10_000
let catalogVersionCache: { value: number | null; fetchedAt: number } = { value: null, fetchedAt: 0 }
let catalogVersionInFlight: Promise<number> | null = null

/**
 * Invalidate music library cache
 * Useful when schema changes or data is updated
 */
export function invalidateMusicLibraryCache(): void {
  musicLibraryCache = { data: null, expiresAt: 0, version: 0 }
  catalogVersionCache = { value: null, fetchedAt: 0 }
  catalogVersionInFlight = null
  if (typeof window === 'undefined') return
  try {
    const prefix = `sergik:musicLibraryCache:${CACHE_VERSION}`
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && (key === PERSIST_KEY || key.startsWith(`${prefix}:`) || key.startsWith(prefix))) {
        keys.push(key)
      }
    }
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Ignore errors
  }
}

/**
 * Update in-memory (+ optional localStorage) snapshot after track hydration
 * so browse UIs that peek the cache see folder.tracks populated.
 */
export function seedMusicLibraryCache(data: MusicLibraryData, opts?: { persist?: boolean }): void {
  if (!data?.folders) return
  normalizeMusicLibraryUrlsInPlace(data)
  const version = catalogVersionCache.value || musicLibraryCache.version || 0
  musicLibraryCache = {
    data,
    expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS,
    version,
  }
  if (!opts?.persist || typeof window === 'undefined') return
  try {
    const persistKey = version ? `${PERSIST_KEY}:${version}` : PERSIST_KEY
    window.localStorage.setItem(
      persistKey,
      JSON.stringify({ data, expiresAt: Date.now() + PERSIST_TTL_MS }),
    )
  } catch {
    // Ignore quota / private mode
  }
}

/**
 * Instant, sync read of any in-memory or localStorage library snapshot.
 * Used to paint the vault UI before network sync finishes.
 */
export function peekCachedMusicLibrary(): MusicLibraryData | null {
  if (musicLibraryCache.data) {
    normalizeMusicLibraryUrlsInPlace(musicLibraryCache.data)
    return musicLibraryCache.data
  }
  if (typeof window === 'undefined') return null
  try {
    const prefix = `sergik:musicLibraryCache:${CACHE_VERSION}`
    let best: { data: MusicLibraryData; expiresAt: number } | null = null
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !(key === PERSIST_KEY || key.startsWith(`${prefix}:`) || key.startsWith(prefix))) {
        continue
      }
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || '') as {
          data: MusicLibraryData
          expiresAt: number
        }
        if (!parsed?.data?.folders) continue
        // Prefer freshest snapshot even if TTL expired (stale-while-revalidate)
        if (!best || (parsed.expiresAt || 0) > (best.expiresAt || 0)) {
          best = parsed
        }
      } catch {
        // skip bad entries
      }
    }
    if (!best?.data) return null
    normalizeMusicLibraryUrlsInPlace(best.data)
    musicLibraryCache = {
      data: best.data,
      expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS,
      version: 0,
    }
    return best.data
  } catch {
    return null
  }
}

async function fetchCatalogPublishVersion(): Promise<number> {
  const now = Date.now()
  if (
    catalogVersionCache.value != null &&
    now - catalogVersionCache.fetchedAt < CATALOG_VERSION_TTL_MS
  ) {
    return catalogVersionCache.value
  }
  if (catalogVersionInFlight) return catalogVersionInFlight

  catalogVersionInFlight = (async () => {
    try {
      const response = await fetch('/api/music-library/catalog-version', { cache: 'no-store' })
      if (!response.ok) return 0
      const data = await response.json()
      const version = Number(data?.version)
      const resolved = Number.isFinite(version) ? version : 0
      catalogVersionCache = { value: resolved, fetchedAt: Date.now() }
      return resolved
    } catch {
      return catalogVersionCache.value ?? 0
    } finally {
      catalogVersionInFlight = null
    }
  })()

  return catalogVersionInFlight
}

function withCatalogVersion(url: string, version: number): string {
  if (!version) return url
  return url.includes('?') ? `${url}&v=${version}` : `${url}?v=${version}`
}

async function fetchLibrary(url: string, init?: RequestInit): Promise<Response> {
  // Version is already attached by callers that need it; avoid a second round-trip.
  if (/[?&]v=/.test(url)) {
    return fetch(url, { ...init, cache: 'no-store' })
  }
  const version = await fetchCatalogPublishVersion()
  return fetch(withCatalogVersion(url, version), { ...init, cache: 'no-store' })
}

/** In-place: Supabase vault objects are MP3; rewrite stale .wav URLs from old caches. */
function normalizeMusicLibraryUrlsInPlace(data: MusicLibraryData): void {
  const fix = (t: Track) => {
    if (t?.file && typeof t.file === 'string') t.file = normalizeVaultAudioUrl(t.file)
    delete (t as any).sonic_dna
    delete (t as any).waveform
    delete (t as any).waveform_data
  }
  const walk = (nodes: FolderItem[] | undefined) => {
    if (!nodes) return
    for (const n of nodes) {
      n.tracks?.forEach(fix)
      if (n.children) walk(n.children)
    }
  }
  walk(data.folders)
  if (Array.isArray(data.playlists)) {
    for (const p of data.playlists as { tracks?: Track[] }[]) {
      p?.tracks?.forEach(fix)
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
  
  // Drop older persisted schema keys (e.g. v10 held pre-MP3 .wav URLs) without deleting this version's key
  if (typeof window !== 'undefined' && CACHE_VERSION_NUM > 1 && !purgedOldCacheKeys) {
    purgedOldCacheKeys = true
    try {
      for (let v = 1; v < CACHE_VERSION_NUM; v++) {
        window.localStorage.removeItem(`sergik:musicLibraryCache:v${v}`)
      }
    } catch {
      // Ignore errors
    }
  }

  const catalogVersionHint = !includeHidden ? catalogVersionCache.value : 0
  const persistKeyHint = catalogVersionHint ? `${PERSIST_KEY}:${catalogVersionHint}` : PERSIST_KEY

  // Return cached data if fresh (skip cache for admin requests with includeHidden)
  if (
    !skipCache &&
    !includeHidden &&
    musicLibraryCache.data &&
    Date.now() < musicLibraryCache.expiresAt
  ) {
    normalizeMusicLibraryUrlsInPlace(musicLibraryCache.data)
    // Refresh version in background without blocking paint
    void fetchCatalogPublishVersion()
    return musicLibraryCache.data
  }

  if (!skipCache && !includeHidden && typeof window !== 'undefined') {
    try {
      const raw =
        window.localStorage.getItem(persistKeyHint) ||
        (catalogVersionHint ? null : window.localStorage.getItem(PERSIST_KEY))
      if (raw) {
        const parsed = JSON.parse(raw) as { data: MusicLibraryData; expiresAt: number }
        if (parsed?.data && typeof parsed.expiresAt === 'number' && Date.now() < parsed.expiresAt) {
          normalizeMusicLibraryUrlsInPlace(parsed.data)
          musicLibraryCache = {
            data: parsed.data,
            expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS,
            version: catalogVersionHint || musicLibraryCache.version || 0,
          }
          void fetchCatalogPublishVersion()
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
      // Cold public path: lean bootstrap (folders+playlists). Admin hidden → full sync.
      const catalogPath = includeHidden
        ? `/api/music-library/sync?${params.toString()}`
        : `/api/music-library/bootstrap`
      const [versionFromApi, response] = await Promise.all([
        includeHidden ? Promise.resolve(0) : fetchCatalogPublishVersion(),
        fetch(catalogPath, {
          cache: 'no-store',
          headers: catalogVersionCache.value
            ? { 'If-None-Match': `"bootstrap-v${catalogVersionCache.value}"` }
            : undefined,
        }),
      ])
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
      if (response.status === 304 && musicLibraryCache.data) {
        return musicLibraryCache.data
      }
      if (response.ok) {
        const data = (await response.json()) as MusicLibraryData & {
          version?: number
          bootstrap?: boolean
          error?: string
          code?: string
        }
        // Guard against legacy empty "success" payloads if any route still emits them.
        if (
          data?.code === 'CATALOG_UNAVAILABLE' ||
          (typeof data?.error === 'string' && data.error.includes('unavailable'))
        ) {
          throw new Error(data.error || 'Music library catalog unavailable')
        }
        const catalogVersion =
          Number(data?.version) || versionFromApi || catalogVersionCache.value || 0
        if (catalogVersion) {
          catalogVersionCache = { value: catalogVersion, fetchedAt: Date.now() }
        }
        const persistKey = catalogVersion ? `${PERSIST_KEY}:${catalogVersion}` : PERSIST_KEY
        normalizeMusicLibraryUrlsInPlace(data)
        debugIngest({
          location: 'musicLibraryApi.ts:59',
          message: 'fetchMusicLibrary success',
          data: {
            hasFolders: !!data.folders,
            foldersCount: data.folders?.length || 0,
            bootstrap: Boolean(data.bootstrap),
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'D',
        })
        musicLibraryCache = {
          data,
          expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS,
          version: catalogVersion,
        }

        // Best-effort persistent cache
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(
              persistKey,
              JSON.stringify({ data, expiresAt: Date.now() + PERSIST_TTL_MS }),
            )
          } catch {
            // Ignore quota issues
          }
        }
        return data
      }
      // Auth / vault gate / server outage: never paper over with stale JSON
      // (old Supabase project URLs → broken playback).
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 503 ||
        response.status >= 500
      ) {
        const body = await response.json().catch(() => ({} as { error?: string; code?: string }))
        const msg =
          body?.error ||
          (response.status === 401
            ? 'Vault unlock or sign-in required'
            : `Music library API error (${response.status})`)
        debugIngest({
          location: 'musicLibraryApi.ts:62',
          message: 'API fetch failed hard (no JSON fallback)',
          data: { status: response.status, code: body?.code },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'D',
        })
        const hard = new Error(msg) as Error & { status?: number; code?: string; noJsonFallback?: boolean }
        hard.status = response.status
        hard.code = body?.code
        hard.noJsonFallback = true
        throw hard
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
      // Re-throw hard failures (auth / 5xx) — do not mask with dead fallback data.
      if (error?.noJsonFallback) throw error
      if (
        error?.message &&
        /catalog unavailable|CATALOG_UNAVAILABLE|VAULT_AUTH/i.test(
          `${error.message} ${error?.code || ''}`,
        )
      ) {
        throw error
      }
      // Network / parse errors may still use offline JSON (URLs are normalized).
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
  const data = await loadJsonLibrary()
  normalizeMusicLibraryUrlsInPlace(data)
  musicLibraryCache = {
    data,
    expiresAt: Date.now() + MUSIC_LIBRARY_CACHE_TTL_MS,
    version: catalogVersionCache.value || 0,
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
      if (!includeHidden) {
        const catalogVersion = await fetchCatalogPublishVersion()
        if (catalogVersion) params.set('v', String(catalogVersion))
      }
      const query = params.toString()
      const url = query ? `/api/music-library/folders?${query}` : '/api/music-library/folders'
      const response = await fetchLibrary(url)
      if (response.ok) {
        const data = await response.json()
        return data.folders || []
      }
    } catch (error) {
      console.error('Error fetching folders from API:', error)
    }
  }

  // Fallback: extract from JSON
  const data = await loadJsonLibrary()
  return data.folders || []
}

/**
 * Fetch tracks from API
 */
function audioFileStem(urlOrPath?: string | null): string {
  if (!urlOrPath) return ''
  let s = String(urlOrPath).split('?')[0]
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep */
  }
  s = s.replace(/\\/g, '/')
  const name = (s.split('/').pop() || '').toLowerCase()
  return name.replace(/\.(mp3|wav|aiff|flac|m4a)$/i, '').trim()
}

/** Strip heavy analysis blobs — DNA/waveform load only for the selected track via audio APIs. */
function stripHeavyAnalysisFields(track: Track): Track {
  const next = { ...track }
  delete (next as any).sonic_dna
  delete (next as any).waveform
  delete (next as any).waveform_data
  return next
}

async function extractTracksFromJson(folderId?: string): Promise<Track[]> {
  const data = await loadJsonLibrary()
  const allTracks: Track[] = []

  function extractTracks(items: FolderItem[]) {
    items.forEach((item) => {
      if (item.tracks) {
        if (!folderId || item.id === folderId) {
          allTracks.push(
            ...item.tracks.map((track) => {
              const next = stripHeavyAnalysisFields(track)
              return {
                ...next,
                folderId: next.folderId || item.id,
                album: next.album || item.name,
              }
            }),
          )
        }
      }
      if (item.children) {
        extractTracks(item.children)
      }
    })
  }

  extractTracks(data.folders || [])
  allTracks.forEach(normalizeTrackMedia)
  return allTracks
}

async function resolveTracksByIds(ids: string[], pool: Track[]): Promise<Track[]> {
  // First occurrence wins — callers must put API/live rows before stale JSON fallbacks.
  // (Previously `new Map(pool.map(...))` let the last duplicate id win, so catalog JSON
  // wiped genre/bpm/key/year from live playlist rows.)
  const byId = new Map<string, Track>()
  const byStem = new Map<string, Track>()
  const byAudio = new Map<string, Track>()
  for (const track of pool) {
    if (!byId.has(track.id)) byId.set(track.id, track)
    const stem = audioFileStem(track.file)
    if (stem && !byStem.has(stem)) byStem.set(stem, track)
    const audioId = track.audioFileId || (track as any).audio_file_id
    if (audioId && !byAudio.has(audioId)) byAudio.set(audioId, track)
  }

  const jsonById = new Map((await extractTracksFromJson()).map((t) => [t.id, t]))
  return ids
    .map((id) => {
      if (byId.has(id)) return byId.get(id) as Track
      const jsonTrack = jsonById.get(id)
      if (!jsonTrack) return undefined
      const stem = audioFileStem(jsonTrack.file)
      const shared =
        (stem && byStem.get(stem)) ||
        (jsonTrack.audioFileId ? byAudio.get(jsonTrack.audioFileId) : undefined)
      if (shared) {
        return {
          ...shared,
          id: jsonTrack.id,
          title: shared.title || jsonTrack.title,
          artist: shared.artist || jsonTrack.artist,
          artwork: shared.artwork || jsonTrack.artwork,
          folderId: jsonTrack.folderId || shared.folderId,
          album: shared.album || jsonTrack.album,
          file: shared.file || jsonTrack.file,
          bpm: shared.bpm ?? jsonTrack.bpm,
          key_signature: shared.key_signature || jsonTrack.key_signature,
          genre: shared.genre || jsonTrack.genre,
          subgenre: shared.subgenre || jsonTrack.subgenre,
          year: shared.year ?? jsonTrack.year,
          date: shared.date || jsonTrack.date,
          date_created: shared.date_created || jsonTrack.date_created,
          duration: shared.duration || jsonTrack.duration,
          metadata: shared.metadata || jsonTrack.metadata,
        }
      }
      return jsonTrack
    })
    .filter(Boolean) as Track[]
}

export async function fetchTracks(
  folderId?: string,
  options?: { includeArchived?: boolean; includeFullData?: boolean }
): Promise<Track[]> {
  // Public cold path must not hit unbounded GET /tracks — require folder scope.
  // Callers that need everything should use peekCachedMusicLibrary / sync or
  // fetchAllTracksSummaryForHydration (tracks-optimized pages).
  if (!folderId) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[fetchTracks] folderId required; use sync cache or fetchAllTracksSummaryForHydration')
    }
    return extractTracksFromJson(undefined)
  }

  if (USE_API) {
    try {
      const params = new URLSearchParams()
      params.set('folderId', folderId)
      if (options?.includeArchived) params.set('includeArchived', 'true')
      if (options?.includeFullData) params.set('includeFullData', 'true')
      const response = await fetchLibrary(`/api/music-library/tracks?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        const tracks = (data.tracks || []) as Track[]
        tracks.forEach(normalizeTrackMedia)
        if (tracks.length > 0) return tracks
      }
    } catch (error) {
      console.error('Error fetching tracks from API:', error)
    }
  }

  return extractTracksFromJson(folderId)
}

/**
 * Resolve playlist tracks in order. Reuses the same audio file when a playlist
 * row is missing but another library row already points at that file.
 */
export async function fetchTracksByIds(ids: string[]): Promise<Track[]> {
  if (!ids.length) return []

  if (USE_API) {
    try {
      const params = new URLSearchParams()
      params.set('ids', ids.join(','))
      const response = await fetchLibrary(`/api/music-library/tracks?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        const tracks = (data.tracks || []) as Track[]
        tracks.forEach(normalizeTrackMedia)
        const byId = new Map(tracks.map((t) => [t.id, t]))
        const orderedFromApi = ids.map((id) => byId.get(id)).filter(Boolean) as Track[]
        // Prefer live API rows; only consult stale catalog JSON for missing ids.
        if (orderedFromApi.length === ids.length) return orderedFromApi
        return resolveTracksByIds(ids, [...tracks, ...(await extractTracksFromJson())])
      }
    } catch (error) {
      console.error('Error fetching tracks by id from API:', error)
    }
  }

  return resolveTracksByIds(ids, await extractTracksFromJson())
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
      const response = await fetchLibrary(url)
      if (response.ok) {
        const data = await response.json()
        const tracks = (data.tracks || []) as Track[]
        tracks.forEach(normalizeTrackMedia)
        // Prefer live API rows whenever present. Empty 200 with a folderId can be
        // a real empty folder — return it so we do not paint stale JSON stubs
        // (Unknown key / None genre) over rich cloud catalog fields.
        if (tracks.length > 0 || folderId) {
          return { tracks, total: data.total ?? tracks.length, hasMore: Boolean(data.hasMore) }
        }
      }
    } catch (error) {
      console.error('Error fetching tracks summary from API:', error)
    }
  }

  // Offline / unconfigured API only — never preferred over live DB when USE_API.
  if (USE_API && folderId) {
    return { tracks: [], total: 0, hasMore: false }
  }

  // Fallback: extract from JSON (no pagination)
  const data = await loadJsonLibrary()
  const allTracks: Track[] = []

  function extractTracks(items: FolderItem[]) {
    items.forEach(item => {
      if (item.tracks) {
        if (!folderId || item.id === folderId) {
          allTracks.push(
            ...item.tracks.map((track) => {
              const next = stripHeavyAnalysisFields(track)
              return {
                ...next,
                folderId: next.folderId || item.id,
                album: next.album || item.name,
              }
            }),
          )
        }
      }
      if (item.children) {
        extractTracks(item.children)
      }
    })
  }

  extractTracks(data.folders || [])
  allTracks.forEach(normalizeTrackMedia)
  return { tracks: allTracks }
}

/** Catalog JSON fallback when live folder ids don't match slug ids. */
export async function extractTracksFromJsonByAlbumName(albumName?: string): Promise<Track[]> {
  const needle = albumName?.trim().toLowerCase()
  if (!needle) return []
  const data = await loadJsonLibrary()
  const allTracks: Track[] = []

  function walk(items: FolderItem[]) {
    for (const item of items) {
      if (item.tracks?.length && String(item.name || '').trim().toLowerCase() === needle) {
        allTracks.push(
          ...item.tracks.map((track) => {
            const next = stripHeavyAnalysisFields(track)
            return {
              ...next,
              folderId: next.folderId || item.id,
              album: next.album || item.name,
            }
          }),
        )
      }
      if (item.children?.length) walk(item.children)
    }
  }

  walk(data.folders || [])
  allTracks.forEach(normalizeTrackMedia)
  return allTracks
}

const HYDRATION_SUMMARY_PAGE_SIZE = 200
const HYDRATION_CONCURRENCY = 4

type CatalogHydrationOptions = {
  includeArchived?: boolean
  signal?: AbortSignal
  /** When true, wait before each page batch (e.g. while audio is buffering/playing). */
  shouldPause?: () => boolean
  onBatch?: (loaded: number, total: number | undefined) => void
}

let hydrationInFlight: Promise<Track[]> | null = null
let hydrationInFlightKey = ''

async function yieldWhilePaused(
  shouldPause: (() => boolean) | undefined,
  signal?: AbortSignal,
): Promise<void> {
  if (!shouldPause) return
  while (shouldPause() && !signal?.aborted) {
    await new Promise((r) => setTimeout(r, 350))
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/**
 * Load optimized track summaries for the whole library (paginated on the API)
 * and merge them into folder-tree hydration on the client.
 * Pages after the first run in parallel (bounded concurrency). Dedupes in-flight
 * requests so MusicLibraryClient + SergBrowser don't double-fetch.
 */
export async function fetchAllTracksSummaryForHydration(
  options?: CatalogHydrationOptions,
): Promise<Track[]> {
  const includeArchived = options?.includeArchived ?? false
  const key = includeArchived ? 'arch' : 'live'
  // Reuse in-flight only when caller didn't pass a custom pause/abort controller
  if (
    hydrationInFlight &&
    hydrationInFlightKey === key &&
    !options?.signal &&
    !options?.shouldPause
  ) {
    return hydrationInFlight
  }

  const run = (async () => {
    const all: Track[] = []
    await yieldWhilePaused(options?.shouldPause, options?.signal)

    const first = await fetchTracksSummary(undefined, {
      includeArchived,
      limit: HYDRATION_SUMMARY_PAGE_SIZE,
      offset: 0,
    })
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const firstBatch = first.tracks || []
    all.push(...firstBatch)
    options?.onBatch?.(all.length, first.total)

    const total =
      typeof first.total === 'number' && first.total > 0 ? first.total : undefined
    if (!firstBatch.length || first.hasMore === false) {
      return all
    }

    const pageSize = HYDRATION_SUMMARY_PAGE_SIZE
    const offsets: number[] = []
    if (total != null) {
      for (let offset = pageSize; offset < total; offset += pageSize) {
        offsets.push(offset)
      }
    } else {
      // Unknown total — keep sequential after first page
      let offset = firstBatch.length
      while (true) {
        await yieldWhilePaused(options?.shouldPause, options?.signal)
        const result = await fetchTracksSummary(undefined, {
          includeArchived,
          limit: pageSize,
          offset,
        })
        const batch = result.tracks || []
        all.push(...batch)
        options?.onBatch?.(all.length, undefined)
        if (batch.length === 0 || !result.hasMore) break
        offset += batch.length
      }
      return all
    }

    for (let i = 0; i < offsets.length; i += HYDRATION_CONCURRENCY) {
      await yieldWhilePaused(options?.shouldPause, options?.signal)
      const slice = offsets.slice(i, i + HYDRATION_CONCURRENCY)
      const pages = await Promise.all(
        slice.map((offset) =>
          fetchTracksSummary(undefined, {
            includeArchived,
            limit: pageSize,
            offset,
          }),
        ),
      )
      if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      for (const page of pages) {
        all.push(...(page.tracks || []))
      }
      options?.onBatch?.(all.length, total)
    }

    return all
  })()

  if (!options?.signal && !options?.shouldPause) {
    hydrationInFlight = run
    hydrationInFlightKey = key
    try {
      return await run
    } finally {
      if (hydrationInFlight === run) {
        hydrationInFlight = null
        hydrationInFlightKey = ''
      }
    }
  }

  return run
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
  updates: Partial<Omit<FolderItem, 'artwork'>> & { artwork?: string | null }
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
  /** Private = hidden from public music library (folder.hidden); still visible in admin */
  hidden?: boolean
}

/**
 * Fetch playlists from API
 */
export async function fetchPlaylists(options?: {
  includeArchived?: boolean
  includeHidden?: boolean
}): Promise<Playlist[]> {
  if (USE_API) {
    try {
      const params = new URLSearchParams()
      if (options?.includeArchived) params.set('includeArchived', 'true')
      if (options?.includeHidden) params.set('includeHidden', 'true')
      const query = params.toString()
      const url = query ? `/api/music-library/playlists?${query}` : '/api/music-library/playlists'
      const response = await fetchLibrary(url)
      if (response.ok) {
        const data = await response.json()
        return data.playlists || []
      }
    } catch (error) {
      console.error('Error fetching playlists from API:', error)
    }
  }

  // Fallback: extract from JSON
  const data = await loadJsonLibrary()
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
 * Drop OS audio into a curated playlist: match vault catalog first; auto-ingest
 * unmatched files into public/audio + DB, then append playlist.track_ids.
 *
 * Pass `convertToMp3: true` to transcode oversized lossless files (wav/flac/…)
 * to 320kbps MP3 on the server before ingest.
 */
export class PlaylistDropTooLargeError extends Error {
  code = 'FILE_TOO_LARGE' as const
  maxBytes: number
  files: { file: string; sizeBytes: number; maxBytes: number; convertible: boolean }[]
  convertible: boolean

  constructor(payload: {
    message: string
    maxBytes: number
    files: { file: string; sizeBytes: number; maxBytes: number; convertible: boolean }[]
    convertible: boolean
  }) {
    super(payload.message)
    this.name = 'PlaylistDropTooLargeError'
    this.maxBytes = payload.maxBytes
    this.files = payload.files
    this.convertible = payload.convertible
  }
}

export type LinkDroppedFilesResult = {
  added: string[]
  created: { file: string; trackId: string; filePath: string; convertedFrom?: string }[]
  converted?: { from: string; to: string; trackId: string }[]
  unmatched: { file: string; reason: string }[]
  ingestFailed: { file: string; error: string }[]
  alreadyInPlaylist: string[]
  trackIds: string[]
  playlistName?: string
  publishVersion?: number | null
  databaseUpdated?: boolean
}

function parseLinkFilesPayload(data: any): LinkDroppedFilesResult {
  return {
    added: data.added || [],
    created: data.created || [],
    converted: data.converted || [],
    unmatched: data.unmatched || [],
    ingestFailed: data.ingestFailed || [],
    alreadyInPlaylist: data.alreadyInPlaylist || [],
    trackIds: data.trackIds || [],
    playlistName: data.playlistName,
    publishVersion: data.publishVersion ?? null,
    databaseUpdated: !!data.databaseUpdated,
  }
}

function throwIfLinkFilesFailed(ok: boolean, data: any) {
  if (ok) return
  if (data?.code === 'FILE_TOO_LARGE') {
    throw new PlaylistDropTooLargeError({
      message: data.error || 'File too large',
      maxBytes: Number(data.maxBytes) || 0,
      files: Array.isArray(data.files) ? data.files : [],
      convertible: !!data.convertible,
    })
  }
  throw new Error(data.error || 'Failed to link dropped files')
}

function postLinkFilesForm(
  form: FormData,
  onUploadProgress?: (ratio: number) => void,
): Promise<{ ok: boolean; data: any }> {
  if (!onUploadProgress || typeof XMLHttpRequest === 'undefined') {
    return fetch('/api/music-library/playlists/link-files', {
      method: 'POST',
      body: form,
      credentials: 'include',
    }).then(async (response) => ({
      ok: response.ok,
      data: await response.json().catch(() => ({})),
    }))
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/music-library/playlists/link-files')
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      let data = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {
        /* ignore */
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data })
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.send(form)
  })
}

export async function linkDroppedFilesToPlaylist(
  playlistId: string,
  files: File[] | { name: string; path?: string }[],
  options?: { convertToMp3?: boolean; onUploadProgress?: (ratio: number) => void },
): Promise<LinkDroppedFilesResult> {
  const asFiles = (files as unknown[]).filter(
    (f): f is File => typeof File !== 'undefined' && f instanceof File,
  )

  if (asFiles.length) {
    const form = new FormData()
    form.append('playlistId', playlistId)
    if (options?.convertToMp3) form.append('convertToMp3', '1')
    for (const file of asFiles) {
      form.append('files', file, file.name)
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      if (rel) form.append('paths', rel)
      else form.append('paths', file.name)
    }
    const { ok, data } = await postLinkFilesForm(form, options?.onUploadProgress)
    throwIfLinkFilesFailed(ok, data)
    return parseLinkFilesPayload(data)
  }

  const nameRefs = files.map((f) =>
    f instanceof File
      ? {
          name: f.name,
          path: (f as File & { webkitRelativePath?: string }).webkitRelativePath,
        }
      : { name: f.name, path: f.path },
  )
  const response = await fetch('/api/music-library/playlists/link-files', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId, files: nameRefs }),
  })
  const data = await response.json().catch(() => ({}))
  throwIfLinkFilesFailed(response.ok, data)
  return parseLinkFilesPayload(data)
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
export async function deletePlaylist(id: string, options?: { hard?: boolean }): Promise<boolean> {
  if (!USE_API) {
    console.warn('API not enabled, cannot delete playlist')
    return false
  }

  try {
    const params = new URLSearchParams({ id })
    if (options?.hard) params.set('hard', '1')
    const response = await fetch(`/api/music-library/playlists?${params}`, {
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
  const catalogVersion = await fetchCatalogPublishVersion()
  if (catalogVersion) params.set('v', String(catalogVersion))

  const res = await fetch(`/api/music-library/browse?${params}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch browse data')
  return res.json()
}

const BROWSE_SONGS_PAGE_SIZE = 200

/** Fetch every song for browse (API caps at 200 per request). */
export async function fetchBrowseSongsAll(
  options: Omit<BrowseOptions, 'view' | 'limit' | 'offset'>
): Promise<{ tracks: Track[]; total: number }> {
  const all: Track[] = []
  let offset = 0
  let total = 0
  for (;;) {
    const data = await fetchBrowse({
      ...options,
      view: 'songs',
      limit: BROWSE_SONGS_PAGE_SIZE,
      offset,
    })
    const batch: Track[] = data.tracks || []
    total = typeof data.total === 'number' ? data.total : total
    all.push(...batch)
    if (batch.length < BROWSE_SONGS_PAGE_SIZE || (total > 0 && all.length >= total)) break
    offset += batch.length
  }
  return { tracks: all, total: total || all.length }
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
