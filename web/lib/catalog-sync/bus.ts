import { folderIdFromPlaylistId, playlistIdForFolder } from './ids'
import { normalizeArtworkPatch } from './artwork'
import type { CatalogSyncEvent, CatalogSyncListener, CatalogSyncPatch } from './types'
import { CATALOG_SYNC_CHANNEL } from './types'

const listeners = new Set<CatalogSyncListener>()
let lastEvent: CatalogSyncEvent | null = null
let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    channel = new BroadcastChannel(CATALOG_SYNC_CHANNEL)
    channel.onmessage = (msg) => {
      const event = msg.data as CatalogSyncEvent | undefined
      if (!event?.entity || !event.entityId) return
      dispatchLocal({ ...event, source: 'remote' }, { broadcast: false })
    }
  }
  return channel
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizePatch(patch: CatalogSyncPatch): CatalogSyncPatch {
  const next: CatalogSyncPatch = { ...patch }
  if (Object.prototype.hasOwnProperty.call(patch, 'artwork')) {
    next.artwork = normalizeArtworkPatch(patch.artwork ?? null) ?? null
  }
  return next
}

function enrichLinks(
  partial: Omit<CatalogSyncEvent, 'id' | 'at' | 'source'> & { source?: CatalogSyncEvent['source'] },
): Pick<CatalogSyncEvent, 'folderId' | 'playlistId'> {
  if (partial.entity === 'folder') {
    return {
      folderId: partial.folderId || partial.entityId,
      playlistId: partial.playlistId || playlistIdForFolder(partial.entityId),
    }
  }
  if (partial.entity === 'playlist') {
    const folderId = partial.folderId || folderIdFromPlaylistId(partial.entityId)
    return {
      folderId,
      playlistId: partial.playlistId || partial.entityId,
    }
  }
  return {
    folderId: partial.folderId,
    playlistId: partial.playlistId,
  }
}

function dispatchLocal(event: CatalogSyncEvent, opts: { broadcast: boolean }) {
  lastEvent = event
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (err) {
      console.error('[catalog-sync] listener failed', err)
    }
  }
  if (opts.broadcast) {
    try {
      getChannel()?.postMessage(event)
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to catalog mutations (same tab + cross-tab via BroadcastChannel). */
export function subscribeCatalogSync(listener: CatalogSyncListener): () => void {
  listeners.add(listener)
  getChannel()
  return () => {
    listeners.delete(listener)
  }
}

export function getLastCatalogSyncEvent(): CatalogSyncEvent | null {
  return lastEvent
}

/**
 * Emit a catalog mutation. Normalizes artwork, fills folder↔playlist links,
 * notifies local listeners and other tabs.
 */
export function emitCatalogSync(
  partial: Omit<CatalogSyncEvent, 'id' | 'at' | 'source' | 'patch'> & {
    patch: CatalogSyncPatch
    source?: CatalogSyncEvent['source']
  },
): CatalogSyncEvent {
  const links = enrichLinks(partial)
  const event: CatalogSyncEvent = {
    id: newId(),
    at: Date.now(),
    entity: partial.entity,
    entityId: partial.entityId,
    folderId: links.folderId,
    playlistId: links.playlistId,
    patch: normalizePatch(partial.patch),
    source: partial.source || 'local',
    publishVersion: partial.publishVersion ?? null,
  }
  dispatchLocal(event, { broadcast: event.source === 'local' })
  return event
}
