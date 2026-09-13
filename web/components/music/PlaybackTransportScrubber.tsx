'use client'

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'

export type PlaybackTransportScrubberHandle = {
  /** Paint elapsed time + scrubber fill without a React commit. */
  update: (timeSec: number, durationSec?: number) => void
  /** Range element — expanded bar uses this for seek-preview hover math. */
  getRangeElement: () => HTMLInputElement | null
}

type Variant = 'mini-mobile' | 'mini-desktop' | 'expanded'

type Props = {
  duration: number
  initialTime?: number
  onSeek: (timeSec: number) => void
  variant?: Variant
  onHoverPreview?: (timeSec: number | null) => void
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const PlaybackTransportScrubberInner = forwardRef<PlaybackTransportScrubberHandle, Props>(
  function PlaybackTransportScrubber(
    { duration, initialTime = 0, onSeek, variant = 'mini-desktop', onHoverPreview },
    ref,
  ) {
    const rangeRef = useRef<HTMLInputElement>(null)
    const elapsedRef = useRef<HTMLSpanElement>(null)
    const durationRef = useRef<HTMLSpanElement>(null)
    const durationCacheRef = useRef(duration)
    const draggingRef = useRef(false)

    const applyPaint = useCallback((timeSec: number, durationSec: number) => {
      durationCacheRef.current = durationSec
      const safeTime = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0
      const progress = durationSec > 0 ? (safeTime / durationSec) * 100 : 0
      const range = rangeRef.current
      if (range && !draggingRef.current) {
        range.value = String(safeTime)
        range.max = String(Math.max(0, durationSec))
        range.style.background = `linear-gradient(to right, #fff 0%, #fff ${progress}%, #374151 ${progress}%, #374151 100%)`
      }
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(safeTime)
      if (durationRef.current) durationRef.current.textContent = formatTime(durationSec)
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        update: (timeSec, durationSec) => {
          applyPaint(timeSec, durationSec ?? durationCacheRef.current)
        },
        getRangeElement: () => rangeRef.current,
      }),
      [applyPaint],
    )

    useEffect(() => {
      applyPaint(initialTime, duration)
    }, [applyPaint, duration, initialTime])

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = parseFloat(e.target.value)
      if (!Number.isFinite(next)) return
      onSeek(next)
      applyPaint(next, durationCacheRef.current)
    }

    const rangeClass =
      variant === 'mini-mobile'
        ? 'music-player-scrubber h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-700 touch-manipulation'
        : variant === 'mini-desktop'
          ? 'h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-gray-700 touch-manipulation'
          : 'h-1 w-full cursor-pointer appearance-none rounded-lg bg-gray-700'

    const elapsedClass =
      variant === 'mini-mobile'
        ? 'w-10 shrink-0 text-right text-[11px] leading-none tabular-nums text-gray-400'
        : variant === 'mini-desktop'
          ? 'w-9 shrink-0 text-right text-[10px] tabular-nums text-gray-500 sm:w-10'
          : 'hidden w-10 shrink-0 text-right text-xs text-gray-400 lg:block'

    const durationClass =
      variant === 'mini-mobile'
        ? 'w-10 shrink-0 text-left text-[11px] leading-none tabular-nums text-gray-400'
        : variant === 'mini-desktop'
          ? 'w-9 shrink-0 text-[10px] tabular-nums text-gray-500 sm:w-10'
          : 'hidden w-10 shrink-0 text-xs text-gray-400 lg:block'

    const rowClass =
      variant === 'mini-mobile'
        ? 'flex h-8 min-w-0 items-center gap-2'
        : variant === 'mini-desktop'
          ? 'flex min-w-0 flex-1 basis-0 items-center gap-1.5 px-1 sm:min-w-[60%] sm:px-2'
          : 'flex w-full min-w-0 flex-1 items-center gap-2'

    return (
      <div className={rowClass}>
        <span ref={elapsedRef} className={elapsedClass}>
          {formatTime(initialTime)}
        </span>
        <div className="relative min-w-0 flex-1">
          <input
            ref={rangeRef}
            type="range"
            min={0}
            max={Math.max(0, duration)}
            defaultValue={initialTime}
            onChange={onChange}
            onPointerDown={() => {
              draggingRef.current = true
            }}
            onPointerUp={() => {
              draggingRef.current = false
            }}
            onPointerCancel={() => {
              draggingRef.current = false
            }}
            onMouseMove={
              onHoverPreview
                ? (e) => {
                    const el = rangeRef.current
                    if (!el || !durationCacheRef.current) return
                    const rect = el.getBoundingClientRect()
                    const pct = (e.clientX - rect.left) / rect.width
                    onHoverPreview(Math.max(0, Math.min(1, pct)) * durationCacheRef.current)
                  }
                : undefined
            }
            onMouseLeave={onHoverPreview ? () => onHoverPreview(null) : undefined}
            className={rangeClass}
            title="Seek through track"
            aria-label="Seek through track"
          />
        </div>
        <span ref={durationRef} className={durationClass}>
          {formatTime(duration)}
        </span>
      </div>
    )
  },
)

export const PlaybackTransportScrubber = memo(PlaybackTransportScrubberInner)
