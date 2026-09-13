import {
  displayTrackGenre,
  displayTrackSubgenre,
  type TrackDisplaySource,
} from '@/lib/audio/track-display'

export type VaultFolderRow = {
  id: string
  name: string
  type: string
  artwork_url?: string | null
  year?: number | null
  album_artist?: string | null
  genre?: string | null
  metadata?: Record<string, unknown> | null
}

export type VaultTrackRow = TrackDisplaySource & {
  id: string
  title: string
  folder_id?: string | null
  file_url?: string | null
  artwork_url?: string | null
  duration?: number | null
  date?: string | null
  date_created?: string | null
  year?: number | null
  genre?: string | null
  subgenre?: string | null
  sonic_dna?: unknown
  sonic_dna_status?: string | null
  display_order?: number | null
  track_number?: number | null
  is_archived?: boolean | null
}

export type StudioReleaseType = 'single' | 'ep' | 'album'

export type VaultReleaseDraft = {
  title: string
  type: StudioReleaseType
  artwork_url: string | null
  genre: string | null
  subgenre: string | null
  description: string | null
  release_date: string | null
  label_name: string
  explicit: boolean
  source_folder_id: string
}

export type VaultTrackDraft = {
  music_library_track_id: string
  title: string
  duration: number | null
  artwork_url: string | null
  /** Provisional audio URL from vault streaming file — replace with master WAV before DSP. */
  wav_url: string
  genre: string | null
  subgenre: string | null
  dna_complete: boolean
}

/** Map vault folder type → studio release type. */
export function studioTypeFromFolderType(type: string | null | undefined): StudioReleaseType {
  const t = String(type || '').toLowerCase()
  if (t === 'album') return 'album'
  if (t === 'ep' || t === 'remix') return 'ep'
  return 'single'
}

function clean(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

/** Pull short prose from Sonic DNA for release description / marketing seed. */
export function descriptionFromSonicDna(dna: unknown): string | null {
  if (!dna || typeof dna !== 'object') return null
  const d = dna as Record<string, any>
  const candidates = [
    d.description,
    d.summary,
    d.overview,
    d.intention?.summary,
    d.intention?.description,
    d.cultural?.summary,
    d.emotional?.summary,
    d.agents?.descriptionWriter?.text,
    d.agents?.description_writer?.text,
  ]
  for (const c of candidates) {
    const text = clean(c)
    if (text.length >= 24) return text.slice(0, 2000)
  }
  return null
}

export function isSonicDnaComplete(track: VaultTrackRow): boolean {
  const status = clean(track.sonic_dna_status).toLowerCase()
  if (status === 'complete' || status === 'completed' || status === 'ready') return true
  const dna = track.sonic_dna
  if (!dna || typeof dna !== 'object') return false
  const genre = displayTrackGenre(track)
  return Boolean(genre)
}

function releaseDateFromFolderAndTracks(
  folder: VaultFolderRow,
  tracks: VaultTrackRow[],
): string | null {
  if (folder.year && folder.year > 1900) {
    return `${folder.year}-01-01`
  }
  for (const t of tracks) {
    const raw = clean(t.date_created) || clean(t.date)
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
    if (/^\d{4}$/.test(raw)) return `${raw}-01-01`
    if (t.year && t.year > 1900) return `${t.year}-01-01`
  }
  return null
}

/**
 * Build release + track drafts from a vault folder and its tracks.
 * Pure — no DB. Callers persist via studio APIs.
 */
export function buildVaultReleaseDraft(
  folder: VaultFolderRow,
  tracks: VaultTrackRow[],
): { release: VaultReleaseDraft; tracks: VaultTrackDraft[] } {
  const liveTracks = tracks
    .filter((t) => t && t.id && !t.is_archived)
    .slice()
    .sort((a, b) => {
      const ao = a.display_order ?? a.track_number ?? 0
      const bo = b.display_order ?? b.track_number ?? 0
      if (ao !== bo) return ao - bo
      return clean(a.title).localeCompare(clean(b.title))
    })

  let genre = clean(folder.genre) || null
  let subgenre: string | null = null
  let description: string | null = null

  for (const t of liveTracks) {
    if (!genre) {
      const g = displayTrackGenre(t)
      if (g) genre = g
    }
    if (!subgenre) {
      const s = displayTrackSubgenre(t)
      if (s) subgenre = s
    }
    if (!description) {
      description = descriptionFromSonicDna(t.sonic_dna)
    }
    if (genre && subgenre && description) break
  }

  const trackDrafts: VaultTrackDraft[] = liveTracks.map((t) => {
    const fileUrl = clean(t.file_url)
    return {
      music_library_track_id: t.id,
      title: clean(t.title) || 'Untitled',
      duration: typeof t.duration === 'number' ? t.duration : null,
      artwork_url: clean(t.artwork_url) || clean(folder.artwork_url) || null,
      wav_url: fileUrl || `pending://vault/${t.id}`,
      genre: displayTrackGenre(t) || genre,
      subgenre: displayTrackSubgenre(t) || subgenre,
      dna_complete: isSonicDnaComplete(t),
    }
  })

  return {
    release: {
      title: clean(folder.name) || 'Untitled release',
      type: studioTypeFromFolderType(folder.type),
      artwork_url: clean(folder.artwork_url) || trackDrafts[0]?.artwork_url || null,
      genre,
      subgenre,
      description,
      release_date: releaseDateFromFolderAndTracks(folder, liveTracks),
      label_name: clean(folder.album_artist) || 'SERGIK',
      explicit: false,
      source_folder_id: folder.id,
    },
    tracks: trackDrafts,
  }
}

/** Soft vault readiness hints for LaunchPanel (non-blocking). */
export function vaultSoftReadiness(tracks: Array<{
  music_library_track_id?: string | null
  wav_url?: string | null
  artwork_url?: string | null
  title?: string
}>, releaseArtwork: string | null | undefined) {
  const linked = tracks.filter((t) => Boolean(t.music_library_track_id))
  const pendingMasters = tracks.filter((t) =>
    String(t.wav_url || '').startsWith('pending://vault/'),
  )
  const streamingAsMaster = tracks.filter((t) => {
    const u = String(t.wav_url || '')
    return u && !u.startsWith('pending://') && !/\.wav(\?|$)/i.test(u)
  })
  return {
    vaultLinkedCount: linked.length,
    vaultLinked: linked.length > 0 && linked.length === tracks.length,
    needsMasterWav: pendingMasters.length > 0 || streamingAsMaster.length > 0,
    hasArtwork: Boolean(releaseArtwork) || tracks.some((t) => Boolean(t.artwork_url)),
    hints: [
      linked.length === 0
        ? 'No vault track links — import from Music Vault to reuse catalog DNA/metadata'
        : `${linked.length}/${tracks.length} track(s) linked to Music Vault`,
      pendingMasters.length || streamingAsMaster.length
        ? 'Replace vault/streaming audio with master WAV before DSP delivery'
        : null,
      !releaseArtwork ? 'Release artwork missing' : null,
    ].filter(Boolean) as string[],
  }
}

export function marketingCopyWithVaultMeta(
  existing: Record<string, unknown> | null | undefined,
  sourceFolderId: string,
): Record<string, unknown> {
  return {
    ...(existing || {}),
    _vault: {
      folderId: sourceFolderId,
      importedAt: new Date().toISOString(),
    },
  }
}

export function vaultFolderIdFromMarketingCopy(
  copy: Record<string, unknown> | null | undefined,
): string | null {
  const vault = copy?._vault
  if (!vault || typeof vault !== 'object') return null
  const id = clean((vault as { folderId?: string }).folderId)
  return id || null
}
