'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clampSnippetWindow, STORY_SNIPPET_DURATION_SEC } from '@/lib/shares/story-snippet'

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export type ShareStoryClipPickerProps = {
  open: boolean
  title: string
  artist?: string
  trackDurationSec: number
  /** Initial window start (e.g. current playhead). */
  initialStartSec?: number
  snippetDurationSec?: number
  busy?: boolean
  busyLabel?: string | null
  onCancel: () => void
  onConfirm: (startSec: number) => void
}

/**
 * Modal to pick which 15s of a track becomes the Instagram Story MP4.
 */
export default function ShareStoryClipPicker({
  open,
  title,
  artist,
  trackDurationSec,
  initialStartSec = 0,
  snippetDurationSec = STORY_SNIPPET_DURATION_SEC,
  busy = false,
  busyLabel = null,
  onCancel,
  onConfirm,
}: ShareStoryClipPickerProps) {
  const trackDur = Math.max(0, Number(trackDurationSec) || 0)
  const windowSec = Math.min(
    snippetDurationSec,
    trackDur > 0 ? trackDur : snippetDurationSec,
  )
  const maxStart = Math.max(0, trackDur - windowSec)

  const [startSec, setStartSec] = useState(0)

  useEffect(() => {
    if (!open) return
    const clamped = clampSnippetWindow({
      startSec: initialStartSec,
      durationSec: windowSec,
      trackDurationSec: trackDur || undefined,
    })
    setStartSec(clamped.startSec)
  }, [open, initialStartSec, windowSec, trackDur])

  const endSec = useMemo(
    () => Math.min(trackDur || startSec + windowSec, startSec + windowSec),
    [startSec, trackDur, windowSec],
  )

  const startRatio = trackDur > 0 ? startSec / trackDur : 0
  const widthRatio = trackDur > 0 ? windowSec / trackDur : 1

  const onRangeChange = useCallback(
    (value: number) => {
      const next = clampSnippetWindow({
        startSec: value,
        durationSec: windowSec,
        trackDurationSec: trackDur || undefined,
      }).startSec
      setStartSec(next)
    },
    [trackDur, windowSec],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 px-4 pb-6 pt-10 sm:items-center sm:pb-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-clip-title"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className="w-full max-w-md border border-white/15 bg-[#0c0c0c] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="share-clip-title"
          className="font-[family-name:var(--font-six-caps)] text-2xl tracking-wide text-white"
        >
          Pick your {Math.round(windowSec)}s
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {title}
          {artist ? <span className="text-zinc-600"> · {artist}</span> : null}
        </p>
        <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          Instagram Story · MPEG-4
        </p>

        <div className="mt-5">
          <div className="relative h-10 overflow-hidden rounded-sm bg-white/5 ring-1 ring-white/10">
            <div
              className="absolute inset-y-1 rounded-sm bg-white/25"
              style={{
                left: `${startRatio * 100}%`,
                width: `${Math.max(4, widthRatio * 100)}%`,
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-[10px] tabular-nums text-zinc-500">
              <span>0:00</span>
              <span>{formatTime(trackDur)}</span>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="sr-only">Clip start</span>
            <input
              type="range"
              min={0}
              max={maxStart || 0}
              step={0.1}
              value={Math.min(startSec, maxStart)}
              disabled={busy || maxStart <= 0}
              onChange={(e) => onRangeChange(Number(e.target.value))}
              className="w-full accent-white disabled:opacity-40"
            />
          </label>

          <p className="mt-2 text-center text-sm tabular-nums text-white/90">
            {formatTime(startSec)}
            <span className="text-zinc-500"> → </span>
            {formatTime(endSec)}
            <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              {Math.round(windowSec)}s clip
            </span>
          </p>
        </div>

        {busyLabel ? (
          <p className="mt-4 text-center text-xs text-zinc-400" role="status">
            {busyLabel}
          </p>
        ) : (
          <p className="mt-4 text-center text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Drag to choose the section fans hear
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(startSec)}
            className="flex-1 rounded-full border border-white/25 bg-white px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-black transition hover:bg-zinc-100 disabled:opacity-40"
          >
            {busy ? 'Rendering…' : 'Export MP4'}
          </button>
        </div>
      </div>
    </div>
  )
}
