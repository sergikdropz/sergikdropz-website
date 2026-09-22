import { ensureProducerCredits, namesForRole, parseContributors, storeTitleFromArtistPrefix } from '@/lib/studio/track-credits'
import { writerLegalNameIssues } from '@/lib/studio/songwriter'
import { normalizeSplitRows } from '@/lib/studio/import-parse'
import { validateISRC } from '@/lib/studio/isrc-format'

export const DSP_PRIMARY_GENRES = [
  'Alternative',
  'Blues',
  'Classical',
  'Country',
  'Dance',
  'Electronic',
  'Folk',
  'Hip-Hop/Rap',
  'Holiday',
  'Jazz',
  'Latin',
  'Metal',
  'New Age',
  'Pop',
  'R&B/Soul',
  'Reggae',
  'Rock',
  'Soundtrack',
  'Spoken Word',
  'World',
] as const

export type DspPrimaryGenre = (typeof DSP_PRIMARY_GENRES)[number]

export const DSP_SECONDARY_BY_PRIMARY: Record<string, string[]> = {
  Dance: [
    'Breakbeat',
    'Deep House',
    'Garage',
    'Hardcore',
    'House',
    'Jungle/Drum\'n\'Bass',
    'Tech House',
    'Techno',
    'Trance',
  ],
  Electronic: [
    'Ambient',
    'Bass',
    'Downtempo',
    'Dubstep',
    'Electro',
    'Electronica',
    'IDM',
    'Minimal',
    'Minimal House',
    'Tech House',
    'Techno',
  ],
  'Hip-Hop/Rap': ['Alternative Rap', 'Bass', 'Trap', 'West Coast'],
  Pop: ['Dance Pop', 'Electropop', 'Indie Pop'],
  Rock: ['Alternative', 'Indie Rock', 'Psychedelic'],
}

export const TRACK_ORIGINS = ['original', 'cover'] as const
export type TrackOrigin = (typeof TRACK_ORIGINS)[number]

export const INGEST_ATTESTATION_FIELDS = [
  {
    id: 'worldwide_rights',
    label:
      'I recorded this music and am authorized to sell it in stores worldwide and collect royalties.',
  },
  {
    id: 'no_other_artist_names',
    label:
      'I am not using any other artist’s name in my artist name, song titles, or album title without their approval.',
  },
  {
    id: 'no_fake_streams',
    label:
      'I will not use promo services that guarantee streams or playlisting. Fake or bot streams get the release taken down.',
  },
  {
    id: 'youtube_music_understood',
    label:
      'I selected YouTube Music, so this master may appear on YouTube as well as YouTube Music.',
  },
  {
    id: 'artwork_owned',
    label:
      'I own this artwork and everything in it. It has no URLs, @handles, store logos, prices, or reused cover from another release.',
  },
] as const

export type IngestAttestationId = (typeof INGEST_ATTESTATION_FIELDS)[number]['id']

export type IngestAttestations = Record<IngestAttestationId, boolean>

export const DEFAULT_INGEST_ATTESTATIONS: IngestAttestations = {
  worldwide_rights: false,
  no_other_artist_names: false,
  no_fake_streams: false,
  youtube_music_understood: false,
  artwork_owned: false,
}

const ATTESTATION_IDS = new Set<string>(INGEST_ATTESTATION_FIELDS.map((item) => item.id))

export type TitlePreviewInput = {
  title: string
  version?: string | null
  featured?: string[]
  remixer?: string[]
  billedArtists?: string[]
  origin?: TrackOrigin | null
  coverOriginalArtist?: string | null
}

export type TitlePreview = {
  display: string
  cleanedTitle: string
  versionLabel: string | null
  warnings: string[]
}

export type DspIngestTrack = {
  id?: string
  title?: string | null
  version?: string | null
  contributors?: unknown
  origin?: string | null
  cover_original_title?: string | null
  cover_original_artist?: string | null
  writer_legal_names?: string | null
  splits?: unknown
  ai_generated?: boolean | null
  radio_edit?: boolean | null
  paired_explicit_isrc?: string | null
  preview_start_seconds?: number | null
  explicit?: boolean | null
  mechanical_licensed?: boolean | null
  contains_samples?: boolean | null
  /** Required for previously-released / switch continuity. */
  isrc_full?: string | null
  wav_url?: string | null
}

export type DspIngestRelease = {
  title?: string | null
  artwork_url?: string | null
  genre?: string | null
  subgenre?: string | null
  release_date?: string | null
  previously_released?: boolean | null
  previous_isrc?: string | null
  previous_upc?: string | null
  upc?: string | null
  language?: string | null
  youtube_artist_id?: string | null
  instagram_handle?: string | null
  facebook_page_id?: string | null
  ingest_attestations?: unknown
  artwork_owned?: boolean | null
  album_artist?: string | null
  distributor_status?: string | null
  /** marketing_copy._stream_continuity or parsed state */
  stream_continuity?: unknown
  store_link_count?: number | null
}

export type DspIngestIssue = {
  id: string
  label: string
  hint?: string
  hard: boolean
}

export type DspIngestResult = {
  ok: boolean
  blockers: string[]
  warnings: string[]
  issues: DspIngestIssue[]
  checks: {
    titles_clean: boolean
    apple_credits: boolean
    legal_writers: boolean
    collab_splits: boolean
    ai_declared: boolean
    origin_ok: boolean
    previously_released_declared: boolean
    attestations_complete: boolean
    artwork_policy: boolean
    dsp_genre: boolean
    artist_profiles: boolean
    street_date_lead: boolean
    preview_clip: boolean
    radio_pair: boolean
    stream_continuity_masters: boolean
    stream_continuity_isrcs: boolean
  }
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function coerceTriStateBoolean(value: unknown): boolean | null {
  if (value === true || value === 'yes' || value === 'true') return true
  if (value === false || value === 'no' || value === 'false') return false
  return null
}

export function normalizePreviewStart(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function parseTrackOrigin(value: unknown): TrackOrigin {
  return value === 'cover' ? 'cover' : 'original'
}

export function parseAttestations(raw: unknown): IngestAttestations {
  const next = { ...DEFAULT_INGEST_ATTESTATIONS }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return next
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (ATTESTATION_IDS.has(key) && value === true) {
      next[key as IngestAttestationId] = true
    }
  }
  return next
}

export function mergeAttestations(current: unknown, patch: unknown): IngestAttestations {
  return { ...parseAttestations(current), ...parseAttestations(patch) }
}

export function attestationsComplete(raw: unknown): boolean {
  const parsed = parseAttestations(raw)
  return INGEST_ATTESTATION_FIELDS.every((field) => parsed[field.id])
}

export function secondaryGenresFor(primary: string | null | undefined): string[] {
  const key = clean(primary)
  return DSP_SECONDARY_BY_PRIMARY[key] || []
}

export function isDspPrimaryGenre(value: string | null | undefined): boolean {
  const text = clean(value)
  return DSP_PRIMARY_GENRES.some((genre) => genre.toLowerCase() === text.toLowerCase())
}

const SONIC_TO_DSP: Array<{ test: RegExp; primary: DspPrimaryGenre; secondary?: string }> = [
  { test: /tech house/i, primary: 'Electronic', secondary: 'Tech House' },
  { test: /deep house|deep n funky/i, primary: 'Dance', secondary: 'Deep House' },
  { test: /minimal house/i, primary: 'Electronic', secondary: 'Minimal House' },
  { test: /funky house|afro house|disco house/i, primary: 'Dance', secondary: 'House' },
  { test: /\bhouse\b/i, primary: 'Dance', secondary: 'House' },
  { test: /detroit techno|\btechno\b/i, primary: 'Electronic', secondary: 'Techno' },
  { test: /breakbeat|breaks/i, primary: 'Dance', secondary: 'Breakbeat' },
  { test: /drum.?n.?bass|\bdnb\b|jungle/i, primary: 'Dance', secondary: "Jungle/Drum'n'Bass" },
  { test: /dubstep/i, primary: 'Electronic', secondary: 'Dubstep' },
  { test: /ambient/i, primary: 'Electronic', secondary: 'Ambient' },
  { test: /downtempo/i, primary: 'Electronic', secondary: 'Downtempo' },
  { test: /hip.?hop|\brap\b/i, primary: 'Hip-Hop/Rap' },
  { test: /experimental bass|bass music/i, primary: 'Electronic', secondary: 'Bass' },
  { test: /\belectronic\b/i, primary: 'Electronic' },
  { test: /\bdance\b/i, primary: 'Dance' },
]

export function mapSonicGenreToDsp(
  genre?: string | null,
  subgenre?: string | null,
): { primary: string; secondary: string; mapped: boolean } {
  const primaryIn = clean(genre)
  const secondaryIn = clean(subgenre)
  if (isDspPrimaryGenre(primaryIn)) {
    const allowed = secondaryGenresFor(primaryIn)
    const secondary =
      allowed.find((item) => item.toLowerCase() === secondaryIn.toLowerCase()) || secondaryIn
    return { primary: canonicalPrimary(primaryIn), secondary, mapped: false }
  }
  const hit = matchSonicRow(primaryIn) || matchSonicRow(secondaryIn)
  if (!hit) return { primary: primaryIn, secondary: secondaryIn, mapped: false }
  const allowed = secondaryGenresFor(hit.primary)
  const keepSecondary =
    secondaryIn && secondaryIn.toLowerCase() !== primaryIn.toLowerCase() ? secondaryIn : ''
  const secondary =
    allowed.find((item) => item.toLowerCase() === keepSecondary.toLowerCase()) ||
    keepSecondary ||
    hit.secondary ||
    ''
  return { primary: hit.primary, secondary, mapped: true }
}

function canonicalPrimary(value: string): string {
  return DSP_PRIMARY_GENRES.find((genre) => genre.toLowerCase() === value.toLowerCase()) || value
}

function matchSonicRow(text: string): (typeof SONIC_TO_DSP)[number] | null {
  if (!clean(text)) return null
  return SONIC_TO_DSP.find((row) => row.test.test(text)) || null
}

const FEAT_IN_TITLE = /\b(?:feat(?:uring)?\.?|ft\.?)\b/i
const YEAR_IN_TITLE = /\b(?:19|20)\d{2}\b/
const PRESENTS_IN_TITLE = /\bpresents?\b/i
const EMOJI_IN_TITLE = /\p{Extended_Pictographic}/u

function stripFeatClause(title: string): string {
  return title
    .replace(/\s*[(\[]?\s*(?:feat(?:uring)?\.?|ft\.?)\s+[^)\]]+[)\]]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function toBracketVersion(value: string): string {
  const inner = value.replace(/^[(\[]/, '').replace(/[)\]]$/, '').trim()
  return inner ? `[${inner}]` : ''
}

export function previewStoreTitle(input: TitlePreviewInput): TitlePreview {
  const warnings: string[] = []
  const rawTitle = clean(input.title)
  let cleanedTitle = stripFeatClause(rawTitle)

  if (!rawTitle) warnings.push('Add a song title.')
  const billed = (input.billedArtists || []).map(clean).filter(Boolean)
  const storeTitle = storeTitleFromArtistPrefix(cleanedTitle, billed)
  if (storeTitle.prefix) {
    warnings.push(
      `Store title should be “${storeTitle.title}”, not “${storeTitle.prefix} - …”`,
    )
    cleanedTitle = storeTitle.title
  }
  if (FEAT_IN_TITLE.test(rawTitle)) {
    warnings.push('Featured artists go in credits, not the song title.')
  }
  if (YEAR_IN_TITLE.test(rawTitle)) {
    warnings.push('Remove years or dates from the song title.')
  }
  if (PRESENTS_IN_TITLE.test(rawTitle)) {
    warnings.push('Do not use “Presents…” in titles or artist names.')
  }
  if (EMOJI_IN_TITLE.test(rawTitle)) {
    warnings.push('Streaming services reject emoji in titles.')
  }
  if (input.origin === 'cover' && input.coverOriginalArtist) {
    const artist = clean(input.coverOriginalArtist)
    if (artist && rawTitle.toLowerCase().includes(artist.toLowerCase())) {
      warnings.push('Do not put the original artist’s name in a cover song title.')
    }
  }

  const remixers = (input.remixer || []).map(clean).filter(Boolean)
  const versionRaw = clean(input.version)
  let versionLabel: string | null = versionRaw ? toBracketVersion(versionRaw) : null
  if (remixers.length) {
    const remixVersion = `${remixers.join(', ')} Remix`
    if (!versionRaw.toLowerCase().includes('remix')) {
      versionLabel = `[${remixVersion}]`
    }
  }
  if (versionLabel && versionRaw) {
    const escaped = versionRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleanedTitle = cleanedTitle
      .replace(new RegExp(`\\s*[\\(\\[]${escaped}[\\)\\]]`, 'i'), '')
      .trim()
  }

  const display = [cleanedTitle || rawTitle || 'Untitled', versionLabel].filter(Boolean).join(' ')
  return { display, cleanedTitle: cleanedTitle || rawTitle, versionLabel, warnings }
}

export { writerLegalNameIssues } from '@/lib/studio/songwriter'

export function appleCreditsReady(contributors: unknown): { ok: boolean; missing: string[] } {
  const rows = ensureProducerCredits(parseContributors(contributors))
  const missing: string[] = []
  if (!namesForRole(rows, 'primary').length) missing.push('performer')
  if (!namesForRole(rows, 'producer').length) missing.push('producer')
  return { ok: missing.length === 0, missing }
}

export function artworkPolicyWarnings(input: {
  fileName?: string | null
  url?: string | null
  reused?: boolean
}): string[] {
  const haystack = `${clean(input.fileName)} ${clean(input.url)}`.toLowerCase()
  const warnings: string[] = []
  if (/(https?:\/\/|www\.|\.com\/|@)/i.test(haystack) && /artwork|cover|jpg|png|webp/i.test(haystack)) {
    warnings.push('Artwork file name looks like it contains a URL or @handle.')
  }
  if (/\b(spotify|itunes|apple.?music|youtube|tidal)\b/i.test(haystack)) {
    warnings.push('Stores reject artwork that includes store logos or names.')
  }
  if (input.reused) {
    warnings.push('This cover is already used on another release. Stores want unique artwork per album.')
  }
  return warnings
}

export function streetDateHint(
  date: string | null | undefined,
  now = new Date(),
): { daysAhead: number | null; warning?: string } {
  const text = clean(date)
  if (!text) return { daysAhead: null, warning: 'Set a street date.' }
  const target = new Date(`${text}T00:00:00`)
  if (Number.isNaN(target.getTime())) return { daysAhead: null, warning: 'Street date is not a valid date.' }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysAhead = Math.round((target.getTime() - start.getTime()) / 86_400_000)
  if (daysAhead < 0) {
    return {
      daysAhead,
      warning: 'Date is in the past. If this already went live, mark it previously released and reuse the ISRC/UPC.',
    }
  }
  if (daysAhead < 7) {
    return {
      daysAhead,
      warning: 'Set the street date at least one week out to improve playlist chances.',
    }
  }
  return { daysAhead }
}

function issue(
  id: string,
  label: string,
  hard: boolean,
  hint?: string,
): DspIngestIssue {
  return { id, label, hint, hard }
}

export function evaluateTrackIngest(
  track: DspIngestTrack,
  opts: { albumArtist?: string | null } = {},
): DspIngestIssue[] {
  const issues: DspIngestIssue[] = []
  const origin = parseTrackOrigin(track.origin)
  const credits = parseContributors(track.contributors)
  const preview = previewStoreTitle({
    title: track.title || '',
    version: track.version,
    featured: namesForRole(credits, 'featured'),
    remixer: namesForRole(credits, 'remixer'),
    billedArtists: namesForRole(credits, 'primary'),
    origin,
    coverOriginalArtist: track.cover_original_artist,
  })
  const titleHard = preview.warnings.some((warning) =>
    /feat|year|emoji|original artist|Presents|store title/i.test(warning),
  )
  for (const warning of preview.warnings) {
    issues.push(issue(`title:${track.id || track.title}`, warning, titleHard))
  }

  const apple = appleCreditsReady(track.contributors)
  if (!apple.ok) {
    issues.push(
      issue(
        `apple:${track.id || track.title}`,
        `Apple Music needs a ${apple.missing.join(' and ')} credit.`,
        true,
        'Add performer (primary artist) and producer on Catalog.',
      ),
    )
  }

  const writerIssues = writerLegalNameIssues(
    track.writer_legal_names,
    ['sergik', 'sergikdropz', clean(opts.albumArtist)].filter(Boolean),
    track.contributors,
  )
  for (const writerIssue of writerIssues) {
    issues.push(issue(`writer:${track.id || track.title}`, writerIssue, true))
  }

  const billed = namesForRole(credits, 'primary')
  const owners = billed.length ? billed : ['SERGIK']
  const splitRows = normalizeSplitRows(track.splits)
  const splitTotal = splitRows.reduce((sum, row) => sum + row.percentage, 0)
  const splitNames = new Set(splitRows.map((row) => row.name.toLowerCase()).filter(Boolean))
  const splitOk = splitRows.length > 0 && Math.abs(splitTotal - 100) < 0.01
  if (owners.length > 1) {
    const missing = owners.filter((name) => !splitNames.has(name.toLowerCase()))
    if (!splitOk) {
      issues.push(
        issue(
          `splits:${track.id || track.title}`,
          `Add a 100% split sheet that includes ${owners.join(' x ')}.`,
          true,
          'Catalog → Edit splits, or Rights → Seed splits from credits.',
        ),
      )
    } else if (missing.length) {
      issues.push(
        issue(
          `splits:${track.id || track.title}`,
          `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} billed and need a split share.`,
          true,
        ),
      )
    }
  }

  if (track.ai_generated == null) {
    issues.push(
      issue(
        `ai:${track.id || track.title}`,
        'Declare whether this recording uses AI-generated music, vocals, or lyrics.',
        true,
        'Mixing or mastering with AI does not count.',
      ),
    )
  }

  if (origin === 'cover') {
    if (!clean(track.cover_original_title) || !clean(track.cover_original_artist)) {
      issues.push(
        issue(
          `cover:${track.id || track.title}`,
          'Cover songs need the original title and original artist, plus a mechanical license.',
          true,
        ),
      )
    }
    if (track.mechanical_licensed !== true) {
      issues.push(
        issue(
          `mechanical:${track.id || track.title}`,
          'Mark the mechanical license for this cover before ingest.',
          true,
          'Rights → cover packet.',
        ),
      )
    }
  }

  if (track.radio_edit && !clean(track.paired_explicit_isrc)) {
    issues.push(
      issue(
        `radio:${track.id || track.title}`,
        'Radio edit should point at the explicit version’s ISRC.',
        false,
      ),
    )
  }
  if (track.paired_explicit_isrc && !validateISRC(String(track.paired_explicit_isrc))) {
    issues.push(
      issue(`radio-isrc:${track.id || track.title}`, 'Paired explicit ISRC is not a valid 12-character code.', true),
    )
  }

  if (track.preview_start_seconds != null) {
    const start = Number(track.preview_start_seconds)
    if (!Number.isFinite(start) || start < 0) {
      issues.push(issue(`preview:${track.id || track.title}`, 'Preview start must be 0 or later (seconds).', true))
    }
  }

  return issues
}

export function evaluateReleaseIngest(
  release: DspIngestRelease,
  tracks: DspIngestTrack[],
  opts: { artworkReused?: boolean } = {},
): DspIngestResult {
  const issues: DspIngestIssue[] = []

  if (!isDspPrimaryGenre(release.genre)) {
    issues.push(
      issue(
        'genre',
        'Pick a DSP primary genre (Apple/Spotify list), not a free-text Sonic DNA class.',
        true,
        'Electronic or Dance for SERGIK; Tech House / House as secondary.',
      ),
    )
  }

  if (!clean(release.youtube_artist_id)) {
    issues.push(
      issue('youtube-artist', 'Add the YouTube channel so this release lands on the existing SERGIK page.', false),
    )
  }
  if (!clean(release.instagram_handle)) {
    issues.push(
      issue('instagram-artist', 'Add the Instagram handle so Meta attaches this to the existing artist.', false),
    )
  }
  if (!clean(release.facebook_page_id)) {
    issues.push(
      issue('facebook-artist', 'Add the Facebook page so this appears with your other SERGIK music.', false),
    )
  }

  const dateHint = streetDateHint(release.release_date)
  if (dateHint.warning && dateHint.daysAhead == null && !release.release_date) {
    issues.push(issue('date', dateHint.warning, true))
  } else if (dateHint.warning) {
    issues.push(issue('date-lead', dateHint.warning, false))
  }

  if (release.previously_released == null) {
    issues.push(
      issue(
        'previous',
        'Say whether this single was previously released.',
        true,
        'If it already lives on DistroKid or another DSP, reuse that ISRC and UPC — do not mint a new QTA53 code.',
      ),
    )
  } else if (release.previously_released) {
    const hasId = clean(release.previous_isrc) || clean(release.previous_upc)
    if (!hasId) {
      issues.push(
        issue('previous-ids', 'Previously released titles need the existing ISRC and/or UPC.', true),
      )
    }
    if (clean(release.previous_isrc) && !validateISRC(release.previous_isrc || '')) {
      issues.push(issue('previous-isrc', 'Previous ISRC is not a valid 12-character code.', true))
    }

    // Stream-safe switch: keep identical ISRCs + original masters (LANDR rules).
    if (tracks.length > 0) {
      const missingIsrc = tracks.filter((track) => !clean(track.isrc_full))
      if (missingIsrc.length) {
        issues.push(
          issue(
            'switch-isrc',
            'Reuse the live ISRCs on every track — do not mint new QTA53 codes when switching distributors.',
            true,
            missingIsrc.map((t) => clean(t.title) || 'Untitled').join(', '),
          ),
        )
      }
      const missingWav = tracks.filter((track) => !clean(track.wav_url))
      if (missingWav.length) {
        issues.push(
          issue(
            'switch-masters',
            'Attach the exact original master WAV for every track so DSPs can merge streams.',
            true,
            'Remasters and new bounces will not transition cleanly.',
          ),
        )
      }
      const upcLive = clean(release.upc) || clean(release.previous_upc)
      if (!upcLive && !(release.store_link_count && release.store_link_count > 0)) {
        issues.push(
          issue(
            'switch-upc',
            'Previously released products need the existing UPC or at least one live store link.',
            true,
          ),
        )
      }
    }

    const continuityRaw = release.stream_continuity
    if (continuityRaw) {
      // Soft dual-live reminder when checklist says submitted but not merged.
      const phases =
        continuityRaw && typeof continuityRaw === 'object' && !Array.isArray(continuityRaw)
          ? ((continuityRaw as { phases?: Record<string, boolean> }).phases || {})
          : {}
      if (phases.submitted_new && !phases.merged_confirmed) {
        issues.push(
          issue(
            'switch-overlap',
            'Dual-live overlap is expected — confirm Spotify/Apple merged before DistroKid takedown.',
            false,
          ),
        )
      }
      if (phases.old_takedown_safe && !phases.merged_confirmed) {
        issues.push(
          issue(
            'switch-takedown',
            'Do not takedown the old distributor until DSP merge is confirmed.',
            true,
          ),
        )
      }
    }
  }

  const attestations = parseAttestations(release.ingest_attestations)
  if (release.artwork_owned === true) attestations.artwork_owned = true
  if (!attestationsComplete(attestations)) {
    issues.push(
      issue('attestations', 'Complete the DSP rights attestations before go-live.', true, 'Rights or Launch.'),
    )
  }

  for (const warning of artworkPolicyWarnings({
    url: release.artwork_url,
    reused: opts.artworkReused,
  })) {
    issues.push(issue('artwork-policy', warning, warning.includes('already used')))
  }
  if (!attestations.artwork_owned && !release.artwork_owned) {
    issues.push(
      issue(
        'artwork-owned',
        'Confirm you own the artwork and it has no URLs, @handles, store logos, or prices.',
        true,
      ),
    )
  }

  for (const track of tracks) {
    issues.push(...evaluateTrackIngest(track, { albumArtist: release.album_artist }))
  }

  if (tracks.length === 0) {
    issues.push(issue('tracks', 'Add at least one track before DSP ingest can pass.', true))
  } else if (tracks.every((track) => track.preview_start_seconds == null)) {
    issues.push(
      issue(
        'preview-clip',
        'Optional: set a preview clip start so Apple/TikTok use a specific hook instead of Auto.',
        false,
      ),
    )
  }

  const blockers = issues.filter((item) => item.hard).map((item) => item.label)
  const warnings = issues.filter((item) => !item.hard).map((item) => item.label)
  const has = (prefix: string) => issues.some((item) => item.hard && item.id.startsWith(prefix))

  const checks = {
    titles_clean: !has('title:'),
    apple_credits: !has('apple:'),
    legal_writers: !has('writer:'),
    collab_splits: !has('splits:'),
    ai_declared: !has('ai:'),
    origin_ok: !has('cover:'),
    previously_released_declared: !has('previous'),
    attestations_complete: !has('attestations') && !has('artwork-owned'),
    artwork_policy: !issues.some((item) => item.hard && item.id.startsWith('artwork')),
    dsp_genre: !has('genre'),
    artist_profiles:
      !issues.some((item) => item.id === 'youtube-artist' || item.id === 'instagram-artist' || item.id === 'facebook-artist'),
    street_date_lead: !issues.some((item) => item.id === 'date-lead'),
    preview_clip: !issues.some((item) => item.id === 'preview-clip'),
    radio_pair: !issues.some((item) => item.id.startsWith('radio:')),
    stream_continuity_masters: !issues.some((item) => item.id === 'switch-masters'),
    stream_continuity_isrcs: !issues.some((item) => item.id === 'switch-isrc'),
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    issues,
    checks,
  }
}
