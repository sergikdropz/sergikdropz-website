type DistributionRelease = {
  id: string
  upc: string | null
  distributor_status: string | null
}

type DistributionTrack = {
  id: string
  release_id: string
  title: string
  wav_url: string | null
  isrc_full: string | null
  splits: unknown
}

type CopyrightChecklist = {
  release_id: string
  rights_intake_complete: boolean
  legal_locked: boolean
  composition_registered: boolean
  master_registered: boolean
  pro_registered: boolean
  monitoring_enabled: boolean
  owner_name: string | null
  role_queue: 'a_and_r' | 'legal' | 'metadata' | 'marketing' | null
  split_sheet_status: 'missing' | 'pending' | 'approved' | null
  producer_agreement_status: 'missing' | 'pending' | 'approved' | null
  sample_clearance_status: 'missing' | 'pending' | 'approved' | null
  due_date: string | null
  updated_at?: string
}

export type CopyrightStage =
  | 'draft'
  | 'rights_intake'
  | 'legal_locked'
  | 'registered'
  | 'metadata_qa'
  | 'ready_to_distribute'
  | 'released'
  | 'monitoring'

export type CopyrightReadiness = {
  stage: CopyrightStage
  readiness_score: number
  stage_age_days: number
  next_best_action: {
    kind:
      | 'assign_tracks'
      | 'upload_audio'
      | 'assign_isrc'
      | 'fix_splits'
      | 'set_upc'
      | 'complete_rights_intake'
      | 'complete_legal_lock'
      | 'register_composition'
      | 'register_master'
      | 'register_pro'
      | 'enable_monitoring'
      | 'ready'
    label: string
    field: string | null
  }
  ops: {
    owner_name: string | null
    role_queue: 'a_and_r' | 'legal' | 'metadata' | 'marketing' | null
    split_sheet_status: 'missing' | 'pending' | 'approved' | null
    producer_agreement_status: 'missing' | 'pending' | 'approved' | null
    sample_clearance_status: 'missing' | 'pending' | 'approved' | null
    due_date: string | null
  }
  blockers: string[]
  checks: {
    has_tracks: boolean
    tracks_have_audio: boolean
    tracks_have_isrc: boolean
    splits_total_100: boolean
    has_upc: boolean
    rights_intake_complete: boolean
    legal_locked: boolean
    contracts_approved: boolean
    composition_registered: boolean
    master_registered: boolean
    pro_registered: boolean
    metadata_qa_passed: boolean
    ready_to_distribute: boolean
    released: boolean
    monitoring_enabled: boolean
  }
}

const DEFAULT_CHECKLIST: Omit<CopyrightChecklist, 'release_id'> = {
  rights_intake_complete: false,
  legal_locked: false,
  composition_registered: false,
  master_registered: false,
  pro_registered: false,
  monitoring_enabled: false,
  owner_name: null,
  role_queue: 'legal',
  split_sheet_status: 'missing',
  producer_agreement_status: 'missing',
  sample_clearance_status: 'missing',
  due_date: null,
}

function readSplitsTotal(rawSplits: unknown): number | null {
  if (!Array.isArray(rawSplits)) return null
  let total = 0
  for (const split of rawSplits) {
    if (!split || typeof split !== 'object') continue
    const value = (split as { percentage?: unknown }).percentage
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) total += numeric
  }
  return total
}

function buildReadiness(
  release: DistributionRelease,
  tracks: DistributionTrack[],
  checklist: CopyrightChecklist
): CopyrightReadiness {
  const hasTracks = tracks.length > 0
  const tracksHaveAudio = hasTracks && tracks.every((t) => Boolean(t.wav_url))
  const tracksHaveIsrc = hasTracks && tracks.every((t) => Boolean(t.isrc_full))
  const splitsTotals = tracks.map((t) => readSplitsTotal(t.splits))
  const splitsTotal100 =
    hasTracks &&
    splitsTotals.every(
      (total) => total !== null && Math.abs(total - 100) < 0.001
    )
  const hasUpc = Boolean(release.upc && release.upc.trim().length > 0)
  const metadataQaPassed =
    hasTracks && tracksHaveAudio && tracksHaveIsrc && splitsTotal100 && hasUpc
  const contractsApproved =
    checklist.split_sheet_status === 'approved' &&
    checklist.producer_agreement_status === 'approved' &&
    checklist.sample_clearance_status === 'approved'

  const released = (release.distributor_status || 'draft') !== 'draft'
  const readyToDistribute =
    checklist.rights_intake_complete &&
    checklist.legal_locked &&
    contractsApproved &&
    checklist.composition_registered &&
    checklist.master_registered &&
    checklist.pro_registered &&
    metadataQaPassed

  const blockers: string[] = []
  const blockerActions: Array<{
    kind: CopyrightReadiness['next_best_action']['kind']
    label: string
    field: string | null
  }> = []
  if (!hasTracks) {
    blockers.push('Add at least one track to the release.')
    blockerActions.push({
      kind: 'assign_tracks',
      label: 'Add tracks to this release',
      field: null,
    })
  }
  if (!tracksHaveAudio) {
    blockers.push('Every track must include a WAV file.')
    blockerActions.push({
      kind: 'upload_audio',
      label: 'Upload missing WAV files',
      field: null,
    })
  }
  if (!tracksHaveIsrc) {
    blockers.push('Assign ISRC codes to all tracks.')
    blockerActions.push({
      kind: 'assign_isrc',
      label: 'Assign missing ISRC codes',
      field: null,
    })
  }
  if (!splitsTotal100) {
    blockers.push('Track splits must total 100% for every track.')
    blockerActions.push({
      kind: 'fix_splits',
      label: 'Fix track split percentages',
      field: null,
    })
  }
  if (!hasUpc) {
    blockers.push('Set a UPC for this release.')
    blockerActions.push({
      kind: 'set_upc',
      label: 'Set release UPC',
      field: null,
    })
  }
  if (!checklist.rights_intake_complete) {
    blockers.push('Complete rights intake.')
    blockerActions.push({
      kind: 'complete_rights_intake',
      label: 'Mark rights intake complete',
      field: 'rights_intake_complete',
    })
  }
  if (!checklist.legal_locked) {
    blockers.push('Legal lock is not complete.')
    blockerActions.push({
      kind: 'complete_legal_lock',
      label: 'Mark legal lock complete',
      field: 'legal_locked',
    })
  }
  if (!contractsApproved) {
    blockers.push('All contract statuses must be approved.')
    blockerActions.push({
      kind: 'complete_legal_lock',
      label: 'Approve split, producer, and clearance contracts',
      field: null,
    })
  }
  if (!checklist.composition_registered) {
    blockers.push('Composition copyright is not registered.')
    blockerActions.push({
      kind: 'register_composition',
      label: 'Mark composition registration complete',
      field: 'composition_registered',
    })
  }
  if (!checklist.master_registered) {
    blockers.push('Master copyright is not registered.')
    blockerActions.push({
      kind: 'register_master',
      label: 'Mark master registration complete',
      field: 'master_registered',
    })
  }
  if (!checklist.pro_registered) {
    blockers.push('PRO registration is not complete.')
    blockerActions.push({
      kind: 'register_pro',
      label: 'Mark PRO registration complete',
      field: 'pro_registered',
    })
  }

  let stage: CopyrightStage = 'draft'
  if (checklist.rights_intake_complete) stage = 'rights_intake'
  if (checklist.legal_locked) stage = 'legal_locked'
  if (
    checklist.composition_registered &&
    checklist.master_registered &&
    checklist.pro_registered
  ) {
    stage = 'registered'
  }
  if (metadataQaPassed) stage = 'metadata_qa'
  if (readyToDistribute) stage = 'ready_to_distribute'
  if (released) stage = 'released'
  if (released && checklist.monitoring_enabled) stage = 'monitoring'

  const scoreChecks = [
    hasTracks,
    tracksHaveAudio,
    tracksHaveIsrc,
    splitsTotal100,
    hasUpc,
    checklist.rights_intake_complete,
    checklist.legal_locked,
    contractsApproved,
    checklist.composition_registered,
    checklist.master_registered,
    checklist.pro_registered,
    metadataQaPassed,
  ]
  const readinessScore = Math.round(
    (scoreChecks.filter(Boolean).length / scoreChecks.length) * 100
  )
  const stageAgeDays = checklist.updated_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(checklist.updated_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0
  const nextBestAction =
    blockerActions[0] ||
    (released && !checklist.monitoring_enabled
      ? {
          kind: 'enable_monitoring' as const,
          label: 'Enable post-release monitoring',
          field: 'monitoring_enabled',
        }
      : {
          kind: 'ready' as const,
          label: 'Release is ready for distribution',
          field: null,
        })

  return {
    stage,
    readiness_score: readinessScore,
    stage_age_days: stageAgeDays,
    next_best_action: nextBestAction,
    ops: {
      owner_name: checklist.owner_name,
      role_queue: checklist.role_queue,
      split_sheet_status: checklist.split_sheet_status,
      producer_agreement_status: checklist.producer_agreement_status,
      sample_clearance_status: checklist.sample_clearance_status,
      due_date: checklist.due_date,
    },
    blockers,
    checks: {
      has_tracks: hasTracks,
      tracks_have_audio: tracksHaveAudio,
      tracks_have_isrc: tracksHaveIsrc,
      splits_total_100: splitsTotal100,
      has_upc: hasUpc,
      rights_intake_complete: checklist.rights_intake_complete,
      legal_locked: checklist.legal_locked,
      contracts_approved: contractsApproved,
      composition_registered: checklist.composition_registered,
      master_registered: checklist.master_registered,
      pro_registered: checklist.pro_registered,
      metadata_qa_passed: metadataQaPassed,
      ready_to_distribute: readyToDistribute,
      released,
      monitoring_enabled: checklist.monitoring_enabled,
    },
  }
}

export async function getCopyrightReadinessByReleaseIds(
  supabase: any,
  releaseIds: string[]
) {
  const uniqueIds = Array.from(new Set(releaseIds))
  if (uniqueIds.length === 0) return {}

  const [releasesResult, tracksResult, checklistResult] = await Promise.all([
    supabase
      .from('distribution_releases')
      .select('id, upc, distributor_status')
      .in('id', uniqueIds),
    supabase
      .from('distribution_tracks')
      .select('id, release_id, title, wav_url, isrc_full, splits')
      .in('release_id', uniqueIds),
    supabase
      .from('release_copyright_checklists')
      .select(
        'release_id, rights_intake_complete, legal_locked, composition_registered, master_registered, pro_registered, monitoring_enabled, owner_name, role_queue, split_sheet_status, producer_agreement_status, sample_clearance_status, due_date, updated_at'
      )
      .in('release_id', uniqueIds),
  ])

  if (releasesResult.error) throw releasesResult.error
  if (tracksResult.error) throw tracksResult.error

  const checklistMissingTable =
    checklistResult.error &&
    checklistResult.error.message?.includes('release_copyright_checklists')
  if (checklistResult.error && !checklistMissingTable) throw checklistResult.error

  const releaseMap = new Map<string, DistributionRelease>()
  for (const release of releasesResult.data || []) {
    releaseMap.set(release.id, release)
  }

  const tracksByRelease: Record<string, DistributionTrack[]> = {}
  for (const id of uniqueIds) tracksByRelease[id] = []
  for (const track of tracksResult.data || []) {
    if (!tracksByRelease[track.release_id]) tracksByRelease[track.release_id] = []
    tracksByRelease[track.release_id].push(track)
  }

  const checklistByRelease: Record<string, CopyrightChecklist> = {}
  for (const id of uniqueIds) {
    checklistByRelease[id] = { release_id: id, ...DEFAULT_CHECKLIST }
  }
  for (const row of checklistResult.data || []) {
    checklistByRelease[row.release_id] = row
  }

  const readinessByRelease: Record<string, CopyrightReadiness> = {}
  for (const id of uniqueIds) {
    const release = releaseMap.get(id)
    if (!release) continue
    readinessByRelease[id] = buildReadiness(
      release,
      tracksByRelease[id] || [],
      checklistByRelease[id]
    )
  }

  return readinessByRelease
}

export async function getSingleReleaseCopyrightReadiness(
  supabase: any,
  releaseId: string
) {
  const readinessByRelease = await getCopyrightReadinessByReleaseIds(supabase, [
    releaseId,
  ])
  return readinessByRelease[releaseId] || null
}
