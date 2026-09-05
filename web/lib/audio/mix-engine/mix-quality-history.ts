/**
 * Persist last N Auto DJ mix-quality snapshots (local device).
 */

import type { MixQualityGrade, MixQualitySnapshot } from './mix-quality'

export const MIX_QUALITY_HISTORY_KEY = 'sergik.autoDj.mixQualityHistory'
export const MIX_QUALITY_HISTORY_MAX = 20

export type MixQualityHistoryEntry = {
  at: number
  grade: MixQualityGrade
  label: string
  phaseRmsSec: number
  kickResidualRmsMs: number
  samples: number
  outgoingTitle?: string
  incomingTitle?: string
  syncMode?: string
  reason?: string
}

export function readMixQualityHistory(): MixQualityHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(MIX_QUALITY_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e) => e && typeof e === 'object' && typeof e.at === 'number')
      .slice(0, MIX_QUALITY_HISTORY_MAX) as MixQualityHistoryEntry[]
  } catch {
    return []
  }
}

export function pushMixQualityHistory(
  snap: MixQualitySnapshot,
  meta?: {
    outgoingTitle?: string
    incomingTitle?: string
    syncMode?: string
    reason?: string
  },
): MixQualityHistoryEntry[] {
  const entry: MixQualityHistoryEntry = {
    at: snap.at,
    grade: snap.grade,
    label: snap.label,
    phaseRmsSec: snap.phaseRmsSec,
    kickResidualRmsMs: snap.kickResidualRmsMs,
    samples: snap.samples,
    outgoingTitle: meta?.outgoingTitle,
    incomingTitle: meta?.incomingTitle,
    syncMode: meta?.syncMode,
    reason: meta?.reason,
  }
  const next = [entry, ...readMixQualityHistory().filter((e) => e.at !== entry.at)].slice(
    0,
    MIX_QUALITY_HISTORY_MAX,
  )
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(MIX_QUALITY_HISTORY_KEY, JSON.stringify(next))
    } catch {
      /* quota */
    }
  }
  return next
}

export function clearMixQualityHistory(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(MIX_QUALITY_HISTORY_KEY)
  } catch {
    /* ignore */
  }
}
