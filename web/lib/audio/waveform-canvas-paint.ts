/**
 * Waveform tape paint — CDJ / MiniMeters style.
 *
 * Dual envelope: RMS body + Peak/flux hairlines (never bake into one blend).
 * Drums/Elements: kick · snare · clap · hat lanes (or overlay).
 * Overview vs zoom budgets drive density, peak spikes, and onset ticks.
 */
import {
  CHANNEL_LANE_RGB,
  DRUM_SPECTRAL_COLORS,
  SERGIK_ELEMENT_COLORS,
  mixAdditiveRgb,
  boostRgbSaturation,
  contrastCurve,
  sampleElementBands,
  softNormalizeEnergies,
  timeToXPercent,
  type ElementBandEnergies,
  type WaveformIntelligenceProfile,
  usesSolidLaneFill,
  type WaveformLayerLayout,
  type TimedWaveformSample,
  type WaveformColorMode,
  usesSeparatedLaneLayout,
  usesOverlayMergedLayout,
} from '@/lib/audio/waveform-view'
import type { WaveformDrawBudget } from '@/lib/audio/waveform-draw-budget'
import {
  dualEnvelopeAmps,
  interpolateDualEnvelope,
} from '@/lib/audio/waveform-dsp-envelope'
import {
  classifyBeatIndex,
  forEachBeatInWindow,
} from '@/lib/audio/beat-grid'

function parseRgb(color: string): [number, number, number] {
  const m = color.match(/\d+/g)
  if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])]
  return [...CHANNEL_LANE_RGB]
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`
}

type LaneLayerSpec<K extends string> = {
  key: K
  rgb: readonly [number, number, number]
  /** Lane top (0 = canvas top, 1 = canvas bottom). */
  yStart: number
  /** Lane bottom. */
  yEnd: number
  anchor: 'bottom' | 'top' | 'center'
  opacityPast: number
  opacityFuture: number
}

/**
 * Multi-lane tape paint: mixed RGB body + per-lane transients in fixed vertical bands.
 * Each instrument owns a height zone so co-active hits stay visible (no winner-takes-all stack).
 */
function paintLaneStack<K extends string>(
  ctx: CanvasRenderingContext2D,
  p: {
    x: number
    fw: number
    height: number
    midY: number
    peakLin: number
    totalAmp: number
    past: boolean
    layers: LaneLayerSpec<K>[]
    energies: Record<K, number>
  }
): void {
  const shares = softNormalizeEnergies(p.energies, { minShare: 0.08, threshold: 0.03 })
  const peakScale = overviewAmp(p.peakLin)

  const [mr, mg, mb] = mixAdditiveRgb(p.layers, shares)
  const bodyHalf = Math.max(0.6, p.totalAmp * 0.32 * peakScale)
  if (bodyHalf >= 0.55) {
    ctx.fillStyle = rgba(mr, mg, mb, p.past ? 0.34 : 0.14)
    ctx.fillRect(p.x, p.midY - bodyHalf, p.fw, bodyHalf * 2)
  }

  for (const layer of p.layers) {
    const energy = shares[layer.key] ?? 0
    if (energy < 0.04) continue

    const laneTop = layer.yStart * p.height
    const laneBot = layer.yEnd * p.height
    const laneH = Math.max(2, laneBot - laneTop)
    const laneMid = (laneTop + laneBot) / 2
    const laneCap = laneH * 0.46
    const half = Math.min(laneCap, laneCap * (0.18 + energy * 0.92) * (0.55 + peakScale * 0.65))
    if (half < 0.65) continue

    const opacityBase = p.past ? layer.opacityPast : layer.opacityFuture
    const [r, g, b] = layer.rgb
    ctx.fillStyle = rgba(r, g, b, Math.min(0.96, opacityBase * 0.82))
    ctx.fillRect(p.x, laneMid - half, p.fw, half * 2)

    if (energy > 0.38 && half >= 1.2) {
      const accentHalf = Math.min(laneCap, half * 1.1)
      let accentY = laneMid - accentHalf
      if (layer.anchor === 'bottom') accentY = laneBot - accentHalf * 2
      else if (layer.anchor === 'top') accentY = laneTop
      ctx.fillStyle = rgba(r, g, b, Math.min(1, opacityBase * (p.past ? 1.05 : 0.72)))
      ctx.fillRect(p.x, accentY, p.fw, accentHalf * 2)
    }
  }
}

type OverlayLayerSpec<K extends string> = {
  key: K
  rgb: readonly [number, number, number]
  weight: number
  opacityPast: number
  opacityFuture: number
  /** 0 = body/back (kick, bass); 1 = air/forward (hats, highs). */
  forwardBias?: number
}

function overlayLayerEnergy(share: number, forwardBias = 0.5): number {
  const contrasted = contrastCurve(share, 1.72)
  return contrasted * (0.82 + forwardBias * 0.28)
}

/**
 * Classic merged silhouette + contrast-boosted color overlays.
 * Softer/brighter frequencies paint last and sit forward (hats, claps, vocals, air).
 */
function paintOverlayMergedStack<K extends string>(
  ctx: CanvasRenderingContext2D,
  p: {
    x: number
    fw: number
    midY: number
    totalAmp: number
    past: boolean
    layers: OverlayLayerSpec<K>[]
    energies: Record<K, number>
    classicRgb?: readonly [number, number, number]
  }
): void {
  const shares = softNormalizeEnergies(p.energies, { minShare: 0.08, threshold: 0.028 })
  const half = p.totalAmp
  let [br, bg, bb] = p.classicRgb ?? mixAdditiveRgb(p.layers, shares)
  ;[br, bg, bb] = boostRgbSaturation(br, bg, bb, 1.55)

  // Keep silhouette on black — avoid washed/white body fill
  ctx.fillStyle = rgba(br * 0.82, bg * 0.82, bb * 0.82, p.past ? 0.58 : 0.24)
  ctx.fillRect(p.x, p.midY - half, p.fw, half * 2)

  const sorted = [...p.layers].sort(
    (a, b) => (a.forwardBias ?? 0.5) - (b.forwardBias ?? 0.5),
  )
  for (const layer of sorted) {
    const share = shares[layer.key] ?? 0
    if (share < 0.035) continue

    const forward = layer.forwardBias ?? 0.5
    const energy = overlayLayerEnergy(share, forward)
    const layerHalf = half * layer.weight * (0.12 + energy * (0.82 + forward * 0.2))
    if (layerHalf < 0.5) continue

    const opacityBase = p.past ? layer.opacityPast : layer.opacityFuture
    const alpha = Math.min(0.78, opacityBase * (0.3 + energy * 0.38 + forward * 0.28))
    let [r, g, b] = [...layer.rgb] as [number, number, number]
    ;[r, g, b] = boostRgbSaturation(r, g, b, 1.85 + forward * 0.45)
    const lift = 1 + forward * 0.12
    r = Math.min(255, r * lift)
    g = Math.min(255, g * lift)
    b = Math.min(255, b * lift)

    ctx.fillStyle = rgba(r, g, b, alpha)
    ctx.fillRect(p.x, p.midY - layerHalf, p.fw, layerHalf * 2)

    if (forward >= 0.62 && energy > 0.22) {
      const accentHalf = Math.max(0.45, layerHalf * (0.22 + forward * 0.16))
      const accentY = p.midY - half
      const accentAlpha = Math.min(0.72, alpha * (0.55 + forward * 0.25))
      ctx.fillStyle = rgba(r, g, b, accentAlpha)
      ctx.fillRect(p.x, accentY, p.fw, accentHalf * 2)
    }
  }
}

/**
 * Overview height mapping — dig valleys so phrase structure is readable.
 * (power > 1 keeps quiet thin; peaks stay tall.)
 */
function overviewAmp(linear: number): number {
  const v = Math.max(0, Math.min(1, linear))
  if (v <= 0) return 0
  return Math.pow(v, 1.65)
}

export type PaintWaveformFrameParams = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  samples: TimedWaveformSample[]
  startSec: number
  endSec: number
  currentTimeSec: number
  playheadXPercent: number
  mirror: boolean
  colorMode: WaveformColorMode
  /** Separated vertical lanes vs classic single merged envelope (Drums/Elements). */
  layerLayout?: WaveformLayerLayout
  intelligenceProfile?: WaveformIntelligenceProfile | null
  budget: WaveformDrawBudget
  showGrid: boolean
  beatDurationSec: number | null
  beatGridOffsetSec: number
  beatsPerBar: number
  beatGridEmphasis: boolean
  /**
   * When false, skip the playhead stroke (drawn on a transparent overlay canvas).
   * Default true for single-canvas callers.
   */
  drawPlayheadStroke?: boolean
}

function ensureCanvasSize(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number
): void {
  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w
    ctx.canvas.height = h
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** Transparent overlay: future dim + playhead (60fps cheap path). */
export function paintPlayheadOverlay(p: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  playheadXPercent: number
  /** Darken unplayed region so base can stay fully bright (no bucketed redraws). */
  dimFuture?: boolean
}): void {
  const { ctx, width, height, dpr } = p
  ensureCanvasSize(ctx, width, height, dpr)
  ctx.clearRect(0, 0, width, height)
  if (p.playheadXPercent < 0) return
  const playX = Math.max(0, Math.min(width, (p.playheadXPercent / 100) * width))
  if (p.dimFuture !== false && playX < width - 0.5) {
    // Match prior future alpha (~0.36 vs ~0.92) ≈ 60% relative brightness
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(playX, 0, width - playX, height)
  }
  drawPlayhead(ctx, playX, height, width)
}

export function paintWaveformFrame(p: PaintWaveformFrameParams): void {
  const { ctx, width, height, dpr } = p
  ensureCanvasSize(ctx, width, height, dpr)

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const span = p.endSec - p.startSec
  if (span <= 0) return

  const toX = (t: number) => (timeToXPercent(t, p.startSec, p.endSec) / 100) * width
  const midY = height / 2
  const playX = Math.max(0, Math.min(width, (p.playheadXPercent / 100) * width))
  const withPlayhead = p.drawPlayheadStroke !== false

  if (p.showGrid && p.beatDurationSec && p.beatDurationSec > 0) {
    paintBeatGrid(ctx, {
      startSec: p.startSec,
      endSec: p.endSec,
      beatDurationSec: p.beatDurationSec,
      beatGridOffsetSec: p.beatGridOffsetSec,
      beatsPerBar: p.beatsPerBar,
      beatGridEmphasis: p.beatGridEmphasis,
      halfBeats: p.budget.halfBeats,
      sixteenths: p.budget.sixteenths,
      beatLines: p.budget.beatLines,
      toX,
      height,
    })
    paintDnaPocketAccents(ctx, {
      startSec: p.startSec,
      endSec: p.endSec,
      beatDurationSec: p.beatDurationSec,
      beatGridOffsetSec: p.beatGridOffsetSec,
      beatsPerBar: p.beatsPerBar,
      profile: p.intelligenceProfile,
      toX,
      height,
    })
  }

  if (!p.samples.length) {
    if (withPlayhead) drawPlayhead(ctx, playX, height, width)
    return
  }

  if (usesSeparatedLaneLayout(p.colorMode, p.layerLayout ?? 'merged')) {
    if (p.colorMode === 'elements') {
      paintElementsMultiBand(ctx, {
        samples: p.samples,
        toX: p.budget.overview ? null : toX,
        midY,
        height,
        playX,
        width,
        interpolate: !p.budget.overview,
        intelligenceProfile: p.intelligenceProfile,
        stackMode: 'lanes',
        peakSpikes: p.budget.peakSpikes,
      })
    } else {
      paintDrumsMultiBand(ctx, {
        samples: p.samples,
        toX: p.budget.overview ? null : toX,
        midY,
        height,
        playX,
        width,
        interpolate: !p.budget.overview,
        intelligenceProfile: p.intelligenceProfile,
        stackMode: 'lanes',
        peakSpikes: p.budget.peakSpikes,
      })
    }
  } else if (usesOverlayMergedLayout(p.colorMode, p.layerLayout ?? 'merged')) {
    if (p.colorMode === 'elements') {
      paintElementsMultiBand(ctx, {
        samples: p.samples,
        toX: p.budget.overview ? null : toX,
        midY,
        height,
        playX,
        width,
        interpolate: !p.budget.overview,
        intelligenceProfile: p.intelligenceProfile,
        stackMode: 'overlay',
        peakSpikes: p.budget.peakSpikes,
      })
    } else {
      paintDrumsMultiBand(ctx, {
        samples: p.samples,
        toX: p.budget.overview ? null : toX,
        midY,
        height,
        playX,
        width,
        interpolate: !p.budget.overview,
        intelligenceProfile: p.intelligenceProfile,
        stackMode: 'overlay',
        peakSpikes: p.budget.peakSpikes,
      })
    }
  } else if (p.budget.overview) {
    paintSoundCloudOverview(ctx, {
      samples: p.samples,
      midY,
      height,
      playX,
      width,
      colorMode: p.colorMode,
      peakSpikes: p.budget.peakSpikes,
    })
  } else {
    // Same continuous 1px silhouette as overview — interpolated so zoom stays smooth
    paintContinuousDetail(ctx, {
      samples: p.samples,
      toX,
      midY,
      height,
      playX,
      width,
      colorMode: p.colorMode,
      peakSpikes: p.budget.peakSpikes,
    })
  }

  if (p.budget.onsetTicks) {
    paintOnsetTransientTicks(ctx, {
      startSec: p.startSec,
      endSec: p.endSec,
      height,
      playX,
      toX,
      profile: p.intelligenceProfile,
      zoomed: !p.budget.overview,
    })
  }

  if (withPlayhead) drawPlayhead(ctx, playX, height, width)
}

function paintBeatGrid(
  ctx: CanvasRenderingContext2D,
  p: {
    startSec: number
    endSec: number
    beatDurationSec: number
    beatGridOffsetSec: number
    beatsPerBar: number
    beatGridEmphasis: boolean
    halfBeats: boolean
    sixteenths: boolean
    beatLines: boolean
    toX: (t: number) => number
    height: number
  }
): void {
  const beat = p.beatDurationSec
  const half = beat / 2
  const sixteenth = beat / 4
  const { toX, height } = p
  const offset = p.beatGridOffsetSec
  const bar = Math.max(1, Math.floor(p.beatsPerBar) || 4)
  const barSec = beat * bar
  const phraseSec = barSec * 8

  const strokeAt = (t: number, stroke: string, lw: number) => {
    // Device-pixel snap keeps grid from looking soft / drifted vs playhead
    const x = Math.round(toX(t)) + 0.5
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  if (p.sixteenths && p.beatGridEmphasis) {
    const n0 = Math.ceil((p.startSec - offset) / sixteenth - 1e-9)
    for (let n = n0; ; n++) {
      const t = offset + n * sixteenth
      if (t > p.endSec + 1e-9) break
      if (n % 2 === 0) continue // half / full beats drawn below
      if (t < p.startSec - 1e-9) continue
      strokeAt(t, 'rgba(255,255,255,0.035)', 1)
    }
  }

  if (p.halfBeats && p.beatGridEmphasis) {
    const n0 = Math.ceil((p.startSec - offset) / half - 1e-9)
    for (let n = n0; ; n++) {
      const t = offset + n * half
      if (t > p.endSec + 1e-9) break
      if (n % 2 === 0) continue // full beats drawn below
      if (t < p.startSec - 1e-9) continue
      strokeAt(t, 'rgba(255,255,255,0.05)', 1)
    }
  }

  // Dual-clock CDJ paint:
  // - Beat / bar lines follow beat-grid phase (offset + k·beat)
  // - Phrase / section markers stay on the file-start lattice (doctrine)
  forEachBeatInWindow(p.startSec, p.endSec, offset, beat, (t, beatIndex) => {
    const kind = classifyBeatIndex(beatIndex, p.beatsPerBar)
    if (kind === 'phrase' || kind === 'section') {
      // Lattice markers drawn below; keep a bar-weight line on phase beats.
      strokeAt(t, 'rgba(255,255,255,0.12)', 1)
      return
    }
    if (kind === 'beat') {
      if (!p.beatLines) return
      if (!p.beatGridEmphasis) return
      strokeAt(t, 'rgba(255,255,255,0.07)', 1)
      return
    }
    if (kind === 'bar') {
      strokeAt(t, 'rgba(255,255,255,0.12)', 1)
    }
  })

  // File-start phrase / section lattice (independent of within-beat phase).
  const phrase0 = Math.ceil(p.startSec / phraseSec - 1e-9)
  for (let n = Math.max(0, phrase0); ; n++) {
    const t = n * phraseSec
    if (t > p.endSec + 1e-9) break
    if (t < p.startSec - 1e-9) continue
    const isSection = n % 2 === 0 // 16 bars = 2 × 8-bar phrases
    if (isSection) {
      strokeAt(
        t,
        p.beatGridEmphasis ? 'rgba(255, 180, 40, 0.48)' : 'rgba(255,255,255,0.2)',
        1.5,
      )
    } else {
      strokeAt(
        t,
        p.beatGridEmphasis ? 'rgba(255, 210, 80, 0.34)' : 'rgba(255,255,255,0.16)',
        1.25,
      )
    }
  }
}

/** Draw DNA kick/snare accents on the beat grid (phrase-aware). */
function paintDnaPocketAccents(
  ctx: CanvasRenderingContext2D,
  p: {
    startSec: number
    endSec: number
    beatDurationSec: number
    beatGridOffsetSec: number
    beatsPerBar: number
    profile?: WaveformIntelligenceProfile | null
    toX: (t: number) => number
    height: number
  }
): void {
  const profile = p.profile
  if (!profile) return
  const kicks = profile.kickPhraseSteps?.length
    ? profile.kickPhraseSteps
    : profile.kickSteps || []
  const snares = profile.snarePhraseSteps?.length
    ? profile.snarePhraseSteps
    : profile.snareSteps || []
  const claps = profile.clapPhraseSteps || []
  const hats = profile.hatPhraseSteps?.length
    ? profile.hatPhraseSteps
    : profile.hatSteps || []
  if (!kicks.length && !snares.length && !claps.length && !hats.length) return

  const beat = p.beatDurationSec
  const barSec = beat * Math.max(1, p.beatsPerBar)
  const stepsPerBar = profile.stepsPerBar || 16
  const phraseBars = profile.phraseBars || 8
  const stepSec = barSec / stepsPerBar
  const phraseSec = stepSec * stepsPerBar * phraseBars
  // DNA phrase steps are on the file-start lattice (dual-clock doctrine).
  const latticeOrigin = 0

  const mark = (t: number, color: string, hFrac: number) => {
    if (t < p.startSec - 1e-6 || t > p.endSec + 1e-6) return
    const x = Math.round(p.toX(t)) + 0.5
    const h = p.height * hFrac
    const y0 = (p.height - h) / 2
    ctx.fillStyle = color
    ctx.fillRect(x - 0.75, y0, 1.5, h)
  }

  const phrase0 = Math.floor((p.startSec - latticeOrigin) / phraseSec) - 1
  const phrase1 = Math.ceil((p.endSec - latticeOrigin) / phraseSec) + 1
  for (let ph = phrase0; ph <= phrase1; ph++) {
    const base = latticeOrigin + ph * phraseSec
    for (const s of kicks) mark(base + s * stepSec, 'rgba(80, 220, 160, 0.55)', 0.55)
    for (const s of snares) mark(base + s * stepSec, 'rgba(255, 190, 70, 0.45)', 0.4)
    for (const s of claps) mark(base + s * stepSec, 'rgba(245, 248, 255, 0.4)', 0.36)
    for (const s of hats) mark(base + s * stepSec, 'rgba(70, 220, 255, 0.38)', 0.28)
  }
}

type DrumBandCol = {
  body: number
  peak: number
  flux: number
  kick: number
  snare: number
  clap: number
  hat: number
}

/** Map L/M/H (+ element labels) → kick / snare / clap / hat for layered drums mode. */
function sampleDrumBands(s: TimedWaveformSample): {
  kick: number
  snare: number
  clap: number
  hat: number
} {
  const bands = s.bands
  const peak = Math.max(s.positive, s.negative)
  let kick = bands?.low ?? peak * 0.55
  let snare = (bands?.mid ?? peak * 0.4) * 0.7
  let clap = (bands?.mid ?? peak * 0.35) * 0.35 + (bands?.high ?? peak * 0.25) * 0.4
  let hat = bands?.high ?? peak * 0.3
  const conf = s.elementConfidence ?? 0
  if (s.elementType && conf > 0.28) {
    const boost = 0.35 + conf * 0.65
    if (s.elementType === 'kick') kick = Math.max(kick, boost)
    else if (s.elementType === 'snare') snare = Math.max(snare, boost)
    else if (s.elementType === 'clap') clap = Math.max(clap, boost)
    else if (s.elementType === 'hihat') hat = Math.max(hat, boost)
  }
  const flux = typeof s.flux === 'number' ? s.flux : 0
  if (flux > 0.35) {
    hat = Math.max(hat, hat + flux * 0.35)
    clap = Math.max(clap, clap + flux * 0.18)
  }
  return { kick, snare, clap, hat }
}

/** CDJ onset ticks — absolute kick/snare/clap/hat times on the tape. */
function paintOnsetTransientTicks(
  ctx: CanvasRenderingContext2D,
  p: {
    startSec: number
    endSec: number
    height: number
    playX: number
    toX: (t: number) => number
    profile?: WaveformIntelligenceProfile | null
    zoomed: boolean
  },
): void {
  const profile = p.profile
  if (!profile) return
  const kicks = profile.kickOnsetSec || []
  const snares = profile.snareClapOnsetSec || []
  if (!kicks.length && !snares.length) return

  const mark = (t: number, rgbaBase: string, hFrac: number, yBias: number) => {
    if (t < p.startSec - 1e-6 || t > p.endSec + 1e-6) return
    const x = Math.round(p.toX(t)) + 0.5
    const past = x <= p.playX
    const h = p.height * hFrac * (p.zoomed ? 1 : 0.72)
    const y0 = p.height * yBias - h / 2
    const alpha = past ? (p.zoomed ? 0.85 : 0.55) : p.zoomed ? 0.4 : 0.22
    ctx.fillStyle = rgbaBase.replace(/[\d.]+\)$/, `${alpha})`)
    ctx.fillRect(x - (p.zoomed ? 0.75 : 0.5), y0, p.zoomed ? 1.5 : 1, h)
  }

  for (const t of kicks) {
    mark(t, 'rgba(255, 72, 8, 0.85)', p.zoomed ? 0.42 : 0.28, 0.72)
  }
  for (let i = 0; i < snares.length; i++) {
    const t = snares[i]!
    if (i % 2 === 0) mark(t, 'rgba(255, 140, 48, 0.8)', p.zoomed ? 0.34 : 0.22, 0.5)
    else mark(t, 'rgba(255, 230, 90, 0.75)', p.zoomed ? 0.3 : 0.2, 0.38)
  }
}

function paintPeakFluxHairline(
  ctx: CanvasRenderingContext2D,
  p: {
    x: number
    fw: number
    midY: number
    bodyAmp: number
    peakAmp: number
    flux: number
    past: boolean
  },
): void {
  // Only true attacks — avoid washing the silhouette white/grey
  const crest = Math.max(0, p.peakAmp - p.bodyAmp * 0.92)
  if (crest < 1.4 && p.flux < 0.45) return
  const spike = Math.max(crest * 0.55, p.flux * p.peakAmp * 0.28)
  if (spike < 1.1) return
  const [r, g, b] = DRUM_SPECTRAL_COLORS.flux
  const alpha = Math.min(
    0.55,
    (p.past ? 0.42 : 0.18) * (0.35 + p.flux * 0.45),
  )
  ctx.fillStyle = rgba(r, g, b, alpha)
  const half = Math.min(p.peakAmp, p.bodyAmp + spike)
  ctx.fillRect(p.x, p.midY - half, 1, half * 2)
}

type ElementBandCol = ElementBandEnergies & { body: number; peak: number; flux: number }

function sampleElementBandsFromTimed(
  s: TimedWaveformSample,
  profile?: WaveformIntelligenceProfile | null,
): ElementBandEnergies {
  return sampleElementBands(s, profile)
}

/**
 * SERGIK Elements mode — kicks, snares, claps, hats, bass, synths, vocals.
 */
function paintElementsMultiBand(
  ctx: CanvasRenderingContext2D,
  p: {
    samples: TimedWaveformSample[]
    toX: ((t: number) => number) | null
    midY: number
    height: number
    playX: number
    width: number
    interpolate: boolean
    intelligenceProfile?: WaveformIntelligenceProfile | null
    stackMode?: 'lanes' | 'overlay'
    peakSpikes?: boolean
  },
): void {
  const { samples, midY, height, playX, width, intelligenceProfile } = p
  const stackMode = p.stackMode ?? 'lanes'
  if (!samples.length) return

  const cols = Math.max(64, Math.floor(width))
  const ampScale = height * 0.34
  const peaks = new Array<ElementBandCol>(cols)
  for (let c = 0; c < cols; c++) {
    peaks[c] = {
      body: 0,
      peak: 0,
      flux: 0,
      drums: 0,
      kicks: 0,
      snares: 0,
      claps: 0,
      hats: 0,
      percussion: 0,
      bass: 0,
      synths: 0,
      vocals: 0,
    }
  }

  const mergeElementCol = (
    col: ElementBandCol,
    e: ElementBandEnergies,
    dual: ReturnType<typeof dualEnvelopeAmps>,
  ) => {
    if (dual.peak > col.peak) col.peak = dual.peak
    if (dual.body > col.body) col.body = dual.body
    if (dual.flux > col.flux) col.flux = dual.flux
    if (e.drums > col.drums) col.drums = e.drums
    if (e.kicks > col.kicks) col.kicks = e.kicks
    if (e.snares > col.snares) col.snares = e.snares
    if (e.claps > col.claps) col.claps = e.claps
    if (e.hats > col.hats) col.hats = e.hats
    if (e.percussion > col.percussion) col.percussion = e.percussion
    if (e.bass > col.bass) col.bass = e.bass
    if (e.synths > col.synths) col.synths = e.synths
    if (e.vocals > col.vocals) col.vocals = e.vocals
  }

  if (p.interpolate && p.toX && samples.length >= 2) {
    const n = samples.length
    let j = 0
    for (let c = 0; c < cols; c++) {
      const xCenter = (c + 0.5) * (width / cols)
      while (j < n - 2 && p.toX!(samples[j + 1].timeSec) < xCenter) j++
      const a = samples[j]
      const b = samples[Math.min(n - 1, j + 1)]
      const xa = p.toX!(a.timeSec)
      const xb = p.toX!(b.timeSec)
      let u = (xCenter - xa) / Math.max(1e-6, xb - xa)
      u = Math.max(0, Math.min(1, u))
      const s = u * u * (3 - 2 * u)
      const dual = interpolateDualEnvelope(dualEnvelopeAmps(a), dualEnvelopeAmps(b), u)
      const ea = sampleElementBandsFromTimed(a, intelligenceProfile)
      const eb = sampleElementBandsFromTimed(b, intelligenceProfile)
      peaks[c] = {
        body: dual.body,
        peak: dual.peak,
        flux: dual.flux,
        drums: ea.drums + (eb.drums - ea.drums) * s,
        kicks: Math.max(ea.kicks, eb.kicks),
        snares: Math.max(ea.snares, eb.snares),
        claps: Math.max(ea.claps, eb.claps),
        hats: Math.max(ea.hats, eb.hats),
        percussion: ea.percussion + (eb.percussion - ea.percussion) * s,
        bass: ea.bass + (eb.bass - ea.bass) * s,
        synths: ea.synths + (eb.synths - ea.synths) * s,
        vocals: ea.vocals + (eb.vocals - ea.vocals) * s,
      }
    }
  } else {
    const t0 = samples[0].timeSec
    const t1 = samples[samples.length - 1].timeSec
    const span = Math.max(1e-6, t1 - t0)
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      const c = Math.min(cols - 1, Math.max(0, Math.floor(((s.timeSec - t0) / span) * cols)))
      mergeElementCol(peaks[c], sampleElementBandsFromTimed(s, intelligenceProfile), dualEnvelopeAmps(s))
    }
  }

  const sorted = peaks.map((c) => c.body).filter((v) => v > 0.001).sort((a, b) => a - b)
  const ref =
    sorted.length > 0
      ? Math.max(0.08, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92))] || 1)
      : 1

  type ElemKey = keyof ElementBandEnergies
  const laneLayers: Array<LaneLayerSpec<ElemKey>> = [
    { key: 'bass', rgb: SERGIK_ELEMENT_COLORS.bass, yStart: 0.62, yEnd: 1, anchor: 'bottom', opacityPast: 0.78, opacityFuture: 0.3 },
    { key: 'kicks', rgb: SERGIK_ELEMENT_COLORS.kicks, yStart: 0.52, yEnd: 0.88, anchor: 'bottom', opacityPast: 0.9, opacityFuture: 0.36 },
    { key: 'snares', rgb: SERGIK_ELEMENT_COLORS.snares, yStart: 0.36, yEnd: 0.7, anchor: 'center', opacityPast: 0.88, opacityFuture: 0.34 },
    { key: 'claps', rgb: SERGIK_ELEMENT_COLORS.claps, yStart: 0.28, yEnd: 0.58, anchor: 'center', opacityPast: 0.86, opacityFuture: 0.34 },
    { key: 'hats', rgb: SERGIK_ELEMENT_COLORS.hats, yStart: 0, yEnd: 0.38, anchor: 'top', opacityPast: 0.9, opacityFuture: 0.4 },
    { key: 'synths', rgb: SERGIK_ELEMENT_COLORS.synths, yStart: 0.22, yEnd: 0.55, anchor: 'center', opacityPast: 0.55, opacityFuture: 0.22 },
    { key: 'vocals', rgb: SERGIK_ELEMENT_COLORS.vocals, yStart: 0.18, yEnd: 0.5, anchor: 'center', opacityPast: 0.5, opacityFuture: 0.2 },
  ]
  const overlayLayers: Array<OverlayLayerSpec<ElemKey>> = [
    { key: 'bass', rgb: SERGIK_ELEMENT_COLORS.bass, weight: 0.9, opacityPast: 0.7, opacityFuture: 0.28, forwardBias: 0.05 },
    { key: 'kicks', rgb: SERGIK_ELEMENT_COLORS.kicks, weight: 1, opacityPast: 0.92, opacityFuture: 0.38, forwardBias: 0.22 },
    { key: 'snares', rgb: SERGIK_ELEMENT_COLORS.snares, weight: 0.95, opacityPast: 0.9, opacityFuture: 0.36, forwardBias: 0.55 },
    { key: 'claps', rgb: SERGIK_ELEMENT_COLORS.claps, weight: 0.9, opacityPast: 0.88, opacityFuture: 0.36, forwardBias: 0.72 },
    { key: 'hats', rgb: SERGIK_ELEMENT_COLORS.hats, weight: 0.82, opacityPast: 1, opacityFuture: 0.48, forwardBias: 1 },
    { key: 'synths', rgb: SERGIK_ELEMENT_COLORS.synths, weight: 0.55, opacityPast: 0.55, opacityFuture: 0.22, forwardBias: 0.6 },
    { key: 'vocals', rgb: SERGIK_ELEMENT_COLORS.vocals, weight: 0.5, opacityPast: 0.5, opacityFuture: 0.2, forwardBias: 0.65 },
  ]

  const colW = width / cols
  for (let c = 0; c < cols; c++) {
    const col = peaks[c]
    const bodyLin = Math.min(1, col.body / ref)
    const peakLin = Math.min(1, col.peak / ref)
    const x = c * colW
    const past = x + colW * 0.5 <= playX
    const fw = Math.max(1, Math.ceil(colW))

    if (bodyLin <= 0.012 && peakLin <= 0.02) {
      const [r, g, b] = SERGIK_ELEMENT_COLORS.kicks
      ctx.fillStyle = rgba(r, g, b, past ? 0.18 : 0.08)
      ctx.fillRect(x, midY - 0.5, fw, 1)
      continue
    }

    const totalAmp = Math.max(1.25, overviewAmp(bodyLin) * ampScale)
    const peakAmp = Math.max(totalAmp, overviewAmp(peakLin) * ampScale)
    const energies: ElementBandEnergies = {
      drums: col.drums,
      kicks: col.kicks,
      snares: col.snares,
      claps: col.claps,
      hats: col.hats,
      percussion: col.percussion,
      bass: col.bass,
      synths: col.synths,
      vocals: col.vocals,
    }
    if (stackMode === 'overlay') {
      paintOverlayMergedStack(ctx, {
        x,
        fw,
        midY,
        totalAmp,
        past,
        layers: overlayLayers,
        energies,
      })
    } else {
      paintLaneStack(ctx, {
        x,
        fw,
        height,
        midY,
        peakLin,
        totalAmp,
        past,
        layers: laneLayers,
        energies,
      })
    }
    if (p.peakSpikes !== false) {
      paintPeakFluxHairline(ctx, {
        x,
        fw,
        midY,
        bodyAmp: totalAmp,
        peakAmp,
        flux: col.flux,
        past,
      })
    }
  }
}

/**
 * Layered drums mode: kick / snare / clap / hat — CDJ dual envelope + flux accents.
 */
function paintDrumsMultiBand(
  ctx: CanvasRenderingContext2D,
  p: {
    samples: TimedWaveformSample[]
    toX: ((t: number) => number) | null
    midY: number
    height: number
    playX: number
    width: number
    interpolate: boolean
    intelligenceProfile?: WaveformIntelligenceProfile | null
    stackMode?: 'lanes' | 'overlay'
    peakSpikes?: boolean
  },
): void {
  const { samples, midY, height, playX, width } = p
  const stackMode = p.stackMode ?? 'lanes'
  if (!samples.length) return

  const bias = p.intelligenceProfile?.spectralBias
  const kickBias = 1 + (bias?.kicks ?? 0) * 1.4
  const hatBias = 1 + (bias?.hats ?? 0) * 1.3
  const snareBias = 1 + (bias?.percussion ?? 0) * 1.15
  const clapBias = 1 + (bias?.percussion ?? 0) * 0.95

  const cols = Math.max(64, Math.floor(width))
  const ampScale = height * 0.34
  const peaks = new Array<DrumBandCol>(cols)
  for (let c = 0; c < cols; c++) {
    peaks[c] = { body: 0, peak: 0, flux: 0, kick: 0, snare: 0, clap: 0, hat: 0 }
  }

  if (p.interpolate && p.toX && samples.length >= 2) {
    const n = samples.length
    let j = 0
    for (let c = 0; c < cols; c++) {
      const xCenter = (c + 0.5) * (width / cols)
      while (j < n - 2 && p.toX(samples[j + 1].timeSec) < xCenter) j++
      const a = samples[j]
      const b = samples[Math.min(n - 1, j + 1)]
      const xa = p.toX(a.timeSec)
      const xb = p.toX(b.timeSec)
      let u = (xCenter - xa) / Math.max(1e-6, xb - xa)
      u = Math.max(0, Math.min(1, u))
      const dual = interpolateDualEnvelope(dualEnvelopeAmps(a), dualEnvelopeAmps(b), u)
      const da = sampleDrumBands(a)
      const db = sampleDrumBands(b)
      peaks[c] = {
        body: dual.body,
        peak: dual.peak,
        flux: dual.flux,
        kick: Math.max(da.kick, db.kick) * kickBias,
        snare: Math.max(da.snare, db.snare) * snareBias,
        clap: Math.max(da.clap, db.clap) * clapBias,
        hat: Math.max(da.hat, db.hat) * hatBias,
      }
    }
  } else {
    const t0 = samples[0].timeSec
    const t1 = samples[samples.length - 1].timeSec
    const span = Math.max(1e-6, t1 - t0)
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      const c = Math.min(cols - 1, Math.max(0, Math.floor(((s.timeSec - t0) / span) * cols)))
      const dual = dualEnvelopeAmps(s)
      const d = sampleDrumBands(s)
      const col = peaks[c]
      if (dual.peak > col.peak) col.peak = dual.peak
      if (dual.body > col.body) col.body = dual.body
      if (dual.flux > col.flux) col.flux = dual.flux
      const k = d.kick * kickBias
      const sn = d.snare * snareBias
      const cl = d.clap * clapBias
      const h = d.hat * hatBias
      if (k > col.kick) col.kick = k
      if (sn > col.snare) col.snare = sn
      if (cl > col.clap) col.clap = cl
      if (h > col.hat) col.hat = h
    }
  }

  const sorted = peaks.map((c) => c.body).filter((v) => v > 0.001).sort((a, b) => a - b)
  const ref =
    sorted.length > 0
      ? Math.max(0.08, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92))] || 1)
      : 1

  type DrumKey = 'kick' | 'snare' | 'clap' | 'hat'
  const laneLayers: Array<LaneLayerSpec<DrumKey>> = [
    { key: 'kick', rgb: DRUM_SPECTRAL_COLORS.kick, yStart: 0.55, yEnd: 1, anchor: 'bottom', opacityPast: 0.9, opacityFuture: 0.38 },
    { key: 'snare', rgb: DRUM_SPECTRAL_COLORS.snare, yStart: 0.36, yEnd: 0.7, anchor: 'center', opacityPast: 0.88, opacityFuture: 0.36 },
    { key: 'clap', rgb: DRUM_SPECTRAL_COLORS.clap, yStart: 0.26, yEnd: 0.56, anchor: 'center', opacityPast: 0.86, opacityFuture: 0.34 },
    { key: 'hat', rgb: DRUM_SPECTRAL_COLORS.hat, yStart: 0, yEnd: 0.4, anchor: 'top', opacityPast: 0.9, opacityFuture: 0.4 },
  ]
  const overlayLayers: Array<OverlayLayerSpec<DrumKey>> = [
    { key: 'kick', rgb: DRUM_SPECTRAL_COLORS.kick, weight: 1, opacityPast: 0.92, opacityFuture: 0.38, forwardBias: 0.15 },
    { key: 'snare', rgb: DRUM_SPECTRAL_COLORS.snare, weight: 0.95, opacityPast: 0.9, opacityFuture: 0.36, forwardBias: 0.55 },
    { key: 'clap', rgb: DRUM_SPECTRAL_COLORS.clap, weight: 0.9, opacityPast: 0.92, opacityFuture: 0.4, forwardBias: 0.78 },
    { key: 'hat', rgb: DRUM_SPECTRAL_COLORS.hat, weight: 0.82, opacityPast: 1, opacityFuture: 0.48, forwardBias: 1 },
  ]

  const colW = width / cols
  for (let c = 0; c < cols; c++) {
    const col = peaks[c]
    const bodyLin = Math.min(1, col.body / ref)
    const peakLin = Math.min(1, col.peak / ref)
    const x = c * colW
    const past = x + colW * 0.5 <= playX
    const fw = Math.max(1, Math.ceil(colW))

    if (bodyLin <= 0.012 && peakLin <= 0.02) {
      const [r, g, b] = DRUM_SPECTRAL_COLORS.sub
      ctx.fillStyle = rgba(r, g, b, past ? 0.22 : 0.1)
      ctx.fillRect(x, midY - 0.5, fw, 1)
      continue
    }

    const totalAmp = Math.max(1.25, overviewAmp(bodyLin) * ampScale)
    const peakAmp = Math.max(totalAmp, overviewAmp(peakLin) * ampScale)
    const energies = { kick: col.kick, snare: col.snare, clap: col.clap, hat: col.hat }
    if (stackMode === 'overlay') {
      paintOverlayMergedStack(ctx, {
        x,
        fw,
        midY,
        totalAmp,
        past,
        layers: overlayLayers,
        energies,
      })
    } else {
      paintLaneStack(ctx, {
        x,
        fw,
        height,
        midY,
        peakLin,
        totalAmp,
        past,
        layers: laneLayers,
        energies,
      })
    }
    if (p.peakSpikes !== false) {
      paintPeakFluxHairline(ctx, {
        x,
        fw,
        midY,
        bodyAmp: totalAmp,
        peakAmp,
        flux: col.flux,
        past,
      })
    }
  }
}

/**
 * SoundCloud / CDJ overview: RMS body + Peak/flux hairlines (dual envelope).
 */
function paintSoundCloudOverview(
  ctx: CanvasRenderingContext2D,
  p: {
    samples: TimedWaveformSample[]
    midY: number
    height: number
    playX: number
    width: number
    colorMode: WaveformColorMode
    peakSpikes?: boolean
  }
): void {
  const { samples, midY, height, playX, width, colorMode } = p
  const solid = usesSolidLaneFill(colorMode)
  const solidRgb: [number, number, number] =
    colorMode === 'mono' ? [255, 85, 0] : colorMode === 'channel' ? [...CHANNEL_LANE_RGB] : [255, 85, 0]

  const cols = Math.max(64, Math.floor(width))
  const ampScale = height * 0.34
  const bodies = new Float32Array(cols)
  const crests = new Float32Array(cols)
  const fluxes = new Float32Array(cols)
  const colors: Array<[number, number, number]> = new Array(cols)

  for (let c = 0; c < cols; c++) {
    colors[c] = solid ? [...solidRgb] : [80, 190, 255]
  }

  const t0 = samples[0].timeSec
  const t1 = samples[samples.length - 1].timeSec
  const span = Math.max(1e-6, t1 - t0)

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const c = Math.min(cols - 1, Math.max(0, Math.floor(((s.timeSec - t0) / span) * cols)))
    const dual = dualEnvelopeAmps(s)
    if (dual.body > bodies[c]) bodies[c] = dual.body
    if (dual.peak > crests[c]) crests[c] = dual.peak
    if (dual.flux > fluxes[c]) fluxes[c] = dual.flux
    if (!solid) {
      colors[c] = parseRgb(s.color)
    } else {
      const bright = 0.45 + dual.body * 0.55
      colors[c] = [solidRgb[0] * bright, solidRgb[1] * bright, solidRgb[2] * bright]
    }
  }

  const sorted = Array.from(bodies).filter((v) => v > 0.001).sort((a, b) => a - b)
  const ref =
    sorted.length > 0
      ? Math.max(0.08, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92))] || 1)
      : 1

  const colW = width / cols
  for (let c = 0; c < cols; c++) {
    const bodyLin = Math.min(1, bodies[c] / ref)
    const peakLin = Math.min(1, crests[c] / ref)
    const x = c * colW
    const past = x + colW * 0.5 <= playX
    const [r, g, b] = colors[c]
    const fw = Math.max(1, Math.ceil(colW))

    if (bodyLin <= 0.012 && peakLin <= 0.02) {
      ctx.fillStyle = rgba(r, g, b, past ? 0.22 : 0.1)
      ctx.fillRect(x, midY - 0.5, fw, 1)
      continue
    }

    const bodyAmp = Math.max(1.25, overviewAmp(bodyLin) * ampScale)
    const peakAmp = Math.max(bodyAmp, overviewAmp(peakLin) * ampScale)
    ctx.fillStyle = rgba(r, g, b, past ? 0.92 : 0.36)
    ctx.fillRect(x, midY - bodyAmp, fw, bodyAmp * 2)
    if (p.peakSpikes !== false) {
      paintPeakFluxHairline(ctx, {
        x,
        fw,
        midY,
        bodyAmp,
        peakAmp,
        flux: fluxes[c],
        past,
      })
    }
  }
}

/**
 * Zoomed-in detail: dual envelope with peak-hold interpolation (no transient smear).
 */
function paintContinuousDetail(
  ctx: CanvasRenderingContext2D,
  p: {
    samples: TimedWaveformSample[]
    toX: (t: number) => number
    midY: number
    height: number
    playX: number
    width: number
    colorMode: WaveformColorMode
    peakSpikes?: boolean
  }
): void {
  const { samples, toX, midY, height, playX, width, colorMode } = p
  if (samples.length < 2) {
    paintSoundCloudOverview(ctx, {
      samples,
      midY,
      height,
      playX,
      width,
      colorMode,
      peakSpikes: p.peakSpikes,
    })
    return
  }

  const solid = usesSolidLaneFill(colorMode)
  const solidRgb: [number, number, number] =
    colorMode === 'mono' ? [255, 85, 0] : colorMode === 'channel' ? [...CHANNEL_LANE_RGB] : [255, 85, 0]

  const cols = Math.max(64, Math.floor(width))
  const ampScale = height * 0.34
  const bodies = new Float32Array(cols)
  const crests = new Float32Array(cols)
  const fluxes = new Float32Array(cols)
  const colors: Array<[number, number, number]> = new Array(cols)

  const n = samples.length
  let j = 0
  for (let c = 0; c < cols; c++) {
    const xCenter = (c + 0.5) * (width / cols)
    while (j < n - 2 && toX(samples[j + 1].timeSec) < xCenter) j++

    const a = samples[j]
    const b = samples[Math.min(n - 1, j + 1)]
    const xa = toX(a.timeSec)
    const xb = toX(b.timeSec)
    const denom = Math.max(1e-6, xb - xa)
    let u = (xCenter - xa) / denom
    u = Math.max(0, Math.min(1, u))
    const s = u * u * (3 - 2 * u)

    const dual = interpolateDualEnvelope(dualEnvelopeAmps(a), dualEnvelopeAmps(b), u)
    bodies[c] = dual.body
    crests[c] = dual.peak
    fluxes[c] = dual.flux

    if (solid) {
      const bright = 0.45 + dual.body * 0.55
      colors[c] = [solidRgb[0] * bright, solidRgb[1] * bright, solidRgb[2] * bright]
    } else {
      const ca = parseRgb(a.color)
      const cb = parseRgb(b.color)
      colors[c] = [
        ca[0] + (cb[0] - ca[0]) * s,
        ca[1] + (cb[1] - ca[1]) * s,
        ca[2] + (cb[2] - ca[2]) * s,
      ]
    }
  }

  const sorted = Array.from(bodies).filter((v) => v > 0.001).sort((a, b) => a - b)
  const ref =
    sorted.length > 0
      ? Math.max(0.08, sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92))] || 1)
      : 1

  const colW = width / cols
  for (let c = 0; c < cols; c++) {
    const bodyLin = Math.min(1, bodies[c] / ref)
    const peakLin = Math.min(1, crests[c] / ref)
    const x = c * colW
    const past = x + colW * 0.5 <= playX
    const [r, g, b] = colors[c]
    const fw = Math.max(1, Math.ceil(colW))

    if (bodyLin <= 0.012 && peakLin <= 0.02) {
      ctx.fillStyle = rgba(r, g, b, past ? 0.22 : 0.1)
      ctx.fillRect(x, midY - 0.5, fw, 1)
      continue
    }

    const bodyAmp = Math.max(1.25, overviewAmp(bodyLin) * ampScale)
    const peakAmp = Math.max(bodyAmp, overviewAmp(peakLin) * ampScale)
    ctx.fillStyle = rgba(r, g, b, past ? 0.92 : 0.36)
    ctx.fillRect(x, midY - bodyAmp, fw, bodyAmp * 2)
    if (p.peakSpikes !== false) {
      paintPeakFluxHairline(ctx, {
        x,
        fw,
        midY,
        bodyAmp,
        peakAmp,
        flux: fluxes[c],
        past,
      })
    }
  }
}

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  cssWidth?: number
): void {
  const maxX = cssWidth ?? ctx.canvas.width
  if (x < -2 || x > maxX + 2) return
  // Device-pixel align so the 1px line doesn't shimmer between frames
  const snap = Math.round(x * (ctx.getTransform().a || 1)) / (ctx.getTransform().a || 1)
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(snap, 0)
  ctx.lineTo(snap, height)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(snap, 0)
  ctx.lineTo(snap, height)
  ctx.stroke()
  ctx.restore()
}
