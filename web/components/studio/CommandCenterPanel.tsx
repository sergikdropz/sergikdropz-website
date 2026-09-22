'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AdminAuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { dispatchAdminAiPrompt } from '@/lib/admin-ai-client'
import { COMMAND_CENTER_AI_PROMPT } from '@/lib/studio/admin-ai-step-prompts'
import {
  buildPipelineIntegrationChips,
  nextActionStep,
  type IntegrationTone,
} from '@/lib/studio/pipeline-integrations'
import {
  studioCollabHref,
  studioPipelineHref,
  studioReleaseHref,
} from '@/lib/studio/studio-ia'
import { FaBrain, FaSpinner } from 'react-icons/fa'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'

type CommandRelease = {
  id: string
  title: string
  release_date: string
  distributor_status?: string | null
  eta_days: number
  risk_score: number
  due_in_days: number | null
  is_overdue: boolean
  is_at_risk: boolean
  store_link_count?: number
  store_live_count?: number
  collab?: {
    collaboratorCount: number
    pendingReviews: number
    messageCount?: number
  }
  copyright: CopyrightReadiness | null
}

type CommandAlerts = {
  overdue_count: number
  at_risk_count: number
  unassigned_count: number
  due_soon_count: number
  dsp_gap_count?: number
  ugc_queued_count?: number
  collab_pending_count?: number
  contracts_open_count?: number
  stores_empty_count?: number
}

const TONE_CLASS: Record<IntegrationTone, string> = {
  ok: 'bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-800/50',
  warn: 'bg-amber-950/35 text-amber-200 ring-1 ring-amber-800/50',
  bad: 'bg-red-950/40 text-red-300 ring-1 ring-red-800/50',
  muted: 'bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800',
}

function chipHref(releaseId: string, hrefKind?: string, step?: string | null) {
  if (hrefKind === 'collab') return studioCollabHref(releaseId)
  if (hrefKind === 'marketing') return studioPipelineHref('marketing')
  if (hrefKind === 'delivery') return studioReleaseHref(releaseId, 'delivery')
  return studioReleaseHref(releaseId, (step as 'rights' | 'catalog' | 'launch' | undefined) || 'rights')
}

export default function CommandCenterPanel() {
  const { user, isAdmin, loading } = useAuth()
  const { showNotification } = useNotifications()
  const [releases, setReleases] = useState<CommandRelease[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sort, setSort] = useState<'risk' | 'eta' | 'readiness'>('risk')
  const [queue, setQueue] = useState<'all' | 'a_and_r' | 'legal' | 'metadata' | 'marketing'>('all')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<CommandAlerts | null>(null)
  const [myQueueOnly, setMyQueueOnly] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({ sort })
      if (queue !== 'all') params.set('queue', queue)
      if (myQueueOnly && user?.email) {
        params.set('my_queue', 'true')
        params.set('owner', user.email)
      }
      const res = await fetch(`/api/studio/releases/command-center?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load command center data')
      const data = await res.json()
      setReleases(data.releases || [])
      setAlerts(data.alerts || null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load command center'
      showNotification(message, 'error')
    } finally {
      setIsLoading(false)
    }
  }, [myQueueOnly, queue, showNotification, sort, user?.email])

  useEffect(() => {
    if (isAdmin) loadData()
  }, [isAdmin, loadData])

  async function updateReleaseOps(
    releaseId: string,
    field:
      | 'owner_name'
      | 'role_queue'
      | 'split_sheet_status'
      | 'producer_agreement_status'
      | 'sample_clearance_status'
      | 'due_date',
    value: string
  ) {
    const key = `${releaseId}-${field}`
    setSavingKey(key)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/copyright`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update release ops')
      }
      await loadData()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update release ops'
      showNotification(message, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const queues = useMemo(
    () =>
      [
        { key: 'all', label: 'All queues' },
        { key: 'a_and_r', label: 'A&R' },
        { key: 'legal', label: 'Legal' },
        { key: 'metadata', label: 'Metadata' },
        { key: 'marketing', label: 'Marketing' },
      ] as const,
    []
  )

  if (loading || !user || !isAdmin) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <FaSpinner className="animate-spin text-3xl text-violet-400" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-end mb-6">
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            href={studioCollabHref()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded text-sm border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 transition"
          >
            Release Collab
            {alerts?.collab_pending_count ? (
              <span className="text-amber-300 text-xs">{alerts.collab_pending_count}</span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() =>
              dispatchAdminAiPrompt({
                agentMode: 'studio_release',
                message: COMMAND_CENTER_AI_PROMPT,
              })
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded text-sm border border-violet-500/50 bg-violet-950/40 text-violet-100 hover:bg-violet-900/50 transition"
          >
            <FaBrain />
            AI weekly priorities
          </button>
          <button
            type="button"
            onClick={() => setMyQueueOnly((prev) => !prev)}
            className={`px-3 py-2 rounded text-sm border transition ${
              myQueueOnly
                ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                : 'bg-gray-900 border-gray-700 text-gray-300'
            }`}
          >
            {myQueueOnly ? 'My Queue On' : 'My Queue'}
          </button>
          <select
            title="Sort command center rows"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            <option value="risk">Sort by risk</option>
            <option value="eta">Sort by ETA</option>
            <option value="readiness">Sort by readiness</option>
          </select>
          <select
            title="Filter command center by queue"
            value={queue}
            onChange={(event) => setQueue(event.target.value as typeof queue)}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            {queues.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {alerts && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
          <div className="bg-red-950/30 border border-red-900/60 rounded p-3">
            <p className="text-xs text-red-300">Overdue</p>
            <p className="text-xl font-semibold">{alerts.overdue_count}</p>
          </div>
          <div className="bg-yellow-950/30 border border-yellow-900/60 rounded p-3">
            <p className="text-xs text-yellow-300">At Risk</p>
            <p className="text-xl font-semibold">{alerts.at_risk_count}</p>
          </div>
          <div className="bg-orange-950/30 border border-orange-900/60 rounded p-3">
            <p className="text-xs text-orange-300">Due in 3 days</p>
            <p className="text-xl font-semibold">{alerts.due_soon_count}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded p-3">
            <p className="text-xs text-gray-400">Unassigned</p>
            <p className="text-xl font-semibold">{alerts.unassigned_count}</p>
          </div>
          <div className="bg-violet-950/25 border border-violet-900/50 rounded p-3">
            <p className="text-xs text-violet-300">DSP ingest gaps</p>
            <p className="text-xl font-semibold">{alerts.dsp_gap_count ?? 0}</p>
          </div>
          <div className="bg-sky-950/25 border border-sky-900/50 rounded p-3">
            <p className="text-xs text-sky-300">Contracts open</p>
            <p className="text-xl font-semibold">{alerts.contracts_open_count ?? 0}</p>
          </div>
          <div className="bg-fuchsia-950/25 border border-fuchsia-900/50 rounded p-3">
            <p className="text-xs text-fuchsia-300">UGC queued</p>
            <p className="text-xl font-semibold">{alerts.ugc_queued_count ?? 0}</p>
          </div>
          <div className="bg-teal-950/25 border border-teal-900/50 rounded p-3">
            <p className="text-xs text-teal-300">Collab pending</p>
            <p className="text-xl font-semibold">{alerts.collab_pending_count ?? 0}</p>
          </div>
        </div>
      )}

      {releases.some((release) => release.is_at_risk || release.is_overdue) && (
        <div className="mb-5 bg-yellow-950/20 border border-yellow-900/60 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-yellow-300 mb-2">At-Risk Alerts</h2>
          <div className="space-y-1 text-xs text-yellow-100">
            {releases
              .filter((release) => release.is_at_risk || release.is_overdue)
              .slice(0, 5)
              .map((release) => (
                <div key={release.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={studioReleaseHref(release.id, nextActionStep(release.copyright))}
                    className="hover:text-white truncate"
                  >
                    {release.title} — risk {release.risk_score} — ETA {release.eta_days}d
                  </Link>
                  <span className="text-yellow-300 shrink-0">
                    {release.is_overdue ? 'Overdue' : 'At risk'}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-800 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-900">
            <tr className="text-gray-400">
              <th className="text-left px-4 py-3">Release</th>
              <th className="text-left px-4 py-3">Risk</th>
              <th className="text-left px-4 py-3">ETA</th>
              <th className="text-left px-4 py-3">Integrations</th>
              <th className="text-left px-4 py-3">SLA</th>
              <th className="text-left px-4 py-3">Queue</th>
              <th className="text-left px-4 py-3">Owner</th>
              <th className="text-left px-4 py-3">Contracts</th>
              <th className="text-left px-4 py-3">Due</th>
              <th className="text-left px-4 py-3">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {releases.map((release) => {
              const chips = buildPipelineIntegrationChips({
                copyright: release.copyright,
                storeLinkCount: release.store_link_count ?? 0,
                storeLiveCount: release.store_live_count ?? 0,
                collab: release.collab,
                distributorStatus: release.distributor_status,
              })
              const actionStep = nextActionStep(release.copyright)
              return (
                <tr key={release.id} className="border-t border-gray-800 hover:bg-gray-900/40">
                  <td className="px-4 py-3">
                    <Link
                      href={studioReleaseHref(release.id, actionStep)}
                      className="text-white hover:text-purple-300"
                    >
                      {release.title}
                    </Link>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {release.copyright?.readiness_score ?? 0}% ready
                    </p>
                  </td>
                  <td className="px-4 py-3">{release.risk_score}</td>
                  <td className="px-4 py-3">{release.eta_days}d</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {chips
                        .filter((chip) => chip.id !== 'marketing' && chip.id !== 'press')
                        .map((chip) => (
                          <Link
                            key={chip.id}
                            href={chipHref(release.id, chip.hrefKind, chip.step)}
                            title={`${chip.label}: ${chip.detail}`}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${TONE_CLASS[chip.tone]}`}
                          >
                            {chip.label}
                          </Link>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 text-xs">
                      {release.is_overdue ? (
                        <span className="px-2 py-1 rounded bg-red-900/40 text-red-300 w-fit">
                          Overdue
                        </span>
                      ) : release.due_in_days !== null && release.due_in_days <= 3 ? (
                        <span className="px-2 py-1 rounded bg-yellow-900/40 text-yellow-300 w-fit">
                          Due soon
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded bg-gray-800 text-gray-300 w-fit">
                          On track
                        </span>
                      )}
                      <span className="text-gray-500">
                        Stage age: {release.copyright?.stage_age_days ?? 0}d
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      title="Set release queue"
                      value={release.copyright?.ops.role_queue || 'legal'}
                      onChange={(event) =>
                        updateReleaseOps(release.id, 'role_queue', event.target.value)
                      }
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
                    >
                      <option value="a_and_r">A&R</option>
                      <option value="legal">Legal</option>
                      <option value="metadata">Metadata</option>
                      <option value="marketing">Marketing</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      title="Release owner name"
                      defaultValue={release.copyright?.ops.owner_name || ''}
                      onBlur={(event) =>
                        updateReleaseOps(release.id, 'owner_name', event.target.value)
                      }
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs w-28"
                      placeholder="Owner"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {(
                        [
                          ['split_sheet_status', release.copyright?.ops.split_sheet_status || 'missing', 'Split'],
                          [
                            'producer_agreement_status',
                            release.copyright?.ops.producer_agreement_status || 'missing',
                            'Producer',
                          ],
                          [
                            'sample_clearance_status',
                            release.copyright?.ops.sample_clearance_status || 'missing',
                            'Sample',
                          ],
                        ] as const
                      ).map(([field, value, label]) => (
                        <label key={field} className="flex items-center gap-2 text-xs">
                          <span className="w-14 text-gray-500">{label}</span>
                          <select
                            title={`Set ${label} contract status`}
                            value={value}
                            onChange={(event) =>
                              updateReleaseOps(release.id, field, event.target.value)
                            }
                            className="bg-gray-900 border border-gray-700 rounded px-1 py-1 text-xs"
                          >
                            <option value="missing">Missing</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                          </select>
                        </label>
                      ))}
                      <Link
                        href={studioReleaseHref(release.id, 'rights')}
                        className="text-[10px] text-violet-300 hover:text-violet-200 mt-1"
                      >
                        Email packets →
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      title="Release due date"
                      value={release.copyright?.ops.due_date || ''}
                      onChange={(event) =>
                        updateReleaseOps(release.id, 'due_date', event.target.value)
                      }
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Link
                      href={studioReleaseHref(release.id, actionStep)}
                      className="text-yellow-300 hover:text-yellow-200"
                    >
                      {release.copyright?.next_best_action.label || 'No action'}
                    </Link>
                    {savingKey?.startsWith(release.id) && (
                      <FaSpinner className="inline ml-2 animate-spin text-gray-500" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
