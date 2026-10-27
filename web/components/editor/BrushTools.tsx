'use client'

import { forwardRef, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  BRUSH_MARK_CLASS,
  BRUSH_TONE_CLASS,
  brushDiameterPx,
  hideBrushCursor,
  placeBrushCursor,
  resizeBrushCursor,
  type BrushTone,
} from '@/lib/editor/brush'

export function BrushMark({ diameter, tone = 'restore' }: { diameter: number; tone?: BrushTone }) {
  return (
    <div
      aria-hidden
      className={`${BRUSH_MARK_CLASS} ${BRUSH_TONE_CLASS[tone]}`}
      style={{ width: diameter, height: diameter }}
    />
  )
}

export const BrushCursor = forwardRef<HTMLDivElement, { tone?: BrushTone }>(function BrushCursor({ tone = 'restore' }, ref) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute left-0 top-0 opacity-0 ${BRUSH_MARK_CLASS} ${BRUSH_TONE_CLASS[tone]}`}
      style={{ transform: 'translate(-50%, -50%)' }}
    />
  )
})

/** Follows the pointer with a circle of `diameter` CSS pixels. Re-sizes while the pointer is over the surface. */
export function useBrushCursor(diameter: number) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    resizeBrushCursor(ref.current, diameter)
  }, [diameter])

  return {
    ref,
    place: (event: ReactPointerEvent<HTMLElement>) => placeBrushCursor(ref.current, event, diameter),
    hide: (event?: ReactPointerEvent<HTMLElement>) => {
      if (event && event.buttons === 1) return
      hideBrushCursor(ref.current)
    },
  }
}

/**
 * Slider that pops a true-size brush circle while the value is being changed.
 * `radius` is a fraction of `surfaceWidth`, the same unit a stroke stores.
 */
export function BrushSizeControl({
  label,
  radius,
  min = 0.01,
  max = 0.12,
  surfaceWidth,
  tone = 'restore',
  onChange,
  onReset,
}: {
  label: string
  radius: number
  min?: number
  max?: number
  surfaceWidth: number
  tone?: BrushTone
  onChange: (radius: number) => void
  onReset: () => void
}) {
  const rootRef = useRef<HTMLLabelElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const diameter = brushDiameterPx(radius, surfaceWidth)
  const display = Math.round(radius * 100)
  const displayMin = Math.round(min * 100)
  const displayMax = Math.round(max * 100)

  useEffect(() => {
    if (!open) return
    const hide = () => setOpen(false)
    window.addEventListener('pointerup', hide)
    window.addEventListener('pointercancel', hide)
    return () => {
      window.removeEventListener('pointerup', hide)
      window.removeEventListener('pointercancel', hide)
    }
  }, [open])

  function reveal() {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor(rect)
    setOpen(true)
  }

  const pad = 16
  const box = diameter + pad * 2
  const labelSpace = 22
  const height = box + labelSpace
  let left = 8
  let top = 8
  if (anchor && typeof window !== 'undefined') {
    left = Math.max(8, anchor.left - box - 12)
    top = Math.max(8, Math.min(window.innerHeight - height - 8, anchor.top + anchor.height / 2 - height / 2))
  }

  return (
    <label ref={rootRef} className="block space-y-1">
      <span
        title="Double-click to reset"
        onDoubleClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onReset()
        }}
        className="flex cursor-default select-none items-center justify-between text-[11px] text-white/70"
      >
        {label}
        <span className="tabular-nums text-white/40">{display}</span>
      </span>
      <input
        type="range"
        min={displayMin}
        max={displayMax}
        value={display}
        onPointerDown={reveal}
        onKeyDown={reveal}
        onBlur={() => setOpen(false)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="w-full accent-white"
      />
      {open && anchor && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed z-[120] flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 bg-zinc-950/95 p-4 shadow-2xl"
              style={{ left, top, width: box }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-3 rounded-xl opacity-70"
                style={{
                  backgroundColor: '#141414',
                  backgroundImage:
                    'linear-gradient(45deg, #2c2c2c 25%, transparent 25%), linear-gradient(-45deg, #2c2c2c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2c2c2c 75%), linear-gradient(-45deg, transparent 75%, #2c2c2c 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                }}
              />
              <BrushMark diameter={diameter} tone={tone} />
              <span className="relative text-xs tabular-nums text-white/80">{display}</span>
            </div>,
            document.body,
          )
        : null}
    </label>
  )
}
