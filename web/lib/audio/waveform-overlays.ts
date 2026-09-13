/**
 * Waveform annotation overlays — mix window, cues, overview scrubber.
 * All positions use the same startSec/endSec → x mapping as the tape.
 */

import { timeToXPercent } from '@/lib/audio/waveform-view'
import type { TimedWaveformSample } from '@/lib/audio/waveform-view'

export type WaveformMixOverlay = {
  active: boolean
  /** Preferred mix-out on the live (outgoing) tape */
  mixOutSec?: number | null
  /** Transition window on the live tape */
  mixStartSec?: number | null
  mixEndSec?: number | null
  /** Live blend position 0→1 within the mix window (during crossfade). */
  blendProgress?: number | null
}

export type WaveformHotCue = {
  id: string
  timeSec: number
  label: string
  color?: string
}

export type WaveformGhostTape = {
  timed: TimedWaveformSample[]
  durationSec: number
  timeSec: number
  opacity?: number
}

function toX(t: number, startSec: number, endSec: number, width: number): number {
  return (timeToXPercent(t, startSec, endSec) / 100) * width
}

/** Shade the planned Auto DJ overlap + mark mix-out. */
export function paintMixAnnotations(
  ctx: CanvasRenderingContext2D,
  p: {
    width: number
    height: number
    startSec: number
    endSec: number
    overlay: WaveformMixOverlay | null | undefined
  }
): void {
  const o = p.overlay
  if (!o?.active) return
  const { width, height, startSec, endSec } = p
  const span = endSec - startSec
  if (span <= 0) return

  const mixStart = o.mixStartSec
  const mixEnd = o.mixEndSec
  if (
    typeof mixStart === 'number' &&
    typeof mixEnd === 'number' &&
    mixEnd > mixStart
  ) {
    const x0 = Math.max(0, toX(mixStart, startSec, endSec, width))
    const x1 = Math.min(width, toX(mixEnd, startSec, endSec, width))
    if (x1 > x0) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.14)'
      ctx.fillRect(x0, 0, x1 - x0, height)
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x0, 0)
      ctx.lineTo(x0, height)
      ctx.moveTo(x1, 0)
      ctx.lineTo(x1, height)
      ctx.stroke()
    }
  }

  // IN = phrase-aligned handoff (incoming takes over at mix end)
  if (typeof mixEnd === 'number' && Number.isFinite(mixEnd)) {
    const x = toX(mixEnd, startSec, endSec, width)
    if (x >= -2 && x <= width + 2) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(56, 189, 248, 0.95)'
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText('IN', Math.min(width - 18, Math.max(2, x + 3)), 10)
    }
  }

  // OUT = phrase-aligned mix-out cue (leave outgoing / start of fade)
  const outSec =
    typeof o.mixOutSec === 'number' && Number.isFinite(o.mixOutSec)
      ? o.mixOutSec
      : typeof mixStart === 'number' && Number.isFinite(mixStart)
        ? mixStart
        : null
  if (outSec != null) {
    const x = toX(outSec, startSec, endSec, width)
    if (x >= -2 && x <= width + 2) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)'
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
      const labelY =
        typeof mixEnd === 'number' && Math.abs(outSec - mixEnd) < span * 0.02 ? 20 : 10
      ctx.fillText('OUT', Math.min(width - 22, Math.max(2, x + 3)), labelY)
    }
  }

  const progress = o.blendProgress
  if (
    typeof progress === 'number' &&
    progress >= 0 &&
    progress <= 1 &&
    typeof mixStart === 'number' &&
    typeof mixEnd === 'number' &&
    mixEnd > mixStart
  ) {
    const blendSec = mixStart + progress * (mixEnd - mixStart)
    const xp = toX(blendSec, startSec, endSec, width)
    if (xp >= 0 && xp <= width) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.fillRect(Math.max(0, toX(mixStart, startSec, endSec, width)), 0, xp - Math.max(0, toX(mixStart, startSec, endSec, width)), height)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(xp, 0)
      ctx.lineTo(xp, height)
      ctx.stroke()
    }
  }
}

export function paintHotCues(
  ctx: CanvasRenderingContext2D,
  p: {
    width: number
    height: number
    startSec: number
    endSec: number
    cues: WaveformHotCue[]
  }
): void {
  if (!p.cues.length) return
  const { width, height, startSec, endSec } = p
  for (const cue of p.cues) {
    if (!Number.isFinite(cue.timeSec)) continue
    const x = toX(cue.timeSec, startSec, endSec, width)
    if (x < -4 || x > width + 4) continue
    const color = cue.color || 'rgba(167, 139, 250, 0.95)'
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 5, 0)
    ctx.lineTo(x, 8)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(cue.label, Math.min(width - 10, x + 4), 18)
  }
}

/** Faint incoming envelope ghost (bottom third) during a mix. */
export function paintGhostLane(
  ctx: CanvasRenderingContext2D,
  p: {
    width: number
    height: number
    ghost: WaveformGhostTape
    columns?: number
  }
): void {
  const { timed, durationSec, timeSec } = p.ghost
  if (!timed.length || durationSec <= 0) return
  const opacity = p.ghost.opacity ?? 0.35
  const laneTop = p.height * 0.62
  const laneH = p.height * 0.34
  const midY = laneTop + laneH / 2
  const windowSec = Math.min(durationSec, Math.max(4, durationSec * 0.12))
  const startSec = Math.max(0, timeSec - windowSec * 0.35)
  const endSec = Math.min(durationSec, startSec + windowSec)
  const span = endSec - startSec
  if (span <= 0) return

  ctx.fillStyle = `rgba(0,0,0,${0.45 * opacity})`
  ctx.fillRect(0, laneTop - 2, p.width, laneH + 4)

  const cols = Math.min(p.columns ?? Math.floor(p.width), timed.length)
  const step = Math.max(1, Math.floor(timed.length / cols))
  ctx.globalAlpha = opacity
  for (let i = 0; i < timed.length; i += step) {
    const s = timed[i]
    if (s.timeSec < startSec || s.timeSec > endSec) continue
    const x = ((s.timeSec - startSec) / span) * p.width
    const amp = Math.max(s.rms ?? 0, (s.positive ?? 0) * 0.85)
    const h = Math.max(1, amp * laneH * 0.9)
    ctx.fillStyle = s.color || 'rgba(56, 189, 248, 0.8)'
    ctx.fillRect(x, midY - h / 2, Math.max(1, p.width / cols), h)
  }
  ctx.globalAlpha = 1

  // Incoming playhead in ghost lane
  const px = ((timeSec - startSec) / span) * p.width
  if (px >= 0 && px <= p.width) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, laneTop)
    ctx.lineTo(px, laneTop + laneH)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(56, 189, 248, 0.75)'
  ctx.font = '8px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('IN', 4, laneTop + 10)
}

/** Full-track overview strip (CDJ-style). */
export function paintOverviewStrip(
  ctx: CanvasRenderingContext2D,
  p: {
    width: number
    height: number
    dpr: number
    timed: TimedWaveformSample[]
    durationSec: number
    currentTimeSec: number
    viewStartSec?: number
    viewEndSec?: number
    mixOverlay?: WaveformMixOverlay | null
  }
): void {
  const { width, height, dpr, timed, durationSec, currentTimeSec } = p
  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w
    ctx.canvas.height = h
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, width, height)
  if (!timed.length || durationSec <= 0) return

  const midY = height / 2
  const cols = Math.min(width, timed.length)
  const bucket = timed.length / cols
  for (let c = 0; c < cols; c++) {
    const i0 = Math.floor(c * bucket)
    const i1 = Math.min(timed.length, Math.floor((c + 1) * bucket))
    let peak = 0
    for (let i = i0; i < i1; i++) {
      peak = Math.max(peak, timed[i].positive ?? timed[i].rms ?? 0)
    }
    const amp = Math.pow(Math.min(1, peak), 1.4)
    const barH = Math.max(1, amp * (height - 2))
    ctx.fillStyle = timed[i0]?.color || 'rgba(148, 163, 184, 0.85)'
    ctx.fillRect(c, midY - barH / 2, 1, barH)
  }

  // Viewport bracket
  if (
    typeof p.viewStartSec === 'number' &&
    typeof p.viewEndSec === 'number' &&
    p.viewEndSec > p.viewStartSec
  ) {
    const x0 = (p.viewStartSec / durationSec) * width
    const x1 = (p.viewEndSec / durationSec) * width
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(x0, 0, Math.max(2, x1 - x0), height)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.strokeRect(x0 + 0.5, 0.5, Math.max(1, x1 - x0 - 1), height - 1)
  }

  if (p.mixOverlay?.active) {
    paintMixAnnotations(ctx, {
      width,
      height,
      startSec: 0,
      endSec: durationSec,
      overlay: p.mixOverlay,
    })
  }

  const playX = (currentTimeSec / durationSec) * width
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(playX, 0)
  ctx.lineTo(playX, height)
  ctx.stroke()
}


/**
 * Fold a signed phase error into ±halfWindowSec (CDJ meter needle range).
 */
export function foldPhaseErrorSec(errSec: number, halfWindowSec: number): number {
  if (!Number.isFinite(errSec) || !(halfWindowSec > 0)) return 0
  const period = halfWindowSec * 2
  let e = ((errSec % period) + period) % period
  if (e > halfWindowSec) e -= period
  return e
}

/**
 * Signed phase within ±½ of the lattice period (local playhead vs offset).
 * `windowBeats` is the full strip width in beats (same as resolvePhaseMeterWindowBeats);
 * default 1 → classic ±½ beat. Negative = playhead before the beat (grid late).
 */
export function localGridPhaseErrorSec(params: {
  currentTimeSec: number
  bpm: number
  offsetSec?: number
  /** Full meter width in beats; error folds to ±half. Default 1 (= ±½ beat). */
  windowBeats?: number
}): number {
  const { currentTimeSec, bpm } = params
  if (!(bpm > 0) || !Number.isFinite(currentTimeSec)) return 0
  const beatSec = 60 / bpm
  const windowBeats =
    typeof params.windowBeats === 'number' && params.windowBeats > 0 ? params.windowBeats : 1
  const period = beatSec * windowBeats
  const half = period * 0.5
  const offset =
    typeof params.offsetSec === 'number' && Number.isFinite(params.offsetSec)
      ? Math.max(0, params.offsetSec)
      : 0
  const rel = currentTimeSec - offset
  const phase = ((rel % period) + period) % period
  return phase > half ? phase - period : phase
}

export type PhaseAlignPaintResult = {
  errSec: number
  locked: boolean
  mode: 'grid' | 'sync'
}

/** Preset id for the phase-meter time window (full width around now). */
export type PhaseMeterWindowId =
  | 'beat-half'
  | 'beat-1'
  | 'beat-2'
  | 'beat-4'
  | 'bar-half'
  | 'bar-1'
  | 'bar-2'
  | 'bar-4'
  | 'bar-8'
  | 'phrase-half'
  | 'phrase-1'

export type PhaseMeterJogFeel = 'fine' | 'normal' | 'coarse'
export type PhaseMeterQuantize = 'off' | 'beat' | 'bar' | 'phrase'

export type PhaseMeterOptions = {
  /** Which window preset is selected (beats / bars / phrases). */
  windowId: PhaseMeterWindowId
  showBeats: boolean
  showBars: boolean
  showPhrases: boolean
  /** Phrase length in bars (DJ doctrine default = 8). */
  phraseBars: 4 | 8 | 16
  showMs: boolean
  /** Side-scroll / drag gear for CDJ-style jog nudging. */
  jogFeel: PhaseMeterJogFeel
  /**
   * Extra scroll-length multiplier on top of jogFeel (1 = default).
   * Higher = shorter stroke / more phase per scroll.
   */
  jogSensitivity: number
  /** Magnetic snap when the needle reaches center. */
  centerSnap: boolean
  /** Lattice used by Align playhead(s) actions in the phase menu. */
  quantize: PhaseMeterQuantize
}

export const DEFAULT_PHASE_METER_OPTIONS: PhaseMeterOptions = {
  windowId: 'bar-4',
  showBeats: true,
  showBars: true,
  showPhrases: false,
  phraseBars: 8,
  showMs: false,
  jogFeel: 'coarse',
  jogSensitivity: 4,
  centerSnap: true,
  quantize: 'phrase',
}

export const PHASE_METER_STORAGE_KEY = 'sergik.phaseMeterOptions.v1'

export const PHASE_METER_JOG_FEEL_OPTIONS: {
  id: PhaseMeterJogFeel
  label: string
  hint: string
}[] = [
  { id: 'fine', label: 'Fine', hint: 'Long stroke — sub-ms trims' },
  { id: 'normal', label: 'Normal', hint: 'Balanced jog' },
  { id: 'coarse', label: 'Coarse', hint: 'Default — faster phase moves' },
]

/** Discrete scroll-length presets (multiplier on wheel/drag gear). */
export const PHASE_METER_JOG_SENSITIVITY_OPTIONS: {
  value: number
  label: string
}[] = [
  { value: 0.5, label: '50% · longer' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 2.5, label: '250%' },
  { value: 3, label: '300%' },
  { value: 4, label: '400% · default' },
  { value: 5, label: '500% · shorter' },
]

export function clampPhaseJogSensitivity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.max(0.25, Math.min(5, Math.round(value * 100) / 100))
}

function isPhaseMeterWindowId(v: unknown): v is PhaseMeterWindowId {
  return (
    v === 'beat-half' ||
    v === 'beat-1' ||
    v === 'beat-2' ||
    v === 'beat-4' ||
    v === 'bar-half' ||
    v === 'bar-1' ||
    v === 'bar-2' ||
    v === 'bar-4' ||
    v === 'bar-8' ||
    v === 'phrase-half' ||
    v === 'phrase-1'
  )
}

function isPhaseMeterJogFeel(v: unknown): v is PhaseMeterJogFeel {
  return v === 'fine' || v === 'normal' || v === 'coarse'
}

function isPhaseMeterQuantize(v: unknown): v is PhaseMeterQuantize {
  return v === 'off' || v === 'beat' || v === 'bar' || v === 'phrase'
}

/** Merge partial prefs onto factory defaults (Coarse / 400% / ±4 bars / TempoSync lattice). */
export function parsePhaseMeterOptions(raw: unknown): PhaseMeterOptions {
  const base = { ...DEFAULT_PHASE_METER_OPTIONS }
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  if (isPhaseMeterWindowId(o.windowId)) base.windowId = o.windowId
  if (typeof o.showBeats === 'boolean') base.showBeats = o.showBeats
  if (typeof o.showBars === 'boolean') base.showBars = o.showBars
  if (typeof o.showPhrases === 'boolean') base.showPhrases = o.showPhrases
  if (o.phraseBars === 4 || o.phraseBars === 8 || o.phraseBars === 16) {
    base.phraseBars = o.phraseBars
  }
  if (typeof o.showMs === 'boolean') base.showMs = o.showMs
  if (isPhaseMeterJogFeel(o.jogFeel)) base.jogFeel = o.jogFeel
  if (typeof o.jogSensitivity === 'number') {
    base.jogSensitivity = clampPhaseJogSensitivity(o.jogSensitivity)
  }
  if (typeof o.centerSnap === 'boolean') base.centerSnap = o.centerSnap
  if (isPhaseMeterQuantize(o.quantize)) base.quantize = o.quantize
  return base
}

export function readPhaseMeterOptionsFromStorage(): PhaseMeterOptions {
  if (typeof window === 'undefined') return { ...DEFAULT_PHASE_METER_OPTIONS }
  try {
    const raw = localStorage.getItem(PHASE_METER_STORAGE_KEY)
    if (!raw) {
      const defaults = { ...DEFAULT_PHASE_METER_OPTIONS }
      writePhaseMeterOptionsToStorage(defaults)
      return defaults
    }
    return parsePhaseMeterOptions(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_PHASE_METER_OPTIONS }
  }
}

export function writePhaseMeterOptionsToStorage(options: PhaseMeterOptions): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PHASE_METER_STORAGE_KEY, JSON.stringify(options))
  } catch {
    /* ignore quota / private mode */
  }
}

export const PHASE_METER_QUANTIZE_OPTIONS: {
  id: PhaseMeterQuantize
  label: string
}[] = [
  { id: 'off', label: 'Off' },
  { id: 'beat', label: 'Beat' },
  { id: 'bar', label: 'Bar' },
  { id: 'phrase', label: 'Phrase' },
]

export const PHASE_METER_WINDOW_OPTIONS: {
  id: PhaseMeterWindowId
  label: string
  group: 'beat' | 'bar' | 'phrase'
}[] = [
  { id: 'beat-half', label: '±½ beat', group: 'beat' },
  { id: 'beat-1', label: '±1 beat', group: 'beat' },
  { id: 'beat-2', label: '±2 beats', group: 'beat' },
  { id: 'beat-4', label: '±4 beats', group: 'beat' },
  { id: 'bar-half', label: '±½ bar', group: 'bar' },
  { id: 'bar-1', label: '±1 bar', group: 'bar' },
  { id: 'bar-2', label: '±2 bars', group: 'bar' },
  { id: 'bar-4', label: '±4 bars', group: 'bar' },
  { id: 'bar-8', label: '±8 bars', group: 'bar' },
  { id: 'phrase-half', label: '±½ phrase', group: 'phrase' },
  { id: 'phrase-1', label: '±1 phrase', group: 'phrase' },
]

/** Map phase-meter window preset → MixEngine gridAlign mode. */
export function phaseMeterWindowToGridAlign(
  windowId: PhaseMeterWindowId,
): 'beat' | 'bar' | 'phrase' {
  const group = PHASE_METER_WINDOW_OPTIONS.find((o) => o.id === windowId)?.group
  if (group === 'bar') return 'bar'
  if (group === 'phrase') return 'phrase'
  return 'beat'
}

/** Full-width window in beats for the selected preset. */
export function resolvePhaseMeterWindowBeats(
  windowId: PhaseMeterWindowId,
  beatsPerBar = 4,
  phraseBars = 8,
): number {
  const bpb = Math.max(1, Math.round(beatsPerBar) || 4)
  const pb = Math.max(1, Math.round(phraseBars) || 8)
  switch (windowId) {
    case 'beat-half':
      return 1
    case 'beat-1':
      return 2
    case 'beat-2':
      return 4
    case 'beat-4':
      return 8
    case 'bar-half':
      return bpb
    case 'bar-1':
      return bpb * 2
    case 'bar-2':
      return bpb * 4
    case 'bar-4':
      return bpb * 8
    case 'bar-8':
      return bpb * 16
    case 'phrase-half':
      return bpb * pb
    case 'phrase-1':
      return bpb * pb * 2
    default:
      return bpb * 8
  }
}

/**
 * CDJ-style phase / grid-align meter.
 * Center = now. Scrolling beat/bar/phrase ticks + needle show drift; green = locked.
 */
export function paintPhaseAlignStrip(
  ctx: CanvasRenderingContext2D,
  p: {
    width: number
    height: number
    dpr: number
    currentTimeSec: number
    bpm: number
    offsetSec?: number
    beatsPerBar?: number
    /** Optional dual-deck error (sec); when set, overrides local grid phase. */
    phaseErrorSec?: number | null
    /** Show ms readout on the right. */
    showMs?: boolean
    options?: Partial<PhaseMeterOptions>
  }
): PhaseAlignPaintResult {
  const { width, height, dpr, currentTimeSec, bpm } = p
  const opts: PhaseMeterOptions = { ...DEFAULT_PHASE_METER_OPTIONS, ...p.options }
  if (p.showMs === false) opts.showMs = false

  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w
    ctx.canvas.height = h
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, width, height)

  const empty: PhaseAlignPaintResult = { errSec: 0, locked: false, mode: 'grid' }
  if (!(bpm > 0) || !Number.isFinite(currentTimeSec) || width < 8) return empty

  const beatSec = 60 / bpm
  const beatsPerBar =
    typeof p.beatsPerBar === 'number' && p.beatsPerBar > 0 ? Math.round(p.beatsPerBar) : 4
  const windowBeats = resolvePhaseMeterWindowBeats(
    opts.windowId,
    beatsPerBar,
    opts.phraseBars,
  )
  const windowSec = (windowBeats / 2) * beatSec
  const phraseBeats = Math.max(1, opts.phraseBars * beatsPerBar)
  const offset =
    typeof p.offsetSec === 'number' && Number.isFinite(p.offsetSec) ? Math.max(0, p.offsetSec) : 0

  const mode: 'grid' | 'sync' =
    typeof p.phaseErrorSec === 'number' && Number.isFinite(p.phaseErrorSec) ? 'sync' : 'grid'

  let errSec: number
  if (mode === 'sync') {
    // Fold into the visible CDJ window (±windowSec), not ±½ beat.
    errSec = foldPhaseErrorSec(p.phaseErrorSec as number, windowSec)
  } else {
    // Grid needle = beat lock (±½ beat). Multi-bar jog shifts markers via offset;
    // the needle stays a micro-phase readout so it does not sweep the strip.
    errSec = localGridPhaseErrorSec({
      currentTimeSec,
      bpm,
      offsetSec: offset,
    })
  }

  const midX = width / 2
  const midY = height / 2
  const locked = Math.abs(errSec) < beatSec * 0.015
  const nearLock = Math.abs(errSec) < beatSec * 0.05

  // Center deadband glow
  const deadW = Math.max(6, width * 0.04)
  const glow = ctx.createLinearGradient(midX - deadW * 2, 0, midX + deadW * 2, 0)
  if (locked) {
    glow.addColorStop(0, 'rgba(52,211,153,0)')
    glow.addColorStop(0.5, 'rgba(52,211,153,0.22)')
    glow.addColorStop(1, 'rgba(52,211,153,0)')
  } else if (nearLock) {
    glow.addColorStop(0, 'rgba(125,211,252,0)')
    glow.addColorStop(0.5, 'rgba(125,211,252,0.12)')
    glow.addColorStop(1, 'rgba(125,211,252,0)')
  } else {
    glow.addColorStop(0, 'rgba(251,146,60,0)')
    glow.addColorStop(0.5, 'rgba(251,146,60,0.08)')
    glow.addColorStop(1, 'rgba(251,146,60,0)')
  }
  ctx.fillStyle = glow
  ctx.fillRect(midX - deadW * 2, 0, deadW * 4, height)

  // Lane
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(0, midY - 0.5, width, 1)

  // Scrolling markers relative to now
  const beatIndex = Math.floor((currentTimeSec - offset) / beatSec)
  const span = Math.ceil(windowBeats / 2) + phraseBeats + 2
  for (let k = beatIndex - span; k <= beatIndex + span; k++) {
    const beatTime = offset + k * beatSec
    const rel = beatTime - currentTimeSec
    if (Math.abs(rel) > windowSec + 0.001) continue
    const x = midX + (rel / windowSec) * midX
    if (x < -2 || x > width + 2) continue

    const inBar = ((k % beatsPerBar) + beatsPerBar) % beatsPerBar
    const inPhrase = ((k % phraseBeats) + phraseBeats) % phraseBeats
    const isPhrase = opts.showPhrases && inPhrase === 0
    const isDownbeat = opts.showBars && inBar === 0
    const isHalf = opts.showBeats && inBar === beatsPerBar / 2 && beatsPerBar % 2 === 0
    const isBeat = opts.showBeats

    if (!isPhrase && !isDownbeat && !isHalf && !isBeat) continue
    if (isPhrase) {
      ctx.fillStyle = 'rgba(167,139,250,0.95)'
      ctx.fillRect(x - 1.25, 1, 2.5, height - 2)
      continue
    }
    if (isDownbeat) {
      ctx.fillStyle = 'rgba(226,232,240,0.9)'
      ctx.fillRect(x - 1, midY - height * 0.46, 2, height * 0.92)
      continue
    }
    if (isHalf) {
      ctx.fillStyle = 'rgba(148,163,184,0.55)'
      ctx.fillRect(x - 0.5, midY - height * 0.31, 1, height * 0.62)
      continue
    }
    ctx.fillStyle = 'rgba(100,116,139,0.4)'
    ctx.fillRect(x - 0.5, midY - height * 0.19, 1, height * 0.38)
  }

  // Center playhead (now)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.moveTo(midX, 0)
  ctx.lineTo(midX, height)
  ctx.stroke()

  // Edge ticks
  ctx.strokeStyle = 'rgba(148,163,184,0.35)'
  ctx.lineWidth = 1
  for (const edge of [0, width] as const) {
    const x = edge === 0 ? 0.5 : width - 0.5
    ctx.beginPath()
    ctx.moveTo(x, height * 0.25)
    ctx.lineTo(x, height * 0.75)
    ctx.stroke()
  }

  // Needle — map error into the visible window (clamped)
  const norm = Math.max(-1, Math.min(1, errSec / Math.max(windowSec, 1e-6)))
  const needleX = midX + norm * (midX - 3)
  ctx.fillStyle = locked
    ? 'rgba(52,211,153,0.95)'
    : nearLock
      ? 'rgba(56,189,248,0.95)'
      : 'rgba(251,146,60,0.95)'
  ctx.beginPath()
  ctx.moveTo(needleX, 1)
  ctx.lineTo(needleX + 4, midY)
  ctx.lineTo(needleX, height - 1)
  ctx.lineTo(needleX - 4, midY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = locked ? 'rgba(16,185,129,0.55)' : 'rgba(0,0,0,0.45)'
  ctx.lineWidth = 1
  ctx.stroke()

  if (opts.showMs && height >= 12) {
    const ms = errSec * 1000
    const label = `${locked ? 'LOCK' : mode === 'sync' ? 'SYNC' : 'GRID'} ${ms >= 0 ? '+' : ''}${ms.toFixed(0)}ms`
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.fillStyle = locked
      ? 'rgba(167,243,208,0.9)'
      : nearLock
        ? 'rgba(186,230,253,0.85)'
        : 'rgba(253,186,116,0.85)'
    ctx.fillText(label, width - 4, midY)
  }

  return { errSec, locked, mode }
}
