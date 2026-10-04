'use client'

import type { AdminAiApplyDiff } from '@/lib/ai/admin-ai-apply-diff'
import { buildPatchPayloadFromDiff } from '@/lib/ai/admin-ai-apply-diff'
import type { AdminAiAgentToolStep } from '@/lib/ai/admin-ai-agent-loop'
import type { AdminAiCheckpoint } from '@/lib/ai/admin-ai-checkpoints'
import { ADMIN_AI_MENTION_SUGGESTIONS } from '@/lib/ai/admin-ai-mentions'
import type { AdminAiThreadMemory } from '@/lib/ai/admin-ai-thread-memory'

export function AdminAiToolStepCards({ steps }: { steps: AdminAiAgentToolStep[] }) {
  if (!steps.length) return null
  return (
    <div className="mt-2 space-y-1.5" data-testid="admin-ai-tool-steps">
      {steps.map((step) => (
        <div
          key={step.id}
          className="rounded border border-gray-700 bg-gray-900/80 px-2.5 py-1.5 text-[11px] text-gray-300"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-gray-100">{step.tool}</span>
            <span
              className={
                step.status === 'running'
                  ? 'text-amber-300'
                  : step.status === 'error'
                    ? 'text-rose-300'
                    : 'text-emerald-300'
              }
            >
              {step.status}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-3 text-gray-400">{step.summary}</p>
        </div>
      ))}
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

export function AdminAiMentionChips({
  onInsert,
}: {
  onInsert: (text: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1" data-testid="admin-ai-mention-chips">
      {ADMIN_AI_MENTION_SUGGESTIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={`Insert ${item.label}`}
          className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-300 hover:border-gray-500 hover:text-white"
          onClick={() => onInsert(item.insert)}
        >
          {item.label}
        </button>
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
