import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MixEngine } from './MixEngine'
import { buildMixPlan } from './plan-from-dna'
import { beatPhaseErrorSec, resolveIncomingMixCue } from './sync'
import { resolvePlaybackBpm } from '@/lib/audio/sonic-dna-mix'
import type { MixPlan, MixTrackRef } from './types'

const MEASURED_DIR = path.resolve(process.cwd(), '../knowledge/library-analysis/measured')

type Measured = {
  bpm?: number
  drumFamily?: string
  kickPhraseSteps?: number[]
  snarePhraseSteps?: number[]
  clapPhraseSteps?: number[]
}

function loadQueue(n = 8): MixTrackRef[] {
  const files = readdirSync(MEASURED_DIR)
    .filter((f) => f.endsWith('.json'))
    .slice(0, n)
  return files.map((file) => {
    const measured = JSON.parse(readFileSync(path.join(MEASURED_DIR, file), 'utf8')) as Measured
    const bpm = typeof measured.bpm === 'number' && measured.bpm > 60 ? measured.bpm : 124
    const id = file.replace(/\.json$/, '')
    return {
      id,
      file: `/${id}.mp3`,
      bpm,
      duration: 240,
      beat_grid_offset: 0.04,
      energy_level: 0.6,
      sonic_dna: { measured },
    }
  })
}

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
    duration: 240,
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

describe('live Sonic DNA queue audit', () => {
  it('snaps consecutive Auto DJ plans to 8-bar DNA phrases with tight pocket lock', () => {
    const queue = loadQueue(8)
    expect(queue.length).toBeGreaterThanOrEqual(4)

    const reports: Array<{
      out: string
      inn: string
      phraseErrBars: number
      phaseMs: number
    }> = []

    for (let i = 0; i < queue.length - 1; i++) {
      const outgoing = queue[i]!
      const incoming = queue[i + 1]!
      const bpm = resolvePlaybackBpm(outgoing) || outgoing.bpm || 124
      const barSec = (60 / bpm) * 4
      const phraseSec = barSec * 8
      const offset = outgoing.beat_grid_offset || 0
      const plan = buildMixPlan({
        outgoing,
        incoming,
        nowSec: 12,
        outPhraseBars: 8,
        inPhraseBars: 8,
        overlapBars: 8,
        style: 'crossfade',
      })
      expect(plan).not.toBeNull()
      const rel = plan!.startAtOutgoingSec - offset
      const phraseErrBars = Math.abs(rel / phraseSec - Math.round(rel / phraseSec))
      const rate = plan!.rateRatio
      const cue = resolveIncomingMixCue({
        plannedIncomingSec: plan!.incomingStartSec,
        outgoingTimeSec: plan!.startAtOutgoingSec,
        outgoingBpm: bpm,
        outgoingOffsetSec: offset,
        outgoingSonicDna: outgoing.sonic_dna,
        incomingBpm: (incoming.bpm || bpm) * rate,
        incomingOffsetSec: incoming.beat_grid_offset,
        incomingSonicDna: incoming.sonic_dna,
        phraseBars: 8,
        snareLock: true,
      })
      const phaseMs =
        Math.abs(
          beatPhaseErrorSec({
            outgoingTimeSec: plan!.startAtOutgoingSec,
            outgoingBpm: bpm,
            outgoingOffsetSec: offset,
            incomingTimeSec: cue,
            incomingBpm: (incoming.bpm || bpm) * rate,
            incomingOffsetSec: incoming.beat_grid_offset ?? undefined,
          }),
        ) * 1000
      reports.push({
        out: outgoing.id.slice(0, 8),
        inn: incoming.id.slice(0, 8),
        phraseErrBars,
        phaseMs,
      })
      expect(phraseErrBars).toBeLessThan(0.02)
      expect(phaseMs).toBeLessThan(45)
    }

    const worstPhase = Math.max(...reports.map((r) => r.phaseMs))
    expect(worstPhase).toBeLessThan(45)
  })
})

describe('MixEngine sequential DNA handoffs', () => {
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancelRaf = globalThis.cancelAnimationFrame

  beforeEach(() => {
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

  it('keeps the incoming deck live after A→B then B→A', async () => {
    const queue = loadQueue(3)
    const [a, b, c] = queue
    expect(a && b && c).toBeTruthy()

    const deckA = createDeck()
    const deckB = createDeck()
    const engine = new MixEngine(
      deckA as unknown as HTMLAudioElement,
      deckB as unknown as HTMLAudioElement,
    )

    const planAb: MixPlan = {
      outgoingTrackId: a!.id,
      incomingTrackId: b!.id,
      startAtOutgoingSec: 100,
      incomingStartSec: 8,
      mixDurationSec: 4,
      rateRatio: 1,
      style: 'crossfade',
      curve: 'equal-power',
      outPhraseBars: 8,
      inPhraseBars: 8,
      overlapBars: 8,
      phraseBars: 8,
      reason: 'audit-ab',
    }

    engine.setActiveTrack(a!)
    deckA.currentTime = 100
    deckA.paused = false
    await engine.loadIdle(b!, b!.file, planAb.incomingStartSec)
    const okAb = await engine.startTransition(planAb, 1)
    expect(okAb).toBe(true)
    expect(engine.getActiveDeck()).toBe('b')
    expect(deckB.volume).toBeGreaterThan(0.98)
    expect(deckA.volume).toBeLessThan(0.02)

    const planBc: MixPlan = {
      ...planAb,
      outgoingTrackId: b!.id,
      incomingTrackId: c!.id,
      reason: 'audit-bc',
    }
    deckB.currentTime = 100
    await engine.loadIdle(c!, c!.file, planBc.incomingStartSec)
    const okBc = await engine.startTransition(planBc, 1)
    expect(okBc).toBe(true)
    expect(engine.getActiveDeck()).toBe('a')
    expect(deckA.volume).toBeGreaterThan(0.98)
    expect(deckB.volume).toBeLessThan(0.02)
  })
})
