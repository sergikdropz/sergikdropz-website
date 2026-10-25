'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { FaFacebook, FaInstagram, FaLink, FaTiktok, FaWhatsapp, FaYoutube } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
import ShareClipWindowWaveform from '@/components/shares/ShareClipWindowWaveform'
import type { ShareScrubApi } from '@/components/shares/ShareMiniPlayer'
import {
  CLIP_SHARE_TARGETS,
  clipShareCaption,
  type ClipPlatformId,
  type ClipVideoPlatform,
  socialIntentUrl,
  timedListenUrl,
} from '@/lib/shares/clip-share'
import { clampSnippetWindow, STORY_SNIPPET_DURATION_SEC } from '@/lib/shares/story-snippet'
import { FloatingMenuPortal } from '@/components/ui/FloatingMenuPortal'

const PLATFORM_ICONS: Record<ClipPlatformId, ReactNode> = {
  instagram: <FaInstagram />,
  tiktok: <FaTiktok />,
  youtube: <FaYoutube />,
  facebook: <FaFacebook />,
  x: <FaXTwitter />,
  whatsapp: <FaWhatsapp />,
  copy: <FaLink />,
}

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
  /** Listen page for this track. Link icons open that network with a timed link. */
  listenUrl?: string | null
  onCancel: () => void
  onConfirm: (startSec: number) => void
  /** Render the clip, then ask for a follow-up tap that hands the file to the app. */
  onSendVideo?: (platform: ClipVideoPlatform, startSec: number) => void
  /** Clip is rendered. The next tap on that platform shares it while the browser still has a user gesture. */
  readyShare?: {
    platform: ClipVideoPlatform
    actionLabel: string
    hint: string
    onShare: () => void
  } | null
  /** Fired when the 15s window moves, so a previously rendered clip is discarded. */
  onWindowChange?: () => void
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
  listenUrl = null,
  onCancel,
  onConfirm,
  onSendVideo,
  readyShare = null,
  onWindowChange,
}: ShareStoryClipPickerProps) {
  const trackDur = Math.max(0, Number(trackDurationSec) || 0)
  const windowSec = Math.min(
    snippetDurationSec,
    trackDur > 0 ? trackDur : snippetDurationSec,
  )
  const maxStart = Math.max(0, trackDur - windowSec)

  const [startSec, setStartSec] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const [sheetNotice, setSheetNotice] = useState<string | null>(null)
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
      onWindowChange?.()
      return next
    },
    [onWindowChange, scrubApiRef, trackDur, windowSec],
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
    setSheetNotice(null)
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
  const canRedirect = Boolean(listenUrl) && !busy

  const openPlatform = useCallback(
    async (platform: ClipPlatformId) => {
      if (busy) return
      const target = CLIP_SHARE_TARGETS.find((row) => row.id === platform)
      if (!target) return
      if (target.kind === 'video') {
        if (readyShare && readyShare.platform === platform) {
          readyShare.onShare()
          return
        }
        if (onSendVideo) onSendVideo(platform as ClipVideoPlatform, startSecRef.current)
        else onConfirm(startSecRef.current)
        return
      }
      if (!listenUrl) return
      const url = timedListenUrl(listenUrl, {
        startSec: startSecRef.current,
        trackId,
        platform,
        campaign: title,
        base: window.location.origin,
      })
      const text = clipShareCaption({
        title,
        artist,
        url,
        startSec: startSecRef.current,
      })
      if (platform === 'copy') {
        try {
          await navigator.clipboard.writeText(url)
          setSheetNotice(`Link copied · starts at ${formatTime(startSecRef.current)}`)
        } catch {
          setSheetNotice('Could not copy the link')
        }
        return
      }
      const intent = socialIntentUrl(platform as 'x' | 'facebook' | 'whatsapp', { text, url })
      window.open(intent, '_blank', 'noopener,noreferrer')
      setSheetNotice(`Opened ${target.label} at ${formatTime(startSecRef.current)}`)
    },
    [artist, busy, listenUrl, onConfirm, onSendVideo, readyShare, title, trackId],
  )

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
          One moment · send it to the platform
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
        ) : readyShare ? (
          <p className="mt-4 text-center text-xs text-zinc-300" role="status">
            {readyShare.hint}
          </p>
        ) : sheetNotice ? (
          <p className="mt-4 text-center text-xs text-zinc-300" role="status">
            {sheetNotice}
          </p>
        ) : (
          <p className="mt-4 text-center text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            {canPreview
              ? 'Play the 15s fans hear · drag the waveform to move it'
              : 'Drag to choose the section fans hear'}
          </p>
        )}

        {readyShare && !busy ? (
          <button
            type="button"
            onClick={() => readyShare.onShare()}
            className="mt-4 w-full rounded-full bg-white px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200"
          >
            {readyShare.actionLabel}
          </button>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-center gap-3" role="group" aria-label="Send this moment">
          {CLIP_SHARE_TARGETS.map((platform) => {
            const disabled = busy || (platform.kind === 'redirect' && platform.id !== 'copy' && !canRedirect) || (platform.id === 'copy' && !canRedirect)
            return (
              <button
                key={platform.id}
                type="button"
                disabled={disabled}
                onClick={() => void openPlatform(platform.id)}
                className="group flex w-14 flex-col items-center gap-1.5 disabled:opacity-40"
                aria-label={
                  readyShare && readyShare.platform === platform.id
                    ? readyShare.actionLabel
                    : platform.kind === 'video'
                      ? `Send video to ${platform.label}`
                      : `Open ${platform.label}`
                }
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg text-white transition group-hover:border-white/40 group-hover:bg-white group-hover:text-black group-disabled:group-hover:border-white/15 group-disabled:group-hover:bg-white/5 group-disabled:group-hover:text-white">
                  {PLATFORM_ICONS[platform.id]}
                </span>
                <span className="text-[9px] uppercase tracking-[0.12em] text-zinc-400 group-hover:text-white">
                  {platform.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
    </FloatingMenuPortal>
  )
}
