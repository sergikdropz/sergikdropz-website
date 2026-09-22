export const CREDIT_ROLES = [
  'primary',
  'featured',
  'vocalist',
  'instrument',
  'remixer',
  'writer',
  'producer',
  'mixer',
  'mastering',
] as const

export type CreditRole = (typeof CREDIT_ROLES)[number]

export type TrackContributor = {
  role: CreditRole
  name: string
  /** Optional contact for Rights contract signing emails. */
  email?: string | null
  /** Instrument type when role is `instrument` (e.g. Bass, Keys). */
  instrument?: string | null
}

/** Common performance instruments for Catalog dropdowns (non-vocal). */
export const PERFORMANCE_INSTRUMENTS = [
  'Drums',
  'Percussion',
  'Bass',
  'Guitar',
  'Keys',
  'Synth',
  'Piano',
  'Rhodes',
  'Organ',
  'Saxophone',
  'Trumpet',
  'Strings',
  'Samples',
  'Other',
] as const

export type PerformanceInstrument = (typeof PERFORMANCE_INSTRUMENTS)[number]

export type InstrumentCredit = {
  instrument: string
  name: string
}

const ROLE_SET = new Set<string>(CREDIT_ROLES)
const DEFAULT_ARTIST = 'SERGIK'

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const name = clean(raw)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

function splitNameList(value: string): string[] {
  return uniqueNames(
    clean(value)
      .split(/\s*(?:,|;|\/|&| and )\s*/i)
      .flatMap((part) => part.split(/\s+[x×]\s+/i)),
  )
}

function isCreditRole(value: string): value is CreditRole {
  return ROLE_SET.has(value)
}

export function parseContributors(raw: unknown): TrackContributor[] {
  if (!Array.isArray(raw)) return []
  const rows: TrackContributor[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const name = clean((item as { name?: unknown }).name)
    const roleRaw = clean((item as { role?: unknown }).role).toLowerCase()
    const role = isCreditRole(roleRaw)
      ? roleRaw
      : roleRaw === 'vocals' || roleRaw === 'vocal'
        ? 'vocalist'
        : 'primary'
    const emailRaw = clean((item as { email?: unknown }).email).toLowerCase()
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(emailRaw) ? emailRaw : null
    const instrument = clean((item as { instrument?: unknown }).instrument) || null
    if (!name) continue
    rows.push({
      role,
      name,
      ...(email ? { email } : {}),
      ...(role === 'instrument' && instrument ? { instrument } : {}),
    })
  }
  return normalizeContributorRows(rows)
}

/** Split "SERGIK x OG Coconut" blobs and drop feat. names already on the primary line. */
export function normalizeContributorRows(rows: TrackContributor[]): TrackContributor[] {
  const emailByName = new Map<string, string>()
  for (const row of rows) {
    const email = clean(row.email).toLowerCase()
    if (email && row.name) emailByName.set(row.name.toLowerCase(), email)
  }
  const expanded: TrackContributor[] = []
  for (const row of rows) {
    if (row.role === 'primary') {
      const billed = parseBilledArtists(row.name)
      const split =
        billed.primary.length + billed.featured.length > 1 || /(?:\s+[x×]\s+|\bfeat)/i.test(row.name)
      if (split) {
        for (const name of billed.primary) {
          const email = emailByName.get(name.toLowerCase())
          expanded.push({ role: 'primary', name, ...(email ? { email } : {}) })
        }
        for (const name of billed.featured) {
          const email = emailByName.get(name.toLowerCase())
          expanded.push({ role: 'featured', name, ...(email ? { email } : {}) })
        }
        continue
      }
    }
    if (row.role === 'featured') {
      const names = splitNameList(row.name)
      if (names.length > 1) {
        for (const name of names) {
          const email = emailByName.get(name.toLowerCase())
          expanded.push({ role: 'featured', name, ...(email ? { email } : {}) })
        }
        continue
      }
    }
    expanded.push(row)
  }
  const deduped = dedupeContributors(expanded)
  const primaryKeys = new Set(namesForRole(deduped, 'primary').map((name) => name.toLowerCase()))
  return deduped.filter((row) => row.role !== 'featured' || !primaryKeys.has(row.name.toLowerCase()))
}

/** Filename-style "OG Coconut - What you want" → store title when the prefix is already billed. */
export function storeTitleFromArtistPrefix(
  title: string | null | undefined,
  billedNames: string[],
): { title: string; prefix: string | null } {
  const raw = clean(title)
  const match = raw.match(/^(.{2,40}?)\s+[-–—]\s+(.{2,})$/)
  if (!match) return { title: raw, prefix: null }
  const prefix = clean(match[1])
  const rest = clean(match[2])
  if (!prefix || !rest) return { title: raw, prefix: null }
  const billed = new Set(billedNames.map((name) => name.toLowerCase()))
  if (billed.has(prefix.toLowerCase()) || prefix.toLowerCase() === DEFAULT_ARTIST.toLowerCase()) {
    return { title: rest, prefix }
  }
  return { title: raw, prefix: null }
}

export function dedupeContributors(rows: TrackContributor[]): TrackContributor[] {
  const seen = new Set<string>()
  const out: TrackContributor[] = []
  for (const row of rows) {
    const name = clean(row.name)
    if (!name || !isCreditRole(row.role)) continue
    const instrument = row.role === 'instrument' ? clean(row.instrument) : ''
    const key = `${row.role}:${instrument.toLowerCase()}:${name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const email = clean(row.email).toLowerCase()
    out.push({
      role: row.role,
      name,
      ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email) ? { email } : {}),
      ...(row.role === 'instrument' && instrument ? { instrument } : {}),
    })
  }
  return out
}

/** Pull billed artists out of vault `artist` plus collab titles like "OG Coconut - What you want". */
export function contributorsFromVault(input: {
  artist?: string | null
  title?: string | null
  albumArtist?: string | null
}): TrackContributor[] {
  const rows: TrackContributor[] = []
  const billed = parseBilledArtists(input.artist)
  rows.push(...billed.primary.map((name) => ({ role: 'primary' as const, name })))
  rows.push(...billed.featured.map((name) => ({ role: 'featured' as const, name })))

  const titleCollab = collaboratorFromTitle(input.title)
  if (titleCollab && !rows.some((row) => row.name.toLowerCase() === titleCollab.toLowerCase())) {
    rows.push({ role: rows.length ? 'featured' : 'primary', name: titleCollab })
  }

  const album = clean(input.albumArtist)
  if (album && !rows.some((row) => row.role === 'primary')) {
    rows.push(...parseBilledArtists(album).primary.map((name) => ({ role: 'primary' as const, name })))
  }

  if (!rows.some((row) => row.role === 'primary')) {
    rows.unshift({ role: 'primary', name: DEFAULT_ARTIST })
  }
  // Apple Music requires an explicit producer credit; default to primary artist.
  if (!rows.some((row) => row.role === 'producer')) {
    const producer = rows.find((row) => row.role === 'primary')?.name || DEFAULT_ARTIST
    rows.push({ role: 'producer', name: producer })
  }
  return normalizeContributorRows(rows)
}

export function parseBilledArtists(value: string | null | undefined): {
  primary: string[]
  featured: string[]
} {
  const text = clean(value)
  if (!text) return { primary: [], featured: [] }
  const featParts = text.split(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+/i)
  const head = featParts[0] || ''
  const featured = uniqueNames(featParts.slice(1).flatMap(splitNameList))
  const primary = uniqueNames(head.split(/\s+[x×]\s+|,\s+/).flatMap(splitNameList))
  return { primary, featured }
}

function collaboratorFromTitle(title: string | null | undefined): string | null {
  const text = clean(title)
  const match = text.match(/^(.{2,40}?)\s+[-–—]\s+.{2,}$/)
  if (!match) return null
  const name = clean(match[1])
  if (!name || /feat|remix|edit|mix|version/i.test(name)) return null
  if (name.toLowerCase() === DEFAULT_ARTIST.toLowerCase()) return null
  return name
}

export function mergeContributors(
  existing: TrackContributor[],
  inferred: TrackContributor[],
): TrackContributor[] {
  const current = normalizeContributorRows(existing)
  if (current.length) return current
  return normalizeContributorRows(inferred)
}

export function namesForRole(rows: TrackContributor[], role: CreditRole): string[] {
  return uniqueNames(rows.filter((row) => row.role === role).map((row) => row.name))
}

/** Apple Music requires a producer credit — default to primary when none is stored. */
export function ensureProducerCredits(rows: TrackContributor[]): TrackContributor[] {
  const normalized = normalizeContributorRows(rows)
  if (namesForRole(normalized, 'producer').length) return normalized
  const primary = namesForRole(normalized, 'primary')[0] || DEFAULT_ARTIST
  return normalizeContributorRows([...normalized, { role: 'producer', name: primary }])
}

export function primaryArtist(rows: TrackContributor[], fallback = DEFAULT_ARTIST): string {
  return namesForRole(rows, 'primary')[0] || fallback
}

export function displayArtistLine(rows: TrackContributor[], fallback = DEFAULT_ARTIST): string {
  const normalized = normalizeContributorRows(rows)
  const primary = namesForRole(normalized, 'primary')
  const featured = namesForRole(normalized, 'featured')
  const head = primary.length ? primary.join(' x ') : fallback
  if (!featured.length) return head
  return `${head} feat. ${featured.join(', ')}`
}

export function instrumentCreditsFromContributors(rows: TrackContributor[]): InstrumentCredit[] {
  return normalizeContributorRows(rows)
    .filter((row) => row.role === 'instrument' && row.name)
    .map((row) => ({
      instrument: clean(row.instrument) || 'Other',
      name: row.name,
    }))
}

export function contributorsFromCreditFields(input: {
  primary?: string
  featured?: string
  vocalist?: string
  writer?: string
  producer?: string
  remixer?: string
  mixer?: string
  mastering?: string
  instruments?: InstrumentCredit[]
}): TrackContributor[] {
  const rows: TrackContributor[] = []
  const push = (role: CreditRole, value?: string) => {
    for (const name of splitNameList(value || '')) rows.push({ role, name })
  }
  push('primary', input.primary)
  push('featured', input.featured)
  push('vocalist', input.vocalist)
  push('writer', input.writer)
  push('producer', input.producer)
  push('remixer', input.remixer)
  push('mixer', input.mixer)
  push('mastering', input.mastering)
  for (const item of input.instruments || []) {
    const name = clean(item.name)
    const instrument = clean(item.instrument)
    if (!name) continue
    rows.push({
      role: 'instrument',
      name,
      ...(instrument ? { instrument } : {}),
    })
  }
  if (!rows.some((row) => row.role === 'primary')) {
    rows.unshift({ role: 'primary', name: DEFAULT_ARTIST })
  }
  // Apple Music requires producer; mirror primary when the field was left blank.
  if (!rows.some((row) => row.role === 'producer')) {
    const producer = rows.find((row) => row.role === 'primary')?.name || DEFAULT_ARTIST
    rows.push({ role: 'producer', name: producer })
  }
  return normalizeContributorRows(rows)
}

export function creditFieldsFromContributors(rows: TrackContributor[]): {
  primary: string
  featured: string
  vocalist: string
  writer: string
  producer: string
  remixer: string
  mixer: string
  mastering: string
  instruments: InstrumentCredit[]
} {
  const normalized = normalizeContributorRows(rows)
  return {
    primary: namesForRole(normalized, 'primary').join(' x '),
    featured: namesForRole(normalized, 'featured').join(', '),
    vocalist: namesForRole(normalized, 'vocalist').join(', '),
    writer: namesForRole(normalized, 'writer').join(', '),
    producer: namesForRole(normalized, 'producer').join(', '),
    remixer: namesForRole(normalized, 'remixer').join(', '),
    mixer: namesForRole(normalized, 'mixer').join(', '),
    mastering: namesForRole(normalized, 'mastering').join(', '),
    instruments: instrumentCreditsFromContributors(normalized),
  }
}

export function creditsBlockFromContributors(
  rows: TrackContributor[],
  year = new Date().getFullYear(),
): string {
  const primary = namesForRole(rows, 'primary')
  const featured = namesForRole(rows, 'featured')
  const vocalists = namesForRole(rows, 'vocalist')
  const instruments = instrumentCreditsFromContributors(rows)
  const writers = namesForRole(rows, 'writer')
  const producers = namesForRole(rows, 'producer')
  const billed = displayArtistLine(rows)
  const mixers = namesForRole(rows, 'mixer')
  const mastering = namesForRole(rows, 'mastering')
  const lines = [
    `Primary artist: ${billed}.`,
    featured.length ? `Featuring: ${featured.join(', ')}.` : '',
    vocalists.length ? `Vocals: ${vocalists.join(', ')}.` : '',
    instruments.length
      ? `Instruments: ${instruments.map((row) => `${row.instrument} — ${row.name}`).join('; ')}.`
      : '',
    `Written by ${writers.join(', ') || primary.join(', ') || DEFAULT_ARTIST}.`,
    `Produced by ${producers.join(', ') || primary.join(', ') || DEFAULT_ARTIST}.`,
    mixers.length ? `Mixed by ${mixers.join(', ')}.` : '',
    mastering.length ? `Mastered by ${mastering.join(', ')}.` : '',
    `Published © ${year} ${primary[0] || DEFAULT_ARTIST}. All rights reserved.`,
  ]
  return lines.filter(Boolean).join('\n')
}

export function flattenReleaseContributors(
  tracks: Array<{ contributors?: unknown; title?: string | null }>,
): TrackContributor[] {
  return dedupeContributors(tracks.flatMap((track) => parseContributors(track.contributors)))
}

/** Attach signing emails onto matching contributor stage names. */
export function applyEmailsToContributors(
  contributors: TrackContributor[],
  emails: Array<{ stage?: string; name?: string; email?: string | null }>,
): TrackContributor[] {
  const map = new Map<string, string>()
  for (const row of emails) {
    const stage = clean(row.stage || row.name)
    const email = clean(row.email).toLowerCase()
    if (!stage || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) continue
    map.set(stage.toLowerCase(), email)
  }
  return normalizeContributorRows(
    contributors.map((row) => {
      const email = map.get(row.name.toLowerCase())
      if (!email) return row
      return { ...row, email }
    }),
  )
}

export function emailsFromContributors(contributors: unknown): Array<{ stage: string; email: string }> {
  const out: Array<{ stage: string; email: string }> = []
  const seen = new Set<string>()
  for (const row of parseContributors(contributors)) {
    const email = clean(row.email).toLowerCase()
    if (!email || seen.has(row.name.toLowerCase())) continue
    seen.add(row.name.toLowerCase())
    out.push({ stage: row.name, email })
  }
  return out
}
