import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MixEngine } from './MixEngine'
import type { MixPlan, MixTrackRef } from './types'

/** Mutable stand-in for the bits of HTMLAudioElement that MixEngine touches. */
type StubDeck = {
  src: string
  volume: number
  currentTime: number
  duration: number
  playbackRate: number
  paused: boolean
  readyState: number
  preservesPitch: boolean
  load: () => void
  play: () => Promise<void>
  pause: () => void
  addEventListener: () => void
  removeEventListener: () => void
}

function createDeck(): StubDeck {
  const deck: StubDeck = {
    src: '',
    volume: 1,
    currentTime: 0,
    duration: 200,
    playbackRate: 1,
    paused: true,
    readyState: 4,
    preservesPitch: true,
    load() {},
    play() {
      deck.paused = false
      return Promise.resolve()
    },
    pause() {
      deck.paused = true
    },
    addEventListener() {},
    removeEventListener() {},
  }
  return deck
}

const asAudioElement = (deck: StubDeck) => deck as unknown as HTMLAudioElement

const trackA: MixTrackRef = { id: 'a-track', file: '/a.mp3', bpm: 124, duration: 200 }
const trackB: MixTrackRef = { id: 'b-track', file: '/b.mp3', bpm: 126, duration: 200 }

const plan: MixPlan = {
  outgoingTrackId: trackA.id,
  incomingTrackId: trackB.id,
  startAtOutgoingSec: 100,
  incomingStartSec: 0,
  mixDurationSec: 4,
  rateRatio: 1,
  style: 'crossfade',
  curve: 'equal-power',
  outPhraseBars: 8,
  inPhraseBars: 8,
  overlapBars: 8,
  phraseBars: 8,
  reason: 'test',
}

const originalRaf = globalThis.requestAnimationFrame
const originalCancelRaf = globalThis.cancelAnimationFrame

beforeEach(() => {
  // Drive the fade loop to completion on its first tick by handing the callback
  // a timestamp far beyond any mix duration.
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    setTimeout(() => cb(performance.now() + 60_000), 0)
    return 1
  }) as typeof globalThis.requestAnimationFrame
  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame
})

afterEach(() => {
  globalThis.requestAnimationFrame = originalRaf
  globalThis.cancelAnimationFrame = originalCancelRaf
})

async function runMix() {
  const deckA = createDeck()
  const deckB = createDeck()
  const engine = new MixEngine(asAudioElement(deckA), asAudioElement(deckB))

  engine.setActiveTrack(trackA)
  deckA.currentTime = plan.startAtOutgoingSec
  deckA.paused = false

  await engine.loadIdle(trackB, '/b.mp3', plan.incomingStartSec)
  const ok = await engine.startTransition(plan, plan.rateRatio)

  return { engine, deckA, deckB, ok }
}

describe('MixEngine deck handoff', () => {
  it('swaps the active deck to the incoming deck when the fade completes', async () => {
    const { engine, deckA, deckB, ok } = await runMix()

    expect(ok).toBe(true)
    expect(engine.getActiveDeck()).toBe('b')
    expect(engine.getActiveTrack()?.id).toBe(trackB.id)
    expect(deckB.volume).toBeGreaterThan(0.98)
    expect(deckA.volume).toBeLessThan(0.02)
  })

  it('fades deck B out when B was outgoing (alternating-deck regression)', async () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(asAudioElement(deckA), asAudioElement(deckB))

    engine.setActiveDeck('b')
    engine.setActiveTrack(trackB)
    deckB.currentTime = plan.startAtOutgoingSec
    deckB.paused = false

    await engine.loadIdle(trackA, '/a.mp3', plan.incomingStartSec)
    const ok = await engine.startTransition(
      {
        ...plan,
        outgoingTrackId: trackB.id,
        incomingTrackId: trackA.id,
      },
      plan.rateRatio,
    )

    expect(ok).toBe(true)
    expect(engine.getActiveDeck()).toBe('a')
    expect(deckA.volume).toBeGreaterThan(0.98)
    expect(deckB.volume).toBeLessThan(0.02)
  })

  it('leaves both decks running so the outgoing channel is only parked, not paused', async () => {
    const { deckA, deckB } = await runMix()

    expect(deckB.paused).toBe(false)
    expect(deckA.paused).toBe(false)
  })

  /**
   * Regression: MusicPlayer used to re-derive the active deck from its own
   * pre-mix deck pointer after awaiting the transition, which reverted this
   * swap and let setMasterVolume restore the outgoing deck to full gain.
   */
  it('keeps the incoming deck live when master volume is set after the mix', async () => {
    const { engine, deckA, deckB } = await runMix()

    engine.setMasterVolume(0.8)

    expect(engine.getActiveDeck()).toBe('b')
    expect(deckB.volume).toBeCloseTo(0.8, 5)
    expect(deckA.volume).toBeCloseTo(0, 5)
  })

  it('refuses to flip the live song back onto the other deck after a mix', async () => {
    const { engine, deckA, deckB } = await runMix()

    engine.setActiveDeck('a')

    expect(engine.getActiveDeck()).toBe('b')
    expect(engine.getActiveTrack()?.id).toBe(trackB.id)
    expect(deckB.volume).toBeGreaterThan(0.98)
    expect(deckA.volume).toBeLessThan(0.02)
  })

  it('refuses enterFire from preArm until the incoming buffer is ready', async () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(asAudioElement(deckA), asAudioElement(deckB))
    engine.setActiveTrack(trackA)
    deckA.paused = false

    const armed = await engine.enterPreArm(plan, trackB, '/b.mp3', plan.rateRatio)
    expect(armed).toBe(true)
    expect(engine.getBlendStage()).toBe('preArm')
    expect(engine.canEnterFire()).toBe(false)

    const fired = await engine.enterFire(plan, plan.rateRatio)
    expect(fired).toBe(false)
    expect(engine.getBlendStage()).toBe('preArm')
    expect(engine.getActiveTrack()?.id).toBe(trackA.id)
  })

  it('lands on handoff then idle after the mix settles', async () => {
    const { engine } = await runMix()

    expect(engine.getActiveDeck()).toBe('b')
    expect(engine.getActiveTrack()?.id).toBe(trackB.id)
    expect(engine.getBlendStage()).toBe('idle')
  })

  it('does not load the on-air song onto the idle deck', async () => {
    const { engine, deckA, deckB } = await runMix()
    const before = deckA.src

    await engine.loadIdle(trackB, '/b-again.mp3', 0)

    expect(engine.getActiveDeck()).toBe('b')
    expect(deckA.src).toBe(before)
    expect(deckB.volume).toBeGreaterThan(0.98)
  })
})
