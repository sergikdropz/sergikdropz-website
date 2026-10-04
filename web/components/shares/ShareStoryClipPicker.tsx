'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import ShareClipWindowWaveform from '@/components/shares/ShareClipWindowWaveform'
import type { ShareScrubApi } from '@/components/shares/ShareMiniPlayer'
import { clampSnippetWindow, STORY_SNIPPET_DURATION_SEC } from '@/lib/shares/story-snippet'
import { FloatingMenuPortal } from '@/components/ui/FloatingMenuPortal'

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
  file?: string
  trackId?: string
  audioFileId?: string
  /** Live share player — preview the 15s window without a second <audio>. */
  scrubApiRef?: MutableRefObject<ShareScrubApi | null>
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
  file,
  trackId,
  audioFileId,
  scrubApiRef,
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
  const [previewing, setPreviewing] = useState(false)
  const previewingRef = useRef(false)
  const startSecRef = useRef(0)
  const progressRef = useRef(0)
  previewingRef.current = previewing
  startSecRef.current = startSec

  const applyStart = useCallback(
    (value: number, opts?: { seek?: boolean }) => {
      const next = clampSnippetWindow({
        startSec: value,
        durationSec: windowSec,
        trackDurationSec: trackDur || undefined,
      }).startSec
      setStartSec(next)
      startSecRef.current = next
      progressRef.current = trackDur > 0 ? next / trackDur : 0
      if (opts?.seek !== false) {
        scrubApiRef?.current?.seek(next)
      }
      return next
    },
    [scrubApiRef, trackDur, windowSec],
  )

  useEffect(() => {
    if (!open) return
    const clamped = clampSnippetWindow({
      startSec: initialStartSec,
      durationSec: windowSec,
      trackDurationSec: trackDur || undefined,
    })
    setStartSec(clamped.startSec)
    startSecRef.current = clamped.startSec
    progressRef.current = trackDur > 0 ? clamped.startSec / trackDur : 0
    setPreviewing(false)
    previewingRef.current = false
  }, [open, initialStartSec, windowSec, trackDur])

  useEffect(() => {
    if (open && !busy) return
    if (!previewingRef.current) return
    scrubApiRef?.current?.pause()
    setPreviewing(false)
    previewingRef.current = false
    progressRef.current = trackDur > 0 ? startSecRef.current / trackDur : 0
  }, [busy, open, scrubApiRef, trackDur])

  useEffect(() => {
    if (!open || !previewing) return
    let raf = 0
    const endPad = 0.04
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const api = scrubApiRef?.current
      if (!api) return
      const pos = api.getPosition()
      const start = startSecRef.current
      const end = Math.min(trackDur || start + windowSec, start + windowSec)
      if (pos.currentTime >= end - endPad) {
        api.seek(start)
        progressRef.current = trackDur > 0 ? start / trackDur : 0
        return
      }
      progressRef.current = trackDur > 0 ? pos.currentTime / trackDur : 0
      if (!pos.playing) {
        setPreviewing(false)
        previewingRef.current = false
        progressRef.current = trackDur > 0 ? start / trackDur : 0
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open, previewing, scrubApiRef, trackDur, windowSec])

  const endSec = useMemo(
    () => Math.min(trackDur || startSec + windowSec, startSec + windowSec),
    [startSec, trackDur, windowSec],
  )

  const onRangeChange = useCallback(
    (value: number) => {
      applyStart(value)
    },
    [applyStart],
  )

  const togglePreview = useCallback(() => {
    if (busy) return
    const api = scrubApiRef?.current
    if (!api) return
    if (previewingRef.current) {
      api.pause()
      setPreviewing(false)
      previewingRef.current = false
      progressRef.current = trackDur > 0 ? startSecRef.current / trackDur : 0
      return
    }
    api.seek(startSecRef.current)
    progressRef.current = trackDur > 0 ? startSecRef.current / trackDur : 0
    api.play()
    setPreviewing(true)
    previewingRef.current = true
  }, [busy, scrubApiRef, trackDur])

  const canPreview = Boolean(scrubApiRef) && !busy

  if (!open) return null

  return (
    <FloatingMenuPortal>
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
          <ShareClipWindowWaveform
            file={file}
            trackId={trackId}
            audioFileId={audioFileId}
            trackDurationSec={trackDur}
            startSec={startSec}
            windowSec={windowSec}
            progressRef={progressRef}
            disabled={busy}
            onPickStart={applyStart}
          />

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

          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={!canPreview}
              onClick={togglePreview}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200 disabled:opacity-40"
              aria-label={previewing ? 'Pause clip preview' : 'Play clip preview'}
            >
              <span className="text-xs leading-none">{previewing ? '❚❚' : '▶'}</span>
            </button>
            <p className="text-sm tabular-nums text-white/90">
              {formatTime(startSec)}
              <span className="text-zinc-500"> → </span>
              {formatTime(endSec)}
              <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                {Math.round(windowSec)}s clip
              </span>
            </p>
          </div>
        </div>

        {busyLabel ? (
          <p className="mt-4 text-center text-xs text-zinc-400" role="status">
            {busyLabel}
          </p>
        ) : (
          <p className="mt-4 text-center text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            {canPreview
              ? 'Play the 15s fans hear · drag the waveform to move it'
              : 'Drag to choose the section fans hear'}
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
    </FloatingMenuPortal>
  )
}
