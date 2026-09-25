import { describe, expect, it } from 'vitest'
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

describe('MixEngine native element output', () => {
  it('reports mixer controls and crossfades via element.volume without Web Audio', () => {
    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )
    engine.setNativeElementOutput(true)
    expect(engine.hasMixerControls()).toBe(true)
    expect(engine.attachGraph({} as AudioContext)).toBe(true)

    engine.setMasterVolume(0.5)
    engine.setManualCrossfade(0, { instant: true })
    const { a, b } = equalPowerGains(0)
    expect(deckA.volume).toBeCloseTo(a * 0.5, 3)
    expect(deckB.volume).toBeCloseTo(b * 0.5, 3)

    engine.setManualCrossfade(1, { instant: true })
    const fullB = equalPowerGains(1)
    expect(deckB.volume).toBeCloseTo(fullB.b * 0.5, 3)
  })
})
