/** Official US ISRC Agency Rights Owner prefix for SERGIK / Jordan Caboga. */
export const US_ISRC_REGISTRANT = {
  name: 'Jordan Caboga',
  prefix: 'QTA53',
  allocatedAt: '2026-09-17',
  agency: 'US ISRC Agency',
  recordingArtist: 'SERGIK',
  /** SoundExchange Direct registrant ID# */
  soundExchangeRegistrantId: '2181363681',
  loginEmail: 'sergikdrops@gmail.com',
  membership: {
    performer: {
      sxid: 'SX1102Q6ZH',
      type: 'Performer',
      membershipDate: '2026-09-16',
      mandateDate: '2026-09-16',
      mandateTerritories: 'Worldwide',
      status: 'Active',
    },
    rightsOwner: {
      sxid: 'SX1102Q6ZJ',
      type: 'Rights Owner',
      membershipDate: '2026-09-16',
      mandateDate: '2026-09-16',
      mandateTerritories: 'Worldwide',
      status: 'Active',
    },
  },
} as const

/** Prefer env account id when set; otherwise the enrolled SoundExchange Direct registrant. */
export function resolveSoundExchangeAccountId(
  raw = process.env.SOUNDEXCHANGE_ACCOUNT_ID,
): string {
  return (raw?.trim() || US_ISRC_REGISTRANT.soundExchangeRegistrantId).trim()
}

export function currentIsrcYear(now = new Date()): number {
  return now.getFullYear() % 100
}

export function resolveIsrcPrefix(raw = process.env.ISRC_PREFIX): string {
  const prefix = (raw?.trim() || US_ISRC_REGISTRANT.prefix).toUpperCase()
  if (!/^[A-Z0-9]{5}$/.test(prefix)) {
    throw new Error(`Invalid ISRC prefix "${prefix}". Expected 5 alphanumeric characters.`)
  }
  return prefix
}

export function formatISRC(prefix: string, year: number, serial: number): string {
  const yearStr = String(year).padStart(2, '0')
  const serialStr = String(serial).padStart(5, '0')
  return `${prefix}${yearStr}${serialStr}`
}

export function validateISRC(isrc: string): boolean {
  const normalized = isrc.replace(/-/g, '').toUpperCase()
  return /^[A-Z0-9]{5}[0-9]{7}$/.test(normalized)
}

export function parseISRC(isrc: string): {
  prefix: string
  year: number
  serial: number
  isrc_full: string
} | null {
  const normalized = isrc.replace(/-/g, '').toUpperCase()
  if (!validateISRC(normalized)) return null
  return {
    prefix: normalized.slice(0, 5),
    year: parseInt(normalized.slice(5, 7), 10),
    serial: parseInt(normalized.slice(7), 10),
    isrc_full: normalized,
  }
}

/** Hyphenated display form used by USISRC / SoundExchange: CC-XXX-YY-NNNNN */
export function formatISRCDisplay(isrc: string): string {
  const parsed = parseISRC(isrc)
  if (!parsed) return isrc.replace(/-/g, '').toUpperCase()
  const yearStr = String(parsed.year).padStart(2, '0')
  const serialStr = String(parsed.serial).padStart(5, '0')
  return `${parsed.prefix.slice(0, 2)}-${parsed.prefix.slice(2)}-${yearStr}-${serialStr}`
}

export function durationToSeconds(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null
  if (value > 10_000) return Math.round(value / 1000)
  return Math.round(value)
}

export function formatDurationMmSs(seconds: number | null | undefined): string {
  const total = durationToSeconds(seconds)
  if (total == null) return ''
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export type UsisrcLockerRow = {
  isrc: string
  title: string
  version?: string | null
  artist?: string | null
  explicit?: boolean | null
  immersive?: boolean | null
  durationSec?: number | null
  yearOfProduction?: number | null
}

const LOCKER_HEADERS = [
  'Code',
  'Registrant Name',
  'Prefix Code',
  'Year of Reference',
  'Designation Code',
  'Recording Artist',
  'Recording Title',
  'Version Title',
  'Asset Type',
  'Immersive',
  'Explicit',
  'Year of Production',
  'Duration',
] as const

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function buildUsisrcLockerCsv(
  tracks: UsisrcLockerRow[],
  opts?: { artist?: string; yearOfProduction?: number }
): string {
  const artistDefault = opts?.artist || US_ISRC_REGISTRANT.recordingArtist
  const rows = tracks.flatMap((track) => {
    const parsed = parseISRC(track.isrc)
    if (!parsed) return []
    const yearStr = String(parsed.year).padStart(2, '0')
    const designation = String(parsed.serial).padStart(5, '0')
    const yearOfProduction =
      track.yearOfProduction ?? opts?.yearOfProduction ?? 2000 + parsed.year
    return [
      [
        formatISRCDisplay(parsed.isrc_full),
        US_ISRC_REGISTRANT.name,
        parsed.prefix,
        yearStr,
        designation,
        track.artist || artistDefault,
        track.title,
        track.version || '',
        'Audio',
        track.immersive ? 'Yes' : 'No',
        track.explicit ? 'Yes' : 'No',
        String(yearOfProduction),
        formatDurationMmSs(track.durationSec),
      ]
        .map((cell) => csvCell(String(cell)))
        .join(','),
    ]
  })
  return `${[LOCKER_HEADERS.join(','), ...rows].join('\n')}\n`
}
