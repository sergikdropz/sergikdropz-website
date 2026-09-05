/**
 * Resolve beat-grid **phase** for mix planning / UI.
 *
 * Dual-clock doctrine:
 * - Phrase lattice always starts at file t=0 (see phrase-lattice.ts).
 * - `beat_grid_offset` is within-beat phase only [0, beatSec).
 * - First-kick absolute times label sections / residual sync — they must NOT
 *   redefine phrase-1 origin.
 */

import { alignBeatGridFromPeaks, beatPeriodSec } from '@/lib/audio/beat-grid'
import { extractMeasured } from '@/lib/audio/sonic-dna-quality'
import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import { toPhaseOnlyOffsetSec } from './phrase-lattice'
import type { MixTrackRef } from './types'

export type MixGridPeaks = {
  peaks: Array<number | { positive?: number; negative?: number; rms?: number }>
  durationSec: number
}

/** @deprecated Phase 0 is valid; prefer isUnsetOffset. Kept for call-site compat. */
export const MIN_STORED_OFFSET = 0

const MIN_ALIGN_LOCK = 0.32
const OVERRIDE_LOCK = 0.48

export function phaseDeltaSec(a: number, b: number, beatSec: number): number {
  if (!(beatSec > 0)) return Math.abs(a - b)
  const pa = ((a % beatSec) + beatSec) % beatSec
  const pb = ((b % beatSec) + beatSec) % beatSec
  let d = Math.abs(pa - pb)
  if (d > beatSec * 0.5) d = beatSec - d
  return d
}

/** True when offset is missing (null/NaN). Phase 0 is a valid downbeat-at-file-start. */
export function isUnsetOffset(offset: number | null | undefined): boolean {
  return typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0
}

/** @deprecated Use isUnsetOffset — zero phase is not “fake”. */
export function isUnsetOrFakeZeroOffset(offset: number | null | undefined): boolean {
  return isUnsetOffset(offset)
}

/**
 * Read beat **phase** from Sonic DNA (fold absolute gridOffset / kick times).
 */
export function readDnaBeatPhaseSec(sonicDna: unknown, beatSec: number): number | null {
  if (!(beatSec > 0)) return null
  const measured = extractMeasured(sonicDna)
  if (!measured) return null

  if (
    typeof measured.gridOffsetSec === 'number' &&
    Number.isFinite(measured.gridOffsetSec) &&
    measured.gridOffsetSec >= 0
  ) {
    return toPhaseOnlyOffsetSec(measured.gridOffsetSec, beatSec)
  }

  const kicks = Array.isArray(measured.kickOnsetSec)
    ? measured.kickOnsetSec.map(Number).filter((t) => Number.isFinite(t) && t >= 0)
    : []
  if (kicks.length >= 1) {
    return toPhaseOnlyOffsetSec(Math.min(...kicks), beatSec)
  }
  return null
}

/** @deprecated Use readDnaBeatPhaseSec — never returns absolute kick time as lattice origin. */
export function readDnaGridOffsetSec(sonicDna: unknown): number | null {
  const measured = extractMeasured(sonicDna)
  if (!measured) return null
  const bpm =
    typeof measured.bpm === 'number' && measured.bpm > 0
      ? measured.bpm
      : typeof measured.effectiveBpm === 'number' && measured.effectiveBpm > 0
        ? measured.effectiveBpm
        : 120
  const beatSec = beatPeriodSec(bpm) ?? 0.5
  return readDnaBeatPhaseSec(sonicDna, beatSec)
}

/** Resolve within-beat phase for mix engine / player (phrase lattice stays at t=0). */
export function resolveMixGridOffset(
  track: MixTrackRef,
  peaks?: MixGridPeaks | null,
): number {
  const bpm = resolvePlaybackBpm(track) ?? (typeof track.bpm === 'number' ? track.bpm : 120)
  const beatSec = beatPeriodSec(bpm) ?? 0.5

  let peakPhase: number | null = null
  let peakLock = 0
  if (peaks?.peaks?.length && peaks.durationSec > 0) {
    const peakAligned = alignBeatGridFromPeaks({
      peaks: peaks.peaks,
      durationSec: peaks.durationSec,
      bpm,
      sonicDna: track.sonic_dna,
      preferTransientOrigin: true,
    })
    if (peakAligned && peakAligned.lock >= MIN_ALIGN_LOCK) {
      peakPhase = toPhaseOnlyOffsetSec(peakAligned.offsetSec, beatSec)
      peakLock = peakAligned.lock
    } else if (peakAligned && peakAligned.lock >= 0.22) {
      peakPhase = toPhaseOnlyOffsetSec(peakAligned.offsetSec, beatSec)
      peakLock = peakAligned.lock
    }
  }

  const storedRaw = track.beat_grid_offset
  const storedPhase = !isUnsetOffset(storedRaw)
    ? toPhaseOnlyOffsetSec(storedRaw!, beatSec)
    : null
  const dnaPhase = readDnaBeatPhaseSec(track.sonic_dna, beatSec)

  // Prefer stored phase; override only when peak phase clearly disagrees with high lock.
  if (storedPhase != null && peakPhase != null) {
    const delta = phaseDeltaSec(storedPhase, peakPhase, beatSec)
    if (peakLock >= OVERRIDE_LOCK && delta > beatSec * 0.1) return peakPhase
    if (peakLock >= MIN_ALIGN_LOCK && delta > beatSec * 0.15) return peakPhase
    return storedPhase
  }

  if (storedPhase != null) return storedPhase
  if (peakPhase != null) return peakPhase
  if (dnaPhase != null) return dnaPhase
  return 0
}

/** Clone track ref with resolved phase-only grid offset. */
export function withResolvedGridOffset(
  track: MixTrackRef,
  peaks?: MixGridPeaks | null,
): MixTrackRef {
  return {
    ...track,
    beat_grid_offset: resolveMixGridOffset(track, peaks),
  }
}
