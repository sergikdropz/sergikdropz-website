/**
 * Named blend stages — orchestration only.
 * DSP (overlap clock, vinyl bend, EQ) stays in MixEngine / helper modules.
 */

import { PRE_AUDIBLE_LOCK_SEC } from './pre-audible-nudge'

export type BlendStage = 'idle' | 'plan' | 'preArm' | 'fire' | 'overlap' | 'handoff'

export type BlendSnapshot = {
  stage: BlendStage
  preArmLocked: boolean
  hasIncomingReady: boolean
  /** Planned overlap seconds (doctrine 8/16-bar length). */
  plannedOverlapSec?: number
  /** Overlap seconds that will actually run. */
  exactOverlapSec?: number
  activeTrackId?: string | null
  idleTrackId?: string | null
  /** |incoming media − cue| at fire. */
  cueDeltaSec?: number
  /** When true, fire from preArm requires an armed/running incoming buffer. */
  requireIncomingReady?: boolean
}

export type BlendInvariantResult = {
  ok: boolean
  reason?: string
}

const TRANSITIONS: ReadonlyArray<readonly [BlendStage, BlendStage]> = [
  ['idle', 'plan'],
  ['idle', 'preArm'],
  ['idle', 'fire'],
  ['plan', 'preArm'],
  ['plan', 'fire'],
  ['plan', 'idle'],
  ['preArm', 'fire'],
  ['preArm', 'plan'],
  ['preArm', 'idle'],
  ['fire', 'overlap'],
  ['fire', 'idle'],
  ['overlap', 'handoff'],
  ['overlap', 'idle'],
  ['handoff', 'idle'],
  ['handoff', 'plan'],
]

const TRANSITION_SET = new Set(TRANSITIONS.map(([from, to]) => `${from}->${to}`))

export function canEnter(from: BlendStage, to: BlendStage): boolean {
  if (from === to) return true
  return TRANSITION_SET.has(`${from}->${to}`)
}

export function assertInvariant(snapshot: BlendSnapshot): BlendInvariantResult {
  const stage = snapshot.stage

  if (stage === 'fire' || stage === 'overlap') {
    if (snapshot.requireIncomingReady && !snapshot.hasIncomingReady) {
      return { ok: false, reason: 'incoming buffer not ready' }
    }
    if (
      snapshot.preArmLocked &&
      typeof snapshot.cueDeltaSec === 'number' &&
      Math.abs(snapshot.cueDeltaSec) > PRE_AUDIBLE_LOCK_SEC
    ) {
      return { ok: false, reason: 'pre-arm lock would be rewritten' }
    }
    const planned = snapshot.plannedOverlapSec
    const exact = snapshot.exactOverlapSec
    if (
      typeof planned === 'number' &&
      planned > 0 &&
      typeof exact === 'number' &&
      exact > 0 &&
      exact + 1e-6 < planned * 0.98
    ) {
      return { ok: false, reason: 'overlap compressed below planned length' }
    }
  }

  if (stage === 'preArm' && snapshot.activeTrackId && snapshot.idleTrackId) {
    if (snapshot.activeTrackId === snapshot.idleTrackId) {
      return { ok: false, reason: 'idle deck would load the on-air track' }
    }
  }

  return { ok: true }
}

/** Fire from preArm only when the incoming BufferSource is armed or running. */
export function canEnterFire(
  from: BlendStage,
  snapshot: Pick<BlendSnapshot, 'hasIncomingReady' | 'preArmLocked' | 'cueDeltaSec'>,
): BlendInvariantResult {
  if (!canEnter(from, 'fire')) {
    return { ok: false, reason: `cannot enter fire from ${from}` }
  }
  return assertInvariant({
    stage: 'fire',
    preArmLocked: snapshot.preArmLocked,
    hasIncomingReady: snapshot.hasIncomingReady,
    cueDeltaSec: snapshot.cueDeltaSec,
    requireIncomingReady: from === 'preArm',
  })
}

export function nextBlendStage(from: BlendStage, to: BlendStage): BlendStage | null {
  return canEnter(from, to) ? to : null
}
