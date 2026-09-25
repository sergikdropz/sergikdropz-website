/**
 * EP / crate release badges for admin Songs (folder assignment + metadata + catalog membership).
 */

export type TrackReleaseBadgeFlags = { ep: boolean; crate: boolean }

export type ReleaseCatalogTile = {
  id?: string | null
  name?: string | null
  type?: string | null
}

export function releaseFolderTypeMap(
  albums: ReleaseCatalogTile[],
  folderMeta?: Record<string, { type?: string | null }>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const album of albums) {
    const id = String(album?.id || '').trim()
    const type = String(album?.type || '').trim()
    if (id && type) out[id] = type
  }
  if (folderMeta) {
    for (const [id, meta] of Object.entries(folderMeta)) {
      const type = String(meta?.type || '').trim()
      if (type === 'ep' || type === 'album') out[id] = type
    }
  }
  return out
}

function normalizeAlbumKey(name: string): string {
  return name.trim().toLowerCase()
}

/** @deprecated use trackReleaseBadgeFlags */
export type EpCrateAssignmentStatus = 'assigned' | 'unassigned'

/** @deprecated use trackReleaseBadgeFlags */
export function trackEpCrateAssignmentStatus(
  track: { folderId?: string | null; folder_id?: string | null },
  opts: {
    releaseFolderTypes: Record<string, string>
    playlistCompanionFolderIds?: ReadonlySet<string>
  },
): EpCrateAssignmentStatus {
  const flags = trackReleaseBadgeFlags(track, opts)
  return flags.ep || flags.crate ? 'assigned' : 'unassigned'
}

export function trackReleaseBadgeFlags(
  track: {
    id?: string
    folderId?: string | null
    folder_id?: string | null
    album?: string | null
    albumType?: string | null
    album_type?: string | null
  },
  opts: {
    releaseFolderTypes: Record<string, string>
    releaseCatalogTiles?: ReleaseCatalogTile[]
    playlistCompanionFolderIds?: ReadonlySet<string>
    membershipByTrackId?: ReadonlyMap<string, TrackReleaseBadgeFlags>
  },
): TrackReleaseBadgeFlags {
  let ep = false
  let crate = false

  const folderId = String(track.folderId || track.folder_id || '').trim()
  if (folderId && !opts.playlistCompanionFolderIds?.has(folderId)) {
    const folderType = String(opts.releaseFolderTypes[folderId] || '').toLowerCase()
    if (folderType === 'ep') ep = true
    if (folderType === 'album') crate = true
  }

  const albumType = String(track.albumType || track.album_type || '').toLowerCase()
  const albumKey = normalizeAlbumKey(String(track.album || ''))

  if (albumType === 'ep' && albumKey) ep = true
  // Folder type `album` = vibe crate in this catalog (not a commercial LP row).
  if (albumType === 'album' && albumKey) crate = true

  if (albumKey && opts.releaseCatalogTiles?.length) {
    for (const tile of opts.releaseCatalogTiles) {
      const name = normalizeAlbumKey(String(tile?.name || ''))
      if (!name || name !== albumKey) continue
      const type = String(tile?.type || '').toLowerCase()
      if (type === 'ep') ep = true
      if (type === 'album') crate = true
    }
  }

  if (track.id && opts.membershipByTrackId?.has(track.id)) {
    const m = opts.membershipByTrackId.get(track.id)!
    ep = ep || m.ep
    crate = crate || m.crate
  }

  return { ep, crate }
}

/** Union of track IDs listed under each EP/crate folder (and optional playlist track_ids). */
export function buildTrackFolderMembershipMap(
  groupedByFolder: Record<string, Array<{ id?: string }>>,
  releaseFolderTypes: Record<string, string>,
  playlistFolders: Array<{ folderId: string; trackIds: string[] }> = [],
): Map<string, TrackReleaseBadgeFlags> {
  const map = new Map<string, TrackReleaseBadgeFlags>()

  const stamp = (folderId: string, trackId: string) => {
    const type = String(releaseFolderTypes[folderId] || '').toLowerCase()
    if (type !== 'ep' && type !== 'album') return
    const cur = map.get(trackId) || { ep: false, crate: false }
    if (type === 'ep') cur.ep = true
    if (type === 'album') cur.crate = true
    map.set(trackId, cur)
  }

  for (const [folderId, list] of Object.entries(groupedByFolder)) {
    for (const t of list) {
      if (t?.id) stamp(folderId, t.id)
    }
  }

  for (const row of playlistFolders) {
    for (const trackId of row.trackIds) {
      if (trackId) stamp(row.folderId, trackId)
    }
  }

  return map
}

/** EP release titles for a track (folder assignment + metadata + folder membership). */
export function trackEpReleaseNames(
  track: {
    id?: string
    folderId?: string | null
    folder_id?: string | null
    album?: string | null
    albumType?: string | null
    album_type?: string | null
  },
  opts: {
    releaseFolderTypes: Record<string, string>
    releaseCatalogTiles?: ReleaseCatalogTile[]
    groupedByFolder?: Record<string, Array<{ id?: string }>>
    playlistCompanionFolderIds?: ReadonlySet<string>
  },
): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const push = (name: string) => {
    const trimmed = String(name || '').trim()
    const key = trimmed.toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    names.push(trimmed)
  }

  const tileName = (folderId: string) => {
    const tile = opts.releaseCatalogTiles?.find((t) => String(t?.id || '') === folderId)
    return String(tile?.name || '').trim()
  }

  const folderId = String(track.folderId || track.folder_id || '').trim()
  if (folderId && !opts.playlistCompanionFolderIds?.has(folderId)) {
    if (String(opts.releaseFolderTypes[folderId] || '').toLowerCase() === 'ep') {
      push(tileName(folderId))
    }
  }

  if (track.id && opts.groupedByFolder) {
    for (const [fid, list] of Object.entries(opts.groupedByFolder)) {
      if (String(opts.releaseFolderTypes[fid] || '').toLowerCase() !== 'ep') continue
      if (!list.some((row) => row?.id === track.id)) continue
      push(tileName(fid))
    }
  }

  const albumType = String(track.albumType || track.album_type || '').toLowerCase()
  if (albumType === 'ep' && track.album) push(String(track.album))

  if (albumType !== 'ep' && track.album && opts.releaseCatalogTiles?.length) {
    const albumKey = normalizeAlbumKey(String(track.album))
    for (const tile of opts.releaseCatalogTiles) {
      if (String(tile?.type || '').toLowerCase() !== 'ep') continue
      if (normalizeAlbumKey(String(tile?.name || '')) === albumKey) {
        push(String(tile.name))
      }
    }
  }

  return names
}

export function trackEpReleaseLabel(
  track: Parameters<typeof trackEpReleaseNames>[0],
  opts: Parameters<typeof trackEpReleaseNames>[1],
): string {
  return trackEpReleaseNames(track, opts).join(', ')
}
