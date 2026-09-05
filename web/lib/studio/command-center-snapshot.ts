import { createSupabaseServerClient } from '@/lib/supabase'
import { getCopyrightReadinessByReleaseIds } from '@/lib/studio/copyright-pipeline'

function daysUntil(releaseDate: string | null) {
  if (!releaseDate) return 999
  const target = new Date(releaseDate).getTime()
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))
}

export type StudioCommandCenterSnapshot = {
  generatedAt: string
  alerts: {
    overdue_count: number
    at_risk_count: number
    unassigned_count: number
    due_soon_count: number
  }
  dueThisWeek: Array<{
    id: string
    title: string
    release_date: string | null
    eta_days: number
    risk_score: number
    distributor_status: string | null
    readiness_score: number
    blockers: string[]
    next_action: string | null
    owner: string | null
    role_queue: string | null
  }>
  topPriorities: Array<{
    id: string
    title: string
    risk_score: number
    reason: string
  }>
}

export async function fetchStudioCommandCenterSnapshot(params?: {
  dueWithinDays?: number
}): Promise<StudioCommandCenterSnapshot> {
  const dueWithinDays = params?.dueWithinDays ?? 7
  const supabase = createSupabaseServerClient()

  const { data: releases, error } = await supabase
    .from('distribution_releases')
    .select('id, title, release_date, distributor_status')
    .order('release_date', { ascending: true, nullsFirst: false })

  if (error) {
    throw new Error(error.message)
  }

  const releaseIds = (releases || []).map((r) => r.id)
  const readinessByRelease = await getCopyrightReadinessByReleaseIds(supabase, releaseIds)
  const now = Date.now()

  const rows = (releases || []).map((release) => {
    const readiness = readinessByRelease[release.id] || null
    const eta = daysUntil(release.release_date)
    const dueDateTs = readiness?.ops?.due_date ? new Date(readiness.ops.due_date).getTime() : null
    const dueInDays =
      dueDateTs === null ? null : Math.ceil((dueDateTs - now) / (1000 * 60 * 60 * 24))
    const isOverdue = dueInDays !== null && dueInDays < 0
    const isAtRisk =
      (readiness?.blockers.length || 0) > 0 &&
      eta <= 14 &&
      release.distributor_status !== 'live'
    const risk =
      (readiness?.blockers.length || 0) * 10 +
      (eta <= 14 ? 35 : 0) +
      ((readiness?.readiness_score || 0) < 70 ? 25 : 0) +
      (isOverdue ? 20 : 0) +
      (release.distributor_status === 'error' ? 15 : 0)

    return {
      id: release.id,
      title: release.title,
      release_date: release.release_date,
      distributor_status: release.distributor_status,
      eta_days: eta,
      risk_score: Math.min(100, risk),
      due_in_days: dueInDays,
      is_overdue: isOverdue,
      is_at_risk: isAtRisk,
      copyright: readiness,
    }
  })

  const alerts = {
    overdue_count: rows.filter((row) => row.is_overdue).length,
    at_risk_count: rows.filter((row) => row.is_at_risk).length,
    unassigned_count: rows.filter((row) => !row.copyright?.ops?.owner_name).length,
    due_soon_count: rows.filter(
      (row) => row.due_in_days !== null && row.due_in_days >= 0 && row.due_in_days <= 3
    ).length,
  }

  const dueThisWeek = rows
    .filter(
      (row) =>
        row.release_date &&
        row.eta_days >= 0 &&
        row.eta_days <= dueWithinDays &&
        row.distributor_status !== 'live'
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      release_date: row.release_date,
      eta_days: row.eta_days,
      risk_score: row.risk_score,
      distributor_status: row.distributor_status,
      readiness_score: row.copyright?.readiness_score ?? 0,
      blockers: row.copyright?.blockers ?? [],
      next_action: row.copyright?.next_best_action?.label ?? null,
      owner: row.copyright?.ops?.owner_name ?? null,
      role_queue: row.copyright?.ops?.role_queue ?? null,
    }))

  const topPriorities = [...rows]
    .filter((r) => r.distributor_status !== 'live')
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      title: row.title,
      risk_score: row.risk_score,
      reason: [
        row.is_overdue ? 'overdue ops due date' : null,
        row.is_at_risk ? 'at risk (blockers + release within 14d)' : null,
        (row.copyright?.blockers.length || 0) > 0 ? `${row.copyright!.blockers.length} blocker(s)` : null,
        row.eta_days <= 7 ? `release in ${row.eta_days}d` : null,
      ]
        .filter(Boolean)
        .join('; ') || 'elevated risk score',
    }))

  return {
    generatedAt: new Date().toISOString(),
    alerts,
    dueThisWeek,
    topPriorities,
  }
}
