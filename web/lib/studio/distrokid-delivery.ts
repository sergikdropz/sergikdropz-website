/**
 * DistroKid interim delivery — Release Studio → upload packet for scheduled releases.
 * DistroKid has no partner upload API. This builds the form packet, upload window,
 * and status stamp. Revelator takes over when partner keys are live (not dry-run).
 */

import { DEFAULT_LABEL_NAME, dspStoreLabel, isDspStoreId } from '@/lib/studio/constants'
import type { AggregatorHealth } from '@/lib/studio/distributor'
import { validateISRC } from '@/lib/studio/isrc-format'
import { TRACK_LANGUAGES } from '@/lib/studio/dsp-package'
import { namesForRole, parseContributors } from '@/lib/studio/track-credits'
import { seedWriterLegalRows, writerLegalNameIssues } from '@/lib/studio/songwriter'

export const DISTROKID_UPLOAD_LEAD_DAYS = 28
export const DISTROKID_LATE_DAYS = 14
export const DISTROKID_NEW_RELEASE_URL = 'https://distrokid.com/new/'
export const DISTROKID_MY_MUSIC_URL = 'https://distrokid.com/mymusic/'

export type DeliveryPipeId = 'distrokid' | 'revelator'

export type DeliveryPipe = {
  id: DeliveryPipeId
  label: string
  revelatorLive: boolean
}

export type DistroKidWindowKind =
  | 'needs_date'
  | 'scheduled'
  | 'due'
  | 'late'
  | 'past_street'
  | 'submitted'
  | 'live'

export type DistroKidDeliveryStatus = 'queued' | 'submitted'

export type DistroKidDeliveryRecord = {
  status: DistroKidDeliveryStatus
  queued_at?: string
  submitted_at?: string
  albumuuid?: string | null
  notes?: string | null
}

export type DistroKidPacketTrackInput = {
  title?: string | null
  isrc?: string | null
  wav_url?: string | null
  explicit?: boolean | null
  contributors?: unknown
  writer_legal_names?: string | null
  preview_start_seconds?: number | null
  track_number?: number | null
}

export type DistroKidPacketReleaseInput = {
  id: string
  title?: string | null
  type?: string | null
  release_date?: string | null
  artwork_url?: string | null
  artwork_dsp_url?: string | null
  genre?: string | null
  subgenre?: string | null
  language?: string | null
  album_artist?: string | null
  label_name?: string | null
  upc?: string | null
  previously_released?: boolean | null
  distributor_status?: string | null
  target_stores?: unknown
  tracks: DistroKidPacketTrackInput[]
}

export type DistroKidPacketTrack = {
  track_number: number
  title: string
  artist: string
  featuring: string
  songwriters: string
  explicit: boolean
  isrc: string
  wav_url: string
  preview_start_seconds: number | null
}

export type DistroKidPacket = {
  ok: boolean
  blockers: string[]
  warnings: string[]
  upload_url: string
  my_music_url: string
  release: {
    previously_released: boolean
    artist: string
    label: string
    title: string
    language: string
    primary_genre: string
    secondary_genre: string
    release_date: string
    upc: string
    artwork_url: string
    stores: string[]
  }
  tracks: DistroKidPacketTrack[]
  worksheet: string
  csv: string
}

export type DistroKidWindow = {
  kind: DistroKidWindowKind
  release_date: string | null
  upload_by: string | null
  days_until_street: number | null
  label: string
}

const GENRE_MAP: Record<string, string> = {
  'hip-hop/rap': 'Hip Hop/Rap',
  'hip hop/rap': 'Hip Hop/Rap',
  'hip-hop': 'Hip Hop/Rap',
  rap: 'Hip Hop/Rap',
  dance: 'Dance',
  house: 'Dance',
  'funky house': 'Dance',
  electronic: 'Electronic',
  jungle: 'Electronic',
  'drum and bass': 'Electronic',
  dnb: 'Electronic',
  reggae: 'Reggae',
  'dub reggae': 'Reggae',
  pop: 'Pop',
  rnb: 'R&B/Soul',
  'r&b': 'R&B/Soul',
  'r&b/soul': 'R&B/Soul',
  rock: 'Rock',
  jazz: 'Jazz',
  latin: 'Latin',
  classical: 'Classical',
  country: 'Country',
  metal: 'Metal',
  folk: 'Folk',
  blues: 'Blues',
  soundtrack: 'Soundtrack',
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function isoDate(value: string): string | null {
  const match = clean(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] || null
}

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function resolveDeliveryPipe(health: Pick<AggregatorHealth, 'label' | 'dryRun'>): DeliveryPipe {
  const revelatorLive = health.label === 'live' && !health.dryRun
  if (revelatorLive) {
    return {
      id: 'revelator',
      label: 'Revelator Partner API',
      revelatorLive: true,
    }
  }
  return {
    id: 'distrokid',
    label: 'DistroKid (interim until Revelator)',
    revelatorLive: false,
  }
}

export function mapDistroKidGenre(value: string | null | undefined): string {
  const text = clean(value)
  if (!text) return ''
  return GENRE_MAP[text.toLowerCase()] || text
}

function languageLabel(value: string | null | undefined): string {
  const id = clean(value).toLowerCase() || 'en'
  return TRACK_LANGUAGES.find((row) => row.id === id)?.label || id
}

export function parseDistroKidDelivery(marketingCopy: unknown): DistroKidDeliveryRecord | null {
  if (!marketingCopy || typeof marketingCopy !== 'object') return null
  const raw = (marketingCopy as { distrokid_delivery?: unknown }).distrokid_delivery
  if (!raw || typeof raw !== 'object') return null
  const status = (raw as { status?: unknown }).status
  if (status !== 'queued' && status !== 'submitted') return null
  const albumuuid = clean((raw as { albumuuid?: unknown }).albumuuid) || null
  const notes = clean((raw as { notes?: unknown }).notes) || null
  return {
    status,
    queued_at: clean((raw as { queued_at?: unknown }).queued_at) || undefined,
    submitted_at: clean((raw as { submitted_at?: unknown }).submitted_at) || undefined,
    albumuuid,
    notes,
  }
}

export function marketingCopyWithDistroKidDelivery(
  marketingCopy: unknown,
  record: DistroKidDeliveryRecord | null,
): Record<string, unknown> {
  const base =
    marketingCopy && typeof marketingCopy === 'object'
      ? { ...(marketingCopy as Record<string, unknown>) }
      : {}
  if (!record) {
    delete base.distrokid_delivery
    return base
  }
  base.distrokid_delivery = record
  return base
}

export function distrokidReleaseId(releaseId: string, albumuuid?: string | null): string {
  const uuid = clean(albumuuid)
  return uuid ? `dk-${uuid}` : `dk-pending-${releaseId}`
}

export function isDistroKidDistributorId(value: string | null | undefined): boolean {
  return clean(value).startsWith('dk-')
}

export function evaluateDistroKidWindow(input: {
  release_date?: string | null
  distributor_status?: string | null
  record?: DistroKidDeliveryRecord | null
  today: string
}): DistroKidWindow {
  const status = clean(input.distributor_status)
  const record = input.record
  if (status === 'live') {
    return {
      kind: 'live',
      release_date: isoDate(clean(input.release_date)) ,
      upload_by: null,
      days_until_street: null,
      label: 'Live',
    }
  }
  if (record?.status === 'submitted') {
    const date = isoDate(clean(input.release_date))
    return {
      kind: 'submitted',
      release_date: date,
      upload_by: date ? addIsoDays(date, -DISTROKID_UPLOAD_LEAD_DAYS) : null,
      days_until_street: date ? daysBetween(input.today, date) : null,
      label: 'Submitted on DistroKid',
    }
  }
  const date = isoDate(clean(input.release_date))
  if (!date) {
    return {
      kind: 'needs_date',
      release_date: null,
      upload_by: null,
      days_until_street: null,
      label: 'Set a street date',
    }
  }
  const days = daysBetween(input.today, date)
  const uploadBy = addIsoDays(date, -DISTROKID_UPLOAD_LEAD_DAYS)
  if (days < 0) {
    return {
      kind: 'past_street',
      release_date: date,
      upload_by: uploadBy,
      days_until_street: days,
      label: 'Street date passed',
    }
  }
  if (days <= DISTROKID_LATE_DAYS) {
    return {
      kind: 'late',
      release_date: date,
      upload_by: uploadBy,
      days_until_street: days,
      label: `Late — ${days} day${days === 1 ? '' : 's'} to street`,
    }
  }
  if (days <= DISTROKID_UPLOAD_LEAD_DAYS) {
    return {
      kind: 'due',
      release_date: date,
      upload_by: uploadBy,
      days_until_street: days,
      label: `Upload now — street in ${days} days`,
    }
  }
  return {
    kind: 'scheduled',
    release_date: date,
    upload_by: uploadBy,
    days_until_street: days,
    label: `Upload by ${uploadBy}`,
  }
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function storeNames(targetStores: unknown): string[] {
  const raw = Array.isArray(targetStores) ? targetStores : []
  const names = raw
    .map((id) => clean(id))
    .filter(isDspStoreId)
    .map((id) => dspStoreLabel(id))
  return names
}

export function buildDistroKidPacket(input: DistroKidPacketReleaseInput): DistroKidPacket {
  const blockers: string[] = []
  const warnings: string[] = []
  const title = clean(input.title)
  const artist = clean(input.album_artist) || 'SERGIK'
  const label = clean(input.label_name)
  const date = isoDate(clean(input.release_date))
  const artwork = clean(input.artwork_dsp_url) || clean(input.artwork_url)
  const primaryGenre = mapDistroKidGenre(input.genre)
  const secondaryGenre = mapDistroKidGenre(input.subgenre)
  const upc = clean(input.upc)

  if (!title) blockers.push('Release title is required.')
  if (!clean(input.album_artist)) warnings.push('Album artist was empty — packet uses SERGIK. Confirm before upload.')
  if (!label) blockers.push(`Set Metadata → Label to ${DEFAULT_LABEL_NAME}.`)
  else if (label.toLowerCase() !== DEFAULT_LABEL_NAME.toLowerCase()) {
    blockers.push(`Label must be ${DEFAULT_LABEL_NAME} (found “${label}”).`)
  }
  if (!date) blockers.push('Set a real street date. DistroKid needs the future release date, not ASAP.')
  if (!artwork) blockers.push('Artwork is required (square JPG or PNG, ideally 3000×3000).')
  if (!primaryGenre) blockers.push('Set a primary genre.')
  else if (!GENRE_MAP[clean(input.genre).toLowerCase()]) {
    warnings.push(`Confirm “${primaryGenre}” matches a DistroKid genre dropdown.`)
  }
  if (input.previously_released) {
    warnings.push(
      'This title is marked previously released. Do not upload a second copy of a release already on DistroKid.',
    )
  }
  if (!upc) warnings.push('No UPC yet. Leave DistroKid’s UPC blank so they assign one, then paste it back into Metadata.')

  const tracks = [...input.tracks]
    .map((track, index) => ({ track, index }))
    .sort((a, b) => {
      const an = Number(a.track.track_number) || a.index + 1
      const bn = Number(b.track.track_number) || b.index + 1
      return an - bn
    })

  if (!tracks.length) blockers.push('Add at least one track.')

  const packetTracks: DistroKidPacketTrack[] = tracks.map(({ track, index }) => {
    const trackTitle = clean(track.title) || `Track ${index + 1}`
    const contributors = parseContributors(track.contributors)
    const primaries = namesForRole(contributors, 'primary')
    const featuring = namesForRole(contributors, 'featured').join(', ')
    const legalRows = seedWriterLegalRows(track.contributors, track.writer_legal_names)
    const songwriters = legalRows.map((row) => clean(row.legal)).filter(Boolean).join(', ')
    const legalIssues = writerLegalNameIssues(track.writer_legal_names, [], track.contributors)
    const isrc = clean(track.isrc).replace(/-/g, '').toUpperCase()
    const wav = clean(track.wav_url)
    const previewRaw = Number(track.preview_start_seconds)
    const preview = Number.isFinite(previewRaw) && previewRaw >= 0 ? Math.round(previewRaw) : null

    if (!clean(track.title)) blockers.push(`Track ${index + 1} needs a title.`)
    if (!isrc) blockers.push(`${trackTitle}: ISRC is required. Use your own codes — do not let DistroKid mint new ones.`)
    else if (!validateISRC(isrc)) blockers.push(`${trackTitle}: ISRC “${isrc}” is not valid.`)
    if (!wav) blockers.push(`${trackTitle}: WAV master is missing.`)
    for (const issue of legalIssues) blockers.push(`${trackTitle}: ${issue}`)

    return {
      track_number: Number(track.track_number) || index + 1,
      title: trackTitle,
      artist: primaries[0] || artist,
      featuring,
      songwriters,
      explicit: Boolean(track.explicit),
      isrc,
      wav_url: wav,
      preview_start_seconds: preview,
    }
  })

  const stores = storeNames(input.target_stores)
  const releaseFields = {
    previously_released: Boolean(input.previously_released),
    artist,
    label: label || DEFAULT_LABEL_NAME,
    title,
    language: languageLabel(input.language),
    primary_genre: primaryGenre,
    secondary_genre: secondaryGenre,
    release_date: date || '',
    upc,
    artwork_url: artwork,
    stores,
  }

  const lines = [
    `${title || 'Untitled'} — DistroKid upload packet`,
    `Open ${DISTROKID_NEW_RELEASE_URL} on the SERGIKdropz DistroKid account.`,
    'DistroKid has no upload API. Fill their form from this packet, then mark submitted in Release Studio.',
    '',
    `Previously released: ${releaseFields.previously_released ? 'Yes' : 'No'}`,
    `Artist: ${releaseFields.artist}`,
    `Record label: ${releaseFields.label}`,
    `Release title: ${releaseFields.title}`,
    `Language: ${releaseFields.language}`,
    `Primary genre: ${releaseFields.primary_genre}`,
    `Secondary genre: ${releaseFields.secondary_genre || '—'}`,
    `Release date: ${releaseFields.release_date || '—'} (set this date — do not choose ASAP)`,
    `UPC: ${releaseFields.upc || 'leave blank — DistroKid assigns'}`,
    `Artwork: ${releaseFields.artwork_url || '—'}`,
    `Stores: ${stores.length ? stores.join(', ') : 'DistroKid default store set'}`,
    '',
    'Tracks',
    ...packetTracks.map(
      (track) =>
        `${track.track_number}. ${track.title} | artist ${track.artist}${track.featuring ? ` feat. ${track.featuring}` : ''} | songwriters ${track.songwriters || '—'} | ISRC ${track.isrc || '—'} | explicit ${track.explicit ? 'yes' : 'no'}${track.preview_start_seconds != null ? ` | preview ${track.preview_start_seconds}s` : ''}`,
    ),
  ]
  if (blockers.length) {
    lines.push('', 'Fix before upload', ...blockers.map((item) => `- ${item}`))
  }
  if (warnings.length) {
    lines.push('', 'Check', ...warnings.map((item) => `- ${item}`))
  }

  const header = [
    'track_number',
    'release_title',
    'artist',
    'label',
    'release_date',
    'language',
    'primary_genre',
    'secondary_genre',
    'upc',
    'track_title',
    'track_artist',
    'featuring',
    'songwriters',
    'isrc',
    'explicit',
    'wav_url',
    'artwork_url',
  ]
  const csvRows = packetTracks.map((track) =>
    [
      String(track.track_number),
      releaseFields.title,
      releaseFields.artist,
      releaseFields.label,
      releaseFields.release_date,
      releaseFields.language,
      releaseFields.primary_genre,
      releaseFields.secondary_genre,
      releaseFields.upc,
      track.title,
      track.artist,
      track.featuring,
      track.songwriters,
      track.isrc,
      track.explicit ? 'yes' : 'no',
      track.wav_url,
      releaseFields.artwork_url,
    ]
      .map(csvCell)
      .join(','),
  )

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    upload_url: DISTROKID_NEW_RELEASE_URL,
    my_music_url: DISTROKID_MY_MUSIC_URL,
    release: releaseFields,
    tracks: packetTracks,
    worksheet: lines.join('\n'),
    csv: [header.join(','), ...csvRows].join('\n'),
  }
}

const WINDOW_RANK: Record<DistroKidWindowKind, number> = {
  late: 0,
  due: 1,
  scheduled: 2,
  needs_date: 3,
  submitted: 4,
  past_street: 5,
  live: 6,
}

export type DistroKidQueueItem = {
  id: string
  title: string
  type: string | null
  window: DistroKidWindow
  packet_ok: boolean
  blocker_count: number
  blockers: string[]
  record: DistroKidDeliveryRecord | null
  distributor_status: string | null
}

export function buildDistroKidQueue(
  rows: DistroKidPacketReleaseInput[],
  today: string,
  records: Array<DistroKidDeliveryRecord | null> = [],
): DistroKidQueueItem[] {
  const items = rows.map((row, index) => {
    const record = records[index] ?? null
    const packet = buildDistroKidPacket(row)
    const window = evaluateDistroKidWindow({
      release_date: row.release_date,
      distributor_status: row.distributor_status,
      record,
      today,
    })
    return {
      id: row.id,
      title: clean(row.title) || 'Untitled',
      type: clean(row.type) || null,
      window,
      packet_ok: packet.ok,
      blocker_count: packet.blockers.length,
      blockers: packet.blockers.slice(0, 3),
      record,
      distributor_status: clean(row.distributor_status) || null,
    }
  })
  return items.sort((a, b) => {
    const rank = WINDOW_RANK[a.window.kind] - WINDOW_RANK[b.window.kind]
    if (rank !== 0) return rank
    return (a.window.release_date || '9999').localeCompare(b.window.release_date || '9999')
  })
}
