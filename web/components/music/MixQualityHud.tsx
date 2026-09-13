'use client'

import type { MixQualitySnapshot } from '@/lib/audio/mix-engine/mix-quality'

const GRADE_CLASS: Record<MixQualitySnapshot['grade'], string> = {
  excellent: 'border-emerald-600/50 bg-emerald-900/40 text-emerald-200',
  good: 'border-sky-600/50 bg-sky-900/40 text-sky-200',
  fair: 'border-amber-600/50 bg-amber-900/40 text-amber-200',
  poor: 'border-rose-600/50 bg-rose-900/40 text-rose-200',
  unknown: 'border-gray-700 bg-gray-900/40 text-gray-400',
}

export default function MixQualityHud({
  quality,
  compact = false,
}: {
  quality: MixQualitySnapshot | null
  compact?: boolean
}) {
  if (!quality) return null
  const phaseMs = quality.phaseRmsSec * 1000
  const title = `Last mix · phase RMS ${phaseMs.toFixed(1)}ms · kick residual ${quality.kickResidualRmsMs.toFixed(1)}ms (${quality.samples} samples)`

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${GRADE_CLASS[quality.grade]}`}
        title={title}
      >
        {quality.label}
        <span className="opacity-80">
          {phaseMs.toFixed(0)}/{quality.kickResidualRmsMs.toFixed(0)}ms
        </span>
      </span>
    )
  }

  return (
    <div
      className={`rounded-md border px-2 py-1.5 text-[10px] leading-tight ${GRADE_CLASS[quality.grade]}`}
      title={title}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="uppercase tracking-[0.14em] opacity-80">Last mix</span>
        <span className="font-semibold">{quality.label}</span>
      </div>
      <div className="mt-0.5 tabular-nums opacity-90">
        phase {phaseMs.toFixed(0)}ms · kick {quality.kickResidualRmsMs.toFixed(0)}ms
      </div>
    </div>
  )
}
