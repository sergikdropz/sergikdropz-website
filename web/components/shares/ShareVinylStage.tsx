'use client'

import { memo, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  acquireVinylSpin,
  beginVinylScrub,
  endVinylScrub,
  nudgeVinylAngle,
  releaseVinylSpin,
  shortestAngleDelta,
  subscribeVinylSpin,
  vinylDegreesToSeconds,
  VINYL_33_RPM_MS,
  VINYL_33_RPM_SEC,
  VINYL_RPM,
} from '@/lib/shares/vinyl-spin-clock'

export { VINYL_33_RPM_MS, VINYL_33_RPM_SEC, VINYL_RPM }

/** Degrees of finger arc before a touch becomes a scrub (avoids accidental reverse). */
const SCRUB_ARM_DEG = 10
/** Ignore micro jitter under this many degrees per move sample. */
const SCRUB_JITTER_DEG = 0.35

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

function pointerAngleDeg(clientX: number, clientY: number, el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI
}

/**
 * Black vinyl platter with grooves + center label artwork.
 * Rotation uses a monotonic angle (no 0–360 wrap) so mobile WebKit never
 * reverse-snaps. Scrub arms only after a clear circular drag — taps/scrolls
 * do not pause or reverse the disc.
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
  /** True once pointer is down (may still be waiting for scrub arm threshold). */
  const trackingRef = useRef(false)
  /** True only after circular drag exceeds SCRUB_ARM_DEG. */
  const scrubArmedRef = useRef(false)
  const lastPointerAngleRef = useRef(0)
  const lastMoveAtRef = useRef(0)
  const armedAccumRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const onScrubStartRef = useRef(onScrubStart)
  const onScrubDeltaRef = useRef(onScrubDelta)
  const onScrubEndRef = useRef(onScrubEnd)
  onScrubStartRef.current = onScrubStart
  onScrubDeltaRef.current = onScrubDelta
  onScrubEndRef.current = onScrubEnd

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    return subscribeVinylSpin((angleDeg) => {
      const el = platterRef.current
      // Monotonic degrees — never wrap. WebKit reverse-snaps on 359→0.
      if (el) el.style.transform = `rotate(${angleDeg}deg)`
    })
  }, [])

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

  const endTracking = useCallback(() => {
    if (!trackingRef.current) return
    const wasArmed = scrubArmedRef.current
    trackingRef.current = false
    scrubArmedRef.current = false
    armedAccumRef.current = 0
    activePointerIdRef.current = null
    lastMoveAtRef.current = 0
    if (wasArmed) {
      endVinylScrub()
      onScrubEndRef.current?.()
    }
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!scrubEnabled || event.button !== 0) return
      const root = rootRef.current
      if (!root) return

      // Do NOT scrub/pause yet — wait for a clear circular drag.
      trackingRef.current = true
      scrubArmedRef.current = false
      armedAccumRef.current = 0
      activePointerIdRef.current = event.pointerId
      lastPointerAngleRef.current = pointerAngleDeg(event.clientX, event.clientY, root)
      lastMoveAtRef.current = performance.now()
      try {
        root.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    },
    [scrubEnabled],
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!trackingRef.current || activePointerIdRef.current !== event.pointerId) return
    const root = rootRef.current
    if (!root) return

    const now = performance.now()
    const dtMs = Math.max(8, Math.min(64, now - (lastMoveAtRef.current || now)))
    lastMoveAtRef.current = now

    const next = pointerAngleDeg(event.clientX, event.clientY, root)
    const deltaDeg = shortestAngleDelta(lastPointerAngleRef.current, next)
    lastPointerAngleRef.current = next
    if (Math.abs(deltaDeg) < SCRUB_JITTER_DEG) return

    if (!scrubArmedRef.current) {
      armedAccumRef.current += Math.abs(deltaDeg)
      if (armedAccumRef.current < SCRUB_ARM_DEG) return
      // Crossed threshold — now take over the platter.
      scrubArmedRef.current = true
      event.preventDefault()
      beginVinylScrub()
      onScrubStartRef.current?.()
    }

    event.preventDefault()
    nudgeVinylAngle(deltaDeg)
    onScrubDeltaRef.current?.({
      deltaDegrees: deltaDeg,
      deltaSeconds: vinylDegreesToSeconds(deltaDeg),
      dtMs,
    })
  }, [])

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return
      try {
        rootRef.current?.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
      endTracking()
    },
    [endTracking],
  )

  return (
    <div
      ref={rootRef}
      className={`relative aspect-square ${scrubEnabled ? 'touch-none cursor-grab active:cursor-grabbing' : ''} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role={scrubEnabled ? 'slider' : undefined}
      aria-label={scrubEnabled ? 'Vinyl scrubber — drag in a circle to seek' : undefined}
    >
      {/* Rotating vinyl body — no mix-blend (iOS compositing flicker) */}
      <div
        ref={platterRef}
        className="absolute inset-0 rounded-full"
        style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
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

        {/* Fine grooves — opacity only, no mix-blend */}
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

        {/* Wider groove bands */}
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

        {/* Lead-out ring */}
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: `${((labelScale + 0.04) / 2) * 100}%`,
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.06), inset 0 0 10px rgba(0,0,0,0.45)',
          }}
          aria-hidden
        />

        {/* Outer rim bevel */}
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

        {/* Center label */}
        <div
          className="absolute left-1/2 top-1/2 overflow-hidden rounded-full bg-zinc-900"
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
              className="h-full w-full object-cover"
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

      {/* Soft fixed lamp sheen only — no conic streak (reads as reverse spin on phones) */}
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
          <div className="absolute left-0 top-0 z-10 w-[72%]">
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
