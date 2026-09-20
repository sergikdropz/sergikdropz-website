'use client'

import type { MixQualitySnapshot } from '@/lib/audio/mix-engine/mix-quality'

const GRADE_CLASS: Record<MixQualitySnapshot['grade'], string> = {
  excellent: 'border-emerald-600/50 bg-emerald-900/40 text-emerald-200',
  good: 'border-sky-600/50 bg-sky-900/40 text-sky-200',
  fair: 'border-amber-600/50 bg-amber-900/40 text-amber-200',
  poor: 'border-rose-600/50 bg-rose-900/40 text-rose-200',
  unknown: 'border-gray-700 bg-gray-900/40 text-gray-400',
}

export type AutoDjDebugHud = {
  blendStage?: string | null
  preArmLocked?: boolean | null
  cueDeltaMs?: number | null
  idleRate?: number | null
  freezeOutSec?: number | null
  gateReason?: string | null
  /** Last completed mix scorecard one-liner */
  scorecardLine?: string | null
}

export default function MixQualityHud({
  quality,
  compact = false,
  debug,
}: {
  quality: MixQualitySnapshot | null
  compact?: boolean
  debug?: AutoDjDebugHud | null
}) {
  const debugBits: string[] = []
  if (debug?.blendStage) debugBits.push(debug.blendStage)
  if (debug?.preArmLocked != null) debugBits.push(debug.preArmLocked ? 'lock' : 'unlock')
  if (typeof debug?.cueDeltaMs === 'number' && Number.isFinite(debug.cueDeltaMs)) {
    debugBits.push(`cueΔ${debug.cueDeltaMs.toFixed(0)}ms`)
  }
  if (typeof debug?.idleRate === 'number' && Number.isFinite(debug.idleRate)) {
    debugBits.push(`×${debug.idleRate.toFixed(3)}`)
  }
  if (typeof debug?.freezeOutSec === 'number' && Number.isFinite(debug.freezeOutSec)) {
    debugBits.push(`OUT@${debug.freezeOutSec.toFixed(1)}`)
  }
  if (debug?.gateReason) debugBits.push(debug.gateReason)
  if (debug?.scorecardLine) debugBits.push(debug.scorecardLine)

  if (!quality && !debugBits.length) return null

  const phaseMs = quality ? quality.phaseRmsSec * 1000 : 0
  const title = quality
    ? `Last mix · phase RMS ${phaseMs.toFixed(1)}ms · kick residual ${quality.kickResidualRmsMs.toFixed(1)}ms (${quality.samples} samples)`
    : debugBits.join(' · ')

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {quality ? (
          <span
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${GRADE_CLASS[quality.grade]}`}
            title={title}
          >
            {quality.label}
            <span className="opacity-80">
              {phaseMs.toFixed(0)}/{quality.kickResidualRmsMs.toFixed(0)}ms
            </span>
          </span>
        ) : null}
        {debugBits.length > 0 ? (
          <span
            className="inline-flex items-center rounded border border-gray-700 bg-gray-900/50 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-gray-300"
            title={debugBits.join(' · ')}
            data-testid="autodj-debug-hud"
          >
            {debugBits.join(' · ')}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <div className="space-y-1">
      {quality ? (
        <div
          className={`rounded-md border px-2 py-1.5 text-[10px] leading-tight ${GRADE_CLASS[quality.grade]}`}
          title={title}
        >
          <div className="font-semibold">{quality.label}</div>
          <div className="opacity-90 tabular-nums">
            phase {phaseMs.toFixed(1)}ms · kick {quality.kickResidualRmsMs.toFixed(1)}ms
          </div>
        </div>
      ) : null}
      {debugBits.length > 0 ? (
        <div
          className="rounded-md border border-gray-700 bg-gray-900/50 px-2 py-1.5 text-[10px] leading-tight text-gray-300 tabular-nums"
          data-testid="autodj-debug-hud"
        >
          {debugBits.join(' · ')}
        </div>
      ) : null}
    </div>
  )
}
