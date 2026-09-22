import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getCopyrightReadinessByReleaseIds } from '@/lib/studio/copyright-pipeline'
import {
  integrationRiskBoost,
  summarizePipelineIntegrationAlerts,
  type PipelineCollabMeta,
} from '@/lib/studio/pipeline-integrations'

function daysUntil(releaseDate: string | null) {
  if (!releaseDate) return 999
  const now = Date.now()
  const target = new Date(releaseDate).getTime()
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

async function loadStoreLinkCounts(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  releaseIds: string[]
): Promise<{ total: Map<string, number>; live: Map<string, number> }> {
  const total = new Map<string, number>()
  const live = new Map<string, number>()
  if (!releaseIds.length) return { total, live }
  const { data } = await supabase
    .from('distribution_store_links')
    .select('release_id, verification_status')
    .in('release_id', releaseIds)
  for (const row of data || []) {
    const id = String(row.release_id)
    total.set(id, (total.get(id) || 0) + 1)
    const status = String((row as { verification_status?: string | null }).verification_status || '')
    if (status === 'live' || status === 'reachable') {
      live.set(id, (live.get(id) || 0) + 1)
    }
  }
  return { total, live }
}

async function loadCollabMeta(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  releaseIds: string[]
): Promise<Map<string, PipelineCollabMeta>> {
  const meta = new Map<string, PipelineCollabMeta>()
  if (!releaseIds.length) return meta

  for (const id of releaseIds) {
    meta.set(id, { collaboratorCount: 0, pendingReviews: 0, messageCount: 0 })
  }

  const [{ data: collabs, error: cErr }, { data: reviews, error: rErr }, { data: messages }] =
    await Promise.all([
      supabase.from('release_collaborators').select('release_id').in('release_id', releaseIds),
      supabase.from('release_collab_reviews').select('release_id,status').in('release_id', releaseIds),
      supabase.from('release_collab_messages').select('release_id').in('release_id', releaseIds),
    ])

  // Collab tables may be missing until migration — fail soft.
  if (cErr || rErr) return meta

  for (const row of collabs || []) {
    const id = String(row.release_id)
    const current = meta.get(id) || { collaboratorCount: 0, pendingReviews: 0, messageCount: 0 }
    current.collaboratorCount += 1
    meta.set(id, current)
  }
  for (const row of reviews || []) {
    if (String(row.status) !== 'pending') continue
    const id = String(row.release_id)
    const current = meta.get(id) || { collaboratorCount: 0, pendingReviews: 0, messageCount: 0 }
    current.pendingReviews += 1
    meta.set(id, current)
  }
  for (const row of messages || []) {
    const id = String(row.release_id)
    const current = meta.get(id) || { collaboratorCount: 0, pendingReviews: 0, messageCount: 0 }
    current.messageCount = (current.messageCount || 0) + 1
    meta.set(id, current)
  }

  return meta
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = new URL(request.url).searchParams
    const sort = searchParams.get('sort') || 'risk'
    const queue = searchParams.get('queue')
    const owner = searchParams.get('owner')
    const myQueue = searchParams.get('my_queue') === 'true'

    const supabase = createSupabaseServerClient()
    const { data: releases, error } = await supabase
      .from('distribution_releases')
      .select('id, title, type, release_date, distributor_status, artwork_url')
      .order('release_date', { ascending: true, nullsFirst: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const releaseIds = (releases || []).map((r) => r.id)
    const [readinessByRelease, storeCounts, collabByRelease] = await Promise.all([
      getCopyrightReadinessByReleaseIds(supabase, releaseIds),
      loadStoreLinkCounts(supabase, releaseIds),
      loadCollabMeta(supabase, releaseIds),
    ])

    const now = Date.now()
    const rows = (releases || [])
      .map((release) => {
        const readiness = readinessByRelease[release.id] || null
        const eta = daysUntil(release.release_date)
        const dueDateTs = readiness?.ops?.due_date
          ? new Date(readiness.ops.due_date).getTime()
          : null
        const dueInDays =
          dueDateTs === null ? null : Math.ceil((dueDateTs - now) / (1000 * 60 * 60 * 24))
        const isOverdue = dueInDays !== null && dueInDays < 0
        const isAtRisk =
          (readiness?.blockers.length || 0) > 0 &&
          eta <= 14 &&
          release.distributor_status !== 'live'
        const collab = collabByRelease.get(release.id) || {
          collaboratorCount: 0,
          pendingReviews: 0,
          messageCount: 0,
        }
        const storeLinkCount = storeCounts.total.get(release.id) || 0
        const storeLiveCount = storeCounts.live.get(release.id) || 0
        const integrationInput = {
          copyright: readiness,
          storeLinkCount,
          storeLiveCount,
          collab,
          distributorStatus: release.distributor_status,
        }
        const risk =
          (readiness?.blockers.length || 0) * 10 +
          (eta <= 14 ? 35 : 0) +
          ((readiness?.readiness_score || 0) < 70 ? 25 : 0) +
          (isOverdue ? 20 : 0) +
          (release.distributor_status === 'error' ? 15 : 0) +
          integrationRiskBoost(integrationInput, eta)

        return {
          ...release,
          eta_days: eta,
          risk_score: Math.min(100, risk),
          due_in_days: dueInDays,
          is_overdue: isOverdue,
          is_at_risk: isAtRisk,
          copyright: readiness,
          store_link_count: storeLinkCount,
          store_live_count: storeLiveCount,
          collab,
        }
      })
      .filter((row) => !queue || row.copyright?.ops?.role_queue === queue)
      .filter((row) => !myQueue || !owner || row.copyright?.ops?.owner_name === owner)

    rows.sort((a, b) => {
      if (sort === 'eta') return a.eta_days - b.eta_days
      if (sort === 'readiness') {
        return (b.copyright?.readiness_score || 0) - (a.copyright?.readiness_score || 0)
      }
      return b.risk_score - a.risk_score
    })

    const alerts = {
      overdue_count: rows.filter((row) => row.is_overdue).length,
      at_risk_count: rows.filter((row) => row.is_at_risk).length,
      unassigned_count: rows.filter((row) => !row.copyright?.ops?.owner_name).length,
      due_soon_count: rows.filter(
        (row) => row.due_in_days !== null && row.due_in_days >= 0 && row.due_in_days <= 3
      ).length,
      ...summarizePipelineIntegrationAlerts(
        rows.map((row) => ({
          copyright: row.copyright,
          storeLinkCount: row.store_link_count,
          storeLiveCount: row.store_live_count,
          collab: row.collab,
          distributorStatus: row.distributor_status,
        }))
      ),
    }

    return NextResponse.json({ releases: rows, alerts })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load command center'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
