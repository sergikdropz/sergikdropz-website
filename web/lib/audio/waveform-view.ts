/**
 * CDJ-style waveform view math + MiniMeters-inspired multi-band RGB coloring.
 * One time window drives waveform, playhead, and beatgrid.
 */

import {
  dnaTintBands,
  type WaveformIntelligenceProfile,
} from '@/lib/audio/waveform-intelligence'

export type { WaveformIntelligenceProfile } from '@/lib/audio/waveform-intelligence'

export type WaveformElementType = 'kick' | 'snare' | 'clap' | 'hihat' | 'other'

export type WaveformBands = {
  /** ~20–250 Hz energy (kicks / sub / bass) — Red channel */
  low: number
  /** ~250–2500 Hz energy (body / snares / instruments) — Green channel */
  mid: number
  /** ~2500 Hz+ energy (hats / air / transients) — Blue channel */
  high: number
}

export type WaveformSample = {
  positive: number
  negative: number
  color: string
  elementType?: WaveformElementType
  elementConfidence?: number
  bands?: WaveformBands
  /** Optional RMS body (DAW dual-envelope); peak lives in positive/negative. */
  rms?: number
}

export type VisibleTimeWindow = {
  startSec: number
  endSec: number
  spanSec: number
  startIndex: number
  endIndex: number
  visibleCount: number
}

/**
 * MiniMeters Multi-Band / RGB balance (documented Low→Red, Mid→Green, High→Blue).
 * Tuned to match the screenshot: hot orange body, magenta mid spikes, cyan high air.
 */
export const MINIMETERS_BAND_RGB = {
  low: [255, 96, 12] as const, // hot orange-red (bass body)
  mid: [255, 48, 200] as const, // magenta (snares / body mids) — reads better than pure green in MM waveform
  high: [64, 230, 255] as const, // cyan (hats / air)
} as const

/** Pure band paint colors for layered Multi-Band overlay (Low/Mid/High drawn separately). */
export const MINIMETERS_LAYER_COLORS = {
  low: 'rgb(255, 78, 8)',
  mid: 'rgb(40, 255, 110)',
  high: 'rgb(70, 220, 255)',
} as const

/** Rekordbox / CDJ overview palette (blue lows, amber mids, white highs). */
export const REKORDBOX_COLORS = {
  kick: 'rgb(45, 130, 255)',
  snare: 'rgb(245, 248, 255)',
  hihat: 'rgb(190, 235, 255)',
  other: 'rgb(255, 165, 40)',
  fallback: 'rgb(80, 190, 255)',
} as const

/** Legacy alias — MiniMeters hot palette used by layered Multiband. */
export const CDJ_COLORS = {
  kick: 'rgb(255, 96, 12)',
  snare: 'rgb(255, 48, 200)',
  hihat: 'rgb(70, 220, 255)',
  other: 'rgb(255, 200, 40)',
  fallback: 'rgb(80, 220, 255)',
} as const

/**
 * Unified SERGIK waveform visual language (Ableton channel + musical energy).
 *
 * One silhouette for every mode: mirrored continuous envelope on a dark lane.
 * Color modes only change how that envelope is filled — never barcode columns.
 *
 * - channel: Ableton/OlliN solid teal lane (consumer default)
 * - energy: MiniMeters Low/Mid/High tint, remesured from Sonic DNA
 * - drums: layered kicks / claps / hats from phrase grids + spectral ranges
 * - elements: SERGIK DNA instrument lanes (kicks, bass, synths, vocals…)
 * - spectrum: spectral rainbow biased by DNA centroid / mix
 * - rekordbox: CDJ blue/amber/white from remesured pocket labels
 * - mono: SoundCloud solid orange
 */
export type WaveformColorMode =
  | 'channel'
  | 'energy'
  | 'drums'
  | 'elements'
  | 'spectrum'
  | 'rekordbox'
  | 'mono'

/** How Drums/Elements paint: separated lanes, flat merged, or overlay stacked on classic silhouette. */
export type WaveformLayerLayout = 'lanes' | 'merged' | 'overlay'

export const WAVEFORM_LAYER_LAYOUTS: Array<{
  id: WaveformLayerLayout
  label: string
  shortLabel: string
  description: string
}> = [
  {
    id: 'merged',
    label: 'Classic merged',
    shortLabel: 'Merged',
    description: 'Single waveform — lane colors blended into one envelope per sample',
  },
  {
    id: 'overlay',
    label: 'Overlay merged',
    shortLabel: 'Overlay',
    description: 'Classic single waveform with instrument color layers stacked on top',
  },
  {
    id: 'lanes',
    label: 'Separated lanes',
    shortLabel: 'Lanes',
    description: 'Fixed vertical bands per instrument (kick bottom, hats top)',
  },
]

/** Ableton / OlliN arrangement-lane accent (calm teal). */
export const CHANNEL_LANE_RGB = [56, 196, 210] as const

/** SERGIK Elements mode — instrument / frequency-band legend palette. */
export const SERGIK_ELEMENT_COLORS = {
  drums: [232, 63, 51] as const,
  kicks: [158, 206, 230] as const,
  claps: [115, 238, 71] as const,
  hats: [101, 219, 238] as const,
  percussion: [144, 185, 246] as const,
  bass: [248, 240, 114] as const,
  synths: [88, 251, 80] as const,
  vocals: [149, 162, 243] as const,
} as const

export type ElementBandEnergies = {
  drums: number
  kicks: number
  claps: number
  hats: number
  percussion: number
  bass: number
  synths: number
  vocals: number
}

/** Drum-element + spectral-range palette for `drums` mode. */
export const DRUM_SPECTRAL_COLORS = {
  kick: [255, 72, 8] as const, // sub / kick punch
  clap: [255, 210, 48] as const, // clap / snare body
  hat: [70, 230, 255] as const, // hats / air
  sub: [255, 40, 20] as const, // deepest low
  lowMid: [255, 140, 20] as const, // bass body
  mid: [255, 64, 180] as const, // musical mids
  highMid: [120, 255, 90] as const, // presence
  air: [140, 160, 255] as const, // top air
} as const

export const WAVEFORM_COLOR_MODES: Array<{
  id: WaveformColorMode
  label: string
  shortLabel: string
  description: string
}> = [
  {
    id: 'energy',
    label: 'Energy',
    shortLabel: 'Energy',
    description: 'MiniMeters Multi-Band remesured from Sonic DNA Low/Mid/High',
  },
  {
    id: 'drums',
    label: 'Drums',
    shortLabel: 'Drums',
    description: 'Kick / clap / hat pocket from DNA phrase grids',
  },
  {
    id: 'elements',
    label: 'Elements',
    shortLabel: 'Elem',
    description: 'Unified DNA — kicks, claps, hats, bass, synths, vocals',
  },
  {
    id: 'channel',
    label: 'Channel',
    shortLabel: 'Chan',
    description: 'Ableton/OlliN solid teal lane',
  },
  {
    id: 'spectrum',
    label: 'Spectrum',
    shortLabel: 'Spec',
    description: 'Spectral rainbow along the envelope',
  },
  {
    id: 'rekordbox',
    label: 'Rekordbox',
    shortLabel: 'RB',
    description: 'CDJ energy field — blue lows, amber mids, white highs',
  },
  {
    id: 'mono',
    label: 'Mono',
    shortLabel: 'Mono',
    description: 'Solid orange overview (SoundCloud-style)',
  },
]

export function normalizeWaveformColorMode(mode: string | null | undefined): WaveformColorMode {
  switch (mode) {
    case 'channel':
    case 'energy':
    case 'drums':
    case 'elements':
    case 'spectrum':
    case 'rekordbox':
    case 'mono':
      return mode
    // Legacy → unified language
    case 'multiband':
    case 'rgb':
    case 'colorful':
      return 'drums'
    case 'gradient':
    case 'classic':
      return 'spectrum'
    case 'simple':
      return 'mono'
    case 'ableton':
    case 'ollin':
      return 'channel'
    default:
      return 'energy'
  }
}

/** Layered Low/Mid/High envelopes — kicks / claps / hats readable as separate bands. */
export function usesMultiBandLayers(mode: WaveformColorMode): boolean {
  return mode === 'drums' || mode === 'elements'
}

export function normalizeWaveformLayerLayout(
  layout: string | null | undefined,
): WaveformLayerLayout {
  switch (layout) {
    case 'lanes':
    case 'separated':
    case 'split':
    case 'layers':
      return 'lanes'
    case 'overlay':
    case 'stacked':
    case 'layered':
      return 'overlay'
    case 'merged':
    case 'classic':
    case 'single':
      return 'merged'
    default:
      return 'merged'
  }
}

/** True when canvas stacks instrument colors on one classic merged envelope (Drums/Elements). */
export function usesOverlayMergedLayout(
  colorMode: WaveformColorMode,
  layout: WaveformLayerLayout = 'merged',
): boolean {
  return layout === 'overlay' && usesMultiBandLayers(colorMode)
}

/** True when canvas should paint fixed vertical instrument lanes (Drums/Elements only). */
export function usesSeparatedLaneLayout(
  colorMode: WaveformColorMode,
  layout: WaveformLayerLayout = 'merged',
): boolean {
  return layout === 'lanes' && usesMultiBandLayers(colorMode)
}

/** Solid-lane fills (no per-sample hue gradient). */
export function usesSolidLaneFill(mode: WaveformColorMode): boolean {
  return mode === 'channel' || mode === 'mono'
}

/** Original SERGIK spectral gradient (pre-MiniMeters look). */
export function spectralGradientColor(
  bands: WaveformBands,
  amp = 0.6,
  centroidHz: number | null = null
): string {
  const total = bands.low + bands.mid + bands.high + 1e-6
  // Map band balance to a 0–1 spectral position (low→high)
  let t = clamp((bands.mid * 0.45 + bands.high * 1.0) / total, 0, 1)
  if (centroidHz && centroidHz > 0) {
    const centroidT = clamp((Math.log2(Math.max(80, centroidHz)) - 6.3) / 7.2, 0, 1)
    t = clamp(t * 0.78 + centroidT * 0.22, 0, 1)
  }
  const brightness = 0.35 + expandPeakValley(amp, { power: 1.4, gain: 1.3, floor: 0 }) * 0.75

  let r: number
  let g: number
  let b: number
  if (t < 0.16) {
    // Deep red → orange (subs / kicks)
    const u = t / 0.16
    r = 255
    g = 40 + u * 120
    b = 0
  } else if (t < 0.32) {
    // Orange → yellow
    const u = (t - 0.16) / 0.16
    r = 255
    g = 160 + u * 95
    b = u * 40
  } else if (t < 0.5) {
    // Yellow → green
    const u = (t - 0.32) / 0.18
    r = 255 * (1 - u)
    g = 255
    b = u * 60
  } else if (t < 0.68) {
    // Green → cyan
    const u = (t - 0.5) / 0.18
    r = 0
    g = 255
    b = 60 + u * 195
  } else if (t < 0.84) {
    // Cyan → blue
    const u = (t - 0.68) / 0.16
    r = u * 40
    g = 255 * (1 - u)
    b = 255
  } else {
    // Blue → magenta/violet (air / hats)
    const u = (t - 0.84) / 0.16
    r = 40 + u * 180
    g = 0
    b = 255
  }

  return rgbString(r * brightness, g * brightness, b * brightness)
}

/** Rekordbox / CDJ energy field from remesured pocket labels or band dominance. */
export function rekordboxEnergyColor(
  sample: Pick<WaveformSample, 'positive' | 'elementType' | 'elementConfidence' | 'bands'>
): string {
  const confidence = sample.elementConfidence ?? 0
  if (sample.elementType && confidence > 0.25) {
    switch (sample.elementType) {
      case 'kick':
        return REKORDBOX_COLORS.kick
      case 'snare':
      case 'clap':
        return REKORDBOX_COLORS.snare
      case 'hihat':
        return REKORDBOX_COLORS.hihat
      default:
        return REKORDBOX_COLORS.other
    }
  }

  const bands = inferBandsFromSample(sample)
  const dominated = dominateBands(bands, 3.8)
  if (dominated.low >= dominated.mid && dominated.low >= dominated.high) {
    return lerpColor(REKORDBOX_COLORS.kick, REKORDBOX_COLORS.other, clamp(dominated.mid, 0, 0.45))
  }
  if (dominated.high >= dominated.mid) {
    return lerpColor(REKORDBOX_COLORS.hihat, REKORDBOX_COLORS.snare, clamp(dominated.mid, 0, 0.5))
  }
  return lerpColor(REKORDBOX_COLORS.other, REKORDBOX_COLORS.snare, clamp(dominated.high, 0, 0.55))
}

/** Map L/M/H (+ element labels + DNA profile) → 8 SERGIK element energies. */
export function sampleElementBands(
  sample: Pick<
    WaveformSample,
    'positive' | 'negative' | 'elementType' | 'elementConfidence' | 'bands' | 'rms'
  >,
  profile?: WaveformIntelligenceProfile | null
): ElementBandEnergies {
  const peak = Math.max(sample.positive ?? 0, sample.negative ?? 0)
  const { low = peak * 0.55, mid = peak * 0.4, high = peak * 0.3 } = sample.bands ?? {}
  const rms = sample.rms ?? peak

  const crest = peak / Math.max(1e-4, rms)
  let kicks = low * (crest > 1.6 ? 0.75 : 0.35)
  let bass = low * (crest > 1.6 ? 0.25 : 0.65)
  let claps = mid * 0.45 + high * 0.15
  let hats = high * 0.85
  let percussion = mid * 0.35 * Math.max(0.2, 1 - crest / 3)
  let synths = mid * Math.min(1, rms / Math.max(peak, 1e-4))
  let vocals = mid * 0.25 + high * 0.1

  const conf = sample.elementConfidence ?? 0
  if (sample.elementType && conf > 0.28) {
    const boost = 0.35 + conf * 0.65
    if (sample.elementType === 'kick') kicks = Math.max(kicks, boost)
    else if (sample.elementType === 'snare') claps = Math.max(claps, boost * 0.85)
    else if (sample.elementType === 'clap') claps = Math.max(claps, boost)
    else if (sample.elementType === 'hihat') hats = Math.max(hats, boost)
  }

  if (profile) {
    const b = profile.spectralBias
    bass *= 1 + b.bass
    synths *= 1 + b.synths
    vocals *= 1 + b.vocals
    kicks *= 1 + b.kicks
    hats *= 1 + b.hats
    percussion *= 1 + b.percussion
    if (!profile.hasVocals) vocals *= 0.12
    if (!profile.hasSynths) synths *= 0.22
    if (!profile.hasBass) bass *= 0.35
    if (!profile.hasHats) hats *= 0.45
    if (profile.bassLock === 'follows-kick' || profile.bassLock === 'rolling') bass *= 1.12
  }

  const drums = Math.max(kicks, claps, hats) * 0.6 + (kicks + claps + hats) * 0.15
  return { drums, kicks, claps, hats, percussion, bass, synths, vocals }
}

/** SERGIK Elements mode — sharpened weighted blend of instrument palette colors. */
export function elementSpectralColor(
  sample: Pick<
    WaveformSample,
    'positive' | 'negative' | 'elementType' | 'elementConfidence' | 'bands' | 'rms'
  >,
  profile?: WaveformIntelligenceProfile | null
): string {
  const amp = expandPeakValley(sample.positive ?? 0.5, { power: 1.35, gain: 1.25, floor: 0 })
  const e = sharpenBandWeights(
    sampleElementBands(sample, profile),
    2.55,
    0.03,
  )
  const total =
    e.drums + e.kicks + e.claps + e.hats + e.percussion + e.bass + e.synths + e.vocals + 1e-6

  let r = 0
  let g = 0
  let b = 0
  for (const [key, rgb] of Object.entries(SERGIK_ELEMENT_COLORS) as Array<
    [keyof typeof SERGIK_ELEMENT_COLORS, readonly [number, number, number]]
  >) {
    const w = e[key] / total
    r += rgb[0] * w
    g += rgb[1] * w
    b += rgb[2] * w
  }
  const energy = 0.24 + amp * 0.96
  ;[r, g, b] = boostRgbSaturation(r * energy, g * energy, b * energy, 2.25)
  return rgbString(r, g, b)
}

/** Resolve display color for a sample given the active professional color mode. */
export function resolveWaveformColor(
  sample: Pick<
    WaveformSample,
    'color' | 'positive' | 'negative' | 'elementType' | 'elementConfidence' | 'bands' | 'rms'
  >,
  mode: WaveformColorMode,
  profile?: WaveformIntelligenceProfile | null
): string {
  const tinted = dnaTintBands(inferBandsFromSample(sample), profile)
  const amp = sample.positive ?? 0.5
  const energyLift = profile ? 0.92 + profile.energy01 * 0.16 : 1
  switch (mode) {
    case 'channel': {
      const [cr, cg, cb] = CHANNEL_LANE_RGB
      const bright =
        (0.5 + expandPeakValley(amp, { power: 1.3, gain: 1.2, floor: 0 }) * 0.5) * energyLift
      return rgbString(cr * bright, cg * bright, cb * bright)
    }
    case 'mono':
      return '#ff5500'
    case 'spectrum':
      return spectralGradientColor(tinted, amp, profile?.centroidHz ?? null)
    case 'rekordbox':
      return rekordboxEnergyColor(sample)
    case 'drums':
      return drumSpectralColor(sample, profile)
    case 'elements':
      return elementSpectralColor(sample, profile)
    case 'energy':
    default:
      return multiBandRgbColor(tinted)
  }
}

/**
 * Drums mode: prioritize kick / clap / hat labels, otherwise blend spectral ranges
 * (sub → low-mid → mid → high-mid → air) from Low/Mid/High band energy.
 */
export function drumSpectralColor(
  sample: Pick<WaveformSample, 'positive' | 'elementType' | 'elementConfidence' | 'bands'>,
  profile?: WaveformIntelligenceProfile | null
): string {
  const amp = expandPeakValley(sample.positive ?? 0.5, { power: 1.35, gain: 1.25, floor: 0 })
  const confidence = sample.elementConfidence ?? 0
  if (sample.elementType && confidence > 0.28) {
    const scale = 0.42 + amp * 0.82
    switch (sample.elementType) {
      case 'kick': {
        const [r, g, b] = DRUM_SPECTRAL_COLORS.kick
        return rgbString(r * scale, g * scale, b * scale)
      }
      case 'snare': {
        const [r, g, b] = DRUM_SPECTRAL_COLORS.mid
        return rgbString(r * scale, g * scale, b * scale)
      }
      case 'clap': {
        const [r, g, b] = DRUM_SPECTRAL_COLORS.clap
        return rgbString(r * scale, g * scale, b * scale)
      }
      case 'hihat': {
        const [r, g, b] = DRUM_SPECTRAL_COLORS.hat
        return rgbString(r * scale, g * scale, b * scale)
      }
      default:
        break
    }
  }

  const bands = dominateBands(dnaTintBands(inferBandsFromSample(sample), profile), 4.2)
  const total = bands.low + bands.mid + bands.high + 1e-6
  const spectral = sharpenBandWeights(
    {
      sub: bands.low * (bands.low / total),
      lowMid: bands.low * (1 - bands.low / total) + bands.mid * 0.25,
      mid: bands.mid * 0.7,
      highMid: bands.mid * 0.3 + bands.high * 0.35,
      air: bands.high * 0.75,
    },
    2.4,
    0.04,
  )
  const sub = spectral.sub
  const lowMid = spectral.lowMid
  const mid = spectral.mid
  const highMid = spectral.highMid
  const air = spectral.air

  const energy = 0.22 + amp * 0.98
  let r =
    sub * DRUM_SPECTRAL_COLORS.sub[0] +
    lowMid * DRUM_SPECTRAL_COLORS.lowMid[0] +
    mid * DRUM_SPECTRAL_COLORS.mid[0] +
    highMid * DRUM_SPECTRAL_COLORS.highMid[0] +
    air * DRUM_SPECTRAL_COLORS.air[0]
  let g =
    sub * DRUM_SPECTRAL_COLORS.sub[1] +
    lowMid * DRUM_SPECTRAL_COLORS.lowMid[1] +
    mid * DRUM_SPECTRAL_COLORS.mid[1] +
    highMid * DRUM_SPECTRAL_COLORS.highMid[1] +
    air * DRUM_SPECTRAL_COLORS.air[1]
  let b =
    sub * DRUM_SPECTRAL_COLORS.sub[2] +
    lowMid * DRUM_SPECTRAL_COLORS.lowMid[2] +
    mid * DRUM_SPECTRAL_COLORS.mid[2] +
    highMid * DRUM_SPECTRAL_COLORS.highMid[2] +
    air * DRUM_SPECTRAL_COLORS.air[2]

  ;[r, g, b] = boostRgbSaturation(r * energy, g * energy, b * energy, 2.1)
  return rgbString(r, g, b)
}

/** Zoom 1 = full track; zoom > 1 zooms in (smaller visible ratio). Legacy helper. */
export function zoomToVisibleRatio(zoomLevel: number): number {
  if (zoomLevel <= 0 || zoomLevel < 0.01) return 100
  if (zoomLevel === 1) return 1
  return 1 / Math.pow(zoomLevel, 1.5)
}

/**
 * Discrete musical zoom ladder (bars visible on screen).
 * Steps favor 4/8/16 phrase windows and then +8-bar increments toward overview.
 */
export const WAVEFORM_BAR_ZOOM_STEPS = [4, 8, 16, 24, 32, 48, 64, 96, 128] as const

export type WaveformBarZoomStep = (typeof WAVEFORM_BAR_ZOOM_STEPS)[number]

export const WAVEFORM_MIN_VISIBLE_BARS = WAVEFORM_BAR_ZOOM_STEPS[0]
export const WAVEFORM_MAX_VISIBLE_BARS = WAVEFORM_BAR_ZOOM_STEPS[WAVEFORM_BAR_ZOOM_STEPS.length - 1]

/** 0 = full-track overview; otherwise bars visible in the follow/pan window. */
export function clampVisibleBars(bars: number): number {
  if (!Number.isFinite(bars) || bars <= 0) return 0
  // Continuous zoom: keep fractional bars between min/max (do not snap/round here)
  return Math.max(WAVEFORM_MIN_VISIBLE_BARS, Math.min(WAVEFORM_MAX_VISIBLE_BARS, bars))
}

export function nearestBarZoomStep(bars: number): number {
  if (!Number.isFinite(bars) || bars <= 0) return 0
  let best: number = WAVEFORM_BAR_ZOOM_STEPS[0]
  let bestDist = Math.abs(bars - best)
  for (const step of WAVEFORM_BAR_ZOOM_STEPS) {
    const d = Math.abs(bars - step)
    if (d < bestDist) {
      best = step
      bestDist = d
    }
  }
  return best
}

/**
 * Continuous wheel/pinch zoom. `factor` > 1 zooms out (more bars);
 * `factor` < 1 zooms in (fewer bars). Returns 0 for full-track overview.
 *
 * Hard stop: once at full overview (`currentBars <= 0`), further zoom-out
 * stays at 0 (does not re-enter the ladder). Optional `durationSec` + BPM
 * collapse to full as soon as the bar window already covers the whole track.
 */
export function scaleVisibleBars(
  currentBars: number,
  factor: number,
  options?: {
    durationSec?: number
    beatDurationSec?: number | null
    beatsPerBar?: number
  }
): number {
  if (!Number.isFinite(factor) || factor <= 0) return currentBars

  // Already full waveform — zoom-out is a no-op; zoom-in leaves overview.
  if (currentBars <= 0) {
    if (factor >= 1) return 0
    const next = WAVEFORM_MAX_VISIBLE_BARS * factor
    return clampVisibleBars(next)
  }

  const base = clampVisibleBars(currentBars)
  const next = base * factor

  // Past the wide end → full overview
  if (next >= WAVEFORM_MAX_VISIBLE_BARS * 1.12) return 0

  const clamped = clampVisibleBars(next)
  const durationSec = options?.durationSec
  const beatDurationSec = options?.beatDurationSec
  const beatsPerBar = options?.beatsPerBar ?? 4
  // If this window already shows the entire track, stop at full overview
  if (
    factor > 1 &&
    durationSec != null &&
    durationSec > 0 &&
    isFullTrackVisible(clamped, durationSec, beatDurationSec, beatsPerBar)
  ) {
    return 0
  }
  return clamped
}

/** True when a bar window is at least as wide as the track (full waveform on screen). */
export function isFullTrackVisible(
  visibleBars: number,
  durationSec: number,
  beatDurationSec?: number | null,
  beatsPerBar = 4
): boolean {
  if (visibleBars <= 0) return true
  if (!(durationSec > 0)) return false
  const fromBars = barsToWindowSec(visibleBars, beatDurationSec, beatsPerBar)
  const spanSec = fromBars != null ? fromBars : visibleBars * 2 // ~120 BPM fallback
  return spanSec >= durationSec * 0.985
}

/** Map pixel wheel delta → zoom factor (stable across trackpads / mice). */
export function wheelDeltaToZoomFactor(deltaY: number, sensitivity = 0.00185): number {
  // Clamp huge trackpad bursts so one flick doesn't leap the whole ladder
  const dy = Math.max(-180, Math.min(180, deltaY))
  return Math.exp(dy * sensitivity)
}

/** Zoom in = fewer bars; zoom out = more bars; past max step → full track (0). */
export function stepVisibleBars(currentBars: number, direction: 1 | -1): number {
  const steps = WAVEFORM_BAR_ZOOM_STEPS
  if (direction < 0) {
    // zoom out
    if (currentBars <= 0) return 0
    const idx = steps.findIndex((s) => s >= currentBars)
    if (idx < 0) return 0
    if (idx >= steps.length - 1) return 0 // past widest preset → full overview
    return steps[idx + 1]
  }
  // zoom in
  if (currentBars <= 0) return steps[Math.min(steps.length - 1, 4)] // enter at 32 bars
  const exact = steps.indexOf(currentBars as WaveformBarZoomStep)
  if (exact > 0) return steps[exact - 1]
  if (exact === 0) return steps[0]
  // between steps: snap then move inward
  const nearest = nearestBarZoomStep(currentBars)
  const nIdx = steps.indexOf(nearest as WaveformBarZoomStep)
  return steps[Math.max(0, nIdx - 1)]
}

export function barsToWindowSec(
  visibleBars: number,
  beatDurationSec: number | null | undefined,
  beatsPerBar = 4
): number | null {
  if (visibleBars <= 0) return null
  if (!beatDurationSec || beatDurationSec <= 0) return null
  return visibleBars * beatsPerBar * beatDurationSec
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Snap a duration to an integer number of half-beats (min 4 half-beats). */
export function quantizeWindowToHalfBeats(
  windowSec: number,
  beatDurationSec: number | null | undefined,
  minHalfBeats = 4
): number {
  if (!beatDurationSec || beatDurationSec <= 0 || !Number.isFinite(windowSec)) {
    return Math.max(0.001, windowSec)
  }
  const half = beatDurationSec / 2
  const halfBeats = Math.max(minHalfBeats, Math.round(windowSec / half))
  return halfBeats * half
}

/** Snap window to whole bars (preferred for DJ overview / phrase zoom). */
export function quantizeWindowToBars(
  windowSec: number,
  beatDurationSec: number | null | undefined,
  beatsPerBar = 4,
  minBars = 4
): number {
  if (!beatDurationSec || beatDurationSec <= 0 || !Number.isFinite(windowSec)) {
    return Math.max(0.001, windowSec)
  }
  const barSec = beatDurationSec * beatsPerBar
  const bars = Math.max(minBars, Math.round(windowSec / barSec))
  return bars * barSec
}

export function indexToTimeSec(index: number, sampleCount: number, durationSec: number): number {
  if (sampleCount <= 0 || durationSec <= 0) return 0
  // Bin center — peaks sit mid-slice so they line up with playhead / beat grid
  return ((index + 0.5) / sampleCount) * durationSec
}

export function timeSecToIndex(timeSec: number, sampleCount: number, durationSec: number): number {
  if (sampleCount <= 0 || durationSec <= 0) return 0
  // Inverse of bin-center mapping
  return (timeSec / durationSec) * sampleCount - 0.5
}

/** Map absolute time into viewBox X percent [0, 100]. */
export function timeToXPercent(timeSec: number, startSec: number, endSec: number): number {
  const span = endSec - startSec
  if (span <= 0) return 0
  return ((timeSec - startSec) / span) * 100
}

/**
 * Playhead left position as a percentage of the waveform container.
 * Returns -1 when the playhead is outside the visible window.
 * `zoomed` = not full-track overview (bar window active).
 */
export function playheadLeftPercent(params: {
  currentTimeSec: number
  durationSec: number
  zoom?: number
  /** Prefer this over legacy zoom when provided. 0 = full track. */
  visibleBars?: number
  follow: boolean
  startSec: number
  endSec: number
}): number {
  const { currentTimeSec, durationSec, follow, startSec, endSec } = params
  const visibleBars = params.visibleBars
  const zoomed =
    visibleBars != null ? visibleBars > 0 : (params.zoom ?? 1) > 1
  if (durationSec <= 0) return 0
  if (follow && zoomed) return 50
  if (!zoomed) return (currentTimeSec / durationSec) * 100
  if (currentTimeSec < startSec || currentTimeSec > endSec) return -1
  return timeToXPercent(currentTimeSec, startSec, endSec)
}

export function getVisibleTimeWindow(params: {
  durationSec: number
  sampleCount: number
  /** Legacy zoom multiplier (1 = full). Ignored when visibleBars is set. */
  zoom?: number
  /** Bars visible on screen; 0/undefined with zoom<=1 = full track. */
  visibleBars?: number
  beatsPerBar?: number
  /** Waveform sample index offset when not in follow mode. */
  offsetIndex: number
  follow: boolean
  currentTimeSec: number
  beatDurationSec?: number | null
}): VisibleTimeWindow {
  const {
    durationSec,
    sampleCount,
    zoom = 1,
    offsetIndex,
    follow,
    currentTimeSec,
    beatDurationSec,
  } = params
  const beatsPerBar = params.beatsPerBar ?? 4
  const visibleBars = params.visibleBars != null ? clampVisibleBars(params.visibleBars) : 0

  if (durationSec <= 0 || sampleCount <= 0) {
    return {
      startSec: 0,
      endSec: Math.max(0, durationSec),
      spanSec: Math.max(0, durationSec),
      startIndex: 0,
      endIndex: Math.max(0, sampleCount),
      visibleCount: Math.max(0, sampleCount),
    }
  }

  let spanSec: number
  if (visibleBars > 0) {
    const fromBars = barsToWindowSec(visibleBars, beatDurationSec, beatsPerBar)
    if (fromBars != null) {
      spanSec = Math.min(durationSec, fromBars)
    } else {
      // No BPM: approximate a bar as 2s (120 BPM / 4/4) so zoom still widens
      spanSec = Math.min(durationSec, visibleBars * 2)
    }
  } else if (zoom <= 1) {
    spanSec = durationSec
  } else {
    // Legacy path: ratio zoom, but snap to bars (min 4) so we never collapse to ~1 beat
    const ratio = zoomToVisibleRatio(zoom)
    spanSec = Math.max(durationSec * ratio, durationSec / sampleCount)
    spanSec = quantizeWindowToBars(spanSec, beatDurationSec, beatsPerBar, 4)
    spanSec = Math.min(spanSec, durationSec)
  }

  const zoomed = visibleBars > 0 || zoom > 1
  let startSec: number
  if (!zoomed) {
    startSec = 0
  } else if (follow) {
    // Center playhead — past history and future lookahead share the bar window
    startSec = clamp(currentTimeSec - spanSec / 2, 0, Math.max(0, durationSec - spanSec))
  } else {
    startSec = clamp(
      indexToTimeSec(offsetIndex, sampleCount, durationSec),
      0,
      Math.max(0, durationSec - spanSec)
    )
  }

  const endSec = Math.min(durationSec, startSec + spanSec)
  const startIndex = clamp(Math.floor(timeSecToIndex(startSec, sampleCount, durationSec)), 0, sampleCount)
  const endIndex = clamp(Math.ceil(timeSecToIndex(endSec, sampleCount, durationSec)), startIndex, sampleCount)
  const visibleCount = Math.max(1, endIndex - startIndex)

  return {
    startSec,
    endSec,
    spanSec: Math.max(0.0001, endSec - startSec),
    startIndex,
    endIndex,
    visibleCount,
  }
}

/** Follow-mode target offset in sample-index space (for existing pan state). */
export function followTargetOffsetIndex(params: {
  currentTimeSec: number
  durationSec: number
  sampleCount: number
  zoom?: number
  visibleBars?: number
  beatsPerBar?: number
  beatDurationSec?: number | null
}): number {
  const {
    currentTimeSec,
    durationSec,
    sampleCount,
    zoom = 1,
    visibleBars = 0,
    beatsPerBar = 4,
    beatDurationSec,
  } = params
  const zoomed = visibleBars > 0 || zoom > 1
  if (durationSec <= 0 || sampleCount <= 0 || !zoomed) return 0
  const window = getVisibleTimeWindow({
    durationSec,
    sampleCount,
    zoom,
    visibleBars,
    beatsPerBar,
    offsetIndex: 0,
    follow: true,
    currentTimeSec,
    beatDurationSec,
  })
  return timeSecToIndex(window.startSec, sampleCount, durationSec)
}

export function parseRgb(color: string): [number, number, number] {
  const match = color.match(/\d+/g)
  if (match && match.length >= 3) {
    return [Number(match[0]), Number(match[1]), Number(match[2])]
  }
  return [80, 190, 255]
}

export function rgbString(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseRgb(a)
  const [r2, g2, b2] = parseRgb(b)
  return rgbString(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
}

/** Raise midtones for MiniMeters-like punch without clipping highlights. */
export function contrastCurve(x: number, amount = 1.55): number {
  const v = clamp(x, 0, 1)
  // Soft contrast: push lows down, highs up
  const shaped = Math.pow(v, 1 / amount)
  return clamp((shaped - 0.5) * 1.35 + 0.5, 0, 1)
}

/**
 * Softmax-sharpen band/element weights so the dominant lane owns hue
 * (less muddy grey overlap between kicks, claps, hats, bass, synths).
 */
export function sharpenBandWeights<T extends Record<string, number>>(
  weights: T,
  power = 2.65,
  floor = 0.035,
): T {
  const entries = Object.entries(weights) as Array<[keyof T & string, number]>
  if (!entries.length) return weights
  const max = Math.max(...entries.map(([, v]) => Math.max(0, v)), 1e-6)
  const scaled = entries.map(([k, v]) => [k, Math.pow(Math.max(0, v) / max, power)] as const)
  const sum = scaled.reduce((acc, [, v]) => acc + v, 0) || 1
  const out = { ...weights }
  for (const [k, v] of scaled) {
    out[k] = Math.max(floor, v / sum) as T[keyof T & string]
  }
  return out
}

/**
 * Sqrt-normalize lane energies so co-active instruments keep visible share
 * (unlike softmax sharpen, which lets one lane swallow the column).
 */
export function softNormalizeEnergies<T extends Record<string, number>>(
  energies: T,
  options?: { minShare?: number; threshold?: number },
): T {
  const minShare = options?.minShare ?? 0.07
  const threshold = options?.threshold ?? 0.035
  const entries = Object.entries(energies) as Array<[keyof T & string, number]>
  const active = entries.filter(([, v]) => v >= threshold)
  const out = { ...energies }
  if (!active.length) return out
  for (const [k] of entries) out[k] = 0 as T[keyof T & string]
  const sqrtShares = active.map(([k, v]) => [k, Math.sqrt(Math.max(0, v))] as const)
  const sum = sqrtShares.reduce((acc, [, v]) => acc + v, 0) || 1
  const floored = sqrtShares.map(([k, v]) => [k, Math.max(v / sum, minShare)] as const)
  const floorSum = floored.reduce((acc, [, s]) => acc + s, 0) || 1
  for (const [k, s] of floored) out[k] = (s / floorSum) as T[keyof T & string]
  return out
}

/** Weighted additive RGB mix for shared waveform body (co-present lanes). */
export function mixAdditiveRgb<K extends string>(
  layers: Array<{ key: K; rgb: readonly [number, number, number] }>,
  shares: Record<K, number>,
): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  let w = 0
  for (const layer of layers) {
    const s = shares[layer.key] ?? 0
    if (s <= 0) continue
    r += layer.rgb[0] * s
    g += layer.rgb[1] * s
    b += layer.rgb[2] * s
    w += s
  }
  if (w <= 0) return [72, 72, 72]
  return [r / w, g / w, b / w]
}

/** Push RGB away from grey for clearer separation on the black tape bed. */
export function boostRgbSaturation(
  r: number,
  g: number,
  b: number,
  amount = 2.15,
): [number, number, number] {
  const avg = (r + g + b) / 3
  return [
    clamp(avg + (r - avg) * amount, 0, 255),
    clamp(avg + (g - avg) * amount, 0, 255),
    clamp(avg + (b - avg) * amount, 0, 255),
  ]
}

/**
 * Expand peaks vs valleys like MiniMeters: quiet → near 0, transients → near 1.
 * `power` > 1 digs valleys; `gain` lifts peaks before soft-clip.
 */
export function expandPeakValley(
  x: number,
  options?: { power?: number; gain?: number; floor?: number }
): number {
  const power = options?.power ?? 1.85
  const gain = options?.gain ?? 1.55
  const floor = options?.floor ?? 0.02
  const v = Math.max(0, x)
  const shaped = Math.pow(clamp(v * gain, 0, 1.4), power)
  // Soft knee into 1.0 so peaks bloom without hard clipping early
  const soft = shaped < 1 ? shaped : 1 - Math.exp(-(shaped - 1) * 2.2) * 0.35
  return clamp(soft < floor && v > 0.001 ? floor : soft, 0, 1)
}

/** Local adaptive contrast across a window (MiniMeters-style readability). */
export function applyLocalAmplitudeContrast(
  samples: WaveformSample[],
  options?: { percentile?: number; floor?: number }
): WaveformSample[] {
  if (samples.length === 0) return samples
  const percentile = options?.percentile ?? 0.92
  const floor = options?.floor ?? 0.015
  const amps = samples.map((s) => Math.max(s.positive, s.negative))
  const sorted = [...amps].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))
  const ref = Math.max(0.08, sorted[idx] || 0.5)

  return samples.map((s) => {
    const pos = expandPeakValley(s.positive / ref, { power: 1.75, gain: 1.35, floor })
    const neg = expandPeakValley(s.negative / ref, { power: 1.75, gain: 1.35, floor })
    const amp = Math.max(pos, neg)
    // Prefer real DSP bands; only fall back to amplitude heuristics when missing
    const baseBands = s.bands ?? inferBandsFromSample({ ...s, positive: Math.max(pos, neg) })
    const scaledBands: WaveformBands = {
      low: clamp(baseBands.low * (0.3 + amp * 0.85), 0, 1),
      mid: clamp(baseBands.mid * (0.3 + amp * 0.85), 0, 1),
      high: clamp(baseBands.high * (0.3 + amp * 0.85), 0, 1),
    }
    const rms =
      s.rms != null
        ? expandPeakValley(s.rms / ref, { power: 1.55, gain: 1.25, floor })
        : undefined
    return {
      ...s,
      positive: pos,
      negative: neg,
      rms,
      bands: scaledBands,
      color: multiBandRgbColor(scaledBands),
    }
  })
}

/** Softmax-ish band weights so one dominant band owns the hue (less muddy grey). */
export function dominateBands(bands: WaveformBands, sharpness = 3.2): WaveformBands {
  const low = Math.max(0, bands.low)
  const mid = Math.max(0, bands.mid)
  const high = Math.max(0, bands.high)
  const eL = Math.exp(low * sharpness)
  const eM = Math.exp(mid * sharpness)
  const eH = Math.exp(high * sharpness)
  const sum = eL + eM + eH || 1
  const peak = Math.max(low, mid, high, 1e-6)
  // Keep absolute energy (for brightness) while redistributing hue ownership
  return {
    low: (eL / sum) * peak * (0.55 + low * 0.7),
    mid: (eM / sum) * peak * (0.55 + mid * 0.7),
    high: (eH / sum) * peak * (0.55 + high * 0.7),
  }
}

/**
 * MiniMeters Multi-Band: additive RGB mix of Low/Mid/High envelopes.
 * Dominant band saturates; balanced energy goes white/hot (transients).
 */
export function multiBandRgbColor(
  bands: WaveformBands,
  options?: { contrast?: number; saturation?: number; floor?: number }
): string {
  const contrast = options?.contrast ?? 2.28
  const saturation = options?.saturation ?? 2.08
  const floor = options?.floor ?? 0.015

  const dominated = dominateBands(
    {
      low: contrastCurve(Math.max(0, bands.low), contrast),
      mid: contrastCurve(Math.max(0, bands.mid), contrast),
      high: contrastCurve(Math.max(0, bands.high), contrast),
    },
    4.1
  )
  const low = dominated.low
  const mid = dominated.mid
  const high = dominated.high

  // Pure-ish band paints with limited cross-talk (matches MiniMeters chromatic look)
  let r =
    low * MINIMETERS_BAND_RGB.low[0] +
    mid * MINIMETERS_BAND_RGB.mid[0] * 0.55 +
    high * MINIMETERS_BAND_RGB.high[0] * 0.12
  let g =
    low * MINIMETERS_BAND_RGB.low[1] * 0.55 +
    mid * MINIMETERS_BAND_RGB.mid[1] * 0.35 +
    high * MINIMETERS_BAND_RGB.high[1] * 0.75 +
    // green mid layer contribution when mids win without magenta wash
    mid * 180 * (1 - high)
  let b =
    low * MINIMETERS_BAND_RGB.low[2] * 0.08 +
    mid * MINIMETERS_BAND_RGB.mid[2] * 0.55 +
    high * MINIMETERS_BAND_RGB.high[2]

  // Yellow lift when low+mid (classic MiniMeters orange→yellow bass body)
  const warmBody = clamp(low * mid * 2.2, 0, 1)
  r = lerp(r, 255, warmBody * 0.25)
  g = lerp(g, 220, warmBody * 0.45)

  // White-hot only for strong multi-band transients (thin cyan/white spikes)
  const peak = Math.max(low, mid, high)
  const multi = Math.min(low, mid) + Math.min(mid, high) + Math.min(low, high)
  const whiteHot = clamp(multi * 1.1 * peak, 0, 1)
  r = lerp(r, 255, whiteHot * 0.28)
  g = lerp(g, 255, whiteHot * 0.32)
  b = lerp(b, 255, whiteHot * 0.4)

  // Saturation boost away from grey — keep MiniMeters punch on black
  const avg = (r + g + b) / 3
  r = avg + (r - avg) * saturation
  g = avg + (g - avg) * saturation
  b = avg + (b - avg) * saturation

  // Energy-scaled brightness: valleys nearly black, peaks full chroma
  const energy = expandPeakValley(clamp((low + mid + high) / 1.6, 0, 1), {
    power: 1.35,
    gain: 1.25,
    floor: 0,
  })
  r *= 0.12 + energy * 0.95
  g *= 0.12 + energy * 0.95
  b *= 0.12 + energy * 0.95

  const floorLift = floor * (1 - energy)
  r = Math.max(r, 255 * floorLift * 0.25)
  g = Math.max(g, 255 * floorLift * 0.35)
  b = Math.max(b, 255 * floorLift * 0.45)

  return rgbString(clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255))
}

/** Infer Low/Mid/High bands from element labels or amplitude when FFT bands are missing. */
export function inferBandsFromSample(
  sample: Pick<WaveformSample, 'positive' | 'elementType' | 'elementConfidence' | 'bands'>
): WaveformBands {
  if (sample.bands) {
    return {
      low: clamp(sample.bands.low, 0, 1),
      mid: clamp(sample.bands.mid, 0, 1),
      high: clamp(sample.bands.high, 0, 1),
    }
  }

  const amp = contrastCurve(sample.positive ?? 0.4, 1.4)
  const confidence = sample.elementConfidence ?? 0

  if (sample.elementType && confidence > 0.2) {
    switch (sample.elementType) {
      case 'kick':
        return { low: amp, mid: amp * 0.22, high: amp * 0.08 }
      case 'snare':
        return { low: amp * 0.25, mid: amp * 0.85, high: amp * 0.55 }
      case 'clap':
        return { low: amp * 0.15, mid: amp * 0.7, high: amp * 0.85 }
      case 'hihat':
        return { low: amp * 0.05, mid: amp * 0.25, high: amp }
      default:
        return { low: amp * 0.35, mid: amp, high: amp * 0.4 }
    }
  }

  // Amplitude-only heuristic for stored peak arrays (no spectral metadata)
  if (amp > 0.75) return { low: amp, mid: amp * 0.35, high: amp * 0.2 }
  if (amp > 0.5) return { low: amp * 0.45, mid: amp, high: amp * 0.35 }
  if (amp > 0.3) return { low: amp * 0.2, mid: amp * 0.55, high: amp * 0.85 }
  return { low: amp * 0.12, mid: amp * 0.35, high: amp * 0.7 }
}

/**
 * Display color for a waveform sample — MiniMeters multi-band RGB by default.
 * Prefer explicit `bands` from live FFT; otherwise infer from element/amplitude.
 */
export function cdjEnergyColor(
  sample: Pick<WaveformSample, 'color' | 'elementType' | 'elementConfidence' | 'positive' | 'bands'>
): string {
  return multiBandRgbColor(inferBandsFromSample(sample))
}

/** Normalize Float32 FFT magnitudes (often negative dB) into 0–1 band energies. */
export function normalizeFftBands(
  low: number,
  mid: number,
  high: number,
  options?: { dbFloor?: number; dbCeil?: number }
): WaveformBands {
  const floor = options?.dbFloor ?? -90
  const ceil = options?.dbCeil ?? -20
  const toUnit = (db: number) => {
    // Float32 frequency data is typically dB; also accept already-linear magnitudes.
    if (db <= 1.5 && db >= 0) return contrastCurve(db, 1.45)
    const t = (db - floor) / Math.max(1e-6, ceil - floor)
    return contrastCurve(clamp(t, 0, 1), 1.6)
  }
  return {
    low: toUnit(low),
    mid: toUnit(mid),
    high: toUnit(high),
  }
}

/**
 * Upsample waveform samples with cubic-ish envelope interpolation so zoomed views
 * look continuous instead of discrete bars.
 */
export function upsampleWaveformSamples(
  samples: WaveformSample[],
  targetCount: number
): WaveformSample[] {
  if (samples.length === 0) return []
  if (targetCount <= samples.length) {
    return applyLocalAmplitudeContrast(
      samples.map((s) => {
        const bands = inferBandsFromSample(s)
        return { ...s, bands, color: multiBandRgbColor(bands) }
      })
    )
  }

  const out: WaveformSample[] = []
  const last = samples.length - 1

  for (let i = 0; i < targetCount; i++) {
    const pos = (i / Math.max(1, targetCount - 1)) * last
    const i0 = Math.floor(pos)
    const i1 = Math.min(last, i0 + 1)
    const t = pos - i0
    // Less smoothing on peaks so valleys stay deep (MiniMeters jagged silhouette)
    const st = t * t * (2.2 - 1.2 * t)
    const a = samples[i0]
    const b = samples[i1]
    const bandsA = inferBandsFromSample(a)
    const bandsB = inferBandsFromSample(b)
    const bands: WaveformBands = {
      low: lerp(bandsA.low, bandsB.low, st),
      mid: lerp(bandsA.mid, bandsB.mid, st),
      high: lerp(bandsA.high, bandsB.high, st),
    }
    const positive = expandPeakValley(lerp(a.positive, b.positive, st), {
      power: 1.65,
      gain: 1.4,
      floor: 0.015,
    })
    const negative = expandPeakValley(lerp(a.negative, b.negative, st), {
      power: 1.65,
      gain: 1.4,
      floor: 0.015,
    })
    const prefer = (a.elementConfidence ?? 0) >= (b.elementConfidence ?? 0) ? a : b
    out.push({
      positive,
      negative,
      color: multiBandRgbColor(bands),
      bands,
      elementType: prefer.elementType,
      elementConfidence: prefer.elementConfidence,
    })
  }

  return applyLocalAmplitudeContrast(out)
}

export function targetDisplaySampleCount(visibleCount: number, zoom: number): number {
  if (zoom <= 1) return Math.max(visibleCount, 8)
  // Dense enough to read as continuous MiniMeters-style columns when zoomed in.
  const densify = zoom >= 4 ? 840 : zoom >= 2 ? 600 : 420
  return Math.max(visibleCount, densify)
}

/**
 * Ableton/MiniMeters model: every display sample carries absolute track time.
 * Densify by interpolating amplitude *and* time so zoom never desyncs from the beatgrid.
 */
export type TimedWaveformSample = WaveformSample & { timeSec: number }

export function buildTimedSamplesInWindow(params: {
  samples: WaveformSample[]
  durationSec: number
  startIndex: number
  endIndex: number
  /** Target display density (Ableton-style continuous tape when zoomed). */
  targetCount?: number
}): TimedWaveformSample[] {
  const { samples, durationSec, startIndex, endIndex } = params
  const n = samples.length
  if (n === 0 || durationSec <= 0) return []
  const i0 = clamp(Math.floor(startIndex), 0, n - 1)
  const i1 = clamp(Math.max(i0 + 1, Math.ceil(endIndex)), i0 + 1, n)
  const slice = samples.slice(i0, i1)
  if (slice.length === 0) return []

  const timedSource: TimedWaveformSample[] = slice.map((sample, offset) => {
    const index = i0 + offset
    return {
      ...sample,
      timeSec: indexToTimeSec(index, n, durationSec),
    }
  })

  const target = Math.max(slice.length, params.targetCount ?? slice.length)
  if (target <= timedSource.length) {
    // Keep existing DSP bands — do not recolor via amplitude heuristics
    return timedSource.map((s) => {
      const bands = s.bands ?? inferBandsFromSample(s)
      return {
        ...s,
        bands,
        color: s.bands ? resolveWaveformColor(s, 'energy') : multiBandRgbColor(bands),
      }
    })
  }

  // Smooth densify: lerp amplitude/bands so zoomed views aren't stair-steps.
  // Peak bias keeps transients without flat plateaus.
  const out: TimedWaveformSample[] = []
  const last = timedSource.length - 1
  for (let i = 0; i < target; i++) {
    const pos = (i / Math.max(1, target - 1)) * last
    const aIdx = Math.floor(pos)
    const bIdx = Math.min(last, aIdx + 1)
    const t = pos - aIdx
    const s = t * t * (3 - 2 * t) // smoothstep
    const a = timedSource[aIdx]
    const b = timedSource[bIdx]
    const bandsA = a.bands ?? inferBandsFromSample(a)
    const bandsB = b.bands ?? inferBandsFromSample(b)
    const bands: WaveformBands = {
      low: bandsA.low + (bandsB.low - bandsA.low) * s,
      mid: bandsA.mid + (bandsB.mid - bandsA.mid) * s,
      high: bandsA.high + (bandsB.high - bandsA.high) * s,
    }
    const posAmp = a.positive + (b.positive - a.positive) * s
    const negAmp = a.negative + (b.negative - a.negative) * s
    const peakBias = Math.max(a.positive, b.positive)
    const prefer = a.positive >= b.positive ? a : b
    const rmsA = a.rms ?? a.positive * 0.7
    const rmsB = b.rms ?? b.positive * 0.7
    out.push({
      positive: posAmp * 0.72 + peakBias * 0.28,
      negative: negAmp * 0.72 + Math.max(a.negative, b.negative) * 0.28,
      rms: rmsA + (rmsB - rmsA) * s,
      color: multiBandRgbColor(bands),
      bands,
      elementType: prefer.elementType,
      elementConfidence: prefer.elementConfidence,
      timeSec: lerp(a.timeSec, b.timeSec, t),
    })
  }
  return out
}

/** Map absolute track time into the current zoom window (0..100). Same fn for grid + waveform. */
export function timeWindowXPercent(timeSec: number, startSec: number, endSec: number): number {
  return timeToXPercent(timeSec, startSec, endSec)
}

export type EnvelopePoint = { x: number; topY: number; bottomY: number; color: string }

export type BandLayerColumn = {
  x: number
  y1: number
  y2: number
  width: number
  color: string
  opacity: number
  band: 'low' | 'mid' | 'high'
}

/**
 * MiniMeters Multi-Band overlay: three band envelopes in fixed vertical lanes.
 * Low = orange body (bottom), Mid = green (center), High = cyan spikes (top).
 */
export function buildMultiBandLayerColumns(
  samples: WaveformSample[],
  options?: { mirror?: boolean; amplitudeScale?: number; xPositions?: number[] }
): BandLayerColumn[] {
  const mirror = options?.mirror ?? true
  const scale = options?.amplitudeScale ?? 48
  const n = samples.length
  if (n === 0) return []
  const width = Math.max(0.1, 100 / n)
  const cols: BandLayerColumn[] = []

  const laneDefs: Array<{
    band: 'low' | 'mid' | 'high'
    yStart: number
    yEnd: number
    color: string
    opacity: number
  }> = [
    { band: 'low', yStart: 52, yEnd: 100, color: MINIMETERS_LAYER_COLORS.low, opacity: 0.88 },
    { band: 'mid', yStart: 32, yEnd: 68, color: MINIMETERS_LAYER_COLORS.mid, opacity: 0.76 },
    { band: 'high', yStart: 0, yEnd: 42, color: MINIMETERS_LAYER_COLORS.high, opacity: 0.86 },
  ]

  for (let i = 0; i < n; i++) {
    const sample = samples[i]
    const centerX =
      options?.xPositions && options.xPositions.length === n
        ? options.xPositions[i]
        : n === 1
          ? 0
          : (i / (n - 1)) * 100
    const x = centerX - width * 0.5
    const amp = expandPeakValley(Math.max(sample.positive, sample.negative), {
      power: 1.7,
      gain: 1.45,
      floor: 0.01,
    })
    const bandShares = softNormalizeEnergies(dominateBands(inferBandsFromSample(sample), 2.2), {
      minShare: 0.08,
      threshold: 0.03,
    })

    for (const lane of laneDefs) {
      const energy = bandShares[lane.band]
      if (energy < 0.04) continue
      const laneMid = (lane.yStart + lane.yEnd) / 2
      const laneCap = ((lane.yEnd - lane.yStart) / 2) * 0.92
      const h =
        expandPeakValley(amp * (0.16 + energy * 1.05), {
          power: 1.45,
          gain: 1.28,
          floor: 0,
        }) * scale
      const half = Math.min(laneCap, h)
      if (half < 0.6) continue
      if (mirror) {
        cols.push({
          x,
          y1: laneMid - half,
          y2: laneMid + half,
          width,
          color: lane.color,
          opacity: lane.opacity,
          band: lane.band,
        })
      } else {
        cols.push({
          x,
          y1: laneMid - half,
          y2: laneMid,
          width,
          color: lane.color,
          opacity: lane.opacity,
          band: lane.band,
        })
      }
    }
  }

  const order = { low: 0, mid: 1, high: 2 }
  cols.sort((a, b) => order[a.band] - order[b.band])
  return cols
}

/** Build mirrored envelope points in viewBox space (0–100) with MiniMeters contrast. */
export function buildEnvelopePoints(
  samples: WaveformSample[],
  options?: { mirror?: boolean; amplitudeScale?: number }
): EnvelopePoint[] {
  const mirror = options?.mirror ?? true
  const scale = options?.amplitudeScale ?? 48
  const n = samples.length
  if (n === 0) return []

  return samples.map((sample, index) => {
    const x = n === 1 ? 0 : (index / (n - 1)) * 100
    const positive = expandPeakValley(clamp(sample.positive || 0, 0, 1), {
      power: 1.75,
      gain: 1.5,
      floor: 0.012,
    })
    const negative = expandPeakValley(clamp(sample.negative || 0, 0, 1), {
      power: 1.75,
      gain: 1.5,
      floor: 0.012,
    })
    const bands = inferBandsFromSample(sample)
    const transientBoost = Math.max(bands.high, bands.mid * 0.55) > 0.5 ? 1.28 : 1
    const color = multiBandRgbColor(bands)
    if (mirror) {
      return {
        x,
        topY: 50 - positive * scale * transientBoost,
        bottomY: 50 + negative * scale * transientBoost,
        color,
      }
    }
    const h = positive * (scale * 2) * transientBoost
    return {
      x,
      topY: 100 - h,
      bottomY: 100,
      color,
    }
  })
}

/** Closed filled path for a continuous MiniMeters-style waveform. */
export function buildFilledEnvelopePath(points: EnvelopePoint[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x.toFixed(3)} ${points[0].topY.toFixed(3)}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const cpx = (prev.x + cur.x) / 2
    d += ` C ${cpx.toFixed(3)} ${prev.topY.toFixed(3)}, ${cpx.toFixed(3)} ${cur.topY.toFixed(3)}, ${cur.x.toFixed(3)} ${cur.topY.toFixed(3)}`
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const cur = points[i]
    if (i === points.length - 1) {
      d += ` L ${cur.x.toFixed(3)} ${cur.bottomY.toFixed(3)}`
    } else {
      const next = points[i + 1]
      const cpx = (next.x + cur.x) / 2
      d += ` C ${cpx.toFixed(3)} ${next.bottomY.toFixed(3)}, ${cpx.toFixed(3)} ${cur.bottomY.toFixed(3)}, ${cur.x.toFixed(3)} ${cur.bottomY.toFixed(3)}`
    }
  }
  d += ' Z'
  return d
}

/**
 * Dense MiniMeters-like vertical columns (thin lines) for zoomed views.
 * Prefer this over a single smooth fill when sample density is high.
 */
export function buildColumnSegments(
  points: EnvelopePoint[],
  options?: { minHeight?: number }
): Array<{ x: number; y1: number; y2: number; color: string; width: number }> {
  if (points.length === 0) return []
  const minHeight = options?.minHeight ?? 0.35
  const width = Math.max(0.1, 100 / points.length)
  return points.map((p) => {
    const top = Math.min(p.topY, p.bottomY)
    const bottom = Math.max(p.topY, p.bottomY)
    const h = Math.max(minHeight, bottom - top)
    const mid = (top + bottom) / 2
    return {
      x: p.x - width * 0.5,
      y1: mid - h / 2,
      y2: mid + h / 2,
      color: p.color,
      width,
    }
  })
}

export function buildGradientStops(
  points: EnvelopePoint[],
  maxStops = 72
): Array<{ offset: number; color: string }> {
  if (points.length === 0) return []
  const step = Math.max(1, Math.floor(points.length / maxStops))
  const stops: Array<{ offset: number; color: string }> = []
  for (let i = 0; i < points.length; i += step) {
    stops.push({
      offset: points[i].x,
      color: points[i].color,
    })
  }
  const last = points[points.length - 1]
  if (stops[stops.length - 1]?.offset !== last.x) {
    stops.push({ offset: last.x, color: last.color })
  }
  return stops
}
