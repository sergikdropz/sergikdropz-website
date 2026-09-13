'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/api/query-keys'
import {
  fetchBrowse,
  fetchPlaylists,
  fetchSmartPlaylists,
  type BrowseOptions,
  type Playlist,
  type SmartPlaylist,
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

export function useMusicPlaylists({
  enabled = true,
  publishVersion,
  includeHidden = false,
  includeArchived = false,
}: LeafOpts & { includeHidden?: boolean; includeArchived?: boolean }) {
  return useQuery({
    queryKey: queryKeys.musicLibrary.playlists(publishVersion, includeHidden, includeArchived),
    queryFn: (): Promise<Playlist[]> =>
      fetchPlaylists({ includeHidden, includeArchived }),
    enabled,
    staleTime: MUSIC_LIBRARY_LEAF_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * Browse leaf — optional for screens that are not SergBrowser's full loadData yet.
 * Does not seed musicLibraryApi localStorage.
 */
export function useMusicBrowse(
  options: BrowseOptions & LeafOpts,
) {
  const { enabled = true, publishVersion, ...browse } = options
  return useQuery({
    queryKey: queryKeys.musicLibrary.browse(publishVersion, browse.view, {
      sort: browse.sort,
      dir: browse.dir,
      genre: browse.genre,
      artist: browse.artist,
      search: browse.search,
      limit: browse.limit,
      offset: browse.offset,
    }),
    queryFn: () => fetchBrowse(browse),
    enabled,
    staleTime: MUSIC_LIBRARY_LEAF_STALE_MS,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
