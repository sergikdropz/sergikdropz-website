import { describe, expect, it } from 'vitest'
import {
  buildFilledEnvelopePath,
  boostRgbSaturation,
  cdjEnergyColor,
  elementSpectralColor,
  expandPeakValley,
  followTargetOffsetIndex,
  getVisibleTimeWindow,
  isFullTrackVisible,
  multiBandRgbColor,
  mixAdditiveRgb,
  normalizeWaveformColorMode,
  playheadLeftPercent,
  quantizeWindowToHalfBeats,
  timeToXPercent,
  resolveWaveformColor,
  sharpenBandWeights,
  softNormalizeEnergies,
  SERGIK_ELEMENT_COLORS,
  buildTimedSamplesInWindow,
  clampVisibleBars,
  scaleVisibleBars,
  splitWheelAxes,
  stepVisibleBars,
  wheelDeltaToZoomFactor,
  upsampleWaveformSamples,
  usesMultiBandLayers,
  normalizeWaveformLayerLayout,
  usesSeparatedLaneLayout,
  usesOverlayMergedLayout,
  zoomToVisibleRatio,
} from './waveform-view'

describe('zoomToVisibleRatio', () => {
  it('maps 1x to full track', () => {
    expect(zoomToVisibleRatio(1)).toBe(1)
  })

  it('zooms in for levels above 1', () => {
    expect(zoomToVisibleRatio(4)).toBeLessThan(0.2)
  })
})

describe('quantizeWindowToHalfBeats', () => {
  it('snaps window duration to half-beat multiples', () => {
    const beat = 60 / 120 // 0.5s
    const half = beat / 2 // 0.25s
    const snapped = quantizeWindowToHalfBeats(1.1, beat)
    expect(snapped % half).toBeCloseTo(0, 8)
    expect(snapped).toBeGreaterThanOrEqual(half * 4)
  })
})

describe('getVisibleTimeWindow + playhead', () => {
  it('keeps playhead centered in follow mode when zoomed mid-track', () => {
    const duration = 100
    const sampleCount = 1000
    const currentTime = 40
    const window = getVisibleTimeWindow({
      durationSec: duration,
      sampleCount,
      zoom: 4,
      offsetIndex: 0,
      follow: true,
      currentTimeSec: currentTime,
      beatDurationSec: 0.5,
    })
    const left = playheadLeftPercent({
      currentTimeSec: currentTime,
      durationSec: duration,
      zoom: 4,
      follow: true,
      startSec: window.startSec,
      endSec: window.endSec,
    })
    expect(left).toBeCloseTo(timeToXPercent(currentTime, window.startSec, window.endSec), 5)
    expect(left).toBeCloseTo(50, 0)
    expect(currentTime).toBeGreaterThan(window.startSec)
    expect(currentTime).toBeLessThan(window.endSec)
  })

  it('keeps playhead on true time at the start instead of faking 50%', () => {
    const window = getVisibleTimeWindow({
      durationSec: 100,
      sampleCount: 1000,
      visibleBars: 8,
      offsetIndex: 0,
      follow: true,
      currentTimeSec: 0.4,
      beatDurationSec: 0.5,
      beatsPerBar: 4,
    })
    const left = playheadLeftPercent({
      currentTimeSec: 0.4,
      durationSec: 100,
      visibleBars: 8,
      follow: true,
      startSec: window.startSec,
      endSec: window.endSec,
    })
    expect(left).not.toBe(50)
    expect(left).toBeCloseTo(timeToXPercent(0.4, window.startSec, window.endSec), 5)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left).toBeLessThan(20)
  })

  it('hides the playhead when it is outside the zoomed window', () => {
    const window = getVisibleTimeWindow({
      durationSec: 80,
      sampleCount: 800,
      visibleBars: 8,
      offsetIndex: 0,
      follow: false,
      currentTimeSec: 60,
      beatDurationSec: 0.5,
      beatsPerBar: 4,
    })
    expect(window.endSec).toBeLessThan(60)
    expect(
      playheadLeftPercent({
        currentTimeSec: 60,
        durationSec: 80,
        visibleBars: 8,
        follow: false,
        startSec: window.startSec,
        endSec: window.endSec,
      }),
    ).toBe(-1)
  })

  it('stays on true time when zoomed into a region that is not centered', () => {
    const window = getVisibleTimeWindow({
      durationSec: 80,
      sampleCount: 800,
      visibleBars: 8,
      offsetIndex: 200,
      follow: false,
      currentTimeSec: 22,
      beatDurationSec: 0.5,
      beatsPerBar: 4,
    })
    const left = playheadLeftPercent({
      currentTimeSec: 22,
      durationSec: 80,
      visibleBars: 8,
      follow: false,
      startSec: window.startSec,
      endSec: window.endSec,
    })
    expect(left).toBeCloseTo(timeToXPercent(22, window.startSec, window.endSec), 5)
    expect(left).not.toBe(50)
  })

  it('maps playhead with the same time transform as the window', () => {
    const window = getVisibleTimeWindow({
      durationSec: 60,
      sampleCount: 600,
      zoom: 8,
      offsetIndex: 100,
      follow: false,
      currentTimeSec: 12,
      beatDurationSec: null,
    })
    const x = timeToXPercent(12, window.startSec, window.endSec)
    const left = playheadLeftPercent({
      currentTimeSec: 12,
      durationSec: 60,
      zoom: 8,
      follow: false,
      startSec: window.startSec,
      endSec: window.endSec,
    })
    expect(left).toBeCloseTo(x, 5)
  })

  it('returns a plain number for full-track progress (no double %)', () => {
    const left = playheadLeftPercent({
      currentTimeSec: 30,
      durationSec: 100,
      zoom: 1,
      follow: false,
      startSec: 0,
      endSec: 100,
    })
    expect(left).toBe(30)
  })
})

describe('followTargetOffsetIndex', () => {
  it('tracks current time in sample space', () => {
    const offset = followTargetOffsetIndex({
      currentTimeSec: 50,
      durationSec: 100,
      sampleCount: 1000,
      zoom: 4,
      beatDurationSec: 0.5,
    })
    expect(offset).toBeGreaterThan(0)
    expect(offset).toBeLessThan(1000)
  })
})

describe('upsampleWaveformSamples', () => {
  it('produces a denser continuous series with peak/valley contrast', () => {
    const samples = [
      { positive: 0.2, negative: 0.2, color: 'rgb(1,2,3)', elementType: 'kick' as const, elementConfidence: 0.9 },
      { positive: 0.9, negative: 0.8, color: 'rgb(4,5,6)', elementType: 'snare' as const, elementConfidence: 0.8 },
      { positive: 0.3, negative: 0.25, color: 'rgb(7,8,9)', elementType: 'hihat' as const, elementConfidence: 0.7 },
    ]
    const dense = upsampleWaveformSamples(samples, 32)
    expect(dense).toHaveLength(32)
    // Local contrast expands peaks and digs valleys — mid sample should remain tallest
    const mid = dense[Math.floor(dense.length / 2)]
    expect(mid.positive).toBeGreaterThan(dense[0].positive)
    expect(mid.positive).toBeGreaterThan(dense[31].positive)
    expect(dense[0].positive).toBeLessThan(0.35)
  })
})

describe('cdjEnergyColor / multiBandRgbColor', () => {
  it('maps kick energy toward red/orange (MiniMeters low band)', () => {
    const color = cdjEnergyColor({ positive: 0.8, elementType: 'kick', elementConfidence: 0.9, color: 'rgb(0,0,0)' })
    const [r, g, b] = color.match(/\d+/g)!.map(Number)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('maps hihat energy toward cyan/blue (MiniMeters high band)', () => {
    const color = cdjEnergyColor({ positive: 0.7, elementType: 'hihat', elementConfidence: 0.9, color: 'rgb(0,0,0)' })
    const [r, g, b] = color.match(/\d+/g)!.map(Number)
    expect(b).toBeGreaterThan(r)
  })

  it('keeps dominant-band color chromatic (not washed white)', () => {
    const lowOnly = multiBandRgbColor({ low: 0.95, mid: 0.05, high: 0.02 })
    const [r, g, b] = lowOnly.match(/\d+/g)!.map(Number)
    expect(r).toBeGreaterThan(180)
    expect(b).toBeLessThan(120)
  })
})

describe('normalizeWaveformColorMode', () => {
  it('maps legacy ids and defaults to energy (MiniMeters multi-band)', () => {
    expect(normalizeWaveformColorMode('classic')).toBe('spectrum')
    expect(normalizeWaveformColorMode('gradient')).toBe('spectrum')
    expect(normalizeWaveformColorMode('colorful')).toBe('drums')
    expect(normalizeWaveformColorMode('multiband')).toBe('drums')
    expect(normalizeWaveformColorMode('rgb')).toBe('drums')
    expect(normalizeWaveformColorMode('elements')).toBe('elements')
    expect(normalizeWaveformColorMode('drums')).toBe('drums')
    expect(normalizeWaveformColorMode('simple')).toBe('mono')
    expect(normalizeWaveformColorMode('ableton')).toBe('channel')
    expect(normalizeWaveformColorMode('ollin')).toBe('channel')
    expect(normalizeWaveformColorMode('nope')).toBe('drums')
    expect(normalizeWaveformColorMode(null)).toBe('drums')
  })
})

describe('softNormalizeEnergies + mixAdditiveRgb', () => {
  it('softNormalizeEnergies keeps weak lanes visible vs one dominant hit', () => {
    const soft = softNormalizeEnergies({ kick: 0.95, clap: 0.18, hat: 0.12 })
    expect(soft.clap).toBeGreaterThan(0.08)
    expect(soft.hat).toBeGreaterThan(0.08)
    expect(soft.kick).toBeGreaterThan(soft.clap)
    expect(soft.kick + soft.clap + soft.hat).toBeCloseTo(1, 1)
  })

  it('mixAdditiveRgb blends co-active lane colors', () => {
    const [r, g, b] = mixAdditiveRgb(
      [
        { key: 'kick', rgb: [255, 0, 0] },
        { key: 'hat', rgb: [0, 0, 255] },
      ],
      { kick: 0.5, hat: 0.5 },
    )
    expect(r).toBeGreaterThan(100)
    expect(b).toBeGreaterThan(100)
    expect(g).toBeLessThan(80)
  })
})

describe('sharpenBandWeights + boostRgbSaturation', () => {
  it('sharpenBandWeights pushes dominant lane weight up', () => {
    const sharp = sharpenBandWeights({ kick: 0.9, clap: 0.2, hat: 0.15 }, 2.8)
    expect(sharp.kick).toBeGreaterThan(sharp.clap)
    expect(sharp.kick).toBeGreaterThan(sharp.hat)
    expect(sharp.kick + sharp.clap + sharp.hat).toBeCloseTo(1, 1)
  })

  it('boostRgbSaturation increases chroma vs grey', () => {
    const [r, g, b] = boostRgbSaturation(200, 100, 80, 2.2)
    expect(r - g).toBeGreaterThan(200 - 100)
  })
})

describe('resolveWaveformColor', () => {
  it('returns mono orange and spectral / channel hues', () => {
    expect(resolveWaveformColor({ positive: 0.5, negative: 0.5, color: 'rgb(0,0,0)' }, 'mono')).toBe(
      '#ff5500'
    )
    const spectrum = resolveWaveformColor(
      {
        positive: 0.8,
        negative: 0.75,
        color: 'rgb(0,0,0)',
        elementType: 'kick',
        elementConfidence: 0.9,
      },
      'spectrum'
    )
    const [r] = spectrum.match(/\d+/g)!.map(Number)
    expect(r).toBeGreaterThan(100)
    const channel = resolveWaveformColor({ positive: 0.7, negative: 0.65, color: 'rgb(0,0,0)' }, 'channel')
    expect(channel).toMatch(/rgb\(/)
  })

  it('colors drums mode by kick / clap / hat and spectral ranges', () => {
    const kick = resolveWaveformColor(
      {
        positive: 0.9,
        negative: 0.85,
        color: 'rgb(0,0,0)',
        elementType: 'kick',
        elementConfidence: 0.95,
      },
      'drums'
    )
    const [kr, kg, kb] = kick.match(/\d+/g)!.map(Number)
    expect(kr).toBeGreaterThan(kg)
    expect(kr).toBeGreaterThan(kb)

    const snare = resolveWaveformColor(
      {
        positive: 0.85,
        negative: 0.8,
        color: 'rgb(0,0,0)',
        elementType: 'snare',
        elementConfidence: 0.9,
      },
      'drums'
    )
    const [sr, , sb] = snare.match(/\d+/g)!.map(Number)
    expect(sr).toBeGreaterThan(100)
    expect(sb).toBeGreaterThan(80)

    const clap = resolveWaveformColor(
      {
        positive: 0.85,
        negative: 0.8,
        color: 'rgb(0,0,0)',
        elementType: 'clap',
        elementConfidence: 0.9,
      },
      'drums'
    )
    const [cr, cg] = clap.match(/\d+/g)!.map(Number)
    expect(cg).toBeGreaterThan(80)

    const hat = resolveWaveformColor(
      {
        positive: 0.8,
        negative: 0.75,
        color: 'rgb(0,0,0)',
        elementType: 'hihat',
        elementConfidence: 0.9,
      },
      'drums'
    )
    const [, , hb] = hat.match(/\d+/g)!.map(Number)
    expect(hb).toBeGreaterThan(100)

    const spectral = resolveWaveformColor(
      {
        positive: 0.7,
        negative: 0.65,
        color: 'rgb(0,0,0)',
        bands: { low: 0.1, mid: 0.2, high: 0.95 },
      },
      'drums'
    )
    expect(spectral).toMatch(/rgb\(/)
  })
})

describe('usesMultiBandLayers + layer layout', () => {
  it('enables layered envelopes for drums and elements modes', () => {
    expect(usesMultiBandLayers('drums')).toBe(true)
    expect(usesMultiBandLayers('elements')).toBe(true)
    expect(usesMultiBandLayers('energy')).toBe(false)
    expect(usesMultiBandLayers('channel')).toBe(false)
  })

  it('usesSeparatedLaneLayout only when lanes + drums/elements', () => {
    expect(usesSeparatedLaneLayout('drums', 'lanes')).toBe(true)
    expect(usesSeparatedLaneLayout('elements', 'lanes')).toBe(true)
    expect(usesSeparatedLaneLayout('drums', 'merged')).toBe(false)
    expect(usesSeparatedLaneLayout('drums', 'overlay')).toBe(false)
    expect(usesSeparatedLaneLayout('energy', 'lanes')).toBe(false)
  })

  it('usesOverlayMergedLayout only when overlay + drums/elements', () => {
    expect(usesOverlayMergedLayout('drums', 'overlay')).toBe(true)
    expect(usesOverlayMergedLayout('elements', 'overlay')).toBe(true)
    expect(usesOverlayMergedLayout('drums', 'merged')).toBe(false)
    expect(usesOverlayMergedLayout('drums', 'lanes')).toBe(false)
    expect(usesOverlayMergedLayout('energy', 'overlay')).toBe(false)
  })

  it('normalizeWaveformLayerLayout maps legacy ids', () => {
    expect(normalizeWaveformLayerLayout('lanes')).toBe('lanes')
    expect(normalizeWaveformLayerLayout('separated')).toBe('lanes')
    expect(normalizeWaveformLayerLayout('overlay')).toBe('overlay')
    expect(normalizeWaveformLayerLayout('stacked')).toBe('overlay')
    expect(normalizeWaveformLayerLayout('classic')).toBe('merged')
    expect(normalizeWaveformLayerLayout(null)).toBe('overlay')
  })
})

describe('elementSpectralColor', () => {
  it('uses SERGIK element palette for kick-heavy samples', () => {
    const kickHeavy = resolveWaveformColor(
      {
        positive: 0.9,
        negative: 0.85,
        color: 'rgb(0,0,0)',
        bands: { low: 0.95, mid: 0.1, high: 0.05 },
      },
      'elements'
    )
    expect(kickHeavy).toMatch(/rgb\(/)
    const [r, g, b] = kickHeavy.match(/\d+/g)!.map(Number)
    // Kick sky-blue + bass yellow dominate low-heavy material
    expect(b).toBeGreaterThan(40)

    const hatHeavy = elementSpectralColor({
      positive: 0.85,
      negative: 0.8,
      elementType: 'hihat',
      elementConfidence: 0.9,
      bands: { low: 0.05, mid: 0.15, high: 0.95 },
    })
    const [, hg, hb] = hatHeavy.match(/\d+/g)!.map(Number)
    expect(hb).toBeGreaterThan(hg * 0.5)
  })

  it('exports legend palette matching SERGIK spec', () => {
    expect(SERGIK_ELEMENT_COLORS.drums).toEqual([232, 63, 51])
    expect(SERGIK_ELEMENT_COLORS.kicks).toEqual([158, 206, 230])
    expect(SERGIK_ELEMENT_COLORS.snares).toEqual([255, 140, 48])
    expect(SERGIK_ELEMENT_COLORS.claps).toEqual([115, 238, 71])
    expect(SERGIK_ELEMENT_COLORS.hats).toEqual([101, 219, 238])
    expect(SERGIK_ELEMENT_COLORS.bass).toEqual([248, 240, 114])
    expect(SERGIK_ELEMENT_COLORS.vocals).toEqual([149, 162, 243])
  })
})

describe('expandPeakValley', () => {
  it('digs valleys and lifts peaks', () => {
    expect(expandPeakValley(0.15, { power: 1.85, gain: 1.55 })).toBeLessThan(0.15)
    expect(expandPeakValley(0.85, { power: 1.85, gain: 1.55 })).toBeGreaterThan(0.7)
  })
})

describe('buildFilledEnvelopePath', () => {
  it('returns a closed path', () => {
    const path = buildFilledEnvelopePath([
      { x: 0, topY: 20, bottomY: 80, color: 'rgb(1,2,3)' },
      { x: 50, topY: 10, bottomY: 90, color: 'rgb(1,2,3)' },
      { x: 100, topY: 30, bottomY: 70, color: 'rgb(1,2,3)' },
    ])
    expect(path.startsWith('M ')).toBe(true)
    expect(path.endsWith(' Z')).toBe(true)
  })
})


describe('bar-based zoom ladder', () => {
  it('steps through 1/2/4/8/16… and out to full track', () => {
    expect(stepVisibleBars(0, 1)).toBe(32)
    expect(stepVisibleBars(32, 1)).toBe(24)
    expect(stepVisibleBars(16, 1)).toBe(8)
    expect(stepVisibleBars(8, 1)).toBe(4)
    expect(stepVisibleBars(4, 1)).toBe(2)
    expect(stepVisibleBars(2, 1)).toBe(1)
    expect(stepVisibleBars(1, 1)).toBe(1)
    expect(stepVisibleBars(1, -1)).toBe(2)
    expect(stepVisibleBars(4, -1)).toBe(8)
    expect(stepVisibleBars(8, -1)).toBe(16)
    expect(stepVisibleBars(128, -1)).toBe(0)
    expect(stepVisibleBars(0, -1)).toBe(0)
  })

  it('scales continuously for wheel/pinch without discrete jumps', () => {
    expect(clampVisibleBars(12.5)).toBeCloseTo(12.5, 5)
    expect(clampVisibleBars(0)).toBe(0)
    // zoom in (negative delta) → fewer bars
    const inFactor = wheelDeltaToZoomFactor(-40)
    expect(inFactor).toBeLessThan(1)
    expect(scaleVisibleBars(32, inFactor)).toBeLessThan(32)
    expect(scaleVisibleBars(32, inFactor)).toBeGreaterThan(1)
    // zoom out past max → full overview
    expect(scaleVisibleBars(128, 1.2)).toBe(0)
    // enter from full
    expect(scaleVisibleBars(0, 0.5)).toBeGreaterThan(0)
    // hard stop: further zoom-out while already full stays full
    expect(scaleVisibleBars(0, 1.2)).toBe(0)
    expect(scaleVisibleBars(0, 2)).toBe(0)
  })

  it('applies zoom and pan from the same wheel event', () => {
    expect(splitWheelAxes(30, -40)).toEqual({ zoomDelta: -40, panDelta: 30 })
    expect(splitWheelAxes(0.2, -40)).toEqual({ zoomDelta: -40, panDelta: 0 })
    expect(splitWheelAxes(30, -40, { pinch: true })).toEqual({ zoomDelta: -40, panDelta: 0 })
    expect(splitWheelAxes(4, 40, { shift: true })).toEqual({ zoomDelta: 0, panDelta: 40 })
    expect(splitWheelAxes(40, 4, { shift: true })).toEqual({ zoomDelta: 0, panDelta: 40 })
  })

  it('stops zoom-out once the bar window covers the full track', () => {
    const beat = 0.5 // 120 BPM → 2s/bar
    // 40 bars × 2s = 80s ≥ 60s track → collapse to full
    expect(
      scaleVisibleBars(32, 1.4, {
        durationSec: 60,
        beatDurationSec: beat,
        beatsPerBar: 4,
      })
    ).toBe(0)
    expect(isFullTrackVisible(40, 60, beat, 4)).toBe(true)
    expect(isFullTrackVisible(8, 60, beat, 4)).toBe(false)
    expect(isFullTrackVisible(0, 60, beat, 4)).toBe(true)
  })

  it('sizes the follow window from visible bars × BPM', () => {
    const beat = 0.5 // 120 BPM
    const window = getVisibleTimeWindow({
      durationSec: 200,
      sampleCount: 2000,
      visibleBars: 8,
      beatsPerBar: 4,
      offsetIndex: 0,
      follow: true,
      currentTimeSec: 100,
      beatDurationSec: beat,
    })
    // 8 bars * 4 beats * 0.5s = 16s total (~4 bars history + 4 lookahead)
    expect(window.spanSec).toBeCloseTo(16, 5)
    expect(playheadLeftPercent({
      currentTimeSec: 100,
      durationSec: 200,
      visibleBars: 8,
      follow: true,
      startSec: window.startSec,
      endSec: window.endSec,
    })).toBe(50)
  })

  it('keeps full-track overview when visibleBars is 0', () => {
    const window = getVisibleTimeWindow({
      durationSec: 90,
      sampleCount: 900,
      visibleBars: 0,
      offsetIndex: 0,
      follow: true,
      currentTimeSec: 45,
      beatDurationSec: 0.5,
    })
    expect(window.spanSec).toBeCloseTo(90, 5)
    expect(window.startSec).toBe(0)
  })

  it('accepts fractional visibleBars for smooth zoom windows', () => {
    const beat = 0.5
    const window = getVisibleTimeWindow({
      durationSec: 200,
      sampleCount: 2000,
      visibleBars: 10.5,
      beatsPerBar: 4,
      offsetIndex: 0,
      follow: true,
      currentTimeSec: 100,
      beatDurationSec: beat,
    })
    // 10.5 * 4 * 0.5 = 21s
    expect(window.spanSec).toBeCloseTo(21, 5)
  })
})


describe('buildTimedSamplesInWindow', () => {
  it('keeps sample times on the track timeline so zoom matches the beatgrid axis', () => {
    const samples = Array.from({ length: 100 }, (_, i) => ({
      positive: 0.3 + (i % 7) * 0.05,
      negative: 0.2,
      color: 'rgb(1,2,3)',
    }))
    const timed = buildTimedSamplesInWindow({
      samples,
      durationSec: 100,
      startIndex: 20,
      endIndex: 40,
      targetCount: 40,
    })
    expect(timed.length).toBeGreaterThan(10)
    expect(timed[0].timeSec).toBeCloseTo(20.5, 5)
    expect(timed[timed.length - 1].timeSec).toBeCloseTo(39.5, 0) // last source index 39
    // densified times stay monotonic
    for (let i = 1; i < timed.length; i++) {
      expect(timed[i].timeSec).toBeGreaterThanOrEqual(timed[i - 1].timeSec)
    }
  })
})
