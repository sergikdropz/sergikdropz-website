/**
 * Merge DistroKid / Studio release masters onto existing Music Vault rows
 * so the same song isn't listed twice.
 */

import { normalizeTitleKey } from '@/lib/studio/distrokid-import'

export const DISTROKID_EXPORTS_FOLDER_ID = '1789691284218'

export type VaultMergeCandidate = {
  id: string
  title?: string | null
  artist?: string | null
  file_url?: string | null
  artwork_url?: string | null
  duration?: number | null
  bpm?: number | null
  key_signature?: string | null
  genre?: string | null
  subgenre?: string | null
  year?: number | null
  date?: string | null
  date_created?: string | null
  folder_id?: string | null
  audio_file_id?: string | null
  is_archived?: boolean | null
  metadata?: Record<string, unknown> | null
}

export type ReleaseMergePatch = {
  file_url?: string | null
  audio_file_id?: string | null
  artwork_url?: string | null
  duration?: number | null
  isrc?: string | null
  albumuuid?: string | null
  fingerprint?: string | null
  source?: string | null
  date?: string | null
  year?: number | null
}

function metaRecord(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {}
}

export function vaultTitleMatchKey(title: string, artist?: string | null): string {
  const t = normalizeTitleKey(title)
  if (!t) return ''
  const a = normalizeTitleKey(String(artist || ''))
  // Artist is optional — many vault rows use SERGIK / Sergik interchangeably.
  return a && a !== 'sergik' ? `${t}::${a}` : t
}

export function isrcFromVaultMeta(meta: unknown): string | null {
  const m = metaRecord(meta)
  const raw = m.isrc || m.isrc_full
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null
}

export function isReleaseMasterUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return (
    /\/distrokid\//i.test(url) ||
    /\/dsp-masters\//i.test(url) ||
    /\.wav(\?|$)/i.test(url)
  )
}

export function isDistroKidExportsFolder(folderId: string | null | undefined): boolean {
  return folderId === DISTROKID_EXPORTS_FOLDER_ID
}

/** Higher = better canonical vault row (keep this one when deduping). */
export function scoreVaultMergeCandidate(
  track: VaultMergeCandidate,
  preferIsrc?: string | null,
): number {
  if (track.is_archived) return -1000
  let score = 0
  const url = track.file_url || ''
  const meta = metaRecord(track.metadata)
  const source = typeof meta.source === 'string' ? meta.source : ''
  const isrc = isrcFromVaultMeta(meta)

  if (preferIsrc && isrc && isrc === preferIsrc.replace(/[^A-Za-z0-9]/g, '').toUpperCase()) {
    score += 200
  }
  // Release masters are valuable as *files*, but the canonical list row should be
  // the existing vault home (EP/crate) with catalog DNA — not the Distrokid Exports stub.
  if (isReleaseMasterUrl(url)) score += 25
  if (/\/distrokid\//i.test(url) || track.id.startsWith('track-dk-')) score += 10
  if (source === 'distrokid-wav' || source === 'distrokid' || source === 'distrokid-exports-playlist') {
    score += 8
  }
  if (track.bpm != null && Number.isFinite(Number(track.bpm))) score += 20
  if (
    track.key_signature &&
    !['unknown', 'n/a', 'none', '—'].includes(String(track.key_signature).trim().toLowerCase())
  ) {
    score += 15
  }
  if (track.genre && String(track.genre).trim().toLowerCase() !== 'unknown') score += 10
  if (track.artwork_url) score += 8
  if (track.duration != null) score += 6
  if (track.date || track.date_created || track.year != null) score += 6
  if (isrc) score += 12
  // Prefer the pre-existing vault home over Distrokid Exports stubs.
  if (!isDistroKidExportsFolder(track.folder_id)) score += 55
  return score
}

export function pickCanonicalVaultTrack<T extends VaultMergeCandidate>(
  candidates: T[],
  preferIsrc?: string | null,
): T | null {
  const live = candidates.filter((c) => c?.id && !c.is_archived)
  if (!live.length) return null
  if (live.length === 1) return live[0]
  return [...live].sort(
    (a, b) => scoreVaultMergeCandidate(b, preferIsrc) - scoreVaultMergeCandidate(a, preferIsrc),
  )[0]
}

/**
 * Build the keep-row update: release master file + ISRC win; vault catalog
 * fields (bpm/key/genre/dates/artwork) are preserved when already present.
 */
export function mergeReleaseOntoVaultTrack(
  keep: VaultMergeCandidate,
  release: ReleaseMergePatch,
): {
  file_url: string | null
  audio_file_id: string | null
  artwork_url: string | null
  duration: number | null
  date: string | null
  year: number | null
  metadata: Record<string, unknown>
} {
  const meta = { ...metaRecord(keep.metadata) }
  if (release.isrc) {
    meta.isrc = release.isrc
    meta.isrc_full = release.isrc
  }
  if (release.albumuuid) meta.albumuuid = release.albumuuid
  if (release.fingerprint) meta.fingerprint = release.fingerprint
  if (release.source) meta.source = release.source
  meta.merged_from_release = true
  meta.merged_at = new Date().toISOString()

  const releaseUrl = release.file_url || ''
  const releaseIsWavMaster = /\.wav(\?|$)/i.test(releaseUrl) || /\/dsp-masters\//i.test(releaseUrl)
  if (releaseIsWavMaster && release.file_url) {
    meta.distribution_wav_url = release.file_url
    meta.dspMastersPath = meta.dspMastersPath || release.file_url
  }
  const keepIsStream = /\.mp3(\?|$)/i.test(keep.file_url || '')
  const releaseIsStream = /\.mp3(\?|$)/i.test(releaseUrl)
  const streamUrl = keepIsStream
    ? keep.file_url || null
    : releaseIsStream
      ? release.file_url || null
      : keep.file_url || release.file_url || null

  return {
    file_url: streamUrl,
    audio_file_id: keepIsStream
      ? keep.audio_file_id || null
      : releaseIsStream
        ? release.audio_file_id || keep.audio_file_id || null
        : keep.audio_file_id || null,
    artwork_url: keep.artwork_url || release.artwork_url || null,
    duration: keep.duration ?? release.duration ?? null,
    date: keep.date || release.date || null,
    year: keep.year ?? release.year ?? null,
    metadata: meta,
  }
}

/** UI / list dedupe: one row per title (+ optional artist), preferring release masters + vault richness. */
export function dedupeTracksPreferringReleaseMasters<
  T extends {
    id: string
    title?: string | null
    artist?: string | null
    file?: string | null
    file_url?: string | null
    artwork?: string | null
    artwork_url?: string | null
    duration?: number | null
    bpm?: number | null
    key_signature?: string | null
    genre?: string | null
    subgenre?: string | null
    album?: string | null
    albumType?: string | null
    year?: number | null
    date?: string | null
    date_created?: string | null
    folderId?: string | null
    folder_id?: string | null
    audioFileId?: string | null
    audio_file_id?: string | null
    is_archived?: boolean | null
    metadata?: Record<string, unknown> | null
  },
>(tracks: T[]): T[] {
  const groups = new Map<string, T[]>()
  const order: string[] = []

  for (const track of tracks) {
    if (!track?.id || track.is_archived) continue
    const key =
      vaultTitleMatchKey(String(track.title || ''), track.artist) || `id:${track.id}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(track)
  }

  return order
    .map((key) => {
      const group = groups.get(key) || []
      if (group.length <= 1) return group[0]

      const asCandidates: VaultMergeCandidate[] = group.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        file_url: t.file_url || t.file || null,
        artwork_url: t.artwork_url || t.artwork || null,
        duration: t.duration ?? null,
        bpm: t.bpm ?? null,
        key_signature: t.key_signature,
        genre: t.genre,
        subgenre: t.subgenre,
        year: t.year ?? null,
        date: t.date,
        date_created: t.date_created,
        folder_id: t.folder_id || t.folderId || null,
        audio_file_id: t.audio_file_id || t.audioFileId || null,
        is_archived: t.is_archived,
        metadata: t.metadata || null,
      }))

      const keep = pickCanonicalVaultTrack(asCandidates)
      if (!keep) return group[0]
      const keepRow = group.find((t) => t.id === keep.id) || group[0]
      const donor = group.find((t) => t.id !== keep.id)

      // Surface release master URL + ISRC on the visible row without mutating siblings.
      const releasePatch: ReleaseMergePatch = {
        file_url: donor?.file_url || donor?.file || null,
        audio_file_id: donor?.audio_file_id || donor?.audioFileId || null,
        artwork_url: donor?.artwork_url || donor?.artwork || null,
        duration: donor?.duration ?? null,
        isrc: isrcFromVaultMeta(donor?.metadata) || isrcFromVaultMeta(keepRow.metadata),
        date: donor?.date || null,
        year: donor?.year ?? null,
      }
      const merged = mergeReleaseOntoVaultTrack(
        {
          id: keepRow.id,
          file_url: keepRow.file_url || keepRow.file || null,
          artwork_url: keepRow.artwork_url || keepRow.artwork || null,
          duration: keepRow.duration ?? null,
          date: keepRow.date,
          year: keepRow.year ?? null,
          audio_file_id: keepRow.audio_file_id || keepRow.audioFileId || null,
          metadata: keepRow.metadata || null,
        },
        releasePatch,
      )

      return {
        ...keepRow,
        file: merged.file_url || keepRow.file,
        file_url: merged.file_url || (keepRow as { file_url?: string }).file_url,
        artwork: merged.artwork_url || keepRow.artwork,
        artwork_url: merged.artwork_url || (keepRow as { artwork_url?: string }).artwork_url,
        duration: merged.duration ?? keepRow.duration,
        date: merged.date || keepRow.date,
        year: merged.year ?? keepRow.year,
        audioFileId: merged.audio_file_id || keepRow.audioFileId,
        audio_file_id: merged.audio_file_id || (keepRow as { audio_file_id?: string }).audio_file_id,
        metadata: merged.metadata,
        bpm: keepRow.bpm ?? donor?.bpm,
        key_signature: keepRow.key_signature || donor?.key_signature,
        genre: keepRow.genre || donor?.genre,
        subgenre: keepRow.subgenre || donor?.subgenre,
        album: keepRow.album || donor?.album,
        albumType: keepRow.albumType || donor?.albumType,
      } as T
    })
    .filter(Boolean) as T[]
}
