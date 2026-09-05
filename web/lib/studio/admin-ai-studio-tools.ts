import { createSupabaseServerClient } from '@/lib/supabase'
import { assignISRC } from '@/lib/studio/isrc'
import type { MarketingCopy } from '@/lib/studio/constants'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'

const MARKETING_COPY_KEYS = [
  'elevator_pitch',
  'press_blurb',
  'spotify_pitch',
  'social_caption',
  'store_description',
  'credits_block',
] as const

const COPYRIGHT_CHECKLIST_FIELDS = [
  'rights_intake_complete',
  'legal_locked',
  'composition_registered',
  'master_registered',
  'pro_registered',
  'monitoring_enabled',
  'owner_name',
  'role_queue',
  'split_sheet_status',
  'producer_agreement_status',
  'sample_clearance_status',
  'due_date',
] as const

type CopyrightField = (typeof COPYRIGHT_CHECKLIST_FIELDS)[number]

function pickMarketingCopy(raw: Record<string, unknown>): MarketingCopy {
  const out: MarketingCopy = {}
  for (const key of MARKETING_COPY_KEYS) {
    if (typeof raw[key] === 'string') {
      out[key] = raw[key]
    }
  }
  return out
}

function pickCopyrightUpdates(raw: Record<string, unknown>) {
  const updates: Partial<Record<CopyrightField, boolean | string>> = {}
  for (const field of COPYRIGHT_CHECKLIST_FIELDS) {
    if (typeof raw[field] === 'boolean') {
      updates[field] = raw[field]
    }
    if (
      (field === 'owner_name' ||
        field === 'role_queue' ||
        field === 'split_sheet_status' ||
        field === 'producer_agreement_status' ||
        field === 'sample_clearance_status' ||
        field === 'due_date') &&
      typeof raw[field] === 'string'
    ) {
      updates[field] = raw[field]
    }
  }
  return updates
}

export async function previewPatchReleaseMarketingCopy(params: {
  releaseId: string
  marketingCopy: Record<string, unknown>
  merge?: boolean
}) {
  const supabase = createSupabaseServerClient()
  const { data: release, error } = await supabase
    .from('distribution_releases')
    .select('id, title, marketing_copy')
    .eq('id', params.releaseId)
    .single()

  if (error || !release) {
    throw new Error('Release not found')
  }

  const incoming = pickMarketingCopy(params.marketingCopy)
  if (Object.keys(incoming).length === 0) {
    throw new Error('No valid marketing_copy fields provided')
  }

  const existing = (release.marketing_copy as MarketingCopy) || {}
  const merged =
    params.merge === false ? incoming : { ...existing, ...incoming }

  return {
    releaseId: params.releaseId,
    title: release.title,
    fieldsUpdated: Object.keys(incoming),
    before: existing,
    after: merged,
    studioUrl: `/studio/releases/${encodeURIComponent(params.releaseId)}`,
  }
}

export async function applyPatchReleaseMarketingCopy(params: {
  releaseId: string
  marketingCopy: Record<string, unknown>
  merge?: boolean
}) {
  const preview = await previewPatchReleaseMarketingCopy(params)
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('distribution_releases')
    .update({ marketing_copy: preview.after })
    .eq('id', params.releaseId)
    .select('id, title, marketing_copy')
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update marketing copy')
  }

  return {
    release: data,
    fieldsUpdated: preview.fieldsUpdated,
    studioUrl: preview.studioUrl,
  }
}

export async function previewUpdateCopyrightChecklist(params: {
  releaseId: string
  updates: Record<string, unknown>
}) {
  const updates = pickCopyrightUpdates(params.updates)
  if (Object.keys(updates).length === 0) {
    throw new Error('No valid copyright checklist fields provided')
  }

  const supabase = createSupabaseServerClient()
  const before = await getSingleReleaseCopyrightReadiness(supabase, params.releaseId)

  return {
    releaseId: params.releaseId,
    fieldsUpdated: Object.keys(updates),
    updates,
    currentStage: before.stage,
    currentScore: before.readiness_score,
    blockersBefore: before.blockers,
    studioUrl: `/studio/releases/${encodeURIComponent(params.releaseId)}`,
  }
}

export async function applyUpdateCopyrightChecklist(params: {
  releaseId: string
  updates: Record<string, unknown>
}) {
  const preview = await previewUpdateCopyrightChecklist(params)
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('release_copyright_checklists').upsert(
    {
      release_id: params.releaseId,
      ...preview.updates,
    },
    { onConflict: 'release_id' }
  )

  if (error) {
    throw new Error(error.message || 'Failed to update copyright checklist')
  }

  const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.releaseId)
  return {
    releaseId: params.releaseId,
    fieldsUpdated: preview.fieldsUpdated,
    readiness,
    studioUrl: preview.studioUrl,
  }
}

export async function previewAssignIsrcs(params: { releaseId?: string; trackIds?: string[] }) {
  const supabase = createSupabaseServerClient()
  let trackIds = params.trackIds?.filter(Boolean) ?? []

  if (params.releaseId) {
    const { data: tracks, error } = await supabase
      .from('distribution_tracks')
      .select('id, title, isrc_full')
      .eq('release_id', params.releaseId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }
    trackIds = (tracks || []).filter((t) => !t.isrc_full).map((t) => t.id)
    return {
      releaseId: params.releaseId,
      tracksToAssign: (tracks || [])
        .filter((t) => !t.isrc_full)
        .map((t) => ({ id: t.id, title: t.title })),
      alreadyAssigned: (tracks || []).filter((t) => t.isrc_full).length,
      count: trackIds.length,
    }
  }

  if (!trackIds.length) {
    throw new Error('Provide releaseId or trackIds')
  }

  const { data: tracks } = await supabase
    .from('distribution_tracks')
    .select('id, title, isrc_full')
    .in('id', trackIds)

  const missing = (tracks || []).filter((t) => !t.isrc_full)
  return {
    releaseId: null,
    tracksToAssign: missing.map((t) => ({ id: t.id, title: t.title })),
    alreadyAssigned: (tracks || []).length - missing.length,
    count: missing.length,
  }
}

export async function applyAssignIsrcs(params: { releaseId?: string; trackIds?: string[] }) {
  const prefix = process.env.ISRC_PREFIX
  if (!prefix) {
    throw new Error('ISRC_PREFIX not configured')
  }

  const preview = await previewAssignIsrcs(params)
  const ids = preview.tracksToAssign.map((t) => t.id)

  const results: Array<{ track_id: string; isrc?: string; status: 'ok' | 'error'; message?: string }> = []

  for (const trackId of ids) {
    try {
      const assignment = await assignISRC(trackId, prefix)
      results.push({ track_id: trackId, isrc: assignment.isrc, status: 'ok' })
    } catch (err: unknown) {
      results.push({
        track_id: trackId,
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed',
      })
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length
  return {
    releaseId: params.releaseId ?? null,
    total: results.length,
    successful: ok,
    failed: results.length - ok,
    results,
    studioUrl: params.releaseId
      ? `/studio/releases/${encodeURIComponent(params.releaseId)}`
      : null,
  }
}
