'use client'

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import ShareClipWindowWaveform from '@/components/shares/ShareClipWindowWaveform'
import { assignMediaSrcIfChanged } from '@/lib/audio/media-src'
import {
  clampSnippetWindow,
  resolveStoryClipDuration,
  storyClipLengthChoices,
  storyClipLengthLabel,
  type StoryClipLengthChoice,
} from '@/lib/shares/story-snippet'

type Props = {
  audioUrl: string
  startSec: number
  durationSec: number
  clipLength: StoryClipLengthChoice
  onStartChange: (startSec: number) => void
  onClipLengthChange: (length: StoryClipLengthChoice) => void
  onTrackDuration?: (durationSec: number) => void
  /** Track picker, shown on the play row. */
  audioControl?: ReactNode
  /** Rendered under the clip-length row. */
  footer?: ReactNode
  /** Waveform look controls, rendered under the clip window. */
  afterWaveform?: ReactNode
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Shared with the story preview so Chrome plays one file and the clip window follows it. */
export type VinylAudition = {
  toggle: () => Promise<void>
  currentTime: () => number
  playing: () => boolean
  subscribe: (listener: () => void) => () => void
}

/** Clip window for the story / reel, with 15s steps up to a minute or the full song. */
export default function VinylSectionPlayer({
  audioUrl,
  startSec,
  durationSec,
  clipLength,
  onStartChange,
  onClipLengthChange,
  onTrackDuration,
  audioControl,
  footer,
  afterWaveform,
  auditionRef,
}: Props & { auditionRef?: MutableRefObject<VinylAudition | null> }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startRef = useRef(startSec)
  const durationSecRef = useRef(durationSec)
  const progressRef = useRef(0)
  const listenersRef = useRef(new Set<() => void>())
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  startRef.current = startSec
  durationSecRef.current = durationSec

  const windowed = clampSnippetWindow({
    startSec,
    durationSec,
    trackDurationSec: duration || undefined,
  })
  const endSec = windowed.startSec + windowed.durationSec

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    const wasPlaying = !audio.paused
    const changed = assignMediaSrcIfChanged(audio, audioUrl)
    if (!changed) return
    setDuration(0)
    progressRef.current = 0
    setPlaying(false)
    if (!wasPlaying) return
    const start = () => {
      audio.currentTime = startRef.current
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
    if (audio.readyState >= 1) start()
    else audio.addEventListener('loadedmetadata', start, { once: true })
  }, [audioUrl])

  useEffect(() => {
    if (playing || duration <= 0) return
    progressRef.current = startSec / duration
  }, [playing, duration, startSec])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      const audio = audioRef.current
      if (audio && duration > 0) progressRef.current = audio.currentTime / duration
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration])

  function notify() {
    listenersRef.current.forEach((listener) => listener())
  }

  function stopAtWindow() {
    const audio = audioRef.current
    if (!audio) return
    const end = startRef.current + durationSecRef.current
    if (audio.currentTime < end - 0.05) return
    audio.pause()
    audio.currentTime = startRef.current
    if (duration > 0) progressRef.current = startRef.current / duration
    setPlaying(false)
    notify()
  }

  function applyStart(raw: number) {
    const next = clampSnippetWindow({
      startSec: raw,
      durationSec: durationSecRef.current,
      trackDurationSec: duration || undefined,
    }).startSec
    startRef.current = next
    if (!playing && duration > 0) progressRef.current = next / duration
    onStartChange(next)
    const audio = audioRef.current
    if (audio && !audio.paused) {
      audio.currentTime = next
      if (duration > 0) progressRef.current = next / duration
    }
  }

  async function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      if (duration > 0) progressRef.current = startRef.current / duration
      setPlaying(false)
      notify()
      return
    }
    const start = clampSnippetWindow({
      startSec: startRef.current,
      durationSec: durationSecRef.current,
      trackDurationSec: Number.isFinite(audio.duration) ? audio.duration : undefined,
    }).startSec
    audio.currentTime = start
    if (duration > 0) progressRef.current = start / duration
    try {
      await audio.play()
      setPlaying(true)
      notify()
    } catch {
      setPlaying(false)
      notify()
    }
  }

  if (auditionRef) {
    auditionRef.current = {
      toggle,
      currentTime: () => audioRef.current?.currentTime ?? startRef.current,
      playing: () => Boolean(audioRef.current && !audioRef.current.paused),
      subscribe: (listener) => {
        listenersRef.current.add(listener)
        return () => listenersRef.current.delete(listener)
      },
    }
  }

  return (
    <div className="w-full" data-testid="vinyl-section-player">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="metadata"
        onLoadedMetadata={(event) => {
          const next = event.currentTarget.duration
          const safe = Number.isFinite(next) ? next : 0
          setDuration(safe)
          if (safe > 0) onTrackDuration?.(safe)
        }}
        onTimeUpdate={stopAtWindow}
        onEnded={() => {
          setPlaying(false)
          notify()
        }}
      />
      <ShareClipWindowWaveform
        file={audioUrl}
        trackDurationSec={duration}
        startSec={windowed.startSec}
        windowSec={windowed.durationSec}
        progressRef={progressRef}
        onPickStart={applyStart}
      />
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        {audioControl}
        <button
          type="button"
          onClick={() => void toggle()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200"
          aria-label={playing ? 'Pause clip preview' : 'Play clip preview'}
        >
          <span className="text-xs leading-none">{playing ? '❚❚' : '▶'}</span>
        </button>
        <p className="text-sm tabular-nums text-white/90">
          {formatTime(windowed.startSec)}
          <span className="text-zinc-500"> → </span>
          {formatTime(endSec)}
          <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            {clipLength === 'full' ? 'full song' : `${Math.round(windowed.durationSec)}s clip`}
          </span>
        </p>
      </div>
      <div className="mt-2 flex justify-center">
      <div
        className="inline-flex flex-wrap rounded-lg border border-zinc-700 p-0.5"
        data-testid="story-clip-length"
      >
        {storyClipLengthChoices(duration || undefined).map((choice) => {
          const active = choice === clipLength
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={active}
              data-testid={`story-clip-length-${choice}`}
              onClick={() => {
                onClipLengthChange(choice)
                const nextDuration = resolveStoryClipDuration(choice, duration || undefined)
                const nextStart = clampSnippetWindow({
                  startSec: choice === 'full' ? 0 : startRef.current,
                  durationSec: nextDuration,
                  trackDurationSec: duration || undefined,
                }).startSec
                if (Math.abs(nextStart - startRef.current) > 0.05) onStartChange(nextStart)
              }}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {storyClipLengthLabel(choice)}
            </button>
          )
        })}
      </div>
      </div>
      {footer ? <div className="mt-3 flex flex-col items-center gap-2">{footer}</div> : null}
      {afterWaveform}
    </div>
  )
}
