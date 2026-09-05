'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

type AiAction = {
  id: string
  run_id: string
  tool_name: string
  status: string
  created_at: string
}

type AiApproval = {
  id: string
  run_id: string
  action_id: string
  approved: boolean
  approved_at: string | null
}

type AiRun = {
  id: string
  admin_id: string
  request_type: 'chat' | 'execute'
  prompt: string
  response: Record<string, unknown> | null
  status: 'pending' | 'approval_required' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  completed_at: string | null
  actions: AiAction[]
  approvals: AiApproval[]
}

type RunsResponse = {
  runs: AiRun[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  error?: string
}

type HealthCheck = {
  table: string
  exists: boolean
  rowCount?: number
  error?: string
}

type HealthResponse = {
  ok: boolean
  checks: HealthCheck[]
  latestRun?: { id: string; status: string; created_at: string } | null
  message?: string
  error?: string
}

type DigestResponse = {
  generatedAt: string
  pendingApprovals: number | null
  failedRuns7d: number | null
  completedRuns24h: number | null
  openAiTasks: number | null
  recentFailures: Array<{
    id: string
    status: string
    error_message: string | null
    created_at: string
    request_type: string
  }>
  oldestApprovalWaiting: {
    id: string
    created_at: string
    prompt_snippet: string
  } | null
  alerts: string[]
  queryErrors?: Record<string, string | undefined>
  error?: string
}

type SendDigestResponse = {
  ok?: boolean
  delivered?: boolean
  deliveryReason?: string
  generatedAt?: string
  error?: string
}

type DigestSendRow = {
  id: string
  created_at: string
  trigger_source: 'cron' | 'manual_test'
  delivered: boolean
  delivery_reason: string | null
  error_message: string | null
  digest_generated_at: string
  summary: Record<string, unknown>
  created_by: string | null
}

type PlanGraphStep = { id: string; tool: string }
type TimelineEntry = { stepId: string; status: string; error?: string }

function RunPlanTimeline({ response }: { response: Record<string, unknown> | null }) {
  if (!response) return null
  const planGraph = response.planGraph as { steps?: PlanGraphStep[] } | undefined
  const timeline = response.stepTimeline as TimelineEntry[] | undefined
  const steps = planGraph?.steps
  if (!steps?.length && !timeline?.length) return null

  const statusByStep = new Map((timeline ?? []).map((entry) => [entry.stepId, entry]))

  return (
    <div className="mt-3 rounded border border-gray-800 bg-black/30 p-3 text-xs">
      <p className="font-semibold text-gray-200">Plan timeline</p>
      <ul className="mt-2 space-y-1">
        {(steps ?? []).map((step, index) => {
          const entry = statusByStep.get(step.id)
          const status = entry?.status ?? 'unknown'
          const color =
            status === 'executed'
              ? 'text-green-400'
              : status === 'failed'
                ? 'text-red-400'
                : status === 'previewed'
                  ? 'text-amber-300'
                  : status === 'skipped'
                    ? 'text-gray-500'
                    : 'text-gray-400'
          return (
            <li key={step.id} className="flex flex-wrap items-baseline gap-2">
              <span className="text-gray-500">{index + 1}.</span>
              <span className="font-mono text-gray-300">{step.tool}</span>
              <span className={color}>{status}</span>
              {entry?.error ? <span className="max-w-full truncate text-red-300">{entry.error}</span> : null}
            </li>
          )
        })}
      </ul>
      {!steps?.length && timeline?.length ? (
        <ul className="mt-2 space-y-1">
          {timeline.map((entry) => (
            <li key={entry.stepId} className="font-mono text-gray-300">
              {entry.stepId}: {entry.status}
              {entry.error ? ` — ${entry.error}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function runHasFailedSteps(response: Record<string, unknown> | null): boolean {
  const timeline = response?.stepTimeline as TimelineEntry[] | undefined
  return Boolean(timeline?.some((entry) => entry.status === 'failed'))
}

export default function AdminAiRunsPage() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
  const [runs, setRuns] = useState<AiRun[]>([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 })
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [runningSelfTest, setRunningSelfTest] = useState(false)
  const [retryNotice, setRetryNotice] = useState<string | null>(null)
  const [digest, setDigest] = useState<DigestResponse | null>(null)
  const [loadingDigest, setLoadingDigest] = useState(false)
  const [sendingDigest, setSendingDigest] = useState(false)
  const [digestNotice, setDigestNotice] = useState<string | null>(null)
  const [digestSends, setDigestSends] = useState<DigestSendRow[]>([])
  const [loadingDigestSends, setLoadingDigestSends] = useState(false)
const fetchRuns = useCallback(async () => {
    try {
      setLoadingRuns(true)
      setError(null)
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      })
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('request_type', typeFilter)

      const res = await fetch(`/api/admin/ai/runs?${params.toString()}`)
      const data = (await res.json()) as RunsResponse
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch AI runs')
      }
      setRuns(data.runs || [])
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 })
    } catch (fetchError: unknown) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch AI runs'
      setError(message)
      setRuns([])
    } finally {
      setLoadingRuns(false)
    }
  }, [page, statusFilter, typeFilter])

  async function retryRun(runId: string) {
    try {
      const res = await fetch(`/api/admin/ai/runs/${runId}/retry`, { method: 'POST' })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to retry run')
      await Promise.all([fetchRuns(), fetchDigest()])
    } catch (retryError: unknown) {
      const message = retryError instanceof Error ? retryError.message : 'Retry failed'
      setError(message)
    }
  }

  async function retryFailedPlanSteps(runId: string) {
    try {
      setRetryNotice(null)
      setError(null)
      const res = await fetch(`/api/admin/ai/runs/${runId}/retry-failed`, { method: 'POST' })
      const data = (await res.json()) as { error?: string; retryRunId?: string; message?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to queue retry for failed steps')
      setRetryNotice(data.message || `New preview run: ${data.retryRunId ?? 'created'}`)
      await Promise.all([fetchRuns(), fetchDigest()])
    } catch (retryPlanError: unknown) {
      const message = retryPlanError instanceof Error ? retryPlanError.message : 'Retry failed steps failed'
      setError(message)
    }
  }

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai/health')
      const data = (await res.json()) as HealthResponse
      if (!res.ok) throw new Error(data.error || 'Failed to load AI health')
      setHealth(data)
    } catch (healthError: unknown) {
      const message = healthError instanceof Error ? healthError.message : 'Failed to load AI health'
      setError(message)
    }
  }, [])

  const fetchDigest = useCallback(async () => {
    try {
      setLoadingDigest(true)
      const res = await fetch('/api/admin/ai/digest')
      const data = (await res.json()) as DigestResponse
      if (!res.ok) throw new Error(data.error || 'Failed to load AI digest')
      setDigest(data)
    } catch (digestError: unknown) {
      const message = digestError instanceof Error ? digestError.message : 'Failed to load AI digest'
      setError(message)
      setDigest(null)
    } finally {
      setLoadingDigest(false)
    }
  }, [])

  const fetchDigestSends = useCallback(async () => {
    try {
      setLoadingDigestSends(true)
      const res = await fetch('/api/admin/ai/digest/sends?limit=15')
      const data = (await res.json()) as { sends?: DigestSendRow[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to load digest delivery log')
      setDigestSends(Array.isArray(data.sends) ? data.sends : [])
    } catch (sendsError: unknown) {
      const message = sendsError instanceof Error ? sendsError.message : 'Failed to load digest delivery log'
      setError(message)
      setDigestSends([])
    } finally {
      setLoadingDigestSends(false)
    }
  }, [])

  async function sendTestDigest() {
    try {
      setSendingDigest(true)
      setError(null)
      setDigestNotice(null)
      const res = await fetch('/api/admin/ai/digest/send-test', { method: 'POST' })
      const data = (await res.json()) as SendDigestResponse
      if (!res.ok) throw new Error(data.error || 'Failed to send test digest')
      setDigestNotice(
        data.delivered
          ? `Test digest sent successfully at ${new Date().toLocaleTimeString()}.`
          : `Digest generated, but not delivered: ${data.deliveryReason || 'unknown reason'}.`
      )
      await Promise.all([fetchDigest(), fetchDigestSends()])
    } catch (sendDigestError: unknown) {
      const message = sendDigestError instanceof Error ? sendDigestError.message : 'Failed to send test digest'
      setError(message)
    } finally {
      setSendingDigest(false)
    }
  }

  async function runSelfTest() {
    try {
      setRunningSelfTest(true)
      setError(null)
      const res = await fetch('/api/admin/ai/health', { method: 'POST' })
      const data = (await res.json()) as HealthResponse
      if (!res.ok) throw new Error(data.error || 'Self-test failed')
      await Promise.all([fetchRuns(), fetchHealth(), fetchDigest()])
    } catch (selfTestError: unknown) {
      const message = selfTestError instanceof Error ? selfTestError.message : 'Self-test failed'
      setError(message)
    } finally {
      setRunningSelfTest(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    void fetchRuns()
    void fetchHealth()
    void fetchDigest()
    void fetchDigestSends()
  }, [isAdmin, fetchRuns, fetchHealth, fetchDigest, fetchDigestSends])

  const runSummary = useMemo(
    () => ({
      completed: runs.filter((run) => run.status === 'completed').length,
      failed: runs.filter((run) => run.status === 'failed').length,
      approvalsNeeded: runs.filter((run) => run.status === 'approval_required').length,
    }),
    [runs]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div>Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-4xl font-bold">AI Runs</h1>
          <p className="text-gray-400">Monitor AI chat/execute runs, approvals, and failures.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        {retryNotice && (
          <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
            {retryNotice}
          </div>
        )}

        <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-cyan-100">Proactive ops digest</p>
              <p className="text-xs text-cyan-200/80">
                Cross-table snapshot: approvals backlog, failures, throughput, and AI-sourced tasks.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void sendTestDigest()}
                disabled={sendingDigest}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-50 hover:bg-emerald-600 disabled:opacity-50"
              >
                {sendingDigest ? 'Sending…' : 'Send test digest'}
              </button>
              <button
                type="button"
                onClick={() => void fetchDigest()}
                disabled={loadingDigest}
                className="rounded-md bg-cyan-900 px-3 py-2 text-sm font-semibold text-cyan-50 hover:bg-cyan-800 disabled:opacity-50"
              >
                {loadingDigest ? 'Refreshing…' : 'Refresh digest'}
              </button>
              <button
                type="button"
                onClick={() => void fetchDigestSends()}
                disabled={loadingDigestSends}
                className="rounded-md border border-cyan-800 bg-transparent px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-950/50 disabled:opacity-50"
              >
                {loadingDigestSends ? 'Loading log…' : 'Refresh delivery log'}
              </button>
            </div>
          </div>
          {digestNotice && (
            <div className="mt-3 rounded border border-emerald-800 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
              {digestNotice}
            </div>
          )}
          {digest && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-xs text-cyan-300/90">
                Snapshot: {new Date(digest.generatedAt).toLocaleString()}
              </p>
              <ul className="list-disc space-y-1 pl-5 text-cyan-50">
                {digest.alerts.map((line, index) => (
                  <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="rounded border border-cyan-900/50 bg-black/30 px-2 py-2">
                  <div className="text-cyan-400">Pending approvals (all)</div>
                  <div className="text-lg font-semibold text-white">
                    {digest.pendingApprovals ?? '—'}
                  </div>
                </div>
                <div className="rounded border border-cyan-900/50 bg-black/30 px-2 py-2">
                  <div className="text-cyan-400">Failed (7d)</div>
                  <div className="text-lg font-semibold text-white">{digest.failedRuns7d ?? '—'}</div>
                </div>
                <div className="rounded border border-cyan-900/50 bg-black/30 px-2 py-2">
                  <div className="text-cyan-400">Completed (24h)</div>
                  <div className="text-lg font-semibold text-white">{digest.completedRuns24h ?? '—'}</div>
                </div>
                <div className="rounded border border-cyan-900/50 bg-black/30 px-2 py-2">
                  <div className="text-cyan-400">Open AI tasks</div>
                  <div className="text-lg font-semibold text-white">{digest.openAiTasks ?? '—'}</div>
                </div>
              </div>
              {digest.oldestApprovalWaiting && (
                <div className="rounded border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                  <span className="font-semibold">Longest-waiting approval:</span> run{' '}
                  <span className="font-mono">{digest.oldestApprovalWaiting.id}</span> since{' '}
                  {new Date(digest.oldestApprovalWaiting.created_at).toLocaleString()}
                  <div className="mt-1 text-amber-200/90">{digest.oldestApprovalWaiting.prompt_snippet}</div>
                </div>
              )}
              {digest.recentFailures.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-300">Recent failures</p>
                  <ul className="mt-1 space-y-1 text-xs text-red-200/90">
                    {digest.recentFailures.map((run) => (
                      <li key={run.id} className="font-mono">
                        {run.id.slice(0, 8)}… · {run.request_type} ·{' '}
                        {run.error_message || 'no message'} · {new Date(run.created_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="border-t border-cyan-900/40 pt-3">
                <p className="text-xs font-semibold text-cyan-200">Digest delivery log</p>
                <p className="mt-0.5 text-[11px] text-cyan-300/80">
                  Last webhook send attempts (cron + manual test). Apply migration{' '}
                  <code className="rounded bg-black/40 px-1">add_admin_ai_digest_sends.sql</code> if empty.
                </p>
                {digestSends.length === 0 && !loadingDigestSends ? (
                  <p className="mt-2 text-xs text-cyan-400/70">No delivery rows yet.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-left text-[11px] text-cyan-100/90">
                      <thead>
                        <tr className="border-b border-cyan-900/50 text-cyan-400">
                          <th className="py-1 pr-2 font-medium">Sent</th>
                          <th className="py-1 pr-2 font-medium">Source</th>
                          <th className="py-1 pr-2 font-medium">OK</th>
                          <th className="py-1 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {digestSends.map((row) => (
                          <tr key={row.id} className="border-b border-cyan-950/40 align-top">
                            <td className="py-1.5 pr-2 whitespace-nowrap text-cyan-200/90">
                              {new Date(row.created_at).toLocaleString()}
                            </td>
                            <td className="py-1.5 pr-2 font-mono text-cyan-300/90">{row.trigger_source}</td>
                            <td className="py-1.5 pr-2">{row.delivered ? 'yes' : 'no'}</td>
                            <td className="py-1.5 text-cyan-200/80">
                              {row.error_message ||
                                row.delivery_reason ||
                                `snapshot ${new Date(row.digest_generated_at).toLocaleString()}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs uppercase text-gray-400">Completed</p>
            <p className="text-2xl font-bold">{runSummary.completed}</p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs uppercase text-gray-400">Failed</p>
            <p className="text-2xl font-bold">{runSummary.failed}</p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs uppercase text-gray-400">Need approval</p>
            <p className="text-2xl font-bold">{runSummary.approvalsNeeded}</p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">AI Health</p>
              <p className="text-xs text-gray-400">
                Verifies required tables and runs a full preview/approve execute self-test.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void fetchHealth()}
                className="rounded-md bg-gray-800 px-3 py-2 text-sm font-semibold hover:bg-gray-700"
              >
                Refresh health
              </button>
              <button
                onClick={() => void runSelfTest()}
                disabled={runningSelfTest}
                className="rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-500 disabled:opacity-50"
              >
                {runningSelfTest ? 'Running self-test...' : 'Run self-test'}
              </button>
            </div>
          </div>
          {health && (
            <div className="mt-4 space-y-2 text-xs">
              <div className={`${health.ok ? 'text-green-300' : 'text-amber-300'}`}>
                Status: {health.ok ? 'healthy' : 'degraded'}
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {health.checks.map((check) => (
                  <div key={check.table} className="rounded border border-gray-800 bg-black/40 px-3 py-2">
                    <div className="font-semibold">{check.table}</div>
                    <div>{check.exists ? `ok (${check.rowCount ?? 0} rows)` : `missing (${check.error})`}</div>
                  </div>
                ))}
              </div>
              {health.latestRun && (
                <div className="text-gray-300">
                  Latest run: {health.latestRun.id} ({health.latestRun.status}) at{' '}
                  {new Date(health.latestRun.created_at).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                setPage(1)
              }}
              aria-label="Filter by run status"
              title="Filter by run status"
              className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="pending">pending</option>
              <option value="approval_required">approval_required</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value)
                setPage(1)
              }}
              aria-label="Filter by request type"
              title="Filter by request type"
              className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
            >
              <option value="">All request types</option>
              <option value="chat">chat</option>
              <option value="execute">execute</option>
            </select>
            <button
              onClick={() => {
                setStatusFilter('')
                setTypeFilter('')
                setPage(1)
              }}
              className="rounded-md bg-gray-800 px-3 py-2 text-sm font-semibold hover:bg-gray-700"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          {loadingRuns ? (
            <div className="py-10 text-center text-gray-400">Loading runs...</div>
          ) : runs.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              No AI runs found. If this is a fresh setup, apply the AI migrations first.
            </div>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => (
                <div key={run.id} className="rounded-lg border border-gray-800 bg-black/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{run.request_type.toUpperCase()} run</p>
                      <p className="mt-1 text-xs text-gray-400">{new Date(run.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-gray-800 px-2 py-1 text-xs">{run.status}</span>
                      {run.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => void retryRun(run.id)}
                          className="rounded bg-purple-600 px-2 py-1 text-xs font-semibold hover:bg-purple-500"
                        >
                          Retry (new run)
                        </button>
                      )}
                      {run.status === 'failed' && runHasFailedSteps(run.response) && (
                        <button
                          type="button"
                          onClick={() => void retryFailedPlanSteps(run.id)}
                          className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold hover:bg-amber-500"
                        >
                          Retry failed steps
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-200 whitespace-pre-wrap">{run.prompt}</p>
                  {run.error_message && (
                    <p className="mt-2 rounded bg-red-950/40 px-2 py-1 text-xs text-red-200">
                      Error: {run.error_message}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-300 md:grid-cols-3">
                    <div>Actions: {run.actions.length}</div>
                    <div>Approvals: {run.approvals.length}</div>
                    <div>
                      Tools:{' '}
                      {run.actions.length
                        ? Array.from(new Set(run.actions.map((action) => action.tool_name))).join(', ')
                        : 'n/a'}
                    </div>
                  </div>
                  <RunPlanTimeline response={run.response} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded bg-gray-800 px-3 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              disabled={page >= pagination.totalPages}
              className="rounded bg-gray-800 px-3 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
