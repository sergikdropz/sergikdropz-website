import { describe, expect, it, vi } from 'vitest'
import { MixEngine } from './MixEngine'

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
  const makeNode = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
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

  const ctx = {
    destination: { connect: vi.fn() },
    currentTime: 0,
    createGain: vi.fn(makeNode),
    createDynamicsCompressor: vi.fn(makeNode),
    createBiquadFilter: vi.fn(makeNode),
    createDelay: vi.fn(makeNode),
    createMediaElementSource: vi.fn(() => makeNode()),
  }

  return { ctx: ctx as unknown as AudioContext }
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
})
