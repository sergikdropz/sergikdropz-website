/**
 * Trusted next-track pairing for Auto DJ.
 * Scores ΔBPM, Camelot/DNA, energy, grid lock, and last-mix grade.
 */

import { scoreDnaCompatibility, resolvePlaybackBpm, type DnaMixTrack } from '@/lib/audio/sonic-dna-mix'
import { assessBeatSyncSafety } from './bpm-guard'
import { bothGridsReady, BPM_COMPAT_REL, BPM_SOFT_REL, pairBpmCompatible } from './phrase-mix-doctrine'
import { isGridLocked, needsKickRemeasure } from './kick-onsets'
import { isBrokenGroovePocket, isFourOnFloorPocket } from './mix-techniques'
import type { MixQualityGrade } from './mix-quality'
import type { SyncMode } from '@/lib/audio/auto-dj-preferences'

export { BPM_SOFT_REL, BPM_COMPAT_REL }

export type AutoDjPairTrack = DnaMixTrack & {
  title?: string
  beat_grid_offset?: number | null
  duration?: number | null
}

export type AutoDjPairScore = {
  total: number
  bpm: number
  key: number
  energy: number
  pocket: number
  grid: number
  history: number
  bpmRel: number | null
  gridsReady: boolean
  reject: boolean
  rejectReason: string | null
  why: string
}

export type ScoreAutoDjPairParams = {
  outgoing: AutoDjPairTrack
  incoming: AutoDjPairTrack
  syncMode?: SyncMode
  lastGrade?: MixQualityGrade | null
  lastIncomingId?: string | null
  /** Consecutive fair/poor mixes — tightens BPM window + grid preference. */
  consecutiveWeak?: number
}

function historyPenalty(params: ScoreAutoDjPairParams): number {
  const incomingId = params.incoming.id
  if (!incomingId || !params.lastIncomingId || incomingId !== params.lastIncomingId) {
    return 0
  }
  const weak =
    typeof params.consecutiveWeak === 'number' && params.consecutiveWeak > 0
      ? params.consecutiveWeak
      : params.lastGrade === 'poor' || params.lastGrade === 'fair'
        ? 1
        : 0
  if (params.lastGrade === 'poor') return -0.18 - weak * 0.06
  if (params.lastGrade === 'fair') return -0.08 - weak * 0.04
  if (params.lastGrade === 'good') return 0.03
  if (params.lastGrade === 'excellent') return 0.05
  return 0
}

/** Soft BPM ceiling after weak mixes (tighter than BPM_SOFT_REL). */
export function qualitySoftBpmRel(consecutiveWeak: number, lastGrade?: MixQualityGrade | null): number {
  const weak =
    consecutiveWeak > 0
      ? consecutiveWeak
      : lastGrade === 'poor' || lastGrade === 'fair'
        ? 1
        : 0
  if (weak >= 2) return BPM_SOFT_REL * 0.55
  if (weak >= 1) return BPM_SOFT_REL * 0.75
  return BPM_SOFT_REL
}

function bpmRelOf(outBpm: number | null, inBpm: number | null): number | null {
  if (!(outBpm && outBpm > 0 && inBpm && inBpm > 0)) return null
  return Math.abs(outBpm - inBpm) / Math.max(outBpm, inBpm)
}

/**
 * Pairing BPM: prefer catalog when DNA and crate labels disagree beyond soft %.
 * Stale DNA (e.g. 128 on a 160 track) must not sneak into a BeatSync FoF set.
 */
export function resolvePairBpm(track: AutoDjPairTrack): number | null {
  const catalog =
    typeof track.bpm === 'number' && Number.isFinite(track.bpm) && track.bpm > 0
      ? track.bpm
      : null
  const resolved = resolvePlaybackBpm(track) ?? null
  if (catalog && resolved) {
    const rel = Math.abs(catalog - resolved) / Math.max(catalog, resolved)
    if (rel > BPM_SOFT_REL) return catalog
  }
  return resolved ?? catalog
}

/** Score an outgoing → incoming pair. BeatSync refuses unlocked grids. */
export function scoreAutoDjPair(params: ScoreAutoDjPairParams): AutoDjPairScore {
  const { outgoing, incoming, syncMode = 'beat-sync' } = params
  const dna = scoreDnaCompatibility(outgoing, incoming)
  const outBpm = resolvePairBpm(outgoing)
  const inBpm = resolvePairBpm(incoming)
  const rel = bpmRelOf(outBpm, inBpm)

  const gridsReady = bothGridsReady(
    outgoing.sonic_dna,
    incoming.sonic_dna,
    outgoing.beat_grid_offset,
    incoming.beat_grid_offset,
  )
  const bothLocked = isGridLocked(outgoing.sonic_dna) && isGridLocked(incoming.sonic_dna)
  const peakOnlyKicks =
    (needsKickRemeasure(outgoing.sonic_dna) && !isGridLocked(outgoing.sonic_dna)) ||
    (needsKickRemeasure(incoming.sonic_dna) && !isGridLocked(incoming.sonic_dna))
  let grid = 0
  if (bothLocked && gridsReady) grid = 0.16
  else if (gridsReady) grid = 0.1
  else if (isGridLocked(outgoing.sonic_dna) || isGridLocked(incoming.sonic_dna)) grid = 0.04
  if (peakOnlyKicks) grid -= 0.06

  const history = historyPenalty(params)

  let bpmAdj = dna.bpm
  const softCeil = qualitySoftBpmRel(params.consecutiveWeak ?? 0, params.lastGrade)
  if (rel != null) {
    if (rel <= softCeil) bpmAdj = Math.max(bpmAdj, 0.28)
    else if (rel <= BPM_SOFT_REL) bpmAdj = Math.max(bpmAdj * 0.85, 0.18)
    else if (rel <= BPM_COMPAT_REL) bpmAdj *= 0.72
    else bpmAdj *= 0.25
  }

  // After weak mixes, prefer locked grids harder.
  const weakTighten =
    (params.consecutiveWeak ?? 0) > 0 ||
    params.lastGrade === 'poor' ||
    params.lastGrade === 'fair'
  if (weakTighten) {
    if (bothLocked && gridsReady) grid += 0.06
    else if (gridsReady) grid += 0.03
    else grid -= 0.08
    if (peakOnlyKicks) grid -= 0.04
  }

  const safety = assessBeatSyncSafety({
    outgoingSonicDna: outgoing.sonic_dna,
    incomingSonicDna: incoming.sonic_dna,
    outgoingBpm: outBpm,
    incomingBpm: inBpm,
    outgoingGridOffset: outgoing.beat_grid_offset,
    incomingGridOffset: incoming.beat_grid_offset,
    syncMode,
  })

  let reject = false
  let rejectReason: string | null = null
  if (syncMode === 'beat-sync' && !gridsReady) {
    reject = true
    rejectReason = 'BeatSync unsafe — grid unlocked'
  } else if (
    weakTighten &&
    params.lastIncomingId &&
    params.incoming.id === params.lastIncomingId
  ) {
    reject = true
    rejectReason = 'Avoid last incoming after weak mix'
  } else if (rel != null && weakTighten && rel > softCeil) {
    reject = true
    rejectReason = `BPM ${((rel) * 100).toFixed(1)}% apart after weak mix (max ${(softCeil * 100).toFixed(1)}%)`
  } else if (rel != null && rel > BPM_COMPAT_REL) {
    reject = true
    rejectReason = `BPM ${((rel) * 100).toFixed(1)}% apart (max ${BPM_COMPAT_REL * 100}%)`
  }

  const total = Math.max(
    0,
    Math.min(1, bpmAdj + dna.key + dna.pocket + dna.energy + grid + history),
  )

  const why = formatAutoDjPairWhy({
    total,
    bpmRel: rel,
    keyScore: dna.key,
    gridsReady,
    bothLocked,
    peakOnlyKicks,
    rejectReason,
    safetyMessage: safety.ok ? null : safety.message,
  })

  return {
    total,
    bpm: bpmAdj,
    key: dna.key,
    energy: dna.energy,
    pocket: dna.pocket,
    grid,
    history,
    bpmRel: rel,
    gridsReady,
    reject,
    rejectReason,
    why,
  }
}

export function formatAutoDjPairWhy(parts: {
  total: number
  bpmRel: number | null
  keyScore: number
  gridsReady: boolean
  bothLocked?: boolean
  peakOnlyKicks?: boolean
  rejectReason?: string | null
  safetyMessage?: string | null
}): string {
  const chunks: string[] = [`Score ${Math.round(parts.total * 100)}`]
  if (parts.bpmRel != null) {
    const sign = ''
    chunks.push(`ΔBPM ${sign}${(parts.bpmRel * 100).toFixed(1)}%`)
  }
  if (parts.keyScore >= 0.2) chunks.push('key match')
  else if (parts.keyScore >= 0.08) chunks.push('near key')
  if (parts.bothLocked) chunks.push('grids locked')
  else if (parts.gridsReady) chunks.push('grids ready')
  else chunks.push('grid unlocked')
  if (parts.peakOnlyKicks) chunks.push('peak-only kicks')
  if (parts.rejectReason) chunks.push(parts.rejectReason)
  else if (parts.safetyMessage) chunks.push(parts.safetyMessage)
  return chunks.join(' · ')
}

export function rankAutoDjPairs<T extends AutoDjPairTrack>(params: {
  outgoing: AutoDjPairTrack
  candidates: T[]
  syncMode?: SyncMode
  lastGrade?: MixQualityGrade | null
  lastIncomingId?: string | null
  consecutiveWeak?: number
  excludeIds?: Set<string>
  allowRejected?: boolean
}): Array<{ track: T; score: AutoDjPairScore }> {
  const exclude = params.excludeIds ?? new Set<string>()
  const outId = params.outgoing.id
  const scored = params.candidates
    .filter((t) => t.id && t.id !== outId && !exclude.has(t.id))
    .map((track) => ({
      track,
      score: scoreAutoDjPair({
        outgoing: params.outgoing,
        incoming: track,
        syncMode: params.syncMode,
        lastGrade: params.lastGrade,
        lastIncomingId: params.lastIncomingId,
        consecutiveWeak: params.consecutiveWeak,
      }),
    }))
    .filter((row) => params.allowRejected || !row.score.reject)
    .sort((a, b) => b.score.total - a.score.total)
  return scored
}

function isFourOnFloorLockedCandidate(
  outgoing: AutoDjPairTrack,
  incoming: AutoDjPairTrack,
): boolean {
  if (!isFourOnFloorPocket(outgoing.sonic_dna)) return false
  if (!isFourOnFloorPocket(incoming.sonic_dna)) return false
  if (isBrokenGroovePocket(incoming.sonic_dna)) return false
  return bothGridsReady(
    outgoing.sonic_dna,
    incoming.sonic_dna,
    outgoing.beat_grid_offset,
    incoming.beat_grid_offset,
  )
}

function pickFromRanked<T extends AutoDjPairTrack>(
  ranked: Array<{ track: T; score: AutoDjPairScore }>,
  randomizeTop: number,
): { track: T; score: AutoDjPairScore } | null {
  if (!ranked.length) return null
  const top = Math.max(1, randomizeTop)
  const pool = ranked.slice(0, Math.min(top, ranked.length))
  // Prefer soft-BPM pairs; if several tie at the top score, still randomize.
  const soft = pool.filter((r) => {
    const rel = r.score.bpmRel
    return rel == null || rel <= BPM_SOFT_REL
  })
  const use = soft.length ? soft : pool
  const best = use[0]!.score.total
  const tied = use.filter((r) => Math.abs(r.score.total - best) < 1e-6)
  return tied[Math.floor(Math.random() * tied.length)] ?? null
}

export function pickTrustedAutoDjTrack<T extends AutoDjPairTrack>(params: {
  outgoing: AutoDjPairTrack
  candidates: T[]
  syncMode?: SyncMode
  lastGrade?: MixQualityGrade | null
  lastIncomingId?: string | null
  consecutiveWeak?: number
  excludeIds?: Set<string>
  randomizeTop?: number
}): { track: T; score: AutoDjPairScore } | null {
  const ranked = rankAutoDjPairs(params)
  const outgoingFoF = isFourOnFloorPocket(params.outgoing.sonic_dna)
  const fofLocked = outgoingFoF
    ? ranked.filter((row) => isFourOnFloorLockedCandidate(params.outgoing, row.track))
    : []
  const trusted = pickFromRanked(fofLocked.length ? fofLocked : ranked, params.randomizeTop ?? 2)
  if (trusted) return trusted

  const exclude = params.excludeIds ?? new Set<string>()
  const hasFoFLocked = params.candidates.some((track) => {
    const id = track.id
    if (!id || id === params.outgoing.id || exclude.has(id)) return false
    return isFourOnFloorLockedCandidate(params.outgoing, track)
  })
  // Never fall back to a rejected house→trap / unlocked pair when a FoF lock exists.
  if (hasFoFLocked) return null

  const fallback = rankAutoDjPairs({ ...params, allowRejected: true })
  return fallback[0] ?? null
}

/** Diagnose why the trusted pool is empty (for Auto DJ stall UX). */
export function diagnoseAutoDjPickStall<T extends AutoDjPairTrack>(params: {
  outgoing: AutoDjPairTrack
  candidates: T[]
  syncMode?: SyncMode
  lastGrade?: MixQualityGrade | null
  lastIncomingId?: string | null
  consecutiveWeak?: number
  excludeIds?: Set<string>
}): {
  rejectReason: string
  topRejectedWhy: string | null
  needsLockGrids: boolean
  needsRemeasureKicks: boolean
  suggestTempoSync: boolean
} {
  const rejected = rankAutoDjPairs({ ...params, allowRejected: true })
  const top = rejected[0]?.score
  const reason =
    top?.rejectReason ||
    (params.syncMode === 'beat-sync' && isFourOnFloorPocket(params.outgoing.sonic_dna)
      ? 'No BeatSync-safe FoF pair in pool'
      : 'No compatible next track')
  const needsLockGrids =
    Boolean(top && !top.gridsReady) || /grid unlocked|BeatSync unsafe/i.test(reason)
  const needsRemeasureKicks =
    needsKickRemeasure(params.outgoing.sonic_dna) ||
    Boolean(rejected[0] && needsKickRemeasure(rejected[0].track.sonic_dna))
  return {
    rejectReason: reason,
    topRejectedWhy: top?.why ?? null,
    needsLockGrids,
    needsRemeasureKicks,
    suggestTempoSync: params.syncMode === 'beat-sync' && (needsLockGrids || Boolean(top?.reject)),
  }
}

export function pairSoftBpmCompatible(
  outgoingBpm: number | null | undefined,
  incomingBpm: number | null | undefined,
): boolean {
  return pairBpmCompatible(outgoingBpm, incomingBpm, BPM_SOFT_REL)
}
