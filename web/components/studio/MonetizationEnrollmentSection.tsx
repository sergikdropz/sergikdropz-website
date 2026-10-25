'use client'

import { useState } from 'react'
import {
  ENROLLMENT_STATUSES,
  MONETIZATION_PROGRAMS,
  type EnrollmentRecord,
  type MonetizationEnrollment,
  type MonetizationProgramId,
} from '@/lib/studio/monetization-enrollment'

export default function MonetizationEnrollmentSection({
  enrollment,
  saving,
  onChange,
  onCopyUgc,
}: {
  enrollment: MonetizationEnrollment
  saving?: boolean
  onChange: (next: MonetizationEnrollment) => void
  onCopyUgc?: () => void
}) {
  return (
    <div data-testid="monetization-enrollment" className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4">
      <div>
        <p className="text-sm text-zinc-200 font-medium">Where this release can earn</p>
        <p className="text-xs text-zinc-500 leading-relaxed mt-1">
          Record what you checked. An ISRC does not enroll a track. DistroKid Social Media Pack stays off
          because SERGIK UGC is the claim partner. A view is not a royalty.
        </p>
        {onCopyUgc ? (
          <button
            type="button"
            disabled={saving}
            onClick={onCopyUgc}
            className="mt-3 text-xs text-sky-300 hover:text-sky-100 disabled:opacity-40"
          >
            Copy Meta Rights Manager from the UGC pack
          </button>
        ) : null}
      </div>
      <div className="space-y-3">
        {MONETIZATION_PROGRAMS.map((program) => (
          <ProgramRow
            key={program.id}
            id={program.id}
            label={program.label}
            detail={program.detail}
            record={enrollment[program.id]}
            saving={saving}
            showFee={program.id === 'distrokid_audio_library'}
            onPatch={(partial) => onChange({ ...enrollment, [program.id]: { ...enrollment[program.id], ...partial } })}
          />
        ))}
      </div>
    </div>
  )
}

function ProgramRow({
  id,
  label,
  detail,
  record,
  saving,
  showFee,
  onPatch,
}: {
  id: MonetizationProgramId
  label: string
  detail: string
  record: EnrollmentRecord
  saving?: boolean
  showFee: boolean
  onPatch: (partial: Partial<EnrollmentRecord>) => void
}) {
  const [sourceUrl, setSourceUrl] = useState(record.sourceUrl)
  const [notes, setNotes] = useState(record.notes)
  const [fee, setFee] = useState(record.annualCostCents == null ? '' : String(record.annualCostCents))

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-zinc-200">{label}</p>
          <p className="text-xs text-zinc-500 leading-relaxed mt-0.5">{detail}</p>
        </div>
        <select
          aria-label={`${label} status`}
          disabled={saving}
          value={record.status}
          onChange={(event) => onPatch({ status: event.target.value as EnrollmentRecord['status'] })}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
        >
          {ENROLLMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-[11px] text-zinc-500 block">
          Source URL
          <input
            value={sourceUrl}
            disabled={saving}
            onChange={(event) => setSourceUrl(event.target.value)}
            onBlur={() => {
              if (sourceUrl !== record.sourceUrl) onPatch({ sourceUrl })
            }}
            placeholder="https://"
            className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white"
          />
        </label>
        <label className="text-[11px] text-zinc-500 block">
          Checked on
          <input
            type="date"
            value={record.checkedOn}
            disabled={saving}
            onChange={(event) => onPatch({ checkedOn: event.target.value })}
            className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white"
          />
        </label>
        {showFee ? (
          <label className="text-[11px] text-zinc-500 block">
            Release fee in cents, if a statement shows one
            <input
              inputMode="numeric"
              value={fee}
              disabled={saving}
              onChange={(event) => setFee(event.target.value)}
              onBlur={() => {
                const annualCostCents = fee.trim() === '' ? null : Number(fee)
                onPatch({ annualCostCents: Number.isInteger(annualCostCents) ? annualCostCents : null })
              }}
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white"
            />
          </label>
        ) : null}
        <label className="text-[11px] text-zinc-500 block sm:col-span-2">
          Note
          <input
            value={notes}
            disabled={saving}
            data-program={id}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== record.notes) onPatch({ notes })
            }}
            className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white"
          />
        </label>
      </div>
    </div>
  )
}
