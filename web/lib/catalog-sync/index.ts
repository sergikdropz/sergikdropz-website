export type {
  CatalogEntity,
  CatalogSyncEvent,
  CatalogSyncListener,
  CatalogSyncPatch,
} from './types'
export { CATALOG_SYNC_CHANNEL, CATALOG_VERSION_EVENT } from './types'
export {
  stripArtworkCacheBust,
  withArtworkCacheBust,
  normalizeArtworkPatch,
  normalizeCollectionId,
  collectionIdFromArtwork,
  catalogItemMatchesCoverEvent,
  playerTrackMatchesCoverEvent,
  stampAllTrackArtwork,
  isUploadedFolderArtwork,
  isImageFile,
  artworkUploadRejectReason,
} from './artwork'
export { folderIdFromPlaylistId, playlistIdForFolder, isCollectionPlaylist } from './ids'
export { subscribeCatalogSync, emitCatalogSync, getLastCatalogSyncEvent } from './bus'
export { propagateFolderArtworkToTracks } from './propagate-folder-artwork'
export type { FolderArtworkPropagateResult } from './propagate-folder-artwork'
export { persistSystemicCover, resolveTrackCollection } from './persist-systemic-cover'
export type { SystemicCoverResult } from './persist-systemic-cover'
export { stampLibraryCover, stampPlaylistCovers } from './stamp-library-cover'
export {
  trackTitleKey,
  buildEpArtworkIndex,
  matchEpArtworkForTrack,
  applyEpArtworkToTracks,
  applyEpArtworkToFolderTracks,
} from './match-ep-artwork'
export { collectLibraryCoverPool, crateMosaicCovers, assignCrateMosaicCovers, CRATE_MOSAIC_SIZE } from './crate-cover-mosaic'
export type { EpArtworkHit, EpArtworkIndex } from './match-ep-artwork'
export { backfillFolderArtworkFromTracks } from './backfill-folder-artwork-from-tracks'
export type { FolderArtworkBackfillResult } from './backfill-folder-artwork-from-tracks'
export {
  EMPTY_LIVE_MOSAIC_COVERS,
  upsertLiveMosaicCover,
  removeLiveMosaicCover,
  getLiveMosaicCovers,
  subscribeLiveMosaicCovers,
  mergeMosaicTiles,
  hydrateLiveMosaicCovers,
} from './live-mosaic-covers'
