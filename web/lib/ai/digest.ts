import { createSupabaseServerClient } from '@/lib/supabase'

type FailedRunRow = {
  id: string
  status: string
  error_message: string | null
  created_at: string
  request_type: string | null
}

export type AdminAiDigestSnapshot = {
  generatedAt: string
  pendingApprovals: number | null
  failedRuns7d: number | null
  completedRuns24h: number | null
  openAiTasks: number | null
  recentFailures: FailedRunRow[]
  oldestApprovalWaiting: {
    id: string
    created_at: string
    prompt_snippet: string
  } | null
  alerts: string[]
  queryErrors: {
    pendingApprovals?: string
    failedRuns7d?: string
    completedRuns24h?: string
    openAiTasks?: string
    recentFailures?: string
    oldestApproval?: string
  }
}

function truncate(text: string, max: number) {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}...`
}

export async function fetchAdminAiDigestSnapshot(): Promise<AdminAiDigestSnapshot> {
  const supabase = createSupabaseServerClient()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [pendingApprovalsRes, failed7dRes, completed24hRes, openAiTasksRes, recentFailuresRes, oldestApprovalRes] =
    await Promise.all([
      supabase
        .from('ai_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approval_required'),
      supabase.from('ai_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since7d),
      supabase
        .from('ai_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', since24h),
      supabase
        .from('admin_tasks')
        .select('id', { count: 'exact', head: true })
        .in('status', ['todo', 'in_progress'])
        .like('source', 'ai%'),
      supabase
        .from('ai_runs')
        .select('id, status, error_message, created_at, request_type')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('ai_runs')
        .select('id, created_at, prompt')
        .eq('status', 'approval_required')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

  const pendingApprovals = pendingApprovalsRes.error ? null : (pendingApprovalsRes.count ?? 0)
  const failedRuns7d = failed7dRes.error ? null : (failed7dRes.count ?? 0)
  const completedRuns24h = completed24hRes.error ? null : (completed24hRes.count ?? 0)
  const openAiTasks = openAiTasksRes.error ? null : (openAiTasksRes.count ?? 0)
  const recentFailures = recentFailuresRes.error ? [] : ((recentFailuresRes.data ?? []) as FailedRunRow[])

  const oldestApprovalWaiting = oldestApprovalRes.error
    ? null
    : oldestApprovalRes.data
      ? {
          id: oldestApprovalRes.data.id as string,
          created_at: oldestApprovalRes.data.created_at as string,
          prompt_snippet: truncate(String(oldestApprovalRes.data.prompt ?? ''), 100),
        }
      : null

  const alerts: string[] = []
  if (pendingApprovals !== null && pendingApprovals > 0) {
    alerts.push(`${pendingApprovals} AI run(s) waiting for approval`)
  }
  if (failedRuns7d !== null && failedRuns7d > 0) {
    alerts.push(`${failedRuns7d} failed run(s) in the last 7 days`)
  }
  if (openAiTasks !== null && openAiTasks > 0) {
    alerts.push(`${openAiTasks} open task(s) from AI workflows`)
  }
  if (alerts.length === 0) {
    alerts.push('No urgent AI ops items detected on this snapshot.')
  }

  return {
    generatedAt: new Date().toISOString(),
    pendingApprovals,
    failedRuns7d,
    completedRuns24h,
    openAiTasks,
    recentFailures,
    oldestApprovalWaiting,
    alerts,
    queryErrors: {
      pendingApprovals: pendingApprovalsRes.error?.message,
      failedRuns7d: failed7dRes.error?.message,
      completedRuns24h: completed24hRes.error?.message,
      openAiTasks: openAiTasksRes.error?.message,
      recentFailures: recentFailuresRes.error?.message,
      oldestApproval: oldestApprovalRes.error?.message,
    },
  }
}
