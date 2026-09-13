import { describe, expect, it } from 'vitest'
import {
  applyDeckTempo,
  configureKeyLock,
  computeTempoCrossfadePlan,
  masterBpmAt,
  masterDeckRatesAt,
  MIX_RATE_SLEW,
  TEMPO_GLIDE_SOFT_KNEE,
  tempoMixProgress,
} from './tempo'

/**
 * Counts writes rather than just reading final values — the mix loop calls into
 * these helpers once per animation frame, and it is the redundant write itself
 * (not the value it lands on) that reconfigures the browser time-stretcher and
 * is audible as choppiness.
 */
function createDeck(initialRate = 1) {
  const writes = { playbackRate: 0, preservesPitch: 0 }
  let rate = initialRate
  let preservesPitch = false

  const deck = {
    writes,
    get playbackRate() {
      return rate
    },
    set playbackRate(next: number) {
      writes.playbackRate += 1
      rate = next
    },
    get preservesPitch() {
      return preservesPitch
    },
    set preservesPitch(next: boolean) {
      writes.preservesPitch += 1
      preservesPitch = next
    },
  }

  return deck
}

const asElement = (deck: ReturnType<typeof createDeck>) => deck as unknown as HTMLAudioElement

describe('configureKeyLock', () => {
  it('writes preservesPitch on the first call', () => {
    const deck = createDeck()
    configureKeyLock(asElement(deck), true)
    expect(deck.preservesPitch).toBe(true)
    expect(deck.writes.preservesPitch).toBe(1)
  })

  it('is a no-op once the flag already holds the requested value', () => {
    const deck = createDeck()
    for (let i = 0; i < 60; i += 1) configureKeyLock(asElement(deck), true)
    expect(deck.writes.preservesPitch).toBe(1)
  })

  it('still writes when the requested value actually changes', () => {
    const deck = createDeck()
    configureKeyLock(asElement(deck), true)
    configureKeyLock(asElement(deck), false)
    expect(deck.preservesPitch).toBe(false)
    expect(deck.writes.preservesPitch).toBe(2)
  })
})

describe('applyDeckTempo', () => {
  it('skips writes for inaudible rate deltas', () => {
    const deck = createDeck(1)
    applyDeckTempo(asElement(deck), 1.00001, { instant: true })
    expect(deck.writes.playbackRate).toBe(0)
  })

  it('writes once for an audible rate change', () => {
    const deck = createDeck(1)
    const applied = applyDeckTempo(asElement(deck), 1.05, { instant: true })
    expect(applied).toBeCloseTo(1.05, 5)
    expect(deck.playbackRate).toBeCloseTo(1.05, 5)
    expect(deck.writes.playbackRate).toBe(1)
  })

  it('stops writing once a slewed ramp settles on its target', () => {
    const deck = createDeck(1)
    const target = 1.02
    let current = 1
    for (let i = 0; i < 200; i += 1) {
      current = applyDeckTempo(asElement(deck), target, { currentRate: current })
    }
    expect(current).toBeCloseTo(target, 6)

    const settledWrites = deck.writes.playbackRate
    for (let i = 0; i < 60; i += 1) {
      current = applyDeckTempo(asElement(deck), target, { currentRate: current })
    }
    expect(deck.writes.playbackRate).toBe(settledWrites)
  })

  it('honors the slew limit so a single frame cannot jump the full delta', () => {
    const deck = createDeck(1)
    const applied = applyDeckTempo(asElement(deck), 1.5, { currentRate: 1 })
    expect(applied).toBeCloseTo(1 + MIX_RATE_SLEW, 6)
  })

  it('clamps out-of-range and nonsense targets', () => {
    const deck = createDeck(1)
    expect(applyDeckTempo(asElement(deck), 99, { instant: true })).toBeCloseTo(1.5, 5)
    expect(applyDeckTempo(asElement(deck), Number.NaN, { instant: true })).toBeCloseTo(1, 5)
  })
})

describe('dual master tempo handoff', () => {
  it('holds master at outgoing BPM before glide knee', () => {
    const plan = computeTempoCrossfadePlan({
      outgoingBpm: 128,
      incomingBpm: 124,
      outgoingPlaybackRate: 1,
      incomingTargetRate: 1,
      dualMasterGlide: true,
      style: 'crossfade',
    })
    expect(plan.dualMasterGlide).toBe(true)
    expect(plan.glideStart).toBeGreaterThanOrEqual(0.58)
    expect(masterBpmAt(plan, 0)).toBeCloseTo(128, 1)
    const beforeGlide = Math.max(0, plan.glideStart - TEMPO_GLIDE_SOFT_KNEE - 0.01)
    expect(masterBpmAt(plan, beforeGlide)).toBeCloseTo(128, 1)
    const locked = masterDeckRatesAt(plan, 0)
    expect(locked.inRate).toBeCloseTo(128 / 124, 4)
    expect(locked.inRate * 124).toBeCloseTo(128, 1)
  })

  it('uses a pre-armed mixStartRate for the whole hold', () => {
    const plan = computeTempoCrossfadePlan({
      outgoingBpm: 128,
      incomingBpm: 120,
      outgoingPlaybackRate: 1,
      incomingTargetRate: 1,
      mixStartRate: 128 / 120,
      dualMasterGlide: true,
      style: 'crossfade',
    })
    expect(plan.mixStartRate).toBeCloseTo(128 / 120, 5)
    expect(masterDeckRatesAt(plan, 0).inRate).toBeCloseTo(128 / 120, 5)
    const holdEnd = Math.max(0, plan.glideStart - TEMPO_GLIDE_SOFT_KNEE - 0.005)
    expect(masterDeckRatesAt(plan, holdEnd).inRate).toBeCloseTo(128 / 120, 5)
  })

  it('glides both decks so effective BPMs match toward incoming native', () => {
    const plan = computeTempoCrossfadePlan({
      outgoingBpm: 128,
      incomingBpm: 124,
      outgoingPlaybackRate: 1,
      incomingTargetRate: 1,
      dualMasterGlide: true,
      style: 'crossfade',
    })
    const mid = masterDeckRatesAt(plan, (plan.glideStart + 1) / 2)
    expect(mid.outRate * 128).toBeCloseTo(mid.inRate * 124, 1)
    const end = masterDeckRatesAt(plan, 1)
    expect(end.masterBpm).toBeCloseTo(124, 1)
    expect(end.inRate).toBeCloseTo(1, 3)
  })

  it('eases into glide with a soft knee instead of a hard snap', () => {
    const plan = computeTempoCrossfadePlan({
      outgoingBpm: 128,
      incomingBpm: 124,
      style: 'crossfade',
    })
    expect(tempoMixProgress(plan, 0)).toBe(0)
    const atKnee = Math.max(0, plan.glideStart - TEMPO_GLIDE_SOFT_KNEE + 0.02)
    expect(tempoMixProgress(plan, atKnee)).toBeGreaterThan(0)
    expect(tempoMixProgress(plan, atKnee)).toBeLessThan(0.2)
    expect(masterBpmAt(plan, 1)).toBeCloseTo(124, 1)
  })

  it('phrase-quantizes glideStart by style and BPM delta', () => {
    const smooth = computeTempoCrossfadePlan({
      outgoingBpm: 128,
      incomingBpm: 124,
      incomingTargetRate: 1,
      style: 'crossfade',
    })
    expect(smooth.glideStart).toBe(0.58)
    const same = computeTempoCrossfadePlan({
      outgoingBpm: 120,
      incomingBpm: 120,
      incomingTargetRate: 1,
    })
    expect(same.glideStart).toBe(0.78)
  })
})
