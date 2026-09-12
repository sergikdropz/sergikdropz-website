'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  collectLibraryCoverPool,
  crateMosaicCovers,
  EMPTY_LIVE_MOSAIC_COVERS,
  getLiveMosaicCovers,
  hydrateLiveMosaicCovers,
  subscribeLiveMosaicCovers,
  trackShouldUseCrateMosaic,
} from '@/lib/catalog-sync'

type ArtTrack = {
  id?: string
  artwork?: string | null
  album?: string | null
  albumType?: string | null
  folder?: string | null
  folderId?: string | null
  folder_id?: string | null
}

function mosaicSeedForTrack(track: ArtTrack): string {
  return String(
    track.folderId ||
      track.folder_id ||
      track.folder ||
      track.album ||
      track.id ||
      'track',
  )
}

/** Library cover pool + live mosaic tiles for crate-style player thumbs. */
export function usePlayerCoverPool(queue: ArtTrack[] = []): string[] {
  const liveMosaicCovers = useSyncExternalStore(
    subscribeLiveMosaicCovers,
    getLiveMosaicCovers,
    () => EMPTY_LIVE_MOSAIC_COVERS,
  )

  useEffect(() => {
    void hydrateLiveMosaicCovers()
  }, [])

  return useMemo(() => {
    const urls: Array<string | null | undefined> = []
    for (const track of queue) urls.push(track.artwork)
    for (const tile of liveMosaicCovers) urls.push(tile.src)
    return collectLibraryCoverPool(urls)
  }, [queue, liveMosaicCovers])
}

export function mosaicCoversForTrack(
  track: ArtTrack | null | undefined,
  pool: string[],
): string[] {
  if (!track || !trackShouldUseCrateMosaic(track) || !pool.length) return []
  return crateMosaicCovers(pool, mosaicSeedForTrack(track))
}

export function useTrackMosaicCovers(
  track: ArtTrack | null | undefined,
  queue: ArtTrack[] = [],
): string[] {
  const pool = usePlayerCoverPool(queue)
  return useMemo(() => mosaicCoversForTrack(track, pool), [track, pool])
}
