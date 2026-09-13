'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  XF_CENTER,
  applyCrossfaderWheelDelta,
  crossfaderDeltaFromWheel,
} from '@/lib/ui/mix-crossfader-wheel'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'

const DOUBLE_TAP_MS = 320

/**
 * CDJ-style crossfader — Auto DJ blend meter, or manual drag / side-scroll control.
 * A = 0 (left), B = 1 (right).
 *
 * Click-drag: absolute position under the pointer.
 * Side-scroll: relative longer-stroke jog (does not require a held click).
 * Right-click under Auto DJ: unlock/relock XF without turning Auto DJ off.
 */
export default function MixCrossfader({
  progress,
  active = false,
  interactive = false,
  lockedByAutoDj = false,
  unlockedUnderAutoDj = false,
  onChange,
  onUnlockFromAutoDj,
  onRelockToAutoDj,
  className = '',
}: {
  progress: number
  active?: boolean
  interactive?: boolean
  /** Auto DJ is driving the fader (meter-only). */
  lockedByAutoDj?: boolean
  /** Auto DJ still on, but user owns XF. */
  unlockedUnderAutoDj?: boolean
  onChange?: (progress: number) => void
  /** Take XF while Auto DJ keeps running. */
  onUnlockFromAutoDj?: () => void
  /** Give XF back to Auto DJ automation. */
  onRelockToAutoDj?: () => void
  className?: string
}) {
  const p = Math.max(0, Math.min(1, progress))
  const pct = p * 100
  const trackRef = useRef<HTMLDivElement>(null)
  const menuElRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const progressRef = useRef(p)
  progressRef.current = p
  const lastTapRef = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const canOpenMenu =
    (lockedByAutoDj && Boolean(onUnlockFromAutoDj)) ||
    (unlockedUnderAutoDj && Boolean(onRelockToAutoDj))
  const menuOpen = Boolean(menuAnchor && canOpenMenu)
  const menuClamp = useClampedFixedMenuPosition(
    menuOpen,
    menuAnchor,
    { width: 240, height: 88 },
    { externalRef: menuElRef },
  )

  const valueFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return progressRef.current
    const rect = el.getBoundingClientRect()
    const innerLeft = rect.left + 8
    const innerW = Math.max(1, rect.width - 16)
    const t = (clientX - innerLeft) / innerW
    return Math.max(0, Math.min(1, t))
  }, [])

  const releasePointer = (el: HTMLDivElement | null, pointerId: number | null) => {
    if (el != null && pointerId != null && el.hasPointerCapture?.(pointerId)) {
      try {
        el.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
    }
    if (activePointerIdRef.current === pointerId) {
      activePointerIdRef.current = null
    }
    draggingRef.current = false
  }

  const snapCenter = () => {
    if (!interactive || !onChangeRef.current) return
    const el = trackRef.current
    releasePointer(el, activePointerIdRef.current)
    onChangeRef.current(XF_CENTER)
  }

  const closeMenu = () => setMenuAnchor(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || !onChangeRef.current) return
    if (e.button !== 0) return
    e.preventDefault()
    const now = e.timeStamp
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      // End any capture from the first tap of the double-click.
      releasePointer(e.currentTarget, activePointerIdRef.current ?? e.pointerId)
      snapCenter()
      return
    }
    lastTapRef.current = now
    draggingRef.current = true
    activePointerIdRef.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    onChangeRef.current(valueFromClientX(e.clientX))
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !onChangeRef.current) return
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return
    onChangeRef.current(valueFromClientX(e.clientX))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return
    releasePointer(e.currentTarget, e.pointerId)
  }

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return
    releasePointer(e.currentTarget, e.pointerId)
  }

  const onLostPointerCapture = () => {
    draggingRef.current = false
    activePointerIdRef.current = null
  }

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!interactive || !onChangeRef.current) return
    e.preventDefault()
    snapCenter()
  }

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!canOpenMenu) return
    e.preventDefault()
    e.stopPropagation()
    setMenuAnchor({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuElRef.current?.contains(target) || trackRef.current?.contains(target)) return
      closeMenu()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Native non-passive wheel: relative jog, independent of click-hold drag.
  useEffect(() => {
    const el = trackRef.current
    if (!el || !interactive) return
    const onWheel = (e: WheelEvent) => {
      const change = onChangeRef.current
      if (!change) return
      // Don't mix absolute drag with relative scroll mid-gesture.
      if (draggingRef.current) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      const delta = crossfaderDeltaFromWheel({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      })
      e.preventDefault()
      e.stopPropagation()
      if (!delta) return
      change(applyCrossfaderWheelDelta(progressRef.current, delta))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [interactive])

  const lit = active || interactive

  return (
    <>
      <div
        className={`flex w-full flex-col items-center gap-1 ${className}`}
        role={interactive ? 'slider' : 'presentation'}
        aria-hidden={!lit && !interactive}
        aria-label={interactive ? 'Crossfader A to B' : undefined}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? 100 : undefined}
        aria-valuenow={interactive ? Math.round(pct) : undefined}
        aria-orientation={interactive ? 'horizontal' : undefined}
      >
        <div className="flex w-full items-center justify-between px-0.5 text-[8px] font-semibold uppercase tracking-wider text-gray-500">
          <span className={p < 0.45 ? 'text-amber-400/90' : ''}>A</span>
          <span
            className={`font-mono text-[9px] normal-case tracking-normal tabular-nums ${
              lit ? 'text-gray-500' : 'text-gray-600'
            }`}
          >
            {Math.round(pct)}%
          </span>
          <span className={p > 0.55 ? 'text-sky-400/90' : ''}>B</span>
        </div>
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onLostPointerCapture}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          data-mix-crossfader=""
          data-locked-by-auto-dj={lockedByAutoDj ? 'true' : undefined}
          title={
            interactive
              ? unlockedUnderAutoDj
                ? 'Manual XF · Auto DJ still on · right-click to relock'
                : 'Drag for absolute cut · scroll sideways for smooth jog · double-click to center'
              : lockedByAutoDj
                ? 'Auto DJ crossfader · right-click to unlock (keep Auto DJ)'
                : undefined
          }
          className={`relative h-9 w-full rounded-md border py-1 px-1.5 ${
            interactive
              ? unlockedUnderAutoDj
                ? 'cursor-ew-resize border-amber-400/55 bg-gradient-to-r from-gray-900 via-gray-950 to-gray-900 shadow-inner touch-none'
                : 'cursor-ew-resize border-violet-500/45 bg-gradient-to-r from-gray-900 via-gray-950 to-gray-900 shadow-inner touch-none'
              : lit
                ? 'border-amber-500/35 bg-gradient-to-r from-gray-900 via-gray-950 to-gray-900 shadow-inner'
                : 'border-gray-800 bg-gray-950/80 opacity-60'
          }`}
        >
          <div className="absolute inset-y-2 left-2 right-2 rounded-full bg-gray-800/90" />
          <div className="absolute inset-y-0 left-2 right-2">
            <div
              className={`absolute top-1/2 h-7 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border shadow-md ${
                interactive ? '' : 'transition-[left] duration-75 ease-linear'
              } ${
                lit
                  ? 'border-gray-400 bg-gradient-to-b from-gray-200 to-gray-400'
                  : 'border-gray-600 bg-gray-600'
              }`}
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {menuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuClamp.ref}
            {...menuClamp.rootProps}
            role="menu"
            aria-label="Crossfader options"
            data-mix-crossfader-menu=""
            data-allow-scroll-when-locked=""
            className="fixed w-[min(14rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-gray-700 bg-gray-950 py-1 shadow-2xl"
            style={menuClamp.style}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-800"
              onClick={() => {
                closeMenu()
                if (unlockedUnderAutoDj) onRelockToAutoDj?.()
                else onUnlockFromAutoDj?.()
              }}
            >
              {unlockedUnderAutoDj ? 'Relock to Auto DJ' : 'Unlock crossfader'}
            </button>
            <p className="px-3 pb-1.5 text-[10px] leading-snug text-gray-500">
              {unlockedUnderAutoDj
                ? 'Auto DJ resumes driving the crossfader.'
                : 'Keep Auto DJ on — you take the crossfader.'}
            </p>
          </div>,
          document.body,
        )}
    </>
  )
}
