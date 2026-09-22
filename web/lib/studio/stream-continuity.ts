/**
 * Stream-safe distributor switch checklist (LANDR-style continuity + DistroKid precision).
 * Stored under marketing_copy._stream_continuity so no migration is required.
 */

export const STREAM_CONTINUITY_PHASES = [
  'captured',
  'identity_verified',
  'masters_attached',
  'rights_complete',
  'submitted_new',
  'overlap_live',
  'merged_confirmed',
  'old_takedown_safe',
] as const

export type StreamContinuityPhase = (typeof STREAM_CONTINUITY_PHASES)[number]

export type StreamContinuitySource = 'distrokid' | 'store_url' | 'manual'

export type StreamContinuityState = {
  source: StreamContinuitySource
  seed_url?: string | null
  old_distributor?: string | null
  phases: Partial<Record<StreamContinuityPhase, boolean>>
  notes?: string | null
  updated_at?: string
}

export type StreamContinuityCheckInput = {
  previously_released?: boolean | null
  previous_isrc?: string | null
  previous_upc?: string | null
  upc?: string | null
  store_link_count?: number
  tracks: Array<{
    title?: string | null
    isrc_full?: string | null
    wav_url?: string | null
  }>
  distributor_status?: string | null
  continuity?: StreamContinuityState | null
}

export type StreamContinuityStep = {
  id: StreamContinuityPhase
  label: string
  hint: string
  done: boolean
  auto: boolean
}

export type StreamContinuityEvaluation = {
  active: boolean
  steps: StreamContinuityStep[]
  next: StreamContinuityPhase | null
  can_takedown_old: boolean
  dual_live_expected: boolean
  blockers: string[]
  warnings: string[]
}

const PHASE_COPY: Record<StreamContinuityPhase, { label: string; hint: string }> = {
  captured: {
    label: 'Catalog captured',
    hint: 'DistroKid JSON or Spotify/Apple URL imported with identifiers.',
  },
  identity_verified: {
    label: 'ISRC / UPC / store identity verified',
    hint: 'Same codes and titles as the live release — DSP Connect helps confirm links.',
  },
  masters_attached: {
    label: 'Original master WAVs attached',
    hint: 'Exact same masters as the live release — remasters break the merge.',
  },
  rights_complete: {
    label: 'Writers, producers, and attestations complete',
    hint: 'Fill credits and DSP rights before redistributing.',
  },
  submitted_new: {
    label: 'Submitted to new distributor',
    hint: 'Delivery / go-live on the SERGIK or aggregator path.',
  },
  overlap_live: {
    label: 'Dual-live overlap (expected)',
    hint: 'Same release may appear twice briefly — do not panic or takedown yet.',
  },
  merged_confirmed: {
    label: 'DSPs merged to one release',
    hint: 'Confirm Spotify/Apple still show one album with stream history intact.',
  },
  old_takedown_safe: {
    label: 'Safe to takedown old distributor',
    hint: 'Only after merge is confirmed — then cancel DistroKid / prior plan.',
  },
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function emptyStreamContinuity(
  source: StreamContinuitySource = 'manual',
): StreamContinuityState {
  return {
    source,
    phases: { captured: true },
    updated_at: new Date().toISOString(),
  }
}

export function parseStreamContinuity(raw: unknown): StreamContinuityState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const source =
    record.source === 'distrokid' || record.source === 'store_url' || record.source === 'manual'
      ? record.source
      : 'manual'
  const phasesRaw =
    record.phases && typeof record.phases === 'object' && !Array.isArray(record.phases)
      ? (record.phases as Record<string, unknown>)
      : {}
  const phases: Partial<Record<StreamContinuityPhase, boolean>> = {}
  for (const phase of STREAM_CONTINUITY_PHASES) {
    if (phasesRaw[phase] === true) phases[phase] = true
    if (phasesRaw[phase] === false) phases[phase] = false
  }
  return {
    source,
    seed_url: clean(record.seed_url) || null,
    old_distributor: clean(record.old_distributor) || null,
    phases,
    notes: clean(record.notes) || null,
    updated_at: clean(record.updated_at) || undefined,
  }
}

export function streamContinuityFromMarketingCopy(
  copy: Record<string, unknown> | null | undefined,
): StreamContinuityState | null {
  return parseStreamContinuity(copy?._stream_continuity)
}

export function marketingCopyWithStreamContinuity(
  existing: Record<string, unknown> | null | undefined,
  continuity: StreamContinuityState,
): Record<string, unknown> {
  return {
    ...(existing || {}),
    _stream_continuity: {
      ...continuity,
      updated_at: new Date().toISOString(),
    },
  }
}

export function mergeStreamContinuity(
  current: StreamContinuityState | null | undefined,
  patch: Partial<StreamContinuityState> & {
    phases?: Partial<Record<StreamContinuityPhase, boolean>>
  },
): StreamContinuityState {
  const base = current || emptyStreamContinuity(patch.source || 'manual')
  const nextPhases = { ...base.phases, ...(patch.phases || {}) }

  // Takedown unlock requires merge confirmation.
  if (nextPhases.old_takedown_safe && !nextPhases.merged_confirmed) {
    nextPhases.merged_confirmed = true
  }
  if (nextPhases.merged_confirmed && nextPhases.submitted_new) {
    nextPhases.overlap_live = true
  }

  return {
    source: patch.source || base.source,
    seed_url: patch.seed_url !== undefined ? patch.seed_url : base.seed_url,
    old_distributor:
      patch.old_distributor !== undefined ? patch.old_distributor : base.old_distributor,
    phases: nextPhases,
    notes: patch.notes !== undefined ? patch.notes : base.notes,
    updated_at: new Date().toISOString(),
  }
}

export function autoDetectStreamContinuityPhases(
  input: StreamContinuityCheckInput,
): Partial<Record<StreamContinuityPhase, boolean>> {
  const tracks = input.tracks || []
  const hasTracks = tracks.length > 0
  const allIsrc = hasTracks && tracks.every((t) => Boolean(clean(t.isrc_full)))
  const allWav = hasTracks && tracks.every((t) => Boolean(clean(t.wav_url)))
  const hasUpc = Boolean(clean(input.upc) || clean(input.previous_upc))
  const hasPreviousId = Boolean(clean(input.previous_isrc) || clean(input.previous_upc))
  const storeLinks = input.store_link_count || 0
  const status = clean(input.distributor_status).toLowerCase()
  const liveOrSubmitted = ['submitted', 'delivered', 'processing', 'live'].includes(status)

  const detected: Partial<Record<StreamContinuityPhase, boolean>> = {}
  if (input.previously_released) detected.captured = true
  if (input.previously_released && hasPreviousId && allIsrc && (hasUpc || storeLinks > 0)) {
    detected.identity_verified = true
  }
  if (allWav) detected.masters_attached = true
  if (liveOrSubmitted) {
    detected.submitted_new = true
    detected.overlap_live = true
  }
  return detected
}

export function evaluateStreamContinuity(
  input: StreamContinuityCheckInput,
): StreamContinuityEvaluation {
  const active = input.previously_released === true
  const stored = input.continuity || null
  const auto = autoDetectStreamContinuityPhases(input)
  const phases: Partial<Record<StreamContinuityPhase, boolean>> = {
    ...auto,
    ...(stored?.phases || {}),
  }

  const steps: StreamContinuityStep[] = STREAM_CONTINUITY_PHASES.map((id) => ({
    id,
    label: PHASE_COPY[id].label,
    hint: PHASE_COPY[id].hint,
    done: phases[id] === true,
    auto: auto[id] === true && stored?.phases?.[id] !== true,
  }))

  const blockers: string[] = []
  const warnings: string[] = []

  if (active) {
    if (!phases.identity_verified) {
      blockers.push('Verify identical ISRCs/UPC and store links before redistributing.')
    }
    if (!phases.masters_attached) {
      blockers.push('Attach the original master WAV for every track (remasters will not merge).')
    }
    if (phases.submitted_new && !phases.merged_confirmed) {
      warnings.push(
        'Dual-live is normal. Wait until Spotify/Apple show one merged release before DistroKid takedown.',
      )
    }
    if (phases.old_takedown_safe && !phases.merged_confirmed) {
      blockers.push('Confirm DSP merge before marking old-distributor takedown as safe.')
    }
  }

  const next =
    steps.find((step) => !step.done)?.id ||
    (phases.old_takedown_safe ? null : ('old_takedown_safe' as StreamContinuityPhase))

  const can_takedown_old = Boolean(phases.merged_confirmed && phases.old_takedown_safe)
  const dual_live_expected = Boolean(
    phases.submitted_new && !phases.merged_confirmed && !phases.old_takedown_safe,
  )

  return {
    active,
    steps,
    next: active ? next : null,
    can_takedown_old,
    dual_live_expected,
    blockers: active ? blockers : [],
    warnings: active ? warnings : [],
  }
}

/** Soft gate for go-live / distribute when switching distributors. */
export function streamContinuityDistributeWarnings(
  evaluation: StreamContinuityEvaluation,
): string[] {
  if (!evaluation.active) return []
  const out = [...evaluation.warnings]
  if (evaluation.dual_live_expected) {
    out.push('Keep the old distributor live until merge is confirmed.')
  }
  return out
}
