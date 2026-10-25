/** Program evidence on a release. DistroKid Social Media Pack is not a program. */

export const MONETIZATION_PROGRAMS = [
  {
    id: 'distrokid_audio_library',
    label: 'DistroKid audio library',
    detail: 'Delivery into the Instagram and Facebook music picker. This is not fingerprint monetization.',
  },
  {
    id: 'sergik_meta_rights_manager',
    label: 'SERGIK Meta Rights Manager',
    detail: 'First-party fingerprint claims. Do not also enroll DistroKid Social Media Pack on this master.',
  },
  {
    id: 'meta_creator_facebook',
    label: 'Meta creator · Facebook',
    detail: 'Payouts for SERGIK’s own Facebook content. Separate from recording royalties.',
  },
  {
    id: 'meta_creator_instagram',
    label: 'Meta creator · Instagram',
    detail: 'Payouts for SERGIK’s own Instagram content. Separate from recording royalties.',
  },
] as const

export const ENROLLMENT_STATUSES = [
  'unknown',
  'not_enrolled',
  'pending',
  'enrolled',
  'rejected',
  'expired',
] as const

export type MonetizationProgramId = (typeof MONETIZATION_PROGRAMS)[number]['id']
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number]

export type EnrollmentRecord = {
  status: EnrollmentStatus
  sourceUrl: string
  checkedOn: string
  reviewer: string
  /** Release-level fee in cents, when a statement shows one. Never multiply by track count. */
  annualCostCents: number | null
  commissionPercent: number | null
  notes: string
}

export type MonetizationEnrollment = Record<MonetizationProgramId, EnrollmentRecord>

const PROGRAM_IDS = new Set<string>(MONETIZATION_PROGRAMS.map((program) => program.id))
const STATUS_IDS = new Set<string>(ENROLLMENT_STATUSES)

export function emptyEnrollmentRecord(): EnrollmentRecord {
  return {
    status: 'unknown',
    sourceUrl: '',
    checkedOn: '',
    reviewer: '',
    annualCostCents: null,
    commissionPercent: null,
    notes: '',
  }
}

export function defaultMonetizationEnrollment(): MonetizationEnrollment {
  return {
    distrokid_audio_library: emptyEnrollmentRecord(),
    sergik_meta_rights_manager: emptyEnrollmentRecord(),
    meta_creator_facebook: emptyEnrollmentRecord(),
    meta_creator_instagram: emptyEnrollmentRecord(),
  }
}

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

function httpUrl(value: unknown): string {
  const raw = text(value, 500)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function day(value: unknown): string {
  const raw = text(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

function cents(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000) return null
  return n
}

function percent(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

function parseRecord(raw: unknown): EnrollmentRecord {
  const base = emptyEnrollmentRecord()
  if (!raw || typeof raw !== 'object') return base
  const row = raw as Record<string, unknown>
  const status = text(row.status, 40)
  return {
    status: STATUS_IDS.has(status) ? (status as EnrollmentStatus) : 'unknown',
    sourceUrl: httpUrl(row.sourceUrl),
    checkedOn: day(row.checkedOn),
    reviewer: text(row.reviewer, 120),
    annualCostCents: cents(row.annualCostCents),
    commissionPercent: percent(row.commissionPercent),
    notes: text(row.notes, 500),
  }
}

export function socialMediaPackAttempted(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  return Object.keys(raw as Record<string, unknown>).some((key) =>
    /social.?media.?pack|distrokid_smp/i.test(key),
  )
}

export function parseMonetizationEnrollment(raw: unknown): MonetizationEnrollment {
  const next = defaultMonetizationEnrollment()
  if (!raw || typeof raw !== 'object') return next
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!PROGRAM_IDS.has(key)) continue
    next[key as MonetizationProgramId] = parseRecord(value)
  }
  return next
}

/** Evidence already stored on the SERGIK UGC pack. Does not touch DistroKid or creator programs. */
export function rightsManagerFromUgc(
  input: { optedIn: boolean; meta: boolean; status: string },
  checkedOn: string,
): EnrollmentRecord {
  let status: EnrollmentStatus = 'unknown'
  if (!input.optedIn || !input.meta) status = 'not_enrolled'
  else if (input.status === 'live') status = 'enrolled'
  else if (input.status === 'ineligible') status = 'rejected'
  else if (input.status === 'submitted') status = 'pending'
  return {
    ...emptyEnrollmentRecord(),
    status,
    checkedOn: /^\d{4}-\d{2}-\d{2}$/.test(checkedOn) ? checkedOn : '',
    reviewer: 'ugc_pack',
    notes: 'Copied from SERGIK UGC pack. Not a DistroKid enrollment.',
  }
}

export function mergeMonetizationEnrollment(
  current: MonetizationEnrollment | null | undefined,
  patch: unknown,
): MonetizationEnrollment {
  const base = parseMonetizationEnrollment(current)
  const incoming = parseMonetizationEnrollment(patch)
  if (!patch || typeof patch !== 'object') return base
  const keys = Object.keys(patch as Record<string, unknown>)
  for (const id of PROGRAM_IDS) {
    if (keys.includes(id)) base[id as MonetizationProgramId] = incoming[id as MonetizationProgramId]
  }
  return base
}
