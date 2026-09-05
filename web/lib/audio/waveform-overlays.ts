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
