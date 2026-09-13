import { describe, expect, it } from 'vitest'
import { PRE_AUDIBLE_LOCK_SEC } from './pre-audible-nudge'
import {
  assertInvariant,
  canEnter,
  canEnterFire,
  nextBlendStage,
} from './blend-pipeline'

describe('blend-pipeline stages', () => {
  it('allows the Auto DJ happy path', () => {
    expect(canEnter('idle', 'plan')).toBe(true)
    expect(canEnter('plan', 'preArm')).toBe(true)
    expect(canEnter('preArm', 'fire')).toBe(true)
    expect(canEnter('fire', 'overlap')).toBe(true)
    expect(canEnter('overlap', 'handoff')).toBe(true)
    expect(canEnter('handoff', 'idle')).toBe(true)
    expect(nextBlendStage('handoff', 'plan')).toBe('plan')
  })

  it('rejects illegal jumps', () => {
    expect(canEnter('idle', 'overlap')).toBe(false)
    expect(canEnter('overlap', 'preArm')).toBe(false)
    expect(canEnter('handoff', 'fire')).toBe(false)
    expect(canEnter('fire', 'preArm')).toBe(false)
    expect(nextBlendStage('overlap', 'plan')).toBeNull()
  })

  it('allows abort from fire or overlap back to idle', () => {
    expect(canEnter('fire', 'idle')).toBe(true)
    expect(canEnter('overlap', 'idle')).toBe(true)
    expect(canEnter('preArm', 'plan')).toBe(true)
  })

  it('refuses fire from preArm without an incoming buffer', () => {
    const gate = canEnterFire('preArm', {
      hasIncomingReady: false,
      preArmLocked: true,
    })
    expect(gate.ok).toBe(false)
    expect(gate.reason).toMatch(/buffer not ready/i)
  })

  it('allows fire from idle without a buffer (manual / tests)', () => {
    const gate = canEnterFire('idle', {
      hasIncomingReady: false,
      preArmLocked: false,
    })
    expect(gate.ok).toBe(true)
  })

  it('allows fire from preArm when the buffer is ready', () => {
    const gate = canEnterFire('preArm', {
      hasIncomingReady: true,
      preArmLocked: true,
      cueDeltaSec: 0.002,
    })
    expect(gate.ok).toBe(true)
  })

  it('refuses fire that would rewrite a pre-arm lock', () => {
    const gate = canEnterFire('preArm', {
      hasIncomingReady: true,
      preArmLocked: true,
      cueDeltaSec: PRE_AUDIBLE_LOCK_SEC + 0.02,
    })
    expect(gate.ok).toBe(false)
    expect(gate.reason).toMatch(/pre-arm lock/i)
  })

  it('refuses a compressed exact overlap', () => {
    const check = assertInvariant({
      stage: 'fire',
      preArmLocked: false,
      hasIncomingReady: true,
      plannedOverlapSec: 16,
      exactOverlapSec: 10,
    })
    expect(check.ok).toBe(false)
    expect(check.reason).toMatch(/compressed/i)
  })

  it('refuses loading the on-air track onto idle', () => {
    const check = assertInvariant({
      stage: 'preArm',
      preArmLocked: false,
      hasIncomingReady: false,
      activeTrackId: 'live',
      idleTrackId: 'live',
    })
    expect(check.ok).toBe(false)
    expect(check.reason).toMatch(/on-air/i)
  })
})
