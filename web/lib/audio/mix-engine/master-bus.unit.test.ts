import { describe, expect, it, vi } from 'vitest'
import { MixEngine } from './MixEngine'
import { equalPowerGains } from './index'

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
  return {
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
      this.paused = false
      return Promise.resolve()
    },
    pause() {
      this.paused = true
    },
    addEventListener() {},
    removeEventListener() {},
  }
}

function mockAudioContext() {
  const gainNodes: Array<{
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    gain: {
      value: number
      cancelScheduledValues: ReturnType<typeof vi.fn>
      setTargetAtTime: ReturnType<typeof vi.fn>
      setValueAtTime: ReturnType<typeof vi.fn>
    }
  }> = []
  const makeGain = () => {
    const node = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        value: 1,
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
    }
    gainNodes.push(node)
    return node
  }
  const makeNode = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setTargetAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
    },
    frequency: { value: 1000, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
    Q: { value: 0.7 },
    type: 'lowpass',
    delayTime: { value: 0.25 },
    threshold: { value: -8 },
    knee: { value: 12 },
    ratio: { value: 2 },
    attack: { value: 0.008 },
    release: { value: 0.22 },
  })

  const destination = { connect: vi.fn() }
  const ctx = {
    destination,
    currentTime: 0,
    createGain: vi.fn(makeGain),
    createDynamicsCompressor: vi.fn(makeNode),
    createBiquadFilter: vi.fn(makeNode),
    createDelay: vi.fn(makeNode),
    createMediaElementSource: vi.fn(() => makeNode()),
  }

  return { ctx: ctx as unknown as AudioContext, destination, gainNodes }
}

describe('MixEngine symmetric deck bus', () => {
  it('routes adopted deck-A source through internal gain into sumNode', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx } = mockAudioContext()
    const externalSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      context: ctx,
    } as unknown as MediaElementAudioSourceNode

    engine.adoptExternalSourceA(externalSource)
    engine.attachGraph(ctx)

    const sumNode = engine.getMasterBusInput()
    expect(sumNode).toBeTruthy()
    expect(engine.setDeckEqGains('a', { low: 1, mid: 0, high: -2 }, { instant: true })).toBe(
      true,
    )
  })

  it('EQ dials replace a crossfader ramp instead of being held at 0 dB', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx } = mockAudioContext()
    const raw = ctx as unknown as { createBiquadFilter: ReturnType<typeof vi.fn> }
    engine.attachGraph(ctx)
    engine.setManualCrossfade(0, { instant: true })
    expect(engine.setDeckEqGains('a', { low: -18, mid: 4, high: 6 }, { instant: true })).toBe(
      true,
    )
    const low = raw.createBiquadFilter.mock.results[0]?.value as {
      gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }
    }
    expect(low.gain.value).toBe(-18)
    expect(low.gain.setValueAtTime).toHaveBeenCalledWith(-18, expect.any(Number))
  })

  it('manual crossfader is volume-only and leaves strip EQ alone', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx } = mockAudioContext()
    const raw = ctx as unknown as { createBiquadFilter: ReturnType<typeof vi.fn> }
    engine.attachGraph(ctx)
    expect(engine.setDeckEqGains('a', { low: -12, mid: 3, high: 0 }, { instant: true })).toBe(
      true,
    )
    expect(engine.setDeckEqGains('b', { low: 2, mid: -4, high: 1 }, { instant: true })).toBe(
      true,
    )
    expect(engine.setManualCrossfade(0.5, { instant: true })).toBe(true)
    expect(engine.hasMixerControls()).toBe(true)
    expect(engine.isDeckChainLive('a')).toBe(true)
    expect(engine.isDeckChainLive('b')).toBe(true)
    const lowA = raw.createBiquadFilter.mock.results[0]?.value as { gain: { value: number } }
    const midA = raw.createBiquadFilter.mock.results[1]?.value as { gain: { value: number } }
    const lowB = raw.createBiquadFilter.mock.results[3]?.value as { gain: { value: number } }
    const midB = raw.createBiquadFilter.mock.results[4]?.value as { gain: { value: number } }
    expect(lowA.gain.value).toBe(-12)
    expect(midA.gain.value).toBe(3)
    expect(lowB.gain.value).toBe(2)
    expect(midB.gain.value).toBe(-4)
    expect(engine.getDeckEqGains('a')).toEqual({ low: -12, mid: 3, high: 0 })
    expect(engine.getDeckEqGains('b')).toEqual({ low: 2, mid: -4, high: 1 })
  })

  it('flushUserEq restores strip gains after a missed mid-blend write', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx } = mockAudioContext()
    const raw = ctx as unknown as { createBiquadFilter: ReturnType<typeof vi.fn> }
    engine.attachGraph(ctx)
    engine.setDeckEqGains('a', { low: -9, mid: 0, high: 4 }, { instant: true })
    engine.flushUserEq({ instant: true })
    const lowA = raw.createBiquadFilter.mock.results[0]?.value as { gain: { value: number } }
    const highA = raw.createBiquadFilter.mock.results[2]?.value as { gain: { value: number } }
    expect(lowA.gain.value).toBe(-9)
    expect(highA.gain.value).toBe(4)
  })

  it('keeps formant compensation off the strip dial state', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx } = mockAudioContext()
    const raw = ctx as unknown as { createBiquadFilter: ReturnType<typeof vi.fn> }
    engine.attachGraph(ctx)
    engine.setDeckEqGains('a', { low: -6, mid: 1, high: 3 }, { instant: true })
    engine.setDeckPlaybackRate('a', 0.9, { instant: true, notify: false })
    expect(engine.getDeckEqGains('a')).toEqual({ low: -6, mid: 1, high: 3 })
    const lowA = raw.createBiquadFilter.mock.results[0]?.value as { gain: { value: number } }
    // HTML preservesPitch path — no formant EQ stacked on the strip.
    expect(lowA.gain.value).toBe(-6)
  })

  it('pulls deck B into the EQ chain when that platter takes the track', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx } = mockAudioContext()
    const raw = ctx as unknown as {
      createMediaElementSource: ReturnType<typeof vi.fn>
      createBiquadFilter: ReturnType<typeof vi.fn>
    }
    let created = 0
    raw.createMediaElementSource = vi.fn(() => {
      created += 1
      if (created === 1) {
        const err = new Error('already captured')
        err.name = 'InvalidStateError'
        throw err
      }
      return { connect: vi.fn(), disconnect: vi.fn(), context: ctx }
    })
    const externalSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      context: ctx,
    } as unknown as MediaElementAudioSourceNode
    engine.adoptExternalSourceA(externalSource)
    engine.attachGraph(ctx)
    engine.setActiveDeck('b', { force: true })
    expect(engine.setDeckEqGains('b', { low: -16, mid: 0, high: 2 }, { instant: true })).toBe(
      true,
    )
    const lowB = raw.createBiquadFilter.mock.results[3]?.value as { gain: { value: number } }
    expect(lowB.gain.value).toBe(-16)
  })

  it('listener volume rides masterGain and leaves parked-deck faders down', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx, destination, gainNodes } = mockAudioContext()
    engine.attachGraph(ctx)
    engine.setManualCrossfade(1, { instant: true })
    engine.setMasterVolume(0)
    engine.setMasterVolume(0.8)

    const master = gainNodes.find((node) =>
      node.connect.mock.calls.some((call) => call[0] === destination),
    )
    expect(master).toBeTruthy()
    expect(master?.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 0)
    expect(engine.hasAudibleGraph()).toBe(true)
    // MES path keeps element.volume at unity; mute lives on the bus.
    expect(deckA.volume).toBe(1)
    expect(deckB.volume).toBe(1)
  })

  it('soloDeck cuts the other platter when only one deck is in the graph', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    deckB.paused = false
    deckB.volume = 1
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx, gainNodes } = mockAudioContext()
    const raw = ctx as unknown as { createMediaElementSource: ReturnType<typeof vi.fn> }
    raw.createMediaElementSource = vi.fn(() => {
      const err = new Error('already captured')
      err.name = 'InvalidStateError'
      throw err
    })
    const externalSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      context: ctx,
    } as unknown as MediaElementAudioSourceNode
    engine.adoptExternalSourceA(externalSource)
    engine.attachGraph(ctx)
    engine.soloDeck('a')
    expect(engine.getActiveDeck()).toBe('a')
    expect(deckB.paused).toBe(true)
    expect(deckB.volume).toBe(0)
    expect(gainNodes[0]?.gain.value).toBe(1)
  })

  it('focusDeck leaves the other platter and XF alone', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    deckA.paused = false
    deckB.paused = false
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx, gainNodes } = mockAudioContext()
    engine.attachGraph(ctx)
    engine.setManualCrossfade(0.55, { instant: true })
    const midA = gainNodes[0]?.gain.value
    const midB = gainNodes[1]?.gain.value
    engine.focusDeck('b')
    expect(engine.getActiveDeck()).toBe('b')
    expect(deckA.paused).toBe(false)
    expect(deckB.paused).toBe(false)
    expect(gainNodes[0]?.gain.value).toBe(midA)
    expect(gainNodes[1]?.gain.value).toBe(midB)
  })

  it('hardStopDeck pauses only the targeted platter', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    deckA.paused = false
    deckB.paused = false
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    const { ctx } = mockAudioContext()
    engine.attachGraph(ctx)
    engine.setManualCrossfade(0.4, { instant: true })
    engine.hardStopDeck('a')
    expect(deckA.paused).toBe(true)
    expect(deckB.paused).toBe(false)
    expect(engine.getActiveDeck()).toBe('a')
  })
})

describe('MixEngine HTML-only master volume', () => {
  it('setMasterVolume(0.8) scales the live deck without unmuting the parked deck', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    engine.setActiveDeck('b')
    engine.setManualCrossfade(1, { instant: true })
    engine.setMasterVolume(0.8)
    expect(deckB.volume).toBeCloseTo(0.8, 5)
    expect(deckA.volume).toBeCloseTo(0, 5)
  })

  it('preserves a mid-crossfade when listener volume moves', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    engine.setManualCrossfade(0.5, { instant: true })
    engine.setMasterVolume(0)
    expect(deckA.volume).toBeCloseTo(0, 5)
    expect(deckB.volume).toBeCloseTo(0, 5)
    engine.setMasterVolume(1)
    const { a, b } = equalPowerGains(0.5)
    expect(deckA.volume).toBeCloseTo(a, 5)
    expect(deckB.volume).toBeCloseTo(b, 5)
  })
})
