'use client'

import { memo, useEffect, useRef } from 'react'
import {
  DEFAULT_PHASE_METER_OPTIONS,
  paintPhaseAlignStrip,
  resolvePhaseMeterWindowBeats,
  type PhaseMeterOptions,
} from '@/lib/audio/waveform-overlays'
import {
  phasePlatterBendMultiplier,
  phaseWheelBendMultiplier,
  phaseWheelPixels,
  type PhaseNudgePolarity,
} from '@/lib/ui/phase-meter-wheel'

export type PhaseAlignMeterProps = {
  deckLabel: 'A' | 'B'
  bpm: number | null
  beatsPerBar?: number
  offsetSec?: number
  options?: Partial<PhaseMeterOptions>
  /** Live media / playhead time for this deck. */
  readTimeSec: () => number
  /** Dual-deck sync error (sec); local grid phase used when unset/null. */
  readPhaseErrorSec?: () => number | null
  /** Live grid offset (sec); falls back to offsetSec prop when omitted. */
  readOffsetSec?: () => number
  /**
   * How platter seek moves the displayed error: +1 live sync master, −1 idle.
   * Kept for API compatibility with align/center helpers on the host.
   */
  nudgePolarity?: PhaseNudgePolarity
  /**
   * CDJ outer-platter bend: temporary playbackRate multiplier (1 = neutral).
   * Host applies `baseRate * multiplier` — never seek/stop the platter.
   */
  onPlatterBend?: (rateMultiplier: number) => void
  /** True while the DJ is dragging / wheeling this strip (host pauses BeatSync + settles rate). */
  onJogActiveChange?: (active: boolean) => void
  /** Double-click: snap this deck's playhead to the menu quantize lattice. */
  onAlignPlayhead?: () => void
  /** Optional alternate lock (set downbeat) — unused when onAlignPlayhead is set. */
  onPhaseLock?: () => void
  className?: string
}

/**
 * CDJ-style phase / sync strip — painted independently of WaveformStage
 * so it can sit above the mixer crossfader at full chrome width.
 *
 * Jog = outer platter rim: temporary pitch bend from finger velocity.
 * The media clock never seeks/stops mid-gesture; rate returns to base on release.
 * Double-click still quantize-aligns the playhead (one discrete seek).
 */
function PhaseAlignMeter({
  deckLabel,
  bpm,
  beatsPerBar = 4,
  offsetSec = 0,
  options,
  readTimeSec,
  readPhaseErrorSec,
  readOffsetSec,
  onPlatterBend,
  onJogActiveChange,
  onAlignPlayhead,
  onPhaseLock,
  className = '',
}: PhaseAlignMeterProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const optionsRef = useRef({ ...DEFAULT_PHASE_METER_OPTIONS, ...options })
  optionsRef.current = { ...DEFAULT_PHASE_METER_OPTIONS, ...options }
  const bpmRef = useRef(bpm)
  bpmRef.current = bpm
  const offsetRef = useRef(offsetSec)
  offsetRef.current = offsetSec
  const readOffsetRef = useRef(readOffsetSec)
  readOffsetRef.current = readOffsetSec
  const beatsPerBarRef = useRef(beatsPerBar)
  beatsPerBarRef.current = beatsPerBar
  const readTimeRef = useRef(readTimeSec)
  readTimeRef.current = readTimeSec
  const readPhaseRef = useRef(readPhaseErrorSec)
  readPhaseRef.current = readPhaseErrorSec
  const onBendRef = useRef(onPlatterBend)
  onBendRef.current = onPlatterBend
  const onJogActiveRef = useRef(onJogActiveChange)
  onJogActiveRef.current = onJogActiveChange
  const onAlignRef = useRef(onAlignPlayhead)
  onAlignRef.current = onAlignPlayhead
  const onLockRef = useRef(onPhaseLock)
  onLockRef.current = onPhaseLock
  const dragRef = useRef<{
    lastX: number
    lastTs: number
    width: number
  } | null>(null)
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
  const jogActiveRef = useRef(false)
  const paintUrgentRef = useRef(false)
  const bendRafRef = useRef(0)
  const pendingBendRef = useRef(1)
  const lastBendRef = useRef(1)
  const coastRafRef = useRef(0)
  /** Last spin velocity (mult − 1) for CDJ-style coast on release. */
  const coastVelRef = useRef(0)

  const liveOffsetSec = () => {
    const read = readOffsetRef.current
    if (typeof read === 'function') {
      const v = read()
      if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v)
    }
    return offsetRef.current
  }

  const setJogActive = (active: boolean) => {
    if (jogActiveRef.current === active) return
    jogActiveRef.current = active
    paintUrgentRef.current = active
    try {
      onJogActiveRef.current?.(active)
    } catch {
      /* ignore */
    }
  }

  const flushBend = () => {
    bendRafRef.current = 0
    const next = pendingBendRef.current
    if (Math.abs(next - lastBendRef.current) < 0.00015) return
    lastBendRef.current = next
    try {
      onBendRef.current?.(next)
    } catch {
      /* ignore */
    }
  }

  const queueBend = (multiplier: number) => {
    const m =
      typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier > 0
        ? multiplier
        : 1
    pendingBendRef.current = m
    if (bendRafRef.current) return
    bendRafRef.current = requestAnimationFrame(flushBend)
  }

  const settleBend = () => {
    pendingBendRef.current = 1
    lastBendRef.current = 1
    coastVelRef.current = 0
    if (bendRafRef.current) {
      cancelAnimationFrame(bendRafRef.current)
      bendRafRef.current = 0
    }
    if (coastRafRef.current) {
      cancelAnimationFrame(coastRafRef.current)
      coastRafRef.current = 0
    }
    try {
      onBendRef.current?.(1)
    } catch {
      /* ignore */
    }
  }

  /** CDJ rim inertia — ease bend toward 1 over ~200ms instead of a hard stop. */
  const coastBendToNeutral = () => {
    if (coastRafRef.current) {
      cancelAnimationFrame(coastRafRef.current)
      coastRafRef.current = 0
    }
    let bend = lastBendRef.current
    // Seed from last applied bend; if already near 1, finish immediately.
    if (Math.abs(bend - 1) < 0.002) {
      settleBend()
      setJogActive(false)
      return
    }
    const step = () => {
      bend = 1 + (bend - 1) * 0.78
      if (Math.abs(bend - 1) < 0.0018) {
        coastRafRef.current = 0
        settleBend()
        setJogActive(false)
        return
      }
      queueBend(bend)
      coastRafRef.current = requestAnimationFrame(step)
    }
    coastRafRef.current = requestAnimationFrame(step)
  }

  const endDrag = (pointerId?: number) => {
    const el = wrapRef.current
    if (el != null && pointerId != null && el.hasPointerCapture?.(pointerId)) {
      try {
        el.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null
    // Keep jogActive true during coast so BeatSync stays paused until settle.
    coastBendToNeutral()
  }

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr =
        typeof globalThis !== 'undefined' && 'devicePixelRatio' in globalThis
          ? Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1)
          : 1
      sizeRef.current = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        dpr,
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let lastPaintMs = 0
    const idleMinMs = 33

    const paint = () => {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      const stageBpm = bpmRef.current
      if (!canvas || !wrap || !stageBpm || stageBpm <= 0) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      let { width, height, dpr } = sizeRef.current
      if (width < 2 || height < 2) {
        const rect = wrap.getBoundingClientRect()
        width = Math.max(1, Math.round(rect.width))
        height = Math.max(1, Math.round(rect.height))
        dpr =
          typeof globalThis !== 'undefined' && 'devicePixelRatio' in globalThis
            ? Math.min(2, (globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1)
            : 1
        sizeRef.current = { width, height, dpr }
      }
      const peer =
        typeof readPhaseRef.current === 'function' ? readPhaseRef.current() : null
      const painted = paintPhaseAlignStrip(ctx, {
        width,
        height,
        dpr,
        currentTimeSec: readTimeRef.current(),
        bpm: stageBpm,
        offsetSec: liveOffsetSec(),
        beatsPerBar: beatsPerBarRef.current,
        options: optionsRef.current,
        phaseErrorSec:
          typeof peer === 'number' && Number.isFinite(peer) ? peer : null,
      })
      if (wrap.dataset.phaseMs !== String(Math.round(painted.errSec * 1000))) {
        wrap.dataset.phaseMs = String(Math.round(painted.errSec * 1000))
        wrap.dataset.phaseMode = painted.mode
        wrap.dataset.phaseLocked = painted.locked ? '1' : '0'
        const ms = painted.errSec * 1000
        const q = optionsRef.current.quantize
        const alignHint =
          q === 'off' ? 'double-click disabled (quantize off)' : `double-click to align playhead · ${q}`
        wrap.title = painted.locked
          ? `${painted.mode === 'sync' ? 'Sync' : 'Grid'} locked — spin edge to nudge · ${alignHint}`
          : `${painted.mode === 'sync' ? 'Sync' : 'Grid'} ${ms >= 0 ? '+' : ''}${ms.toFixed(0)} ms — platter-edge bend · ${alignHint}`
        wrap.setAttribute('aria-valuenow', String(Math.round(ms)))
      }
    }

    const tick = (now: number) => {
      const urgent = paintUrgentRef.current || Boolean(dragRef.current)
      const minMs = urgent ? 0 : idleMinMs
      if (now - lastPaintMs >= minMs) {
        lastPaintMs = now
        paint()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (bendRafRef.current) {
        cancelAnimationFrame(bendRafRef.current)
        bendRafRef.current = 0
      }
      if (coastRafRef.current) {
        cancelAnimationFrame(coastRafRef.current)
        coastRafRef.current = 0
      }
    }
  }, [])

  const bendable = Boolean(onPlatterBend) && bpm != null && bpm > 0

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !bendable) return
    let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null
    const onWheel = (e: WheelEvent) => {
      const pixels = phaseWheelPixels({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        feel: optionsRef.current.jogFeel,
        sensitivity: optionsRef.current.jogSensitivity,
      })
      e.preventDefault()
      e.stopPropagation()
      if (!pixels) return
      if (coastRafRef.current) {
        cancelAnimationFrame(coastRafRef.current)
        coastRafRef.current = 0
      }
      setJogActive(true)
      if (wheelIdleTimer) clearTimeout(wheelIdleTimer)
      wheelIdleTimer = setTimeout(() => {
        coastBendToNeutral()
      }, 90)
      const width = Math.max(1, el.getBoundingClientRect().width)
      queueBend(
        phaseWheelBendMultiplier({
          pixels,
          widthPx: width,
          feel: optionsRef.current.jogFeel,
          sensitivity: optionsRef.current.jogSensitivity,
        }),
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (wheelIdleTimer) clearTimeout(wheelIdleTimer)
    }
  }, [bendable])

  if (bpm == null || !(bpm > 0)) return null

  return (
    <div
      ref={wrapRef}
      className={`relative h-5 w-full shrink-0 overflow-hidden rounded-sm border border-gray-800/80 bg-black ${
        onPlatterBend ? 'cursor-ew-resize touch-none' : ''
      } ${className}`}
      title="Phase / sync — spin like CDJ platter edge (temporary pitch bend) · release returns to tempo · double-click aligns playhead"
      data-phase-meter={deckLabel.toLowerCase()}
      role="slider"
      aria-label={`Deck ${deckLabel} beat phase alignment`}
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        if (!onBendRef.current || !bpm || bpm <= 0) return
        e.preventDefault()
        e.stopPropagation()
        const el = wrapRef.current
        if (!el) return
        el.setPointerCapture(e.pointerId)
        setJogActive(true)
        dragRef.current = {
          lastX: e.clientX,
          lastTs: e.timeStamp || performance.now(),
          width: Math.max(1, el.getBoundingClientRect().width),
        }
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        const now = e.timeStamp || performance.now()
        const dx = e.clientX - drag.lastX
        const dt = Math.max(1, now - drag.lastTs)
        drag.lastX = e.clientX
        drag.lastTs = now
        // Stationary finger → settle bend (platter rim stops spinning).
        if (Math.abs(dx) < 0.75) {
          queueBend(1)
          return
        }
        queueBend(
          phasePlatterBendMultiplier({
            deltaPx: dx,
            dtMs: dt,
            widthPx: drag.width,
            feel: optionsRef.current.jogFeel,
            sensitivity: optionsRef.current.jogSensitivity,
          }),
        )
      }}
      onPointerUp={(e) => {
        endDrag(e.pointerId)
      }}
      onPointerCancel={(e) => {
        endDrag(e.pointerId)
      }}
      onLostPointerCapture={() => {
        if (!dragRef.current) return
        dragRef.current = null
        coastBendToNeutral()
      }}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (onAlignRef.current) {
          onAlignRef.current()
          return
        }
        onLockRef.current?.()
      }}
    >
      <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" aria-hidden />
    </div>
  )
}

export default memo(PhaseAlignMeter)
