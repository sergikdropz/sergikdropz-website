import {
  displayTrackGenre,
  displayTrackSubgenre,
  type TrackDisplaySource,
} from '@/lib/audio/track-display'
import type { MarketingCopy } from '@/lib/studio/constants'

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

const COPY_KEYS: (keyof MarketingCopy)[] = [
  'elevator_pitch',
  'press_blurb',
  'spotify_pitch',
  'social_caption',
  'store_description',
  'credits_block',
]

export type DnaCopyInput = {
  title: string
  genre?: string | null
  subgenre?: string | null
  description?: string | null
  artist?: string | null
  trackTitles?: string[]
  year?: number | null
}

function firstSentence(text: string, max = 180): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed
  if (sentence.length <= max) return sentence
  return `${sentence.slice(0, max - 1).trimEnd()}…`
}

function hashtag(genre: string): string {
  return `#${genre.replace(/[^a-zA-Z0-9]+/g, '')}` || '#newmusic'
}

/** Build marketing copy from vault/Sonic DNA fields — no LLM. */
export function marketingCopyFromDna(input: DnaCopyInput): MarketingCopy {
  const title = clean(input.title) || 'Untitled'
  const genre = clean(input.genre) || 'electronic'
  const subgenre = clean(input.subgenre)
  const mood = subgenre || genre
  const artist = clean(input.artist) || 'SERGIK'
  const year = input.year && input.year > 1900 ? input.year : new Date().getFullYear()
  const desc = clean(input.description)
  const hook = firstSentence(desc) || `${title} — ${mood} from ${artist}.`
  const titles = (input.trackTitles || []).map(clean).filter(Boolean)
  const tracklist = titles.length
    ? titles.map((name, i) => `${i + 1}. ${name}`).join('\n')
    : ''

  return {
    elevator_pitch: hook,
    press_blurb:
      desc ||
      `${artist} unveils "${title}", a ${mood} release shaped for club systems and late-night listening.`,
    spotify_pitch: `Mood: ${mood}. For fans of ${genre}${subgenre ? ` / ${subgenre}` : ''}. ${hook}`.slice(
      0,
      500,
    ),
    social_caption: `🎧 "${title}" is out now — stream everywhere. ${hashtag(genre)} ${hashtag('SERGIK')}`,
    store_description: [desc || `${title} by ${artist}.`, tracklist && `Tracklist:\n${tracklist}`]
      .filter(Boolean)
      .join('\n\n'),
    credits_block: `Written & produced by ${artist}.\nPublished © ${year} ${artist}. All rights reserved.`,
  }
}

export function dnaCopyInputFromDraft(draft: {
  release: VaultReleaseDraft
  tracks: VaultTrackDraft[]
}): DnaCopyInput {
  const yearRaw = draft.release.release_date?.slice(0, 4)
  const year = yearRaw ? Number(yearRaw) : null
  return {
    title: draft.release.title,
    genre: draft.release.genre,
    subgenre: draft.release.subgenre,
    description: draft.release.description,
    artist: draft.release.label_name,
    trackTitles: draft.tracks.map((t) => t.title),
    year: year && year > 1900 ? year : null,
  }
}

/** Overlay generated copy. fillEmptyOnly keeps existing non-empty fields. Always preserves `_vault`. */
export function mergeGeneratedMarketingCopy(
  existing: Record<string, unknown> | null | undefined,
  generated: MarketingCopy,
  fillEmptyOnly = false,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing || {}) }
  for (const key of COPY_KEYS) {
    const value = generated[key]
    if (!value) continue
    const prev = next[key]
    if (fillEmptyOnly && typeof prev === 'string' && prev.trim()) continue
    next[key] = value
  }
  if (existing?._vault) next._vault = existing._vault
  return next
}

export type VaultDistributionStamp = {
  releaseId: string
  releaseTitle: string
  status: string
  isrc?: string | null
  upc?: string | null
  releaseDate?: string | null
}

export function mergeVaultDistributionMetadata(
  existing: unknown,
  stamp: VaultDistributionStamp,
): Record<string, unknown> {
  const meta =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  const prev =
    meta.distribution && typeof meta.distribution === 'object' && !Array.isArray(meta.distribution)
      ? { ...(meta.distribution as Record<string, unknown>) }
      : {}
  meta.distribution = {
    ...prev,
    releaseId: stamp.releaseId,
    releaseTitle: stamp.releaseTitle,
    status: stamp.status,
    syncedAt: new Date().toISOString(),
    ...(stamp.isrc ? { isrc: stamp.isrc } : {}),
    ...(stamp.upc ? { upc: stamp.upc } : {}),
    ...(stamp.releaseDate ? { releaseDate: stamp.releaseDate.slice(0, 10) } : {}),
  }
  return meta
}
