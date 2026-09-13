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
  outgoingTrackId?: string
  incomingTrackId?: string
  syncMode?: string
  reason?: string
}

const HISTORY_GRADES: MixQualityGrade[] = ['excellent', 'good', 'fair', 'poor', 'unknown']

export function parseMixQualityHistory(raw: unknown): MixQualityHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .filter((e) => typeof e.at === 'number' && HISTORY_GRADES.includes(e.grade as MixQualityGrade))
    .map((e) => ({
      at: e.at as number,
      grade: e.grade as MixQualityGrade,
      label: typeof e.label === 'string' ? e.label : String(e.grade),
      phaseRmsSec: Number(e.phaseRmsSec) || 0,
      kickResidualRmsMs: Number(e.kickResidualRmsMs) || 0,
      samples: Number(e.samples) || 0,
      outgoingTitle: typeof e.outgoingTitle === 'string' ? e.outgoingTitle : undefined,
      incomingTitle: typeof e.incomingTitle === 'string' ? e.incomingTitle : undefined,
      outgoingTrackId: typeof e.outgoingTrackId === 'string' ? e.outgoingTrackId : undefined,
      incomingTrackId: typeof e.incomingTrackId === 'string' ? e.incomingTrackId : undefined,
      syncMode: typeof e.syncMode === 'string' ? e.syncMode : undefined,
      reason: typeof e.reason === 'string' ? e.reason : undefined,
    }))
    .slice(0, MIX_QUALITY_HISTORY_MAX)
}

/** Union local + cloud by `at`, newest first. */
export function mergeMixQualityHistory(
  local: MixQualityHistoryEntry[],
  cloud: MixQualityHistoryEntry[],
): MixQualityHistoryEntry[] {
  const byAt = new Map<number, MixQualityHistoryEntry>()
  for (const e of [...cloud, ...local]) {
    if (!byAt.has(e.at)) byAt.set(e.at, e)
  }
  return [...byAt.values()].sort((a, b) => b.at - a.at).slice(0, MIX_QUALITY_HISTORY_MAX)
}

export function extractMixQualityHistoryFromSettings(raw: unknown): MixQualityHistoryEntry[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  return parseMixQualityHistory(o._mixQualityHistory ?? o.mixQualityHistory)
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
    outgoingTrackId?: string
    incomingTrackId?: string
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
    outgoingTrackId: meta?.outgoingTrackId,
    incomingTrackId: meta?.incomingTrackId,
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

/** Leading streak of fair/poor grades (newest first). */
export function consecutiveWeakMixCount(
  history: Array<{ grade: MixQualityGrade }>,
): number {
  let n = 0
  for (const e of history) {
    if (e.grade === 'poor' || e.grade === 'fair') n += 1
    else break
  }
  return n
}
