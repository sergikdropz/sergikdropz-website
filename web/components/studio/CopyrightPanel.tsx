'use client'

import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { dispatchAdminAiPrompt } from '@/lib/admin-ai-client'
import { FaBrain, FaShieldAlt, FaExclamationTriangle } from 'react-icons/fa'
import ReleaseReadinessRing from './ReleaseReadinessRing'

type Props = {
  readiness: CopyrightReadiness | null
  releaseId?: string
  releaseTitle?: string
  saving?: boolean
  onToggle: (field: string, value: boolean) => void
  onOpsChange: (field: string, value: string) => void
}

const BOOL_FIELDS = [
  { key: 'rights_intake_complete', label: 'Rights intake complete' },
  { key: 'legal_locked', label: 'Legal lock' },
  { key: 'composition_registered', label: 'Composition registered' },
  { key: 'master_registered', label: 'Master registered' },
  { key: 'pro_registered', label: 'PRO registered' },
  { key: 'monitoring_enabled', label: 'Post-release monitoring' },
] as const

export default function CopyrightPanel({
  readiness,
  releaseId,
  releaseTitle,
  saving,
  onToggle,
  onOpsChange,
}: Props) {
  if (!readiness) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-500 text-sm">
        Loading rights pipeline…
      </div>
    )
  }

  const checks = readiness.checks

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 overflow-hidden">
      <div className="p-6 border-b border-zinc-800 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <FaShieldAlt className="text-violet-400 text-xl mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-white">Rights & copyright</h3>
            <p className="text-sm text-zinc-500 mt-1 capitalize">
              Stage:{' '}
              <span className="text-violet-300">
                {readiness.stage.replace(/_/g, ' ')}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ReleaseReadinessRing score={readiness.readiness_score} size={64} />
          {releaseId ? (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                dispatchAdminAiPrompt({
                  agentMode: 'studio_release',
                  message: [
                    `Update copyright checklist for "${releaseTitle || releaseId}" (${releaseId}).`,
                    `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
                    'Propose update_copyright_checklist for fields that clear blockers; preview before approve.',
                  ].join('\n'),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 px-2.5 py-1 text-[10px] font-medium text-violet-200 hover:bg-violet-950/50 disabled:opacity-40"
            >
              <FaBrain className="text-[9px]" />
              AI checklist
            </button>
          ) : null}
        </div>
      </div>

      {readiness.blockers.length > 0 && (
        <div className="mx-6 mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-900/50">
          <div className="flex items-center gap-2 text-amber-300 text-sm font-medium mb-2">
            <FaExclamationTriangle />
            Blockers
          </div>
          <ul className="text-xs text-amber-100/90 space-y-1 list-disc list-inside">
            {readiness.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-6 grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Checklist
          </p>
          {BOOL_FIELDS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer"
            >
              <input
                type="checkbox"
                disabled={saving}
                checked={Boolean(checks[key as keyof typeof checks])}
                onChange={(e) => onToggle(key, e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-violet-600"
              />
              <span className="text-sm text-zinc-300">{label}</span>
            </label>
          ))}
        </div>

        <div className="space-y-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Ops</p>
          <div>
            <label className="text-xs text-zinc-500">Owner</label>
            <input
              type="text"
              defaultValue={readiness.ops.owner_name || ''}
              onBlur={(e) => onOpsChange('owner_name', e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Your name or email"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Queue</label>
            <select
              value={readiness.ops.role_queue || 'legal'}
              onChange={(e) => onOpsChange('role_queue', e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="a_and_r">A&R</option>
              <option value="legal">Legal</option>
              <option value="metadata">Metadata</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>
          {(
            [
              ['split_sheet_status', 'Split sheet'],
              ['producer_agreement_status', 'Producer agreement'],
              ['sample_clearance_status', 'Sample clearance'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="text-xs text-zinc-500">{label}</label>
              <select
                value={readiness.ops[field] || 'missing'}
                onChange={(e) => onOpsChange(field, e.target.value)}
                className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="missing">Missing</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs text-zinc-500">Due date</label>
            <input
              type="date"
              value={readiness.ops.due_date || ''}
              onChange={(e) => onOpsChange('due_date', e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <p className="text-xs text-violet-300/90 pt-2 border-t border-zinc-800">
            Next: {readiness.next_best_action.label}
          </p>
        </div>
      </div>
    </div>
  )
}
