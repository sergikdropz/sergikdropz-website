'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AdminAiApplyDiff } from '@/lib/ai/admin-ai-apply-diff'
import { buildPatchPayloadFromDiff } from '@/lib/ai/admin-ai-apply-diff'
import type { AdminAiAgentToolStep } from '@/lib/ai/admin-ai-agent-loop'
import { toolStepLog, type ToolStepBurst } from '@/lib/ai/admin-ai-tool-step-groups'
import type { AdminAiCheckpoint } from '@/lib/ai/admin-ai-checkpoints'
import type { AdminAiThreadMemory } from '@/lib/ai/admin-ai-thread-memory'

const KIND_LABEL: Record<ToolStepBurst['kind'], string> = {
  explored: 'Explored',
  read: 'Read',
  scrolled: 'Scrolled',
  checked: 'Checked',
  blocked: 'Blocked',
  ran: 'Ran',
  audited: 'Audited',
}

function burstDetail(burst: ToolStepBurst): string {
  const verb = KIND_LABEL[burst.kind]
  const prefix = `${verb} `
  return burst.label.toLowerCase().startsWith(prefix.toLowerCase()) ? burst.label.slice(prefix.length) : burst.label
}

function burstTone(burst: ToolStepBurst): string {
  if (burst.tone === 'running') return 'text-amber-200'
  if (burst.tone === 'blocked' || burst.tone === 'error') return 'text-rose-200'
  return 'text-gray-300'
}

export function AdminAiToolStepCards({ steps }: { steps: AdminAiAgentToolStep[] }) {
  const finished = steps.length > 0 && steps.every((step) => step.status !== 'running')
  const log = useMemo(() => toolStepLog(steps), [steps])
  const [open, setOpen] = useState(!finished)
  const [fullIds, setFullIds] = useState<Set<string>>(() => new Set())
  const wasFinished = useRef(finished)
  const liveId = finished ? null : (log.bursts[log.bursts.length - 1]?.id ?? null)

  useEffect(() => {
    if (!finished) {
      setOpen(true)
      wasFinished.current = false
      return
    }
    if (!wasFinished.current) {
      setOpen(false)
      wasFinished.current = true
    }
  }, [finished])

  useEffect(() => {
    if (finished || !liveId) return
    setFullIds((current) => {
      if (current.size === 0) return current
      if (current.size === 1 && current.has(liveId)) return current
      const next = new Set<string>()
      if (current.has(liveId)) next.add(liveId)
      return next
    })
  }, [finished, liveId])

  if (!steps.length) return null

  const summary = finished ? log.outcome : log.live

  return (
    <div className="relative mt-2 rounded border border-gray-700 bg-gray-900/50" data-testid="admin-ai-tool-steps">
      <div className="flex items-center px-2.5 py-1 pr-8 text-[11px] text-gray-300">
        <span className="min-w-0 truncate">{summary}</span>
      </div>
      <button
        type="button"
        className="absolute right-1 top-0.5 inline-flex h-6 w-6 items-center justify-center rounded text-gray-300 hover:bg-gray-800 hover:text-white"
        aria-expanded={open}
        aria-label={open ? 'Collapse tool steps' : 'Expand tool steps'}
        data-testid="admin-ai-tool-steps-toggle"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden className="text-sm leading-none">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="space-y-1 px-1.5 pb-1.5">
          {log.bursts.map((burst) => {
            const full = fullIds.has(burst.id)
            return (
              <div
                key={burst.id}
                className="rounded px-1.5 py-1 text-[11px]"
                title={full ? 'Double-click to compact' : 'Double-click to expand'}
                aria-expanded={full}
                role="group"
                aria-label={`${KIND_LABEL[burst.kind]}. ${burstDetail(burst)}`}
                data-testid="admin-ai-tool-burst"
                onDoubleClick={(event) => {
                  event.preventDefault()
                  setFullIds((current) => {
                    const next = new Set(current)
                    if (next.has(burst.id)) next.delete(burst.id)
                    else next.add(burst.id)
                    return next
                  })
                }}
              >
                <div className="flex items-baseline gap-2">
                  <span className={`w-16 shrink-0 font-medium ${burstTone(burst)}`}>{KIND_LABEL[burst.kind]}</span>
                  <span className={`min-w-0 ${burstTone(burst)}`}>{burstDetail(burst)}</span>
                </div>
                {full ? (
                  <p className="mt-1 select-text whitespace-pre-wrap break-words pl-[4.5rem] text-gray-400">{burst.raw}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function AdminAiApplyDiffCards({
  diffs,
  busy,
  onApprove,
}: {
  diffs: AdminAiApplyDiff[]
  busy?: boolean
  onApprove: (diff: AdminAiApplyDiff, payload: Record<string, unknown>) => void
}) {
  if (!diffs.length) return null
  return (
    <div className="mt-2 space-y-2" data-testid="admin-ai-apply-diffs">
      {diffs.map((diff, index) => (
        <div
          key={`${diff.releaseId}-${diff.field}-${index}`}
          className="rounded border border-amber-800/60 bg-amber-950/30 px-2.5 py-2 text-[11px] text-amber-50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{diff.label || diff.field}</span>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-amber-600/70 bg-amber-900/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-100 hover:bg-amber-800/60 disabled:opacity-40"
              onClick={() => onApprove(diff, buildPatchPayloadFromDiff(diff))}
            >
              Approve
            </button>
          </div>
          <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-amber-200/70">Before</div>
              <pre className="mt-0.5 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-1.5 text-[10px] text-gray-300">
                {diff.before || '—'}
              </pre>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-amber-200/70">After</div>
              <pre className="mt-0.5 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-1.5 text-[10px] text-gray-100">
                {diff.after}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function AdminAiMemoryStrip({
  memory,
  checkpoints,
  onUndo,
  undoBusy,
}: {
  memory: AdminAiThreadMemory | null
  checkpoints: AdminAiCheckpoint[]
  onUndo?: (checkpoint: AdminAiCheckpoint) => void
  undoBusy?: boolean
}) {
  if (!memory && !checkpoints.length) return null
  const last = checkpoints[checkpoints.length - 1]
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-3 py-1.5 text-[10px] text-gray-400"
      data-testid="admin-ai-memory-strip"
    >
      {memory?.goal ? <span className="truncate">Goal: {memory.goal}</span> : null}
      {memory?.releaseTitle || memory?.releaseId ? (
        <span className="truncate">Release: {memory.releaseTitle || memory.releaseId}</span>
      ) : null}
      {memory?.deskLabel || memory?.deskUrl ? (
        <span className="truncate">Desk: {memory.deskLabel || memory.deskUrl}</span>
      ) : null}
      {last && onUndo ? (
        <button
          type="button"
          disabled={undoBusy}
          className="ml-auto rounded border border-gray-700 px-1.5 py-0.5 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
          title={last.appliedSummary}
          onClick={() => onUndo(last)}
        >
          Undo last apply
        </button>
      ) : null}
    </div>
  )
}
