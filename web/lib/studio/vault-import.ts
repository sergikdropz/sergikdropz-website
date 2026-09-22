import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'
import {
  displayTrackBpm,
  displayTrackDrumStyle,
  displayTrackGenre,
  displayTrackKey,
  displayTrackScale,
  displayTrackSubgenre,
  displayTrackTimeSignature,
  type TrackDisplaySource,
} from '@/lib/audio/track-display'
import type { MarketingCopy } from '@/lib/studio/constants'
import {
  contributorsFromVault,
  creditsBlockFromContributors,
  displayArtistLine,
  flattenReleaseContributors,
  parseContributors,
  type TrackContributor,
} from '@/lib/studio/track-credits'
import { mapSonicGenreToDsp } from '@/lib/studio/dsp-ingest'

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
  artist?: string | null
  folder_id?: string | null
  file_url?: string | null
  artwork_url?: string | null
  duration?: number | null
  date?: string | null
  date_created?: string | null
  year?: number | null
  genre?: string | null
  subgenre?: string | null
  bpm?: number | string | null
  key_signature?: string | null
  energy_level?: number | null
  danceability?: number | null
  sonic_dna?: unknown
  /** From audio_files — music_library_tracks has no sonic_dna_status column. */
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

export type StudioTrackIdentity = {
  description: string | null
  genre: string | null
  subgenre: string | null
  bpm: number | null
  key_signature: string | null
  scale: string | null
  energy: number | null
  danceability: number | null
  drum_style: string | null
  time_signature: string | null
  timing_feel: string | null
  intention: string | null
  instruments: string[]
  dna_complete: boolean
  lyrics_excerpt?: string | null
  press_source?: 'dna' | 'ai-listen' | 'edited' | null
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
  identity: StudioTrackIdentity
  contributors: TrackContributor[]
  track_number: number | null
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

const ANALYSIS_COPY_RE =
  /groove class|from measured usage|not from a crate name|not extra labels|heuristic, not a lab|witek et al|prediction error|vestibular\/tactile|named center|related traditions on the map|instantiate .+ as a motor|from this file['’]s|encyclopedia fill|sonic intent\s*:|\b(is|are) used as\b|\b(is|are) used\b|not as a house pulse|typical of .+ usage|not a trap|decide genre|low-end label|hats\/cymbals|house\/disco sub/i

/** True when copy is lab/encyclopedia voice, not release or store text. */
export function isAnalysisCopy(text: string | null | undefined): boolean {
  const value = clean(text)
  if (!value) return false
  return ANALYSIS_COPY_RE.test(value)
}

function stripCopyPrefix(text: string): string {
  return text
    .replace(/^(sonic intent|intention|social usage|listener effects|usage|activation formula)\s*[:—-]\s*/i, '')
    .replace(/^groove class[^.?!]*[.?!]\s*/i, '')
    .replace(/\s*[—-]\s*typical of.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function listenerSentences(text: unknown): string[] {
  const value = stripCopyPrefix(clean(text))
  if (!value) return []
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) =>
      sentence
        .replace(/\s*\([^)]{0,100}\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((sentence) => sentence.length >= 24 && !isAnalysisCopy(sentence))
}

function firstReleaseSentence(text: unknown, max = 180): string {
  const sentence = listenerSentences(text)[0] || ''
  if (!sentence) return ''
  if (sentence.length <= max) return sentence
  return `${sentence.slice(0, max - 1).trimEnd()}…`
}

function moodPhrase(genre: string | null, subgenre: string | null): string {
  if (genre && subgenre) return `${genre} / ${subgenre}`
  return genre || subgenre || 'electronic'
}

function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function groovePhrase(track: VaultTrackRow): string {
  const drum = displayTrackDrumStyle(track).toLowerCase()
  if (drum.includes('four')) return 'a four-on-the-floor pulse'
  if (drum.includes('break')) return 'a broken drum pattern'
  if (drum.includes('half')) return 'a half-time pocket'
  if (drum.includes('dembow')) return 'a dembow pocket'
  return ''
}

function listenerHookFromDna(dna: unknown): string {
  const parsed = parseSonicDna(dna)
  if (!parsed) return ''
  const measured = extractMeasured(parsed)
  const intel = asRecord(measured?.intelligence)
  const psycho = asRecord(intel.psychoacoustics)
  const emotional = asRecord(intel.emotional)
  const candidates = [
    psycho.sonicIntent,
    psycho.socialUsage,
    psycho.listenerEffects,
    emotional.emotionalJourney,
    intel.intention,
    nestedString(parsed.intention, 'summary'),
    nestedString(parsed.intention, 'description'),
    typeof parsed.intention === 'string' ? parsed.intention : '',
    nestedString(parsed.agents, 'descriptionWriter', 'text'),
    nestedString(parsed.agents, 'description_writer', 'text'),
    parsed.overview,
    parsed.description,
    parsed.summary,
  ]
  for (const candidate of candidates) {
    const sentence = firstReleaseSentence(candidate)
    if (sentence) return sentence
  }
  return ''
}

/** Pull listener-facing prose from Sonic DNA. Skips encyclopedia / lab voice. */
export function descriptionFromSonicDna(dna: unknown): string | null {
  const hook = listenerHookFromDna(dna)
  return hook || null
}

function titledHook(title: string, hook: string): string {
  if (!hook) return ''
  const headed = capitalize(hook)
  if (title && headed.toLowerCase().includes(title.toLowerCase())) return headed
  return title ? `${title} — ${headed}` : headed
}

function preferReleaseCopy(
  persisted: string | null | undefined,
  live: string | null,
): string | null {
  const prev = clean(persisted)
  const next = clean(live)
  const generated = /^[^—]+ — .+\. (?:A|An) .+ cut/i.test(prev)
  if (prev && !isAnalysisCopy(prev) && !generated && !/^sonic intent\s*:/i.test(prev)) return prev
  return next || (prev && !isAnalysisCopy(prev) ? prev : null) || null
}

/** Short store/press note for one track — unique, readable, never a sibling's copy. */
export function releaseDescriptionFromVault(track: VaultTrackRow): string | null {
  const title = clean(track.title) || 'This track'
  const genre = displayTrackGenre(track) || null
  const subgenre = displayTrackSubgenre(track) || null
  const mood = moodPhrase(genre, subgenre)
  const bpm = displayTrackBpm(track)
  const key = displayTrackKey(track)
  const groove = groovePhrase(track)
  const hook = listenerHookFromDna(track.sonic_dna)
  const intention = releaseIntentionFromDna(track.sonic_dna)

  const facts = [
    bpm ? `at ${bpm} BPM` : '',
    key ? `in ${key}` : '',
    groove ? `with ${groove}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const sentences: string[] = []
  if (hook) {
    const headed = titledHook(title, hook)
    sentences.push(headed.endsWith('.') || headed.endsWith('…') ? headed : `${headed}.`)
    if (facts && !hook.includes(String(bpm || '')) && !hook.toLowerCase().includes(mood.toLowerCase())) {
      sentences.push(`${capitalize(withArticle(mood))} cut${facts ? ` ${facts}` : ''}.`)
    }
  } else if (genre || bpm || key) {
    sentences.push(`${title} is ${withArticle(mood)} cut${facts ? ` ${facts}` : ''}.`)
    if (intention && !sentences[0]?.toLowerCase().includes(intention.toLowerCase().slice(0, 24))) {
      sentences.push(intention.endsWith('.') ? intention : `${intention}.`)
    }
  }

  const text = sentences
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length >= 24 ? text.slice(0, 420) : null
}

export function releaseIntentionFromDna(dna: unknown): string | null {
  const parsed = parseSonicDna(dna)
  const measured = extractMeasured(parsed || dna)
  const intel = asRecord(measured?.intelligence)
  const psycho = asRecord(intel.psychoacoustics)
  const candidates = [
    nestedString(asRecord(parsed).intention, 'summary'),
    nestedString(asRecord(parsed).intention, 'description'),
    typeof parsed?.intention === 'string' ? parsed.intention : '',
    intel.intention,
    psycho.socialUsage,
    psycho.sonicIntent,
  ]
  for (const candidate of candidates) {
    const sentence = firstReleaseSentence(candidate, 160)
    if (sentence) return sentence.endsWith('.') || sentence.endsWith('…') ? sentence : `${sentence}.`
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nestedString(value: unknown, ...keys: string[]): string {
  let current: unknown = value
  for (const key of keys) {
    if (!current || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[key]
  }
  return clean(current)
}

function energyFromTrack(track: VaultTrackRow): number | null {
  const n = Number(track.energy_level)
  if (Number.isFinite(n) && n > 0) return Math.round(n * 10) / 10
  const measured = extractMeasured(parseSonicDna(track.sonic_dna) || track.sonic_dna)
  const fromMeasured = Number((measured as { energy?: number } | null)?.energy)
  return Number.isFinite(fromMeasured) && fromMeasured > 0
    ? Math.round(fromMeasured * 10) / 10
    : null
}

function danceabilityFromTrack(track: VaultTrackRow): number | null {
  const n = Number(track.danceability)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null
}

function instrumentsFromDna(dna: unknown): string[] {
  const measured = extractMeasured(parseSonicDna(dna) || dna)
  return (measured?.instruments || [])
    .filter((item) => (item.confidence || 0) >= 0.35)
    .map((item) => clean(item.label))
    .filter(Boolean)
    .slice(0, 8)
}

/** Unique Sonic DNA card for one vault track — never copies a sibling's prose. */
export function studioTrackIdentityFromVault(track: VaultTrackRow): StudioTrackIdentity {
  const description = releaseDescriptionFromVault(track)
  const intention = releaseIntentionFromDna(track.sonic_dna)
  const timingFeel = clean(extractMeasured(parseSonicDna(track.sonic_dna) || track.sonic_dna)?.timingFeel)
  const intentionLine =
    intention && description && description.toLowerCase().includes(intention.toLowerCase().slice(0, 32))
      ? null
      : intention
  return {
    description,
    genre: displayTrackGenre(track) || null,
    subgenre: displayTrackSubgenre(track) || null,
    bpm: displayTrackBpm(track),
    key_signature: displayTrackKey(track) || null,
    scale: displayTrackScale(track) || null,
    energy: energyFromTrack(track),
    danceability: danceabilityFromTrack(track),
    drum_style: displayTrackDrumStyle(track) || null,
    time_signature: displayTrackTimeSignature(track) || null,
    timing_feel: timingFeel || null,
    intention: intentionLine,
    instruments: instrumentsFromDna(track.sonic_dna),
    dna_complete: isSonicDnaComplete(track),
    lyrics_excerpt: null,
    press_source: 'dna',
  }
}

export function distributionTrackIdentityPayload(identity: StudioTrackIdentity) {
  return {
    description: identity.description,
    genre: identity.genre,
    subgenre: identity.subgenre,
    bpm: identity.bpm,
    key_signature: identity.key_signature,
    sonic_snapshot: identity,
  }
}

export function mergeStudioTrackIdentity(
  persisted: Partial<StudioTrackIdentity> | null | undefined,
  live: StudioTrackIdentity,
): StudioTrackIdentity {
  const pick = <K extends keyof StudioTrackIdentity>(key: K): StudioTrackIdentity[K] => {
    const prev = persisted?.[key]
    if (key === 'instruments') {
      return (Array.isArray(prev) && prev.length ? prev : live.instruments) as StudioTrackIdentity[K]
    }
    if (typeof prev === 'string' && prev.trim()) return prev as StudioTrackIdentity[K]
    if (typeof prev === 'number' && Number.isFinite(prev)) return prev as StudioTrackIdentity[K]
    if (typeof prev === 'boolean') return prev as StudioTrackIdentity[K]
    return live[key]
  }
  const keepPress =
    persisted?.press_source === 'edited' || persisted?.press_source === 'ai-listen'
  const persistedDescription =
    typeof persisted?.description === 'string' ? persisted.description : null
  const persistedIntention =
    typeof persisted?.intention === 'string' ? persisted.intention : null
  const description = keepPress
    ? clean(persistedDescription) || live.description
    : preferReleaseCopy(persistedDescription, live.description)
  const intention = keepPress
    ? clean(persistedIntention) || live.intention
    : preferReleaseCopy(persistedIntention, live.intention)
  return {
    description,
    genre: pick('genre'),
    subgenre: pick('subgenre'),
    bpm: pick('bpm'),
    key_signature: pick('key_signature'),
    scale: pick('scale'),
    energy: pick('energy'),
    danceability: pick('danceability'),
    drum_style: pick('drum_style'),
    time_signature: pick('time_signature'),
    timing_feel: pick('timing_feel'),
    intention:
      intention && description && description.toLowerCase().includes(intention.toLowerCase().slice(0, 32))
        ? null
        : intention,
    instruments: pick('instruments'),
    dna_complete: Boolean(live.dna_complete || persisted?.dna_complete),
    lyrics_excerpt: pick('lyrics_excerpt'),
    press_source: (persisted?.press_source || live.press_source || null) as StudioTrackIdentity['press_source'],
  }
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

  for (const t of liveTracks) {
    if (!genre) {
      const g = displayTrackGenre(t)
      if (g) genre = g
    }
    if (!subgenre) {
      const s = displayTrackSubgenre(t)
      if (s) subgenre = s
    }
    if (genre && subgenre) break
  }

  const trackDrafts: VaultTrackDraft[] = liveTracks.map((t) => {
    const fileUrl = clean(t.file_url)
    const identity = studioTrackIdentityFromVault(t)
    return {
      music_library_track_id: t.id,
      title: clean(t.title) || 'Untitled',
      duration: typeof t.duration === 'number' ? t.duration : null,
      artwork_url: clean(t.artwork_url) || clean(folder.artwork_url) || null,
      wav_url: fileUrl || `pending://vault/${t.id}`,
      genre: identity.genre,
      subgenre: identity.subgenre,
      dna_complete: identity.dna_complete,
      identity,
      contributors: contributorsFromVault({
        artist: t.artist,
        title: t.title,
        albumArtist: folder.album_artist,
      }),
      track_number:
        typeof t.track_number === 'number' && t.track_number > 0
          ? t.track_number
          : typeof t.display_order === 'number' && t.display_order > 0
            ? t.display_order
            : null,
    }
  })

  const folderDescription = clean((folder.metadata as { description?: string } | null)?.description)
  const dsp = mapSonicGenreToDsp(genre, subgenre)
  const journey = releaseDescriptionFromCatalog({
    title: clean(folder.name) || 'Untitled release',
    type: studioTypeFromFolderType(folder.type),
    genre,
    subgenre,
    artist: clean(folder.album_artist) || 'SERGIK',
    tracks: trackDrafts.map((track) => ({
      title: track.title,
      description: track.identity.description,
      intention: track.identity.intention,
      genre: track.identity.genre,
      subgenre: track.identity.subgenre,
      bpm: track.identity.bpm,
      key_signature: track.identity.key_signature,
      drum_style: track.identity.drum_style,
      energy: track.identity.energy,
      danceability: track.identity.danceability,
    })),
  })
  const releaseDescription = !isAnalysisCopy(folderDescription) && folderDescription
    ? folderDescription.slice(0, 1400)
    : journey || null

  return {
    release: {
      title: clean(folder.name) || 'Untitled release',
      type: studioTypeFromFolderType(folder.type),
      artwork_url: clean(folder.artwork_url) || trackDrafts[0]?.artwork_url || null,
      genre: dsp.primary || genre,
      subgenre: dsp.secondary || subgenre,
      description: releaseDescription,
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

/**
 * Stable, human-readable distribution release ids from vault folders.
 * Uses the distinctive folder tail (inspire / in-the-streets) so truncated
 * prefixes like `…---inspi` vs `…---in-th` are not required for uniqueness.
 */
export function studioReleaseIdFromVaultFolder(
  folderId: string,
  now: number = Date.now(),
): string {
  const cleaned = String(folderId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  const withoutCollectionPrefix = cleaned
    .replace(/^collection-unreleased-eps-sergik-?/i, '')
    .replace(/^-+/, '')
  const label = (withoutCollectionPrefix || cleaned || 'vault').slice(0, 28)
  return `release-${label}-${now.toString(36)}`
}

const COPY_KEYS: (keyof MarketingCopy)[] = [
  'elevator_pitch',
  'press_blurb',
  'spotify_pitch',
  'social_caption',
  'store_description',
  'credits_block',
]

export type DnaCopyTrack = {
  title: string
  description?: string | null
  intention?: string | null
  genre?: string | null
  subgenre?: string | null
  bpm?: number | null
  key_signature?: string | null
  drum_style?: string | null
  energy?: number | null
  danceability?: number | null
  billed?: string | null
  instruments?: string[]
  timing_feel?: string | null
  scale?: string | null
  time_signature?: string | null
  lyrics_excerpt?: string | null
}

export type CatalogCopySourceTrack = {
  title?: string | null
  track_number?: number | null
  identity?: Partial<StudioTrackIdentity> | null
  contributors?: unknown
}

export type DnaCopyInput = {
  title: string
  type?: string | null
  genre?: string | null
  subgenre?: string | null
  description?: string | null
  artist?: string | null
  label?: string | null
  language?: string | null
  streetDate?: string | null
  trackTitles?: string[]
  tracks?: DnaCopyTrack[]
  year?: number | null
  contributors?: TrackContributor[]
  artworkCredits?: {
    designer?: string | null
    photographer?: string | null
    illustrator?: string | null
  }
}

export type CatalogCopyFacts = {
  trackCount: number
  mood: string
  tempo: string | null
  keys: string | null
  pressNotes: number
}

function firstSentence(text: string, max = 180): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed
  if (sentence.length <= max) return sentence
  return `${sentence.slice(0, max - 1).trimEnd()}…`
}

function hashtag(raw: string): string {
  const tag = clean(raw).replace(/[^a-zA-Z0-9]+/g, '')
  return tag ? `#${tag}` : ''
}

function hashtagTokens(...parts: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const part of parts) {
    const value = clean(part)
    if (!value) continue
    const compound = hashtag(value)
    if (compound) out.push(compound)
  }
  return out
}

/** SEO-oriented launch hashtags: brand + genre + discovery (deduped, capped). */
export function buildLaunchHashtags(input: {
  title: string
  artist?: string | null
  genre?: string | null
  subgenre?: string | null
  type?: string | null
  tracks?: DnaCopyTrack[]
  max?: number
}): string[] {
  const kind = releaseKind(input.type, input.tracks?.length || 0)
  const grooves = (input.tracks || [])
    .map((track) => grooveLabel(track.drum_style))
    .filter(Boolean)
  const genreTags = hashtagTokens(input.genre, input.subgenre)
  const titleTag = hashtag(input.title)
  const artistTag = hashtag(input.artist || 'SERGIK')
  const kindTags =
    kind === 'album'
      ? ['#NewAlbum', '#AlbumRelease']
      : kind === 'single'
        ? ['#NewSingle', '#SingleRelease']
        : ['#NewEP', '#EPRelease']

  const discovery = [
    '#NewMusic',
    '#OutNow',
    '#NowPlaying',
    '#MusicRelease',
    '#ElectronicMusic',
    '#DanceMusic',
    '#IndieDance',
    '#ClubMusic',
    '#StreamNow',
    '#LinkInBio',
  ]

  // Genre-leaning discovery boosts from primary class
  const genreBoost: string[] = []
  const genreKey = clean(input.genre).toLowerCase()
  if (genreKey.includes('house')) genreBoost.push('#HouseMusic', '#DeepHouse')
  if (genreKey.includes('funky')) genreBoost.push('#FunkyHouse')
  if (genreKey.includes('tech')) genreBoost.push('#TechHouse')
  if (genreKey.includes('bass')) genreBoost.push('#BassMusic')
  if (genreKey.includes('disco')) genreBoost.push('#NuDisco', '#Disco')

  const grooveTags = grooves.flatMap((groove) => {
    if (groove.includes('four')) return ['#FourOnTheFloor']
    if (groove.includes('break')) return ['#Breakbeat']
    if (groove.includes('half')) return ['#HalfTime']
    if (groove.includes('dembow')) return ['#Dembow']
    return []
  })

  const preferred = [
    artistTag || '#SERGIK',
    '#SERGIK',
    titleTag,
    ...genreTags,
    ...kindTags,
    ...discovery.slice(0, 6),
    ...genreBoost,
    ...grooveTags,
    ...discovery.slice(6),
  ]

  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of preferred) {
    const normalized = clean(tag)
    if (!normalized || normalized.length < 3) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    if (/^#[a-z]$/i.test(normalized)) continue
    seen.add(key)
    out.push(normalized)
    if (out.length >= (input.max ?? 16)) break
  }
  return out
}

/** Effective Instagram/X launch caption: hook, facts, CTA, SEO hashtag block. */
export function buildLaunchCaption(input: DnaCopyInput): string {
  const tracks = resolvedCopyTracks(input)
  const title = clean(input.title) || 'Untitled'
  const genre = clean(input.genre) || mostCommonCopyString(tracks.map((t) => t.genre)) || 'electronic'
  const subgenre = clean(input.subgenre) || mostCommonCopyString(tracks.map((t) => t.subgenre)) || ''
  const mood = moodPhrase(genre, subgenre || null)
  const artist =
    (input.contributors?.length ? displayArtistLine(input.contributors) : '') ||
    clean(input.artist) ||
    'SERGIK'
  const kind = releaseKind(input.type, tracks.length)
  const tempo = bpmRange(tracks)
  const lead =
    firstSentence(
      tracks.map((track) => usableNote(track.description)).find(Boolean) ||
        usableNote(input.description),
      140,
    ) || `${mood} built for late-night systems.`
  const facts = [
    tracks.length > 1 ? `${tracks.length}-track ${kind}` : kind,
    tempo,
    mood,
  ]
    .filter(Boolean)
    .join(' · ')
  const tags = buildLaunchHashtags({
    title,
    artist,
    genre,
    subgenre,
    type: input.type,
    tracks,
    max: 16,
  }).join(' ')

  return [
    `OUT NOW — "${title}" by ${artist} 🎧`,
    '',
    lead.replace(/[.!?…]+$/u, '') + '.',
    '',
    facts,
    'Stream everywhere · link in bio',
    '',
    tags,
  ]
    .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
    .join('\n')
    .trim()
}

/** Bandcamp / smart-link store page: SEO headline, engagement lead, tracklist, CTA. */
export function buildStoreDescription(input: DnaCopyInput): string {
  const tracks = resolvedCopyTracks(input)
  const title = clean(input.title) || 'Untitled'
  const genre = clean(input.genre) || mostCommonCopyString(tracks.map((t) => t.genre)) || 'electronic'
  const subgenre = clean(input.subgenre) || mostCommonCopyString(tracks.map((t) => t.subgenre)) || ''
  const mood = moodPhrase(genre, subgenre || null)
  const artist =
    (input.contributors?.length ? displayArtistLine(input.contributors) : '') ||
    clean(input.artist) ||
    'SERGIK'
  const kind = releaseKind(input.type, tracks.length)
  const tempo = bpmRange(tracks)
  const keys = keysLine(tracks)
  const label = clean(input.label) || artist
  const year =
    input.year && input.year > 1900 ? input.year : new Date().getFullYear()

  const metadataLead = usableNote(input.description)
  const pressNotes = tracks
    .map((track) => usableNote(track.description))
    .filter(Boolean)
  const leadA =
    firstSentence(metadataLead, 200) ||
    firstSentence(pressNotes[0], 200) ||
    `"${title}" is ${withArticle(mood)} ${kind} from ${artist}.`
  const leadB =
    firstSentence(
      pressNotes.find((note) => note.toLowerCase() !== leadA.toLowerCase()) || '',
      180,
    ) ||
    (tracks.length > 1
      ? `Play it in order — ${tracks.length} cuts shaped as one ${mood} listen.`
      : `Built for late-night systems and full-floor focus.`)

  const seoHeadline = `${title} by ${artist} — ${mood} ${kind}`
  const seoFacts = [
    tracks.length > 1 ? `${tracks.length}-track ${kind}` : kind,
    tempo,
    keys ? `Keys: ${keys}` : '',
    `${genre}${subgenre ? ` / ${subgenre}` : ''}`,
    label ? `Label: ${label}` : '',
    String(year),
  ]
    .filter(Boolean)
    .join(' · ')

  const tracklist = tracks.length
    ? [
        'Tracklist',
        ...tracks.map((track, index) => {
          const facts = copyTrackFacts(track)
          const billed =
            track.billed && /\sx\s|feat\./i.test(track.billed) ? ` · ${track.billed}` : ''
          const note = firstSentence(usableNote(track.description), 120)
          const line = `${index + 1}. ${track.title}${facts ? ` — ${facts}` : ''}${billed}`
          return note ? `${line}\n   ${note}` : line
        }),
      ].join('\n')
    : ''

  const artwork = artworkCreditsBlock(input.artworkCredits)
  const whyListen = [
    `Why press play: ${artist}'s ${mood} writing rewards a start-to-finish pass — not a shuffle skip.`,
    tempo ? `Tempo sits ${tempo.toLowerCase()}, with enough room for systems and headphones.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const cta = [
    `Listen to "${title}" by ${artist} — ${mood} ${kind}${tempo ? ` at ${tempo}` : ''}.`,
    'Stream everywhere. Support the release on Bandcamp / smart link.',
  ].join(' ')

  const keywordLine = uniqueCopyStrings([
    artist,
    title,
    genre,
    subgenre,
    kind,
    'electronic music',
    'new music',
    tempo,
  ])
    .filter(Boolean)
    .join(' · ')

  return [
    seoHeadline,
    seoFacts,
    '',
    structureStoreLead(leadA),
    structureStoreLead(leadB),
    '',
    whyListen,
    '',
    tracklist,
    artwork ? `\n${artwork}` : '',
    '',
    cta,
    '',
    `Tags: ${keywordLine}`,
  ]
    .filter((line, index, arr) => !(line === '' && (arr[index - 1] === '' || index === 0)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function structureStoreLead(text: string): string {
  const value = clean(text)
  if (!value) return ''
  return value.replace(/[.!?…]+$/u, '') + '.'
}

function usableNote(text?: string | null): string {
  const value = clean(text)
  if (!value || isAnalysisCopy(value)) return ''
  return value
}

function uniqueCopyStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const value = clean(raw)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function mostCommonCopyString(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, { label: string; count: number }>()
  for (const raw of values) {
    const value = clean(raw)
    if (!value) continue
    const key = value.toLowerCase()
    const prev = counts.get(key)
    if (prev) prev.count += 1
    else counts.set(key, { label: value, count: 1 })
  }
  let best: { label: string; count: number } | null = null
  for (const row of counts.values()) {
    if (!best || row.count > best.count) best = row
  }
  return best?.label || null
}

function releaseKind(type?: string | null, count = 0): string {
  const value = clean(type).toLowerCase()
  if (value === 'album') return 'album'
  if (value === 'single' || count <= 1) return 'single'
  return 'EP'
}

function resolvedCopyTracks(input: DnaCopyInput): DnaCopyTrack[] {
  if (input.tracks?.length) {
    return input.tracks
      .map((track) => ({
        ...track,
        title: clean(track.title) || 'Untitled',
      }))
      .filter((track) => track.title)
  }
  return (input.trackTitles || [])
    .map((title) => ({ title: clean(title) }))
    .filter((track) => track.title)
}

function bpmRange(tracks: DnaCopyTrack[]): string | null {
  const bpms = tracks
    .map((track) => track.bpm)
    .filter((bpm): bpm is number => typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0)
    .map((bpm) => Math.round(bpm))
  if (!bpms.length) return null
  const min = Math.min(...bpms)
  const max = Math.max(...bpms)
  return min === max ? `${min} BPM` : `${min}–${max} BPM`
}

function keysLine(tracks: DnaCopyTrack[]): string | null {
  const keys = uniqueCopyStrings(tracks.map((track) => track.key_signature))
  return keys.length ? keys.join(', ') : null
}

function copyTrackFacts(track: DnaCopyTrack): string {
  const mood =
    track.genre && track.subgenre
      ? `${track.genre} / ${track.subgenre}`
      : track.genre || track.subgenre || ''
  const groove = grooveLabel(track.drum_style)
  return [
    track.bpm ? `${Math.round(track.bpm)} BPM` : '',
    track.key_signature,
    mood,
    groove,
    track.timing_feel,
    Number.isFinite(Number(track.energy)) && Number(track.energy) > 0
      ? `energy ${Number(track.energy).toFixed(1)}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function sonicPaletteLine(tracks: DnaCopyTrack[]): string | null {
  const grooves = uniqueCopyStrings(tracks.map((track) => grooveLabel(track.drum_style)))
  const instruments = uniqueCopyStrings(tracks.flatMap((track) => track.instruments || [])).slice(0, 8)
  const feels = uniqueCopyStrings(tracks.map((track) => track.timing_feel))
  const parts = [
    grooves.length ? `Grooves: ${grooves.join(', ')}` : '',
    instruments.length ? `Palette: ${instruments.join(', ')}` : '',
    feels.length ? `Feel: ${feels.join(', ')}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join('. ') : null
}

function releaseMetadataDigest(input: DnaCopyInput): string {
  const artwork = artworkCreditsBlock(input.artworkCredits)
  const lines = [
    `Title: ${clean(input.title) || 'Untitled'}`,
    clean(input.type) && `Type: ${clean(input.type)}`,
    moodPhrase(input.genre || null, input.subgenre || null) &&
      `DSP genre: ${moodPhrase(input.genre || null, input.subgenre || null)}`,
    clean(input.artist) && `Album artist: ${clean(input.artist)}`,
    clean(input.label) && `Label: ${clean(input.label)}`,
    clean(input.language) && `Language: ${clean(input.language)}`,
    clean(input.streetDate) && `Street date: ${clean(input.streetDate)}`,
    artwork ? artwork.replace(/\n/g, ' · ') : '',
    usableNote(input.description)
      ? `Metadata description: ${firstSentence(usableNote(input.description), 280)}`
      : '',
  ].filter(Boolean)
  return lines.length ? `Release metadata\n${lines.join('\n')}` : ''
}

function numberedCatalogTracklist(tracks: DnaCopyTrack[]): string {
  if (!tracks.length) return ''
  return tracks
    .map((track, index) => {
      const facts = copyTrackFacts(track)
      const note = firstSentence(usableNote(track.description), 160)
      return [`${index + 1}. ${track.title}${facts ? ` — ${facts}` : ''}`, note]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

/** Compact ordered titles for DSP / store description (no press-note paragraphs). */
function orderedTracklistLines(tracks: DnaCopyTrack[]): string {
  if (!tracks.length) return ''
  return tracks
    .map((track, index) => {
      const billed =
        track.billed && /\sx\s|feat\./i.test(track.billed) ? ` — ${track.billed}` : ''
      return `${index + 1}. ${track.title}${billed}`
    })
    .join('\n')
}

function artworkCreditsBlock(credits?: DnaCopyInput['artworkCredits']): string {
  if (!credits) return ''
  const lines = [
    clean(credits.designer) && `Design: ${clean(credits.designer)}`,
    clean(credits.photographer) && `Photography: ${clean(credits.photographer)}`,
    clean(credits.illustrator) && `Illustration: ${clean(credits.illustrator)}`,
  ].filter(Boolean)
  return lines.length ? `Artwork\n${lines.join('\n')}` : ''
}

function stitchPressBlurb(input: {
  artist: string
  title: string
  kind: string
  tracks: DnaCopyTrack[]
  fallback: string
}): string {
  const notes = input.tracks
    .map((track) => ({ title: track.title, note: usableNote(track.description) }))
    .filter((row) => row.note)
  if (!notes.length) return input.fallback
  const opener =
    input.tracks.length > 1
      ? `${input.artist} presents "${input.title}", a ${input.tracks.length}-track ${input.kind}.`
      : `${input.artist} presents "${input.title}".`
  const lead = notes[0]
  const others = input.tracks
    .map((track) => track.title)
    .filter((title) => title.toLowerCase() !== lead.title.toLowerCase())
  const rest = others.length ? ` Also on the ${input.kind}: ${others.join(', ')}.` : ''
  return `${opener} ${lead.note}${rest}`.replace(/\s+/g, ' ').trim()
}

function countWord(n: number): string {
  const words = [
    '',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ]
  return words[n] || String(n)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripTitleLead(title: string, sentence: string): string {
  const trimmed = clean(sentence)
  if (!trimmed || !title) return trimmed
  const quoted = escapeRegExp(title)
  return trimmed
    .replace(new RegExp(`^["“']?${quoted}["”']?\\s*[—–:\\-]+\\s*`, 'i'), '')
    .replace(new RegExp(`^["“']${quoted}["”']\\s+`, 'i'), '')
    .replace(new RegExp(`^${quoted}\\s+`, 'i'), '')
    .replace(/^["“][^"”]{1,80}["”]\s+/, '')
    .trim()
}

function grooveLabel(drum?: string | null): string {
  const value = clean(drum).toLowerCase()
  if (!value) return ''
  if (value.includes('four')) return 'four-on-the-floor'
  if (value.includes('break')) return 'breakbeat'
  if (value.includes('half')) return 'half-time'
  if (value.includes('dembow')) return 'dembow'
  return value.replace(/-/g, ' ')
}

function trackBeat(track: DnaCopyTrack): string {
  const fromNote = stripTitleLead(track.title, firstSentence(usableNote(track.description), 170))
  if (fromNote) return fromNote
  const intention = firstSentence(usableNote(track.intention), 140)
  if (intention) return intention
  const groove = grooveLabel(track.drum_style)
  const facts = [
    track.bpm ? `${Math.round(track.bpm)} BPM` : '',
    groove,
    track.key_signature ? `in ${track.key_signature}` : '',
  ].filter(Boolean)
  return facts.length ? `a ${facts.join(' ')} cut` : ''
}

function titledBeat(track: DnaCopyTrack): string {
  const name = track.billed && /\sx\s/i.test(track.billed)
    ? `${track.title} (${track.billed})`
    : track.title
  const beat = trackBeat(track).replace(/[.!?…]+$/u, '').trim()
  if (!beat) return name
  if (/^(arrives|doesn't|does not|plants|opens|lets|is|lands|refuses|holds|keeps|pushes|interrogates|doesn't settle)/i.test(beat)) {
    return `${name}, which ${beat.charAt(0).toLowerCase()}${beat.slice(1)}`
  }
  return `${name}: ${beat}`
}

function energyScore(track: DnaCopyTrack): number | null {
  const energy = Number(track.energy)
  if (Number.isFinite(energy) && energy > 0) return energy
  const dance = Number(track.danceability)
  if (Number.isFinite(dance) && dance > 0) return dance
  return null
}

function sequenceLead(prev: DnaCopyTrack | null, track: DnaCopyTrack, index: number, last: boolean): string {
  const prevScore = prev ? energyScore(prev) : null
  const nextScore = energyScore(track)
  if (index === 0) return 'It opens on'
  if (last) {
    if (prevScore != null && nextScore != null && nextScore < prevScore - 0.3) {
      return 'It lands on'
    }
    return 'It closes on'
  }
  if (prevScore != null && nextScore != null) {
    if (nextScore > prevScore + 0.35) return 'The energy lifts into'
    if (nextScore < prevScore - 0.35) return 'Space opens into'
  }
  return 'The sequence holds through'
}

/** DSP/store blurb: journalist listening journey from catalog press notes, titles, and Sonic DNA. */
export function releaseDescriptionFromCatalog(input: DnaCopyInput): string {
  const tracks = resolvedCopyTracks(input)
  const title = clean(input.title) || 'Untitled'
  const artist = clean(input.artist) || 'SERGIK'
  const kind = releaseKind(input.type, tracks.length)
  const mood = moodPhrase(input.genre || null, input.subgenre || null)
  const tempo = bpmRange(tracks)
  const year = input.year && input.year > 1900 ? input.year : new Date().getFullYear()
  const fullLead = tracks.map((track) => usableNote(track.description)).find(Boolean)

  let journey = ''
  if (!tracks.length) {
    journey = usableNote(input.description) || `${title} by ${artist}.`
  } else if (tracks.length <= 1) {
    journey = fullLead || `${title} is ${withArticle(mood)} single${tempo ? ` at ${tempo}` : ''}.`
  } else {
    const opener = [
      `"${title}" is a ${countWord(tracks.length)}-track ${kind} listen`,
      ` — ${mood}${tempo ? `, ${tempo}` : ''}.`,
      ` ${artist} wrote it as one room, start to finish.`,
    ].join('')

    const peakScore = tracks.reduce<{ title: string; score: number }>((best, track) => {
      const score = energyScore(track)
      return score != null && score > best.score ? { title: track.title, score } : best
    }, { title: tracks[0]?.title || title, score: -1 })

    const walk = tracks.map((track, index) => {
      const lead = sequenceLead(tracks[index - 1] || null, track, index, index === tracks.length - 1)
      const peak =
        peakScore.score > 0 &&
        track.title === peakScore.title &&
        index > 0 &&
        index < tracks.length - 1
          ? ' This is the peak of the listen.'
          : ''
      return `${lead} ${titledBeat(track)}.${peak}`
    })

    const lastIntention = firstSentence(usableNote(tracks[tracks.length - 1]?.intention), 140)
    const closer = lastIntention
      ? ` Play it in order — ${lastIntention.charAt(0).toLowerCase()}${lastIntention.slice(1)}`.replace(/\.\s*$/, '.')
      : ` Play it in order. The titles already tell you where the room is going.`

    journey = [opener, walk.join(' '), closer.replace(/\s+/g, ' ').trim()]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const tracklist = orderedTracklistLines(tracks)
  const credits = input.contributors?.length
    ? creditsBlockFromContributors(input.contributors, year)
    : ''
  const artwork = artworkCreditsBlock(input.artworkCredits)

  return [
    journey.slice(0, 1400),
    tracklist ? `Tracklist\n${tracklist}` : '',
    credits ? `Credits\n${credits}` : '',
    artwork,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function catalogCopyFacts(input: DnaCopyInput): CatalogCopyFacts {
  const tracks = resolvedCopyTracks(input)
  return {
    trackCount: tracks.length,
    mood: moodPhrase(input.genre || null, input.subgenre || null),
    tempo: bpmRange(tracks),
    keys: keysLine(tracks),
    pressNotes: tracks.filter((track) => Boolean(usableNote(track.description))).length,
  }
}

export function catalogCopyPromptDigest(input: DnaCopyInput): string {
  const tracks = resolvedCopyTracks(input)
  const header = releaseMetadataDigest(input)
  if (!tracks.length) {
    return [header, 'No catalog tracks yet.'].filter(Boolean).join('\n\n')
  }
  const body = tracks
    .map((track, index) => {
      const facts = copyTrackFacts(track)
      const note = firstSentence(usableNote(track.description), 200)
      const intention = firstSentence(usableNote(track.intention), 140)
      const instruments = (track.instruments || []).filter(Boolean).slice(0, 8)
      const lyrics = firstSentence(usableNote(track.lyrics_excerpt), 120)
      return [
        `${index + 1}. ${track.title}${facts ? ` — ${facts}` : ''}${
          track.billed && /\sx\s|feat\./i.test(track.billed) ? ` · ${track.billed}` : ''
        }`,
        instruments.length ? `Instruments: ${instruments.join(', ')}` : '',
        note ? `Press: ${note}` : '',
        intention ? `Intention: ${intention}` : '',
        lyrics ? `Lyrics: ${lyrics}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
  const palette = sonicPaletteLine(tracks)
  return [header, 'Sonic DNA + catalog', palette, body].filter(Boolean).join('\n\n')
}

export function dnaCopyInputFromCatalog(input: {
  title: string
  type?: string | null
  genre?: string | null
  subgenre?: string | null
  description?: string | null
  artist?: string | null
  label?: string | null
  language?: string | null
  streetDate?: string | null
  year?: number | null
  tracks?: CatalogCopySourceTrack[]
  artwork_designer?: string | null
  artwork_photographer?: string | null
  artwork_illustrator?: string | null
}): DnaCopyInput {
  const sorted = sortCatalogCopyTracks(input.tracks || [])
  const tracks: DnaCopyTrack[] = sorted.map((track) => {
    const identity = track.identity || {}
    const bpm = Number(identity.bpm)
    const instruments = Array.isArray(identity.instruments)
      ? identity.instruments.map((item) => clean(item)).filter(Boolean)
      : []
    return {
      title: clean(track.title) || 'Untitled',
      description: identity.description || null,
      intention: identity.intention || null,
      genre: identity.genre || null,
      subgenre: identity.subgenre || null,
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      key_signature: identity.key_signature || null,
      drum_style: identity.drum_style || null,
      energy: Number.isFinite(Number(identity.energy)) ? Number(identity.energy) : null,
      danceability: Number.isFinite(Number(identity.danceability))
        ? Number(identity.danceability)
        : null,
      billed: displayArtistLine(parseContributors(track.contributors)),
      instruments,
      timing_feel: identity.timing_feel || null,
      scale: identity.scale || null,
      time_signature: identity.time_signature || null,
      lyrics_excerpt: identity.lyrics_excerpt || null,
    }
  })
  const designer = clean(input.artwork_designer)
  const photographer = clean(input.artwork_photographer)
  const illustrator = clean(input.artwork_illustrator)
  return {
    title: clean(input.title) || 'Untitled',
    type: input.type || null,
    genre: mostCommonCopyString(tracks.map((track) => track.genre)) || input.genre || null,
    subgenre: mostCommonCopyString(tracks.map((track) => track.subgenre)) || input.subgenre || null,
    description: input.description || null,
    artist: input.artist || null,
    label: input.label || null,
    language: input.language || null,
    streetDate: input.streetDate || null,
    trackTitles: tracks.map((track) => track.title),
    tracks,
    year: input.year && input.year > 1900 ? input.year : null,
    contributors: flattenReleaseContributors(sorted),
    artworkCredits:
      designer || photographer || illustrator
        ? {
            designer: designer || null,
            photographer: photographer || null,
            illustrator: illustrator || null,
          }
        : undefined,
  }
}

function sortCatalogCopyTracks(tracks: CatalogCopySourceTrack[]): CatalogCopySourceTrack[] {
  return tracks.slice().sort((a, b) => {
    const aNumber = Number(a.track_number)
    const bNumber = Number(b.track_number)
    const aOk = Number.isFinite(aNumber) && aNumber > 0
    const bOk = Number.isFinite(bNumber) && bNumber > 0
    if (aOk && bOk && aNumber !== bNumber) return aNumber - bNumber
    if (aOk !== bOk) return aOk ? -1 : 1
    return clean(a.title).localeCompare(clean(b.title))
  })
}

/** Build marketing copy from catalog press notes, Sonic DNA, and credits — no LLM. */
export function marketingCopyFromDna(input: DnaCopyInput): MarketingCopy {
  const tracks = resolvedCopyTracks(input)
  const title = clean(input.title) || 'Untitled'
  const genre = clean(input.genre) || mostCommonCopyString(tracks.map((track) => track.genre)) || 'electronic'
  const subgenre = clean(input.subgenre) || mostCommonCopyString(tracks.map((track) => track.subgenre)) || ''
  const mood = moodPhrase(genre, subgenre || null)
  const billed = input.contributors?.length ? displayArtistLine(input.contributors) : ''
  const artist = billed || clean(input.artist) || 'SERGIK'
  const year = input.year && input.year > 1900 ? input.year : new Date().getFullYear()
  const kind = releaseKind(input.type, tracks.length)
  const catalogBlurb = releaseDescriptionFromCatalog({
    ...input,
    description: null,
    tracks,
    genre,
    subgenre,
  })
  const metadataBlurb = usableNote(input.description)
  const desc = metadataBlurb || catalogBlurb
  const leadNote = tracks.map((track) => usableNote(track.description)).find(Boolean) || ''
  const tempo = bpmRange(tracks)
  const keys = keysLine(tracks)
  const palette = sonicPaletteLine(tracks)
  const hookBase =
    firstSentence(leadNote, 160) ||
    firstSentence(metadataBlurb, 160) ||
    `${title} — ${mood} from ${artist}.`
  const hookExtras = [tempo, keys ? `keys ${keys}` : ''].filter(Boolean).join(' · ')
  const hook = hookExtras ? `${hookBase.replace(/[.!?…]+$/u, '')} (${hookExtras}).` : hookBase
  const pressFallback =
    desc ||
    `${artist} unveils "${title}", a ${mood} release shaped for club systems and late-night listening.`
  const press = stitchPressBlurb({ artist, title, kind, tracks, fallback: pressFallback })
  const comparable = subgenre ? `${genre} / ${subgenre}` : genre
  const musicCredits = input.contributors?.length
    ? creditsBlockFromContributors(input.contributors, year)
    : `Written & produced by ${artist}.\nPublished © ${year} ${artist}. All rights reserved.`
  const artwork = artworkCreditsBlock(input.artworkCredits)
  const label = clean(input.label)

  return {
    elevator_pitch: hook.slice(0, 220),
    press_blurb: press,
    spotify_pitch: [
      `Mood: ${mood}${tempo ? `, ${tempo}` : ''}${keys ? `. Keys: ${keys}` : ''}.`,
      palette ? `${palette}.` : '',
      `For fans of ${comparable}.`,
      hook,
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 500),
    social_caption: buildLaunchCaption({
      ...input,
      title,
      genre,
      subgenre,
      artist,
      tracks,
    }),
    store_description: buildStoreDescription({
      ...input,
      title,
      genre,
      subgenre,
      artist,
      tracks,
      label: label || input.label,
      year,
    }),
    credits_block: [musicCredits, artwork, label ? `Label: ${label}.` : '']
      .filter(Boolean)
      .join('\n\n'),
  }
}

export function dnaCopyInputFromDraft(draft: {
  release: VaultReleaseDraft
  tracks: VaultTrackDraft[]
}): DnaCopyInput {
  const yearRaw = draft.release.release_date?.slice(0, 4)
  const year = yearRaw ? Number(yearRaw) : null
  return dnaCopyInputFromCatalog({
    title: draft.release.title,
    type: draft.release.type,
    genre: draft.release.genre,
    subgenre: draft.release.subgenre,
    description: draft.release.description,
    artist: draft.release.label_name,
    year: year && year > 1900 ? year : null,
    tracks: draft.tracks,
  })
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
