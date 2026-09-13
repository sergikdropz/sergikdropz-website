'use client'

import { memo, useEffect, useRef } from 'react'
import {
  DEFAULT_PHASE_METER_OPTIONS,
  localGridPhaseErrorSec,
  paintPhaseAlignStrip,
  resolvePhaseMeterWindowBeats,
  type PhaseMeterOptions,
} from '@/lib/audio/waveform-overlays'
import {
  phaseDragPixels,
  phaseNudgeSecFromPixels,
  phaseWheelPixels,
  snapPhaseJogDelta,
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
   * How offset nudges move the displayed error: +1 live sync master, −1 idle/grid.
   * Used for magnetic center snap.
   */
  nudgePolarity?: PhaseNudgePolarity
  onPhaseNudge?: (deltaSec: number) => void
  /** Double-click: snap this deck's playhead to the menu quantize lattice. */
  onAlignPlayhead?: () => void
  /** Optional alternate lock (set downbeat) — unused when onAlignPlayhead is set. */
  onPhaseLock?: () => void
  className?: string
}

/**
 * CDJ-style phase / grid-align strip — painted independently of WaveformStage
 * so it can sit above the mixer crossfader at full chrome width.
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
  nudgePolarity = -1,
  onPhaseNudge,
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
  const polarityRef = useRef<PhaseNudgePolarity>(nudgePolarity)
  polarityRef.current = nudgePolarity
  const onNudgeRef = useRef(onPhaseNudge)
  onNudgeRef.current = onPhaseNudge
  const onAlignRef = useRef(onAlignPlayhead)
  onAlignRef.current = onAlignPlayhead
  const onLockRef = useRef(onPhaseLock)
  onLockRef.current = onPhaseLock
  const dragRef = useRef<{
    lastX: number
    width: number
    bpm: number
    windowBeats: number
  } | null>(null)
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })

  const liveOffsetSec = () => {
    const read = readOffsetRef.current
    if (typeof read === 'function') {
      const v = read()
      if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v)
    }
    return offsetRef.current
  }

  const applyJogNudge = (pixels: number, widthPx: number, windowBeats: number, stageBpm: number) => {
    const nudge = onNudgeRef.current
    if (!nudge || !pixels) return
    const rawDelta = phaseNudgeSecFromPixels({
      pixels,
      widthPx,
      windowBeats,
      bpm: stageBpm,
    })
    if (!rawDelta) return
    const opts = optionsRef.current
    if (!opts.centerSnap) {
      nudge(rawDelta)
      return
    }
    const peer = typeof readPhaseRef.current === 'function' ? readPhaseRef.current() : null
    const syncing = typeof peer === 'number' && Number.isFinite(peer)
    const { deltaSec } = snapPhaseJogDelta({
      errSec: syncing
        ? peer
        : localGridPhaseErrorSec({
            currentTimeSec: readTimeRef.current(),
            bpm: stageBpm,
            offsetSec: liveOffsetSec(),
          }),
      deltaSec: rawDelta,
      bpm: stageBpm,
      // Local grid and idle sync: offset↑ lowers err. Live sync master: offset↑ raises err.
      polarity: syncing ? polarityRef.current : -1,
    })
    if (deltaSec) nudge(deltaSec)
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
          ? `${painted.mode === 'sync' ? 'Sync' : 'Grid'} locked — ${alignHint}`
          : `${painted.mode === 'sync' ? 'Sync' : 'Grid'} ${ms >= 0 ? '+' : ''}${ms.toFixed(0)} ms — jog to nudge · snaps to center · ${alignHint}`
      }
    }

    const tick = () => {
      paint()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const nudgeable = Boolean(onPhaseNudge) && bpm != null && bpm > 0

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !nudgeable) return
    const onWheel = (e: WheelEvent) => {
      const stageBpm = bpmRef.current
      if (!stageBpm || stageBpm <= 0) return
      const pixels = phaseWheelPixels({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        feel: optionsRef.current.jogFeel,
        sensitivity: optionsRef.current.jogSensitivity,
      })
      // Always claim the wheel while hovering — this strip is a jog, not a scroll lane.
      e.preventDefault()
      e.stopPropagation()
      if (!pixels) return
      applyJogNudge(
        pixels,
        Math.max(1, el.getBoundingClientRect().width),
        resolvePhaseMeterWindowBeats(
          optionsRef.current.windowId,
          beatsPerBarRef.current,
          optionsRef.current.phraseBars,
        ),
        stageBpm,
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [nudgeable])

  if (bpm == null || !(bpm > 0)) return null

  return (
    <div
      ref={wrapRef}
      className={`relative h-5 w-full shrink-0 overflow-hidden rounded-sm border border-gray-800/80 bg-black ${
        onPhaseNudge ? 'cursor-ew-resize touch-none' : ''
      } ${className}`}
      title="Phase / grid align — jog to nudge · snaps to center · double-click aligns playhead to quantize · right-click for options"
      data-phase-meter={deckLabel.toLowerCase()}
      role="slider"
      aria-label={`Deck ${deckLabel} beat phase alignment`}
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        if (!onNudgeRef.current || !bpm || bpm <= 0) return
        e.preventDefault()
        e.stopPropagation()
        const el = wrapRef.current
        if (!el) return
        el.setPointerCapture(e.pointerId)
        dragRef.current = {
          lastX: e.clientX,
          width: Math.max(1, el.getBoundingClientRect().width),
          bpm,
          windowBeats: resolvePhaseMeterWindowBeats(
            optionsRef.current.windowId,
            beatsPerBar,
            optionsRef.current.phraseBars,
          ),
        }
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        const dx = e.clientX - drag.lastX
        if (Math.abs(dx) < 0.5) return
        drag.lastX = e.clientX
        applyJogNudge(
          phaseDragPixels(
            dx,
            optionsRef.current.jogFeel,
            optionsRef.current.jogSensitivity,
          ),
          drag.width,
          drag.windowBeats,
          drag.bpm,
        )
      }}
      onPointerUp={(e) => {
        const el = wrapRef.current
        try {
          el?.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        dragRef.current = null
      }}
      onPointerCancel={() => {
        dragRef.current = null
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
