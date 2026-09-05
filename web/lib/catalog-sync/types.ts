/** Shared catalog mutation events — single spine for UI + cache projectors. */

export type CatalogEntity = 'folder' | 'playlist' | 'track'

export type CatalogSyncPatch = {
  name?: string
  artwork?: string | null
  type?: string
  year?: number | null
  albumArtist?: string
  hidden?: boolean
  trackIds?: string[]
  description?: string
  is_archived?: boolean
}

export type CatalogSyncEvent = {
  id: string
  at: number
  entity: CatalogEntity
  entityId: string
  /** Always set when the mutation touches a collection folder. */
  folderId?: string
  /** Linked `playlist-{folderId}` when applicable. */
  playlistId?: string
  patch: CatalogSyncPatch
  source: 'local' | 'remote'
  publishVersion?: number | null
}

export type CatalogSyncListener = (event: CatalogSyncEvent) => void

export const CATALOG_SYNC_CHANNEL = 'sergik:catalog-sync'
export const CATALOG_VERSION_EVENT = 'sergik:catalog-version'
