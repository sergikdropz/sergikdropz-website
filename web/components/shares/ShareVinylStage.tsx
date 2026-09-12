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

type VinylDiscProps = {
  artwork?: string
  spinning?: boolean
  className?: string
  /** Label (center art) size as fraction of disc diameter */
  labelScale?: number
  /** Drag the platter to scrub audio (disc mode). */
  scrubEnabled?: boolean
  onScrubStart?: () => void
  /** Called with signed seconds (clockwise / forward is positive). */
  onScrubDelta?: (deltaSeconds: number) => void
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
 * Rotation comes from a module-level 33⅓ RPM clock. Optional drag-scrub maps
 * platter angle to audio time at true LP speed (360° ≈ 1.8s).
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
  const scrubbingRef = useRef(false)
  const lastPointerAngleRef = useRef(0)
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

  const endScrub = useCallback(() => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    activePointerIdRef.current = null
    endVinylScrub()
    onScrubEndRef.current?.()
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!scrubEnabled || event.button !== 0) return
      const root = rootRef.current
      if (!root) return

      event.preventDefault()
      scrubbingRef.current = true
      activePointerIdRef.current = event.pointerId
      lastPointerAngleRef.current = pointerAngleDeg(event.clientX, event.clientY, root)
      beginVinylScrub()
      onScrubStartRef.current?.()
      root.setPointerCapture(event.pointerId)
    },
    [scrubEnabled],
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current || activePointerIdRef.current !== event.pointerId) return
    const root = rootRef.current
    if (!root) return

    const next = pointerAngleDeg(event.clientX, event.clientY, root)
    const deltaDeg = shortestAngleDelta(lastPointerAngleRef.current, next)
    lastPointerAngleRef.current = next
    if (deltaDeg === 0) return

    nudgeVinylAngle(deltaDeg)
    onScrubDeltaRef.current?.(vinylDegreesToSeconds(deltaDeg))
  }, [])

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return
      try {
        rootRef.current?.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
      endScrub()
    },
    [endScrub],
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
      aria-label={scrubEnabled ? 'Vinyl scrubber — drag to seek' : undefined}
    >
      {/* Rotating vinyl body */}
      <div ref={platterRef} className="absolute inset-0 rounded-full will-change-transform">
        {/* Deep black PVC with slight warm edge */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `
              radial-gradient(circle at 50% 50%,
                #2a2a2a 0%,
                #141414 28%,
                #0a0a0a 52%,
                #050505 78%,
                #1a1a1a 92%,
                #0c0c0c 100%
              )
            `,
            boxShadow: `
              0 28px 70px rgba(0,0,0,0.75),
              inset 0 0 40px rgba(0,0,0,0.85),
              inset 0 1px 0 rgba(255,255,255,0.08)
            `,
          }}
        />

        {/* Fine groove matrix */}
        <div
          className="pointer-events-none absolute inset-[3.5%] rounded-full opacity-70 mix-blend-soft-light"
          style={{
            background: `
              repeating-radial-gradient(
                circle at center,
                rgba(255,255,255,0.045) 0px,
                rgba(255,255,255,0.045) 0.7px,
                transparent 0.7px,
                transparent 2.1px
              )
            `,
          }}
          aria-hidden
        />

        {/* Wider groove bands (land / groove groups) */}
        <div
          className="pointer-events-none absolute inset-[4%] rounded-full opacity-40"
          style={{
            background: `
              repeating-radial-gradient(
                circle at center,
                transparent 0px,
                transparent 5px,
                rgba(255,255,255,0.03) 5px,
                rgba(255,255,255,0.03) 6px,
                transparent 6px,
                transparent 11px,
                rgba(0,0,0,0.25) 11px,
                rgba(0,0,0,0.25) 12px
              )
            `,
          }}
          aria-hidden
        />

        {/* Lead-out ring near the label */}
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: `${((labelScale + 0.04) / 2) * 100}%`,
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.07), inset 0 0 12px rgba(0,0,0,0.5)',
          }}
          aria-hidden
        />

        {/* Outer rim bevel */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow: `
              inset 0 0 0 1px rgba(255,255,255,0.14),
              inset 0 0 0 3px rgba(0,0,0,0.35),
              inset 0 0 18px rgba(255,255,255,0.04)
            `,
          }}
          aria-hidden
        />

        {/* Micro surface noise */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full opacity-[0.18] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
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
              0 0 0 2px rgba(0,0,0,0.8),
              0 0 0 3px rgba(255,255,255,0.1),
              inset 0 1px 2px rgba(255,255,255,0.12)
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
          {/* Spindle hole */}
          <div
            className="absolute left-1/2 top-1/2 h-[8%] w-[8%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black"
            style={{
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.25), 0 0 0 1px rgba(255,255,255,0.15)',
            }}
          />
        </div>
      </div>

      {/* Fixed studio lamp reflections (screen space — do not rotate) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full opacity-55"
        style={{
          background: `
            radial-gradient(ellipse 42% 28% at 28% 22%, rgba(255,255,255,0.34) 0%, transparent 70%),
            radial-gradient(ellipse 30% 22% at 72% 70%, rgba(255,255,255,0.1) 0%, transparent 70%),
            linear-gradient(145deg, rgba(255,255,255,0.16) 0%, transparent 38%, transparent 62%, rgba(0,0,0,0.45) 100%)
          `,
        }}
        aria-hidden
      />
      {/* Sharp specular streak */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full opacity-40 mix-blend-screen"
        style={{
          background:
            'conic-gradient(from 210deg at 50% 50%, transparent 0deg, transparent 48deg, rgba(255,255,255,0.2) 56deg, transparent 68deg, transparent 360deg)',
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
  onScrubDelta?: (deltaSeconds: number) => void
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
