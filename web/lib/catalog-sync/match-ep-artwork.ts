import { isUploadedFolderArtwork, stripArtworkCacheBust } from './artwork'
import { releaseArtworkKey } from '@/lib/marketing/release-artwork'

const VERSION_TAIL =
  /(?:\s*[\(\[](?:bass\s+)?(?:vip|instrumental|radio\s*edit|extended)(?:\s*\d+)?[\)\]]|\s+v(?:ip)?\.?\d+|\s+\d+)$/i

export type EpArtworkHit = {
  artwork: string
  epName: string
  epId: string
}

export type EpArtworkIndex = {
  byTitle: Map<string, EpArtworkHit>
  byAudioId: Map<string, EpArtworkHit>
  byRelease: Map<string, EpArtworkHit>
}

export function trackTitleKey(title: string): string {
  let text = String(title || '').trim()
  text = text.replace(/^se?ergik\.?\s*-+\s*/i, '')
  let prev = ''
  while (text !== prev) {
    prev = text
    text = text.replace(VERSION_TAIL, '').trim()
  }
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function trackTitleKeys(title: string): string[] {
  const keys = new Set<string>()
  const primary = trackTitleKey(title)
  if (primary) keys.add(primary)
  const withoutArtist = String(title || '').replace(/^[^:]{1,48}\s+-\s+/, '')
  if (withoutArtist !== title) {
    const next = trackTitleKey(withoutArtist)
    if (next) keys.add(next)
  }
  return [...keys]
}

function preferHit(prev: EpArtworkHit | undefined, next: EpArtworkHit): EpArtworkHit {
  if (!prev) return next
  const prevLive = isUploadedFolderArtwork(prev.artwork)
  const nextLive = isUploadedFolderArtwork(next.artwork)
  if (nextLive && !prevLive) return next
  return prev
}

export function buildEpArtworkIndex(
  eps: Array<{
    id: string
    name: string
    artwork?: string | null
    tracks?: Array<{ title?: string; audioFileId?: string; artwork?: string | null }>
  }>,
): EpArtworkIndex {
  const byTitle = new Map<string, EpArtworkHit>()
  const byAudioId = new Map<string, EpArtworkHit>()
  const byRelease = new Map<string, EpArtworkHit>()

  for (const ep of eps) {
    const folderArt = ep.artwork ? stripArtworkCacheBust(ep.artwork) : ''
    const releaseHit: EpArtworkHit | null = folderArt
      ? { artwork: folderArt, epName: ep.name, epId: ep.id }
      : null
    if (releaseHit) {
      const releaseKey = releaseArtworkKey(ep.name)
      if (releaseKey) byRelease.set(releaseKey, preferHit(byRelease.get(releaseKey), releaseHit))
    }

    for (const track of ep.tracks || []) {
      const art = stripArtworkCacheBust(track.artwork || folderArt || '')
      if (!art) continue
      const hit: EpArtworkHit = { artwork: art, epName: ep.name, epId: ep.id }
      for (const key of trackTitleKeys(track.title || '')) {
        byTitle.set(key, preferHit(byTitle.get(key), hit))
      }
      if (track.audioFileId) byAudioId.set(track.audioFileId, preferHit(byAudioId.get(track.audioFileId), hit))
    }
  }

  return { byTitle, byAudioId, byRelease }
}

function containsTitleHit(index: EpArtworkIndex, key: string): EpArtworkHit | null {
  if (key.length < 8) return null
  let best: { hit: EpArtworkHit; len: number } | null = null
  for (const [epKey, hit] of index.byTitle) {
    if (epKey.length < 8) continue
    const crateHasEp = key.endsWith(epKey) || (epKey.length >= 10 && key.includes(epKey))
    const epHasCrate = epKey.endsWith(key) || (key.length >= 10 && epKey.includes(key))
    if (!crateHasEp && !epHasCrate) continue
    if (!best || epKey.length > best.len) best = { hit, len: epKey.length }
  }
  return best?.hit || null
}

export function matchEpArtworkForTrack(
  track: {
    title?: string
    album?: string
    albumType?: string
    artwork?: string | null
    audioFileId?: string
    audio_file_id?: string
  },
  index: EpArtworkIndex,
): EpArtworkHit | null {
  const audioId = track.audioFileId || track.audio_file_id
  if (audioId && index.byAudioId.has(audioId)) return index.byAudioId.get(audioId) || null

  for (const key of trackTitleKeys(track.title || '')) {
    const exact = index.byTitle.get(key)
    if (exact) return exact
  }
  for (const key of trackTitleKeys(track.title || '')) {
    const fuzzy = containsTitleHit(index, key)
    if (fuzzy) return fuzzy
  }

  const albumKey = releaseArtworkKey(track.album || '')
  if (albumKey && index.byRelease.has(albumKey)) return index.byRelease.get(albumKey) || null
  return null
}

function shouldReplaceAlbum(album: string | undefined, crateNames?: Set<string>): boolean {
  const name = String(album || '').trim()
  if (!name) return true
  if (crateNames?.has(name)) return true
  return false
}

export function applyEpArtworkToTracks<
  T extends {
    title?: string
    album?: string
    albumType?: string
    artwork?: string
    audioFileId?: string
    audio_file_id?: string
  },
>(tracks: T[], index: EpArtworkIndex, opts?: { crateNames?: Set<string> }): T[] {
  if (!tracks.length || (!index.byTitle.size && !index.byAudioId.size && !index.byRelease.size)) {
    return tracks
  }
  let changed = false
  const next = tracks.map((track) => {
    const hit = matchEpArtworkForTrack(track, index)
    if (!hit) return track
    const keepOwn = track.artwork && isUploadedFolderArtwork(track.artwork)
    const artwork = keepOwn ? track.artwork : hit.artwork
    const album = shouldReplaceAlbum(track.album, opts?.crateNames) ? hit.epName : track.album
    const albumType = album === hit.epName ? 'ep' : track.albumType
    if (track.artwork === artwork && track.album === album && track.albumType === albumType) return track
    changed = true
    return { ...track, artwork, album, albumType }
  })
  return changed ? next : tracks
}

export function applyEpArtworkToFolderTracks<T extends { title?: string; album?: string; albumType?: string; artwork?: string; audioFileId?: string }>(
  grouped: Record<string, T[]>,
  eps: Array<{ id: string; name: string; type?: string; artwork?: string | null }>,
  opts?: { crateFolderIds?: Set<string>; crateNames?: Set<string> },
): Record<string, T[]> {
  const epFolders = eps.filter((folder) => folder.type === 'ep' || !folder.type)
  const index = buildEpArtworkIndex(
    epFolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      artwork: folder.artwork,
      tracks: grouped[folder.id] || [],
    })),
  )
  const crateIds = opts?.crateFolderIds
  let changed = false
  const next: Record<string, T[]> = {}
  for (const [id, tracks] of Object.entries(grouped)) {
    const isEp = epFolders.some((folder) => folder.id === id)
    if (isEp || (crateIds && !crateIds.has(id))) {
      next[id] = tracks
      continue
    }
    const stamped = applyEpArtworkToTracks(tracks, index, { crateNames: opts?.crateNames })
    if (stamped !== tracks) changed = true
    next[id] = stamped
  }
  return changed ? next : grouped
}
