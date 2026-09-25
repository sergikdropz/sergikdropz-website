'use client'

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/api/query-keys'
import {
  fetchBrowse,
  fetchBrowseSongsAll,
  fetchPlaylists,
  fetchSmartPlaylists,
  type BrowseOptions,
  type Playlist,
  type SmartPlaylist,
  type Track,
} from '@/utils/musicLibraryApi'

/** Short TTL — leaf lists; catalog version in the key is the hard correctness boundary. */
export const MUSIC_LIBRARY_LEAF_STALE_MS = 60_000

/**
 * Invalidate all musicLibrary RQ leaf keys.
 * Safe after sync/publish — does not touch musicLibraryApi memory/localStorage
 * (call invalidateMusicLibraryCache for that; the event bridge covers both).
 */
export async function invalidateMusicLibraryQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.musicLibrary.root() })
}

type LeafOpts = {
  enabled?: boolean
  /** Catalog publish version from CatalogSync — 0 is allowed until first read. */
  publishVersion: number
}

type BrowseLeafOpts = Omit<BrowseOptions, 'view'> & {
  sort?: string
  dir?: 'asc' | 'desc'
  genre?: string
  artist?: string
  search?: string
}

function browseKeyOpts(browse: BrowseOptions) {
  return {
    sort: browse.sort,
    dir: browse.dir,
    genre: browse.genre,
    artist: browse.artist,
    search: browse.search,
    limit: browse.limit,
    offset: browse.offset,
  }
}

/** Shared options for useQuery / fetchQuery — one cache identity for browse leaves. */
export function musicBrowseQueryOptions(publishVersion: number, browse: BrowseOptions) {
  return {
    queryKey: queryKeys.musicLibrary.browse(publishVersion, browse.view, browseKeyOpts(browse)),
    queryFn: () => fetchBrowse(browse),
    staleTime: MUSIC_LIBRARY_LEAF_STALE_MS,
    gcTime: 10 * 60_000,
  }
}

export function musicBrowseSongsAllQueryOptions(
  publishVersion: number,
  opts: BrowseLeafOpts,
) {
  return {
    queryKey: queryKeys.musicLibrary.browseSongsAll(publishVersion, {
      sort: opts.sort,
      dir: opts.dir,
      genre: opts.genre,
      artist: opts.artist,
      search: opts.search,
    }),
    queryFn: (): Promise<{ tracks: Track[]; total: number }> => fetchBrowseSongsAll(opts),
    staleTime: MUSIC_LIBRARY_LEAF_STALE_MS,
    gcTime: 10 * 60_000,
  }
}

/** Imperative browse fetch for loadData — peeks RQ first, does not seed localStorage. */
export function fetchMusicBrowse(
  queryClient: QueryClient,
  publishVersion: number,
  browse: BrowseOptions,
) {
  return queryClient.fetchQuery(musicBrowseQueryOptions(publishVersion, browse))
}

export function fetchMusicBrowseSongsAll(
  queryClient: QueryClient,
  publishVersion: number,
  opts: BrowseLeafOpts,
) {
  return queryClient.fetchQuery(musicBrowseSongsAllQueryOptions(publishVersion, opts))
}

export function useMusicSmartPlaylists({ enabled = true, publishVersion }: LeafOpts) {
  return useQuery({
    queryKey: queryKeys.musicLibrary.smartPlaylists(publishVersion),
    queryFn: (): Promise<SmartPlaylist[]> => fetchSmartPlaylists(),
    enabled,
    staleTime: MUSIC_LIBRARY_LEAF_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/** Seed RQ so SergBrowser does not refetch playlists the parent already loaded. */
export function seedMusicPlaylistsQuery(
  queryClient: QueryClient,
  playlists: Playlist[],
  publishVersion: number,
  opts?: { includeHidden?: boolean; includeArchived?: boolean },
) {
  const includeHidden = opts?.includeHidden ?? false
  const includeArchived = opts?.includeArchived ?? false
  queryClient.setQueryData(
    queryKeys.musicLibrary.playlists(publishVersion, includeHidden, includeArchived),
    playlists,
  )
  // CatalogSync often starts at 0 then flips — seed both keys to avoid a cold refetch.
  if (publishVersion !== 0) {
    queryClient.setQueryData(
      queryKeys.musicLibrary.playlists(0, includeHidden, includeArchived),
      playlists,
    )
  }
}

export function useMusicPlaylists({
  enabled = true,
  publishVersion,
  includeHidden = false,
  includeArchived = false,
  /** Parent already loaded — use as initialData and skip an immediate network hit. */
  initialData,
}: LeafOpts & {
  includeHidden?: boolean
  includeArchived?: boolean
  initialData?: Playlist[]
}) {
  return useQuery({
    queryKey: queryKeys.musicLibrary.playlists(publishVersion, includeHidden, includeArchived),
    queryFn: (): Promise<Playlist[]> =>
      fetchPlaylists({ includeHidden, includeArchived }),
    enabled,
    initialData,
    staleTime: MUSIC_LIBRARY_LEAF_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * Browse leaf — optional declarative hook.
 * Does not seed musicLibraryApi localStorage.
 */
export function useMusicBrowse(options: BrowseOptions & LeafOpts) {
  const { enabled = true, publishVersion, ...browse } = options
  return useQuery({
    ...musicBrowseQueryOptions(publishVersion, browse),
    enabled,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
