/**
 * Resolve beat-grid **phase** for mix planning / UI.
 *
 * Dual-clock doctrine:
 * - Phrase lattice always starts at file t=0 (see phrase-lattice.ts).
 * - `beat_grid_offset` is within-beat phase only [0, beatSec).
 * - First-kick absolute times label sections / residual sync — they must NOT
 *   redefine phrase-1 origin.
 */

import { beatPeriodSec, resolveTapeAlignedGrid } from '@/lib/audio/beat-grid'
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
/** True when DNA gridOffset is the analysis window, not a musical downbeat. */
export function isAnalysisWindowGridOffset(
  offsetSec: number,
  measured: { window?: { startSec?: number; reason?: string } | null } | null,
): boolean {
  if (!Number.isFinite(offsetSec) || offsetSec < 0 || !measured) return false
  const start = measured.window?.startSec
  if (typeof start === 'number' && Number.isFinite(start) && Math.abs(offsetSec - start) < 0.051) {
    return true
  }
  const reason = String(measured.window?.reason || '')
  return offsetSec >= 8 && reason.includes('mid-track')
}

export function readDnaBeatPhaseSec(sonicDna: unknown, beatSec: number): number | null {
  if (!(beatSec > 0)) return null
  const measured = extractMeasured(sonicDna)
  if (!measured) return null

  if (
    typeof measured.gridOffsetSec === 'number' &&
    Number.isFinite(measured.gridOffsetSec) &&
    measured.gridOffsetSec >= 0 &&
    !isAnalysisWindowGridOffset(measured.gridOffsetSec, measured)
  ) {
    return toPhaseOnlyOffsetSec(measured.gridOffsetSec, beatSec)
  }

  const kicks = Array.isArray(measured.kickOnsetSec)
    ? measured.kickOnsetSec.map(Number).filter((t) => Number.isFinite(t) && t >= 0)
    : []
  if (kicks.length >= 1) {
    const first = Math.min(...kicks)
    if (!isAnalysisWindowGridOffset(first, measured)) {
      return toPhaseOnlyOffsetSec(first, beatSec)
    }
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

/** Stored / DNA offset folded to within-beat phase. Safe for tape paint and IN cues. */
export function playbackGridPhaseSec(
  track: Pick<MixTrackRef, 'beat_grid_offset' | 'sonic_dna' | 'bpm'>,
  bpm?: number | null,
): number {
  const useBpm =
    (typeof bpm === 'number' && bpm > 0 ? bpm : null) ??
    resolvePlaybackBpm(track) ??
    (typeof track.bpm === 'number' && track.bpm > 0 ? track.bpm : 120)
  const beatSec = beatPeriodSec(useBpm) ?? 0.5
  if (!isUnsetOffset(track.beat_grid_offset)) {
    return toPhaseOnlyOffsetSec(track.beat_grid_offset!, beatSec)
  }
  return readDnaBeatPhaseSec(track.sonic_dna, beatSec) ?? 0
}

export type MixTapeGrid = {
  offsetSec: number
  bpm: number
}

/**
 * Peak-measured tempo + within-beat phase for paint and mix planning.
 *
 * CDJ contract: catalog `beat_grid_offset` (including explicit 0 ms) is the
 * source of truth for both decks. Peak re-align only fills **unset** grids —
 * never invent a new phase that would desync UI paint from mix planning.
 */
export function resolveMixTapeGrid(
  track: MixTrackRef,
  peaks?: MixGridPeaks | null,
): MixTapeGrid {
  const catalogBpm =
    resolvePlaybackBpm(track) ?? (typeof track.bpm === 'number' && track.bpm > 0 ? track.bpm : 120)
  const beatSec = beatPeriodSec(catalogBpm) ?? 0.5

  const storedRaw = track.beat_grid_offset
  const storedPhase = !isUnsetOffset(storedRaw)
    ? toPhaseOnlyOffsetSec(storedRaw!, beatSec)
    : null

  // Catalog / manual phase (incl. 0) wins — matches MusicPlayer.cacheMixGridOffset.
  if (storedPhase != null) {
    return { offsetSec: storedPhase, bpm: catalogBpm }
  }

  if (peaks?.peaks?.length && peaks.durationSec > 0) {
    const tape = resolveTapeAlignedGrid({
      peaks: peaks.peaks,
      durationSec: peaks.durationSec,
      bpm: catalogBpm,
      storedPhaseSec: null,
      sonicDna: track.sonic_dna,
    })
    if (tape) {
      const tapeBeat = beatPeriodSec(tape.bpm) ?? beatSec
      return {
        offsetSec: toPhaseOnlyOffsetSec(tape.offsetSec, tapeBeat),
        bpm: tape.bpm,
      }
    }
  }

  const dnaPhase = readDnaBeatPhaseSec(track.sonic_dna, beatSec)
  if (dnaPhase != null) return { offsetSec: dnaPhase, bpm: catalogBpm }
  return { offsetSec: 0, bpm: catalogBpm }
}

/** Resolve within-beat phase for mix engine / player (phrase lattice stays at t=0). */
export function resolveMixGridOffset(
  track: MixTrackRef,
  peaks?: MixGridPeaks | null,
): number {
  return resolveMixTapeGrid(track, peaks).offsetSec
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
