import { describe, expect, it } from 'vitest'
import { buildWaveformTapeCache } from './waveform-tape-cache'
import {
  phraseStepAtTime,
  profileCacheKey,
  profileFromSonicDna,
  remesureTimedSamples,
  withLivePlaybackGrid,
} from './waveform-intelligence'

const breakbeatDna = {
  measured: {
    bpm: 123,
    effectiveBpm: 123,
    drumFamily: 'breakbeat',
    timingFeel: 'full-time',
    fourRatio: 0.49,
    stepsPerBar: 16,
    phraseBars: 8,
    gridOffsetSec: 0,
    swingPercent: 13.3,
    kickSteps: [0, 4, 8, 12],
    snareBodySteps: [4, 12],
    clapSteps: [6, 14],
    hatSteps: [2, 6, 10, 14],
    kickPhraseSteps: [0, 4, 8, 12, 16, 20],
    snarePhraseSteps: [4, 12, 20],
    clapPhraseSteps: [6, 14, 22],
    hatPhraseSteps: [2, 6, 10, 14],
    kickOnsetSec: [0, 0.488],
    snareClapOnsetSec: [0.244, 0.732],
    spectral: {
      relative: { sub: 0.25, bass: 0.23, kick: 0.27, air: 0.07, mid: 0.06, lowMid: 0.06, presence: 0.06 },
      centroidHz: 3161,
    },
    instrumentUsage: {
      bass: { type: '808-sub', category: 'bass', confidence: 0.7, source: 'measured' },
      entries: [
        { type: '808-sub', category: 'bass', confidence: 0.7, source: 'measured' },
        { type: 'hi-hats', category: 'percussion', confidence: 0.6, source: 'measured' },
      ],
    },
    percussion: { kickRole: 'syncopated-or-broken-kick', hatGrid: 'sparse-accents' },
    genre: { family: 'Bass', primary: 'Experimental Bass' },
    intelligence: { technical: { energyLevel: 7, danceability: 8 } },
  },
}

describe('profileFromSonicDna', () => {
  it('returns null when no measured DNA', () => {
    expect(profileFromSonicDna(null)).toBeNull()
    expect(profileFromSonicDna({})).toBeNull()
  })

  it('derives spectral bias from measured relative bands', () => {
    const profile = profileFromSonicDna({
      measured: {
        bpm: 128,
        spectral: {
          relative: { sub: 0.2, bass: 0.25, kick: 0.15, air: 0.12, mid: 0.18, lowMid: 0.05, presence: 0.05 },
        },
        instrumentUsage: {
          entries: [{ type: 'shaker', category: 'percussion', confidence: 0.7, source: 'measured' }],
        },
      },
    })
    expect(profile).not.toBeNull()
    expect(profile!.bpm).toBe(128)
    expect(profile!.spectralBias.bass).toBeGreaterThan(0.2)
    expect(profile!.spectralBias.hats).toBeGreaterThan(0.1)
    expect(profile!.hasHats).toBe(true)
    expect(profile!.hasVocals).toBe(false)
  })

  it('reads unified intelligence energy, genre, and pocket grids', () => {
    const profile = profileFromSonicDna(breakbeatDna)
    expect(profile).not.toBeNull()
    expect(profile!.drumFamily).toBe('breakbeat')
    expect(profile!.energy01).toBeGreaterThan(0.5)
    expect(profile!.danceability01).toBeGreaterThan(0.5)
    expect(profile!.genrePrimary).toBe('Experimental Bass')
    expect(profile!.hasBass).toBe(true)
    expect(profile!.clapPhraseSteps.length).toBeGreaterThan(0)
    expect(profile!.hatPhraseSteps.length).toBeGreaterThan(0)
    expect(profile!.centroidHz).toBeGreaterThan(3000)
  })

  it('builds stable cache keys', () => {
    const a = profileFromSonicDna({
      measured: { spectral: { relative: { bass: 0.3 } } },
    })
    expect(profileCacheKey(a)).toMatch(/\d+\.\d+/)
    expect(profileCacheKey(null)).toBe('none')
  })
})

describe('withLivePlaybackGrid', () => {
  it('overlays live beat-grid phase and BPM', () => {
    const profile = profileFromSonicDna(breakbeatDna)!
    const live = withLivePlaybackGrid(profile, 0.12, 124)
    expect(live?.gridOffsetSec).toBe(0.12)
    expect(live?.bpm).toBe(124)
    expect(withLivePlaybackGrid(null, 0.1, 120)).toBeNull()
  })
})

describe('remesureTimedSamples', () => {
  it('labels kick and hat steps from the DNA phrase grid', () => {
    const profile = profileFromSonicDna(breakbeatDna)!
    const beatSec = 60 / 123
    const stepSec = beatSec / 4
    const timed = remesureTimedSamples(
      [
        {
          timeSec: 0,
          positive: 0.9,
          negative: 0.85,
          rms: 0.4,
          bands: { low: 0.95, mid: 0.15, high: 0.08 },
          color: 'rgb(0,0,0)',
        },
        {
          timeSec: stepSec * 2,
          positive: 0.55,
          negative: 0.5,
          rms: 0.28,
          bands: { low: 0.12, mid: 0.22, high: 0.9 },
          color: 'rgb(0,0,0)',
        },
      ],
      profile
    )
    expect(timed[0]!.elementType).toBe('kick')
    expect(timed[0]!.elementConfidence).toBeGreaterThan(0.3)
    expect(timed[0]!.bands!.low).toBeGreaterThan(timed[0]!.bands!.high)
    expect(timed[1]!.elementType).toBe('hihat')
  })

  it('leaves samples unchanged without a profile', () => {
    const sample = {
      timeSec: 1,
      positive: 0.4,
      negative: 0.4,
      color: 'rgb(1,2,3)',
    }
    expect(remesureTimedSamples([sample], null)[0]).toBe(sample)
  })

  it('maps phrase step 0 at grid origin', () => {
    const profile = profileFromSonicDna(breakbeatDna)!
    expect(phraseStepAtTime(0, profile)).toBe(0)
  })
})

describe('buildWaveformTapeCache + DNA remesure', () => {
  it('stamps remesured colors so kick and hat bins differ', () => {
    const profile = profileFromSonicDna(breakbeatDna)!
    const samples = Array.from({ length: 64 }, (_, i) => {
      const kickish = i % 16 === 0
      return {
        positive: kickish ? 0.9 : 0.4,
        negative: kickish ? 0.85 : 0.35,
        rms: kickish ? 0.4 : 0.25,
        bands: kickish
          ? { low: 0.95, mid: 0.12, high: 0.08 }
          : { low: 0.15, mid: 0.25, high: 0.7 },
        color: 'rgb(0,0,0)',
      }
    })
    const tape = buildWaveformTapeCache({
      samples,
      durationSec: 8,
      colorMode: 'energy',
      intelligenceProfile: profile,
      targetCount: 64,
    })
    expect(tape).not.toBeNull()
    const kickish = tape!.timed.filter((s) => s.elementType === 'kick')
    const hats = tape!.timed.filter((s) => s.elementType === 'hihat')
    expect(kickish.length).toBeGreaterThan(0)
    expect(hats.length).toBeGreaterThan(0)
    expect(kickish[0]!.color).not.toBe(hats[0]!.color)
  })

  it('gates vocals off when DNA has no vocal instruments', () => {
    const profile = profileFromSonicDna(breakbeatDna)!
    expect(profile.hasVocals).toBe(false)
    const tape = buildWaveformTapeCache({
      samples: [
        {
          positive: 0.7,
          negative: 0.65,
          bands: { low: 0.2, mid: 0.8, high: 0.4 },
          color: 'rgb(0,0,0)',
        },
      ],
      durationSec: 2,
      colorMode: 'elements',
      intelligenceProfile: profile,
      targetCount: 8,
    })
    expect(tape?.timed[0]?.color).toMatch(/rgb\(/)
  })
})
