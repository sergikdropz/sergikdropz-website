'use client'

import { memo, useCallback, useEffect, useRef } from 'react'
import {
  acquireVinylSpin,
  beginVinylScrub,
  endVinylScrub,
  getVinylSpinAngle,
  releaseVinylSpin,
  setVinylAngle,
  subscribeVinylSpin,
  vinylDegreesToSeconds,
  VINYL_33_RPM_MS,
  VINYL_33_RPM_SEC,
  VINYL_RPM,
} from '@/lib/shares/vinyl-spin-clock'

export { VINYL_33_RPM_MS, VINYL_33_RPM_SEC, VINYL_RPM }

/** px of finger travel before a touch becomes a scrub (avoids accidental grabs). */
const SCRUB_ARM_PX = 8
/** Ignore tiny movement samples under this many degrees. */
const SCRUB_JITTER_DEG = 0.15
/** Ignore samples too close to the spindle (unstable tangent). */
const MIN_RADIUS_PX = 12

type VinylDiscProps = {
  artwork?: string
  spinning?: boolean
  className?: string
  /** Label (center art) size as fraction of disc diameter */
  labelScale?: number
  /** Drag the platter to scrub audio (disc mode). */
  scrubEnabled?: boolean
  onScrubStart?: () => void
  /** Platter motion while scrubbing (degrees + mapped seconds + frame dt). */
  onScrubDelta?: (tick: { deltaSeconds: number; deltaDegrees: number; dtMs: number }) => void
  onScrubEnd?: () => void
}

type Point = { x: number; y: number }

function centerOf(el: HTMLElement): Point {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * Degrees of platter rotation for a finger move, using the 2D cross product
 * against the radius vector (stable turntable math — works near the rim).
 */
function tangentialDeltaDeg(center: Point, from: Point, to: Point): number {
  const rx = from.x - center.x
  const ry = from.y - center.y
  const r2 = rx * rx + ry * ry
  if (r2 < MIN_RADIUS_PX * MIN_RADIUS_PX) return 0
  const dx = to.x - from.x
  const dy = to.y - from.y
  // Positive cross = clockwise on screen (CSS rotate positive).
  const cross = rx * dy - ry * dx
  return (cross / r2) * (180 / Math.PI)
}

/**
 * Black vinyl platter with grooves + center label artwork.
 * Scrub uses native non-passive pointer listeners (iOS-safe) and paints the
 * platter transform directly so React cannot freeze the art mid-drag.
 */
export const VinylDisc = memo(function VinylDisc({
  artwork,
  spinning = false,
  className = '',
  labelScale = 0.38,
  scrubEnabled = false,
  onScrubStart,
  onScrubDelta,
  onScrubEnd,
}: VinylDiscProps) {
  const labelPct = `${labelScale * 100}%`
  const rootRef = useRef<HTMLDivElement>(null)
  const platterRef = useRef<HTMLDivElement>(null)
  const trackingRef = useRef(false)
  const scrubArmedRef = useRef(false)
  const lastPointRef = useRef<Point>({ x: 0, y: 0 })
  const lastMoveAtRef = useRef(0)
  const armedTravelPxRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const platterAngleRef = useRef(0)
  const onScrubStartRef = useRef(onScrubStart)
  const onScrubDeltaRef = useRef(onScrubDelta)
  const onScrubEndRef = useRef(onScrubEnd)
  onScrubStartRef.current = onScrubStart
  onScrubDeltaRef.current = onScrubDelta
  onScrubEndRef.current = onScrubEnd

  const paintPlatter = useCallback((angleDeg: number) => {
    platterAngleRef.current = angleDeg
    const el = platterRef.current
    if (el) el.style.transform = `rotate(${angleDeg}deg)`
  }, [])

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    return subscribeVinylSpin((angleDeg) => {
      // While finger-scrubbing, pointer handler owns the paint.
      if (scrubArmedRef.current) return
      paintPlatter(angleDeg)
    })
  }, [paintPlatter])

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || !spinning) return

    acquireVinylSpin()
    return () => {
      releaseVinylSpin()
    }
  }, [spinning])

  // Native pointer listeners — React synthetic moves are flaky on iOS Safari.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !scrubEnabled) return

    const endTracking = () => {
      if (!trackingRef.current) return
      const wasArmed = scrubArmedRef.current
      trackingRef.current = false
      scrubArmedRef.current = false
      armedTravelPxRef.current = 0
      activePointerIdRef.current = null
      lastMoveAtRef.current = 0
      if (wasArmed) {
        endVinylScrub()
        onScrubEndRef.current?.()
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      trackingRef.current = true
      scrubArmedRef.current = false
      armedTravelPxRef.current = 0
      activePointerIdRef.current = event.pointerId
      lastPointRef.current = { x: event.clientX, y: event.clientY }
      lastMoveAtRef.current = performance.now()
      platterAngleRef.current = getVinylSpinAngle()
      try {
        root.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!trackingRef.current || activePointerIdRef.current !== event.pointerId) return
      event.preventDefault()

      const now = performance.now()
      const dtMs = Math.max(8, Math.min(64, now - (lastMoveAtRef.current || now)))
      lastMoveAtRef.current = now

      const next: Point = { x: event.clientX, y: event.clientY }
      const prev = lastPointRef.current
      const travel = Math.hypot(next.x - prev.x, next.y - prev.y)
      if (travel < 0.5) return

      const center = centerOf(root)
      const deltaDeg = tangentialDeltaDeg(center, prev, next)
      lastPointRef.current = next

      if (!scrubArmedRef.current) {
        armedTravelPxRef.current += travel
        if (armedTravelPxRef.current < SCRUB_ARM_PX) return
        scrubArmedRef.current = true
        platterAngleRef.current = getVinylSpinAngle()
        beginVinylScrub()
        onScrubStartRef.current?.()
      }

      if (Math.abs(deltaDeg) < SCRUB_JITTER_DEG) return

      const nextAngle = platterAngleRef.current + deltaDeg
      // Paint FIRST so the art never waits on audio/React.
      paintPlatter(nextAngle)
      setVinylAngle(nextAngle)

      onScrubDeltaRef.current?.({
        deltaDegrees: deltaDeg,
        deltaSeconds: vinylDegreesToSeconds(deltaDeg),
        dtMs,
      })
    }

    const onPointerUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return
      try {
        root.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
      endTracking()
    }

    root.addEventListener('pointerdown', onPointerDown, { passive: false })
    root.addEventListener('pointermove', onPointerMove, { passive: false })
    root.addEventListener('pointerup', onPointerUp)
    root.addEventListener('pointercancel', onPointerUp)
    root.addEventListener('lostpointercapture', endTracking)

    return () => {
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerup', onPointerUp)
      root.removeEventListener('pointercancel', onPointerUp)
      root.removeEventListener('lostpointercapture', endTracking)
      endTracking()
    }
  }, [scrubEnabled, paintPlatter])

  return (
    <div
      ref={rootRef}
      className={`relative aspect-square touch-none select-none ${
        scrubEnabled ? 'cursor-grab active:cursor-grabbing' : ''
      } ${className}`}
      role={scrubEnabled ? 'slider' : undefined}
      aria-label={scrubEnabled ? 'Vinyl scrubber — drag to spin and seek' : undefined}
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {/* Transform is JS-only — never put `transform` in a React style object */}
      <div
        ref={platterRef}
        className="absolute inset-0 rounded-full will-change-transform [backface-visibility:hidden] [transform:translateZ(0)]"
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `
              radial-gradient(circle at 50% 50%,
                #242424 0%,
                #121212 26%,
                #080808 50%,
                #030303 76%,
                #161616 90%,
                #0a0a0a 100%
              )
            `,
            boxShadow: `
              0 28px 70px rgba(0,0,0,0.75),
              inset 0 0 36px rgba(0,0,0,0.9),
              inset 0 1px 0 rgba(255,255,255,0.07)
            `,
          }}
        />

        <div
          className="pointer-events-none absolute inset-[3.5%] rounded-full opacity-[0.55]"
          style={{
            background: `
              repeating-radial-gradient(
                circle at center,
                rgba(255,255,255,0.05) 0px,
                rgba(255,255,255,0.05) 0.6px,
                transparent 0.6px,
                transparent 2px
              )
            `,
          }}
          aria-hidden
        />

        <div
          className="pointer-events-none absolute inset-[4%] rounded-full opacity-35"
          style={{
            background: `
              repeating-radial-gradient(
                circle at center,
                transparent 0px,
                transparent 6px,
                rgba(255,255,255,0.028) 6px,
                rgba(255,255,255,0.028) 7px,
                transparent 7px,
                transparent 13px,
                rgba(0,0,0,0.22) 13px,
                rgba(0,0,0,0.22) 14px
              )
            `,
          }}
          aria-hidden
        />

        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: `${((labelScale + 0.04) / 2) * 100}%`,
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.06), inset 0 0 10px rgba(0,0,0,0.45)',
          }}
          aria-hidden
        />

        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow: `
              inset 0 0 0 1px rgba(255,255,255,0.12),
              inset 0 0 0 3px rgba(0,0,0,0.4),
              inset 0 0 14px rgba(255,255,255,0.03)
            `,
          }}
          aria-hidden
        />

        <div
          className="pointer-events-none absolute left-1/2 top-1/2 overflow-hidden rounded-full bg-zinc-900"
          style={{
            width: labelPct,
            height: labelPct,
            transform: 'translate(-50%, -50%)',
            boxShadow: `
              0 0 0 2px rgba(0,0,0,0.85),
              0 0 0 3px rgba(255,255,255,0.08),
              inset 0 1px 2px rgba(255,255,255,0.1)
            `,
          }}
        >
          {artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artwork}
              alt=""
              className="pointer-events-none h-full w-full object-cover"
              draggable={false}
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800 font-[family-name:var(--font-six-caps)] text-2xl text-zinc-500 sm:text-3xl">
              SERGIK
            </div>
          )}
          <div
            className="absolute left-1/2 top-1/2 h-[8%] w-[8%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black"
            style={{
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.22), 0 0 0 1px rgba(255,255,255,0.12)',
            }}
          />
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `
            radial-gradient(ellipse 46% 30% at 30% 24%, rgba(255,255,255,0.22) 0%, transparent 68%),
            linear-gradient(150deg, rgba(255,255,255,0.1) 0%, transparent 40%, transparent 58%, rgba(0,0,0,0.35) 100%)
          `,
        }}
        aria-hidden
      />
    </div>
  )
})

type ShareVinylStageProps = {
  artwork?: string
  spinning?: boolean
  mode: 'vinyl' | 'sleeve'
  className?: string
  scrubEnabled?: boolean
  onScrubStart?: () => void
  onScrubDelta?: (tick: { deltaSeconds: number; deltaDegrees: number; dtMs: number }) => void
  onScrubEnd?: () => void
}

/**
 * Listen-page vinyl stage:
 * - `vinyl`: full disc; optional drag-scrub at 33⅓ RPM mapping
 * - `sleeve`: cover in front, record peeking out (spin only)
 */
function ShareVinylStage({
  artwork,
  spinning = false,
  mode,
  className = '',
  scrubEnabled = false,
  onScrubStart,
  onScrubDelta,
  onScrubEnd,
}: ShareVinylStageProps) {
  const sleeve = mode === 'sleeve'
  const canScrub = scrubEnabled && !sleeve

  return (
    <div
      className={`relative mx-auto w-full overflow-visible ${
        sleeve ? 'max-w-[min(96vw,580px)]' : 'max-w-[min(92vw,480px)]'
      } ${className}`}
    >
      <div className={`relative w-full ${sleeve ? 'aspect-[1.15/1]' : 'aspect-square'}`}>
        <div
          className={
            sleeve ? 'absolute left-0 top-[4%] z-0 w-[72%]' : 'absolute inset-0 z-0'
          }
        >
          <div className={sleeve ? 'absolute left-[48%] top-0 w-full' : 'h-full w-full'}>
            <VinylDisc
              artwork={artwork}
              spinning={spinning}
              labelScale={sleeve ? 0.34 : 0.38}
              className="w-full"
              scrubEnabled={canScrub}
              onScrubStart={onScrubStart}
              onScrubDelta={onScrubDelta}
              onScrubEnd={onScrubEnd}
            />
          </div>
        </div>

        {sleeve ? (
          <div className="pointer-events-none absolute left-0 top-0 z-10 w-[72%]">
            <div className="relative aspect-square w-full overflow-hidden bg-zinc-900 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/15">
              {artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artwork} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-[family-name:var(--font-six-caps)] text-5xl text-zinc-600">
                  SERGIK
                </div>
              )}
              <div
                className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-black/50 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        ) : (
          <div
            className="pointer-events-none absolute -bottom-3 left-1/2 z-10 h-6 w-[70%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-xl"
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}

export default memo(ShareVinylStage)
