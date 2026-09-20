import { describe, expect, it } from 'vitest'
import {
  applyDeckTempo,
  configureKeyLock,
  computeTempoCrossfadePlan,
  masterBpmAt,
  masterDeckRatesAt,
  MIX_RATE_SLEW,
  postHandoffNativeGlideMs,
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
    expect(deck.writes.playbackRate).toBe(1)
    expect(deck.playbackRate).toBeCloseTo(1.05, 5)
  })

  it('slews toward the target when not instant', () => {
    const deck = createDeck(1)
    const applied = applyDeckTempo(asElement(deck), 1.2, {
      instant: false,
      currentRate: 1,
      slew: MIX_RATE_SLEW,
    })
    expect(applied).toBeGreaterThan(1)
    expect(applied).toBeLessThan(1.2)
  })

  it('clamps invalid rates to 1', () => {
    const deck = createDeck(1)
    expect(applyDeckTempo(asElement(deck), Number.NaN, { instant: true })).toBeCloseTo(1, 5)
  })
})

describe('dual master tempo handoff', () => {
  it('holds outgoing BPM for the entire overlap (no mid-mix glide)', () => {
    const plan = computeTempoCrossfadePlan({
      outgoingBpm: 128,
      incomingBpm: 124,
      outgoingPlaybackRate: 1,
      incomingTargetRate: 1,
      dualMasterGlide: true,
      style: 'crossfade',
    })
    expect(plan.dualMasterGlide).toBe(true)
    expect(plan.glideStart).toBeGreaterThanOrEqual(1)
    expect(masterBpmAt(plan, 0)).toBeCloseTo(128, 1)
    expect(masterBpmAt(plan, 0.5)).toBeCloseTo(128, 1)
    expect(masterBpmAt(plan, 0.99)).toBeCloseTo(128, 1)
    expect(tempoMixProgress(plan, 1)).toBe(0)
    const locked = masterDeckRatesAt(plan, 0)
    expect(locked.inRate).toBeCloseTo(128 / 124, 4)
    expect(locked.inRate * 124).toBeCloseTo(128, 1)
    expect(masterDeckRatesAt(plan, 1).inRate).toBeCloseTo(128 / 124, 4)
    expect(plan.outEndRate).toBeCloseTo(plan.outgoingRate, 5)
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
    expect(masterDeckRatesAt(plan, 1).inRate).toBeCloseTo(128 / 120, 5)
  })

  it('stores native mixEndRate for the post-handoff 4-bar glide', () => {
    const plan = computeTempoCrossfadePlan({
      outgoingBpm: 128,
      incomingBpm: 124,
      outgoingPlaybackRate: 1,
      incomingTargetRate: 1,
      dualMasterGlide: true,
      style: 'crossfade',
    })
    expect(plan.mixEndRate).toBeCloseTo(1, 5)
    expect(plan.masterEndBpm).toBeCloseTo(124, 1)
    // Soft knee past 1.0 keeps mid-mix progress at 0 even at mix end.
    expect(plan.glideStart).toBeCloseTo(1 + TEMPO_GLIDE_SOFT_KNEE, 5)
  })
})

describe('postHandoffNativeGlideMs', () => {
  it('is exactly 4 bars at the given BPM', () => {
    expect(postHandoffNativeGlideMs(120, 4)).toBe(8000)
    expect(postHandoffNativeGlideMs(128, 4)).toBe(Math.round((60 / 128) * 16 * 1000))
  })

  it('falls back safely for bad BPM', () => {
    expect(postHandoffNativeGlideMs(0, 4)).toBe(8000)
    expect(postHandoffNativeGlideMs(Number.NaN, 4)).toBe(8000)
  })
})
