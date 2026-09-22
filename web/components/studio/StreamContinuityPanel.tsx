'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  STREAM_CONTINUITY_PHASES,
  type StreamContinuityEvaluation,
  type StreamContinuityPhase,
  type StreamContinuityState,
} from '@/lib/studio/stream-continuity'
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaSpinner } from 'react-icons/fa'

type Props = {
  releaseId: string
  previouslyReleased?: boolean | null
  onUpdated?: () => void
}

export default function StreamContinuityPanel({
  releaseId,
  previouslyReleased,
  onUpdated,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [continuity, setContinuity] = useState<StreamContinuityState | null>(null)
  const [evaluation, setEvaluation] = useState<StreamContinuityEvaluation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/stream-continuity`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load checklist')
      setContinuity(data.continuity)
      setEvaluation(data.evaluation)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load checklist')
    } finally {
      setLoading(false)
    }
  }, [releaseId])

  useEffect(() => {
    void load()
  }, [load])

  async function togglePhase(phase: StreamContinuityPhase, done: boolean) {
    setSaving(phase)
    setError(null)
    try {
      const res = await fetch(`/api/studio/releases/${releaseId}/stream-continuity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phases: { [phase]: done },
          source: continuity?.source || (previouslyReleased ? 'manual' : 'manual'),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setContinuity(data.continuity)
      setEvaluation(data.evaluation)
      onUpdated?.()
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(null)
    }
  }

  if (!previouslyReleased && !evaluation?.active && !loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-500">
        Mark this release as previously released (Metadata) to unlock the migrate & keep streams
        checklist.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-4">
        <FaSpinner className="animate-spin" /> Loading stream continuity…
      </div>
    )
  }

  const steps = evaluation?.steps || []

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-500/15">
        <h3 className="text-sm font-semibold text-amber-100">Migrate & keep streams</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Same ISRC + same masters + dual-live until DSPs merge — then takedown the old distributor.
          {continuity?.source ? (
            <span className="text-zinc-400"> Source: {continuity.source.replace('_', ' ')}.</span>
          ) : null}
        </p>
      </div>

      {evaluation?.dual_live_expected ? (
        <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/15 text-xs text-amber-100/90 flex gap-2">
          <FaInfoCircle className="shrink-0 mt-0.5" />
          Dual-live is normal. Do not cancel DistroKid until Spotify/Apple show one merged release.
        </div>
      ) : null}

      {evaluation?.can_takedown_old ? (
        <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/15 text-xs text-emerald-200 flex gap-2">
          <FaCheckCircle className="shrink-0 mt-0.5" />
          Safe to issue a takedown on the old distributor and cancel that plan.
        </div>
      ) : null}

      {error ? <p className="px-4 py-2 text-xs text-rose-400">{error}</p> : null}

      <ul className="divide-y divide-zinc-800/80">
        {steps.map((step) => {
          const locked =
            step.id === 'old_takedown_safe' &&
            !steps.find((s) => s.id === 'merged_confirmed')?.done
          return (
            <li key={step.id} className="flex items-start gap-3 px-4 py-3">
              <label className="flex items-start gap-3 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-zinc-600"
                  checked={step.done}
                  disabled={Boolean(saving) || locked}
                  onChange={(e) => void togglePhase(step.id, e.target.checked)}
                />
                <span className="min-w-0">
                  <span
                    className={`text-sm ${step.done ? 'text-emerald-300' : 'text-zinc-200'}`}
                  >
                    {step.label}
                    {step.auto && step.done ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500">
                        auto
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-zinc-500 mt-0.5">{step.hint}</span>
                  {locked ? (
                    <span className="block text-[11px] text-amber-400/80 mt-1">
                      Confirm merge first
                    </span>
                  ) : null}
                </span>
              </label>
              {saving === step.id ? <FaSpinner className="animate-spin text-zinc-500" /> : null}
            </li>
          )
        })}
      </ul>

      {evaluation?.blockers?.length ? (
        <div className="px-4 py-3 border-t border-zinc-800 space-y-1">
          {evaluation.blockers.map((b) => (
            <p key={b} className="text-xs text-rose-300 flex gap-2">
              <FaExclamationTriangle className="shrink-0 mt-0.5" />
              {b}
            </p>
          ))}
        </div>
      ) : null}

      <div className="px-4 py-2 border-t border-zinc-800 text-[11px] text-zinc-600">
        Phases: {STREAM_CONTINUITY_PHASES.length} · Next:{' '}
        {evaluation?.next?.replace(/_/g, ' ') || 'done'}
      </div>
    </div>
  )
}
