export const SERGIK_UGC_PARTNER = 'sergik' as const

export const UGC_PACK_PARTNERS = [{ id: SERGIK_UGC_PARTNER, label: 'SERGIK' }] as const

export const UGC_PACK_STATUSES = [
  { id: 'not_opted', label: 'Not enrolled', short: 'Off' },
  { id: 'submitted', label: 'Queued with SERGIK', short: 'Queued' },
  { id: 'live', label: 'Fingerprints live', short: 'Live' },
  { id: 'ineligible', label: 'Ineligible', short: 'Blocked' },
] as const

export const UGC_PACK_PLATFORMS = [
  {
    id: 'youtube',
    label: 'YouTube',
    product: 'Content ID',
    hint: 'Claim User-Generated Content that uses this master on YouTube.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    product: 'Music ID',
    hint: 'Match sounds in TikTok posts and commercial library use.',
  },
  {
    id: 'meta',
    label: 'Meta',
    product: 'Rights Manager',
    hint: 'Reels / Facebook / Instagram fingerprinting for this master.',
  },
] as const

export type UgcPackPartner = (typeof UGC_PACK_PARTNERS)[number]['id']
export type UgcPackStatus = (typeof UGC_PACK_STATUSES)[number]['id']
export type UgcPackPlatformId = (typeof UGC_PACK_PLATFORMS)[number]['id']

export type UgcPack = {
  opted_in: boolean
  partner: UgcPackPartner
  status: UgcPackStatus
  youtube: boolean
  tiktok: boolean
  meta: boolean
  /** Freeform ops note (CMS conflict, sample hold, go-live date). */
  notes: string
  /** ISO timestamp when enrollment flipped on. */
  enrolled_at: string | null
  /** ISO timestamp when fingerprints were marked live. */
  live_at: string | null
}

export type UgcPackEligibility = {
  eligible: boolean
  warnings: string[]
}

export type UgcPackNextAction = {
  kind: 'enroll' | 'clearance' | 'platforms' | 'mark_live' | 'blocked' | 'ready'
  label: string
  detail: string
}

export const DEFAULT_UGC_PACK: UgcPack = {
  opted_in: false,
  partner: SERGIK_UGC_PARTNER,
  status: 'not_opted',
  youtube: true,
  tiktok: true,
  meta: true,
  notes: '',
  enrolled_at: null,
  live_at: null,
}

const STATUS_IDS = new Set<string>(UGC_PACK_STATUSES.map((item) => item.id))

export function isUgcPackPartner(value: string): value is UgcPackPartner {
  return value === SERGIK_UGC_PARTNER
}

export function isUgcPackStatus(value: string): value is UgcPackStatus {
  return STATUS_IDS.has(value)
}

export function ugcPackPartnerLabel(partner: string): string {
  return partner === SERGIK_UGC_PARTNER ? 'SERGIK' : 'SERGIK'
}

export function ugcPackStatusLabel(status: string): string {
  return UGC_PACK_STATUSES.find((item) => item.id === status)?.label || status
}

function coercePartner(_value: unknown): UgcPackPartner {
  return SERGIK_UGC_PARTNER
}

function coerceIso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const t = Date.parse(trimmed)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export function parseUgcPack(raw: unknown): UgcPack {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_UGC_PACK }
  }
  const value = raw as Record<string, unknown>
  const status =
    typeof value.status === 'string' && isUgcPackStatus(value.status) ? value.status : 'not_opted'
  const optedIn = value.opted_in === true
  return {
    opted_in: optedIn,
    partner: coercePartner(value.partner),
    status: optedIn && status === 'not_opted' ? 'submitted' : status,
    youtube: value.youtube !== false,
    tiktok: value.tiktok !== false,
    meta: value.meta !== false,
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 2000) : '',
    enrolled_at: coerceIso(value.enrolled_at),
    live_at: coerceIso(value.live_at),
  }
}

export function mergeUgcPack(current: UgcPack | unknown, patch: unknown, now = new Date()): UgcPack {
  const base = parseUgcPack(current)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const next = patch as Record<string, unknown>
  const merged: UgcPack = { ...base, partner: SERGIK_UGC_PARTNER }

  if (typeof next.opted_in === 'boolean') merged.opted_in = next.opted_in
  if (typeof next.status === 'string' && isUgcPackStatus(next.status)) merged.status = next.status
  if (typeof next.youtube === 'boolean') merged.youtube = next.youtube
  if (typeof next.tiktok === 'boolean') merged.tiktok = next.tiktok
  if (typeof next.meta === 'boolean') merged.meta = next.meta
  if (typeof next.notes === 'string') merged.notes = next.notes.slice(0, 2000)
  if ('enrolled_at' in next) merged.enrolled_at = coerceIso(next.enrolled_at)
  if ('live_at' in next) merged.live_at = coerceIso(next.live_at)

  if (merged.opted_in && merged.status === 'not_opted') merged.status = 'submitted'
  if (!merged.opted_in && (merged.status === 'live' || merged.status === 'submitted')) {
    merged.status = 'not_opted'
  }

  const iso = now.toISOString()
  // Backfill enrollment if opted-in without a stamp (legacy rows / re-saves).
  if (merged.opted_in && !merged.enrolled_at) merged.enrolled_at = iso
  if (!merged.opted_in) {
    merged.enrolled_at = null
    merged.live_at = null
  }
  if (merged.status === 'live' && !merged.live_at) merged.live_at = iso
  if (merged.status !== 'live') merged.live_at = null

  merged.partner = SERGIK_UGC_PARTNER
  return merged
}

export function ugcPackEligibility(input: {
  pack: UgcPack
  sampleClearance?: string | null
  masterRegistered?: boolean
  compositionRegistered?: boolean
}): UgcPackEligibility {
  const warnings: string[] = []
  const { pack } = input

  if (!pack.opted_in) {
    return { eligible: true, warnings: [] }
  }

  if (input.sampleClearance && input.sampleClearance !== 'approved') {
    warnings.push('Sample clearance must be approved — uncleared loops/beats make Content ID claims ineligible.')
  }
  if (input.masterRegistered === false) {
    warnings.push('Register the master before SERGIK can fingerprint this release.')
  }
  if (input.compositionRegistered === false) {
    warnings.push('Register the composition so UGC claims can pay the writer share.')
  }
  if (!pack.youtube && !pack.tiktok && !pack.meta) {
    warnings.push('Turn on at least one platform: YouTube Content ID, TikTok UGC, or Meta Rights Manager.')
  }
  if (pack.status === 'ineligible') {
    warnings.push('Marked ineligible — usually a sample, cover, or a master already claimed in another CMS.')
  }

  return {
    eligible: warnings.length === 0,
    warnings,
  }
}

export function ugcPackPlatformCount(pack: UgcPack): number {
  return [pack.youtube, pack.tiktok, pack.meta].filter(Boolean).length
}

export function ugcPackNextAction(input: {
  pack: UgcPack
  eligibility: UgcPackEligibility
}): UgcPackNextAction {
  const { pack, eligibility } = input
  if (!pack.opted_in) {
    return {
      kind: 'enroll',
      label: 'Enroll this master',
      detail: 'Turn on SERGIK UGC, pick platforms, then queue fingerprints after clearance.',
    }
  }
  if (pack.status === 'ineligible') {
    return {
      kind: 'blocked',
      label: 'Resolve ineligibility',
      detail: pack.notes || 'Clear the sample/cover/CMS conflict, then re-queue.',
    }
  }
  if (!eligibility.eligible) {
    return {
      kind: 'clearance',
      label: 'Clear Rights blockers',
      detail: eligibility.warnings[0] || 'Finish master/composition registration and sample clearance.',
    }
  }
  if (!pack.youtube && !pack.tiktok && !pack.meta) {
    return {
      kind: 'platforms',
      label: 'Pick platforms',
      detail: 'Enable YouTube, TikTok, and/or Meta before fingerprinting.',
    }
  }
  if (pack.status === 'submitted') {
    return {
      kind: 'mark_live',
      label: 'Mark fingerprints live',
      detail: 'After SERGIK registers Content ID / Music ID / Rights Manager, set status to Fingerprints live.',
    }
  }
  if (pack.status === 'live') {
    return {
      kind: 'ready',
      label: 'UGC live',
      detail: 'Monitoring is on for the selected platforms. Update notes if a CMS conflict appears.',
    }
  }
  return {
    kind: 'enroll',
    label: 'Continue enrollment',
    detail: 'Confirm platforms and queue this master with SERGIK.',
  }
}

/** Status rail for the Rights UI stepper. */
export function ugcPackStatusSteps(status: UgcPackStatus, optedIn: boolean): Array<{
  id: UgcPackStatus
  label: string
  state: 'done' | 'current' | 'todo' | 'blocked'
}> {
  const order: UgcPackStatus[] = ['not_opted', 'submitted', 'live']
  if (status === 'ineligible') {
    return [
      { id: 'not_opted', label: 'Off', state: 'done' },
      { id: 'submitted', label: 'Queued', state: 'todo' },
      { id: 'ineligible', label: 'Blocked', state: 'blocked' },
    ]
  }
  const currentIdx = !optedIn ? 0 : order.indexOf(status === 'not_opted' ? 'submitted' : status)
  return order.map((id, idx) => {
    const meta = UGC_PACK_STATUSES.find((row) => row.id === id)!
    let state: 'done' | 'current' | 'todo' = 'todo'
    if (idx < currentIdx) state = 'done'
    else if (idx === currentIdx) state = 'current'
    return { id, label: meta.short, state }
  })
}
