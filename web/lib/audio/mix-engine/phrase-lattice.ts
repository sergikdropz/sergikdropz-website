/**
 * Dual-clock model for Auto DJ / beat grid:
 *
 * - Phrase lattice: always from track start — boundaries at n × 8 × barSec
 * - Beat phase: offset folded into [0, beatSec) so kicks land on beat lines
 *
 * Never treat first-kick absolute time as phrase-1 origin.
 */

import { BARS_PER_PHRASE, beatPeriodSec } from '@/lib/audio/beat-grid'

/** Fold any absolute / legacy offset into within-beat phase [0, beatSec). */
export function toPhaseOnlyOffsetSec(offsetSec: number, beatSec: number): number {
  if (!(beatSec > 0) || !Number.isFinite(offsetSec)) return 0
  const p = ((offsetSec % beatSec) + beatSec) % beatSec
  // Snap tiny float noise to exact 0
  return p < 1e-9 || beatSec - p < 1e-9 ? 0 : p
}

export function phrasePeriodSec(bpm: number, phraseBars = BARS_PER_PHRASE): number | null {
  const beat = beatPeriodSec(bpm)
  if (!beat) return null
  return beat * 4 * Math.max(1, phraseBars)
}

/** Phrase index whose interval contains timeSec (lattice origin = 0). */
export function phraseIndexAt(
  timeSec: number,
  bpm: number,
  phraseBars = BARS_PER_PHRASE,
): number {
  const phraseSec = phrasePeriodSec(bpm, phraseBars)
  if (!phraseSec || !(timeSec >= 0)) return 0
  return Math.floor(timeSec / phraseSec)
}

/** Absolute start of phrase n on the file-start lattice. */
export function phraseBoundarySec(
  phraseIndex: number,
  bpm: number,
  phraseBars = BARS_PER_PHRASE,
): number {
  const phraseSec = phrasePeriodSec(bpm, phraseBars)
  if (!phraseSec) return 0
  return Math.max(0, phraseIndex) * phraseSec
}

/** Snap time to nearest phrase boundary counted from t=0 (ignores beat phase). */
export function snapToFileStartPhrase(
  timeSec: number,
  bpm: number,
  opts?: {
    phraseBars?: number
    preferEarlier?: boolean
    minSec?: number
    maxSec?: number
  },
): number {
  const bars = opts?.phraseBars && opts.phraseBars > 0 ? opts.phraseBars : BARS_PER_PHRASE
  const phraseSec = phrasePeriodSec(bpm, bars)
  if (!phraseSec) return Math.max(0, timeSec)
  const t = Math.max(0, timeSec)
  const idx = t / phraseSec
  const floorIdx = Math.floor(idx)
  const ceilIdx = Math.ceil(idx)
  const earlier = floorIdx * phraseSec
  const later = ceilIdx * phraseSec
  const distEarlier = Math.abs(t - earlier)
  const distLater = Math.abs(t - later)
  let snapped =
    distEarlier < distLater - 1e-6
      ? earlier
      : distLater < distEarlier - 1e-6
        ? later
        : opts?.preferEarlier
          ? earlier
          : later
  if (typeof opts?.minSec === 'number') snapped = Math.max(opts.minSec, snapped)
  if (typeof opts?.maxSec === 'number') snapped = Math.min(opts.maxSec, snapped)
  return snapped
}
