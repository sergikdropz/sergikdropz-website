/**
 * Per-mix scorecard — proves lock/fire/phase health without reading HUD tea leaves.
 */

export type MixScorecard = {
  /** ms from preArm enter → first idle lock (null if never locked before fire) */
  preArmLockMs: number | null
  /** |idle media − planned cue| at fire, ms */
  fireCueDeltaMs: number | null
  /** ms from overlap start → first pocket lock (null if never) */
  overlapLockMs: number | null
  phaseRmsSec: number
  kickResidualRmsMs: number
  samples: number
  silentSeekCount: number
  gateReason: string | null
  lockedAtFire: boolean
}

export function emptyMixScorecard(): MixScorecard {
  return {
    preArmLockMs: null,
    fireCueDeltaMs: null,
    overlapLockMs: null,
    phaseRmsSec: 0,
    kickResidualRmsMs: 0,
    samples: 0,
    silentSeekCount: 0,
    gateReason: null,
    lockedAtFire: false,
  }
}

export function formatMixScorecard(s: MixScorecard): string {
  const bits: string[] = []
  if (s.preArmLockMs != null) bits.push(`preArm ${s.preArmLockMs.toFixed(0)}ms`)
  if (s.fireCueDeltaMs != null) bits.push(`cueΔ ${s.fireCueDeltaMs.toFixed(0)}ms`)
  if (s.overlapLockMs != null) bits.push(`lock ${s.overlapLockMs.toFixed(0)}ms`)
  bits.push(`seeks ${s.silentSeekCount}`)
  if (s.gateReason) bits.push(s.gateReason)
  if (s.samples >= 4) {
    bits.push(`phase ${(s.phaseRmsSec * 1000).toFixed(0)}ms`)
  }
  return bits.join(' · ')
}

/** Compact one-liner for status strip / export. */
export function scorecardStatusSuffix(s: MixScorecard | null | undefined): string {
  if (!s) return ''
  const cue =
    s.fireCueDeltaMs != null && Number.isFinite(s.fireCueDeltaMs)
      ? `cueΔ${s.fireCueDeltaMs.toFixed(0)}`
      : null
  const lock =
    s.overlapLockMs != null && Number.isFinite(s.overlapLockMs)
      ? `L${s.overlapLockMs.toFixed(0)}`
      : s.lockedAtFire
        ? 'L✓'
        : 'L—'
  const parts = [lock, cue, `sk${s.silentSeekCount}`].filter(Boolean)
  return parts.length ? ` · ${parts.join('/')}` : ''
}
