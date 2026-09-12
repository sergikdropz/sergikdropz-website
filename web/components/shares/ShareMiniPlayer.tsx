'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { ShareTrackPayload } from '@/lib/shares/types'
import ShareDockWaveformScrubber from '@/components/shares/ShareDockWaveformScrubber'
import { VinylScrubAudio } from '@/lib/shares/vinyl-scrub-audio'
import { relockVinylTimeline, setVinylTimelineSource } from '@/lib/shares/vinyl-spin-clock'

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export type VinylScrubTick = {
  deltaSeconds: number
  deltaDegrees: number
  dtMs: number
}

export type ShareScrubApi = {
  seek: (seconds: number) => void
  play: () => void
  pause: () => void
  getPosition: () => { currentTime: number; duration: number; playing: boolean }
  /** Enter turntable scrub — keeps disc live; starts scratch engine. */
  beginVinylScrub: () => void
  /** Seek + reverse/speed grains + scratch noise from platter motion. */
  tickVinylScrub: (tick: VinylScrubTick) => void
  /** Exit scrub; resume playback if requested. */
  endVinylScrub: (resume: boolean) => void
}

type ShareMiniPlayerProps = {
  tracks: ShareTrackPayload[]
  title: string
  subtitle?: string
  artwork?: string
  /** Compact embed chrome */
  compact?: boolean
  /** Bottom dock for listen pages — no inline artwork */
  dock?: boolean
  className?: string
  onPlayed?: () => void
  onPlayingChange?: (playing: boolean) => void
  onTrackChange?: (index: number, track: ShareTrackPayload) => void
  /** Controlled index (optional) */
  activeIndex?: number
  onActiveIndexChange?: (index: number) => void
  /** Imperative seek/play bridge for vinyl scrubbing */
  scrubApiRef?: MutableRefObject<ShareScrubApi | null>
}

export default function ShareMiniPlayer({
  tracks,
  title,
  subtitle,
  artwork,
  compact = false,
  dock = false,
  className = '',
  onPlayed,
  onPlayingChange,
  onTrackChange,
  activeIndex,
  onActiveIndexChange,
  scrubApiRef,
}: ShareMiniPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [internalIndex, setInternalIndex] = useState(0)
  const index = activeIndex ?? internalIndex
  const setIndex = useCallback(
    (next: number | ((prev: number) => number)) => {
      const resolved = typeof next === 'function' ? next(index) : next
      if (onActiveIndexChange) onActiveIndexChange(resolved)
      else setInternalIndex(resolved)
    },
    [index, onActiveIndexChange],
  )
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const playedOnce = useRef(false)
  const playingRef = useRef(playing)
  const currentTimeRef = useRef(currentTime)
  const durationRef = useRef(duration)
  const scrubAudioRef = useRef<VinylScrubAudio | null>(null)
  const vinylScrubbingRef = useRef(false)
  playingRef.current = playing
  currentTimeRef.current = currentTime
  durationRef.current = duration

  useEffect(() => {
    onPlayingChange?.(playing)
  }, [playing, onPlayingChange])

  useEffect(() => {
    setVinylTimelineSource(() => {
      const el = audioRef.current
      return el?.currentTime ?? currentTimeRef.current
    })
    return () => setVinylTimelineSource(null)
  }, [])

  useEffect(() => {
    return () => {
      scrubAudioRef.current?.dispose()
      scrubAudioRef.current = null
    }
  }, [])

  const track = tracks[index] || null
  const src = useMemo(() => {
    if (!track) return ''
    return track.playbackUrl || track.file || ''
  }, [track])

  const cover = artwork || track?.artwork

  useEffect(() => {
    if (track) onTrackChange?.(index, track)
  }, [index, track, onTrackChange])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !src) return
    el.src = src
    el.load()
    setCurrentTime(0)
    setDuration(Number(track?.duration) || 0)
    setError(null)
    if (!scrubAudioRef.current) scrubAudioRef.current = new VinylScrubAudio()
    void scrubAudioRef.current.prepareTrack(src)
    if (playing) {
      void el.play().catch((err) => {
        setPlaying(false)
        setError(err?.message || 'Playback blocked — tap play')
      })
    }
    // intentionally omit `playing` so track changes reload without fighting pause
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, track?.id])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
      return
    }
    void el
      .play()
      .then(() => {
        setPlaying(true)
        setError(null)
        if (!playedOnce.current) {
          playedOnce.current = true
          onPlayed?.()
        }
      })
      .catch((err) => {
        setError(err?.message || 'Could not play')
      })
  }, [playing, onPlayed])

  const seek = useCallback((value: number) => {
    const el = audioRef.current
    if (!el) return
    const dur = durationRef.current || el.duration || 0
    const next = Math.max(0, dur > 0 ? Math.min(dur, value) : value)
    el.currentTime = next
    setCurrentTime(next)
  }, [])

  const playFromApi = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    void el
      .play()
      .then(() => {
        setPlaying(true)
        setError(null)
        if (!playedOnce.current) {
          playedOnce.current = true
          onPlayed?.()
        }
      })
      .catch((err) => {
        setError(err?.message || 'Could not play')
      })
  }, [onPlayed])

  const pauseFromApi = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    el.pause()
    setPlaying(false)
  }, [])

  useEffect(() => {
    if (!scrubApiRef) return
    scrubApiRef.current = {
      seek: (seconds: number) => {
        const el = audioRef.current
        if (!el) return
        const dur = el.duration || durationRef.current || Number.POSITIVE_INFINITY
        const next = Math.max(0, Number.isFinite(dur) ? Math.min(dur, seconds) : seconds)
        el.currentTime = next
        currentTimeRef.current = next
        setCurrentTime(next)
      },
      play: playFromApi,
      pause: pauseFromApi,
      getPosition: () => {
        const el = audioRef.current
        return {
          currentTime: el?.currentTime ?? currentTimeRef.current,
          duration: el?.duration || durationRef.current || 0,
          playing: playingRef.current,
        }
      },
      beginVinylScrub: () => {
        const el = audioRef.current
        vinylScrubbingRef.current = true
        if (!scrubAudioRef.current) scrubAudioRef.current = new VinylScrubAudio()
        void scrubAudioRef.current.begin()
        // Pause media clock so currentTime only moves with the platter —
        // keep React `playing` as-is so the disc motor stay armed.
        if (el && !el.paused) el.pause()
      },
      tickVinylScrub: (tick) => {
        const el = audioRef.current
        if (!el || !vinylScrubbingRef.current) return
        const dur = el.duration || durationRef.current || Number.POSITIVE_INFINITY
        const next = Math.max(
          0,
          Number.isFinite(dur) ? Math.min(dur, el.currentTime + tick.deltaSeconds) : el.currentTime + tick.deltaSeconds,
        )
        el.currentTime = next
        currentTimeRef.current = next
        setCurrentTime(next)
        scrubAudioRef.current?.tick({
          deltaSeconds: tick.deltaSeconds,
          deltaDegrees: tick.deltaDegrees,
          dtMs: tick.dtMs,
          currentTime: next,
        })
      },
      endVinylScrub: (resume) => {
        const el = audioRef.current
        vinylScrubbingRef.current = false
        scrubAudioRef.current?.end()
        relockVinylTimeline(el?.currentTime ?? currentTimeRef.current)
        if (resume) playFromApi()
        else {
          if (el && !el.paused) el.pause()
          setPlaying(false)
        }
      },
    }
    return () => {
      scrubApiRef.current = null
    }
  }, [scrubApiRef, playFromApi, pauseFromApi])

  const playNext = useCallback(() => {
    if (index >= tracks.length - 1) {
      setPlaying(false)
      return
    }
    setIndex((i) => i + 1)
    setPlaying(true)
  }, [index, tracks.length, setIndex])

  const playPrev = useCallback(() => {
    if (currentTime > 2) {
      seek(0)
      return
    }
    if (index <= 0) {
      seek(0)
      return
    }
    setIndex((i) => i - 1)
    setPlaying(true)
  }, [currentTime, index, seek, setIndex])

  if (!track) {
    return (
      <div className={`rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400 ${className}`}>
        Nothing to play.
      </div>
    )
  }

  const displayTitle = tracks.length > 1 ? track.title : title
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  if (dock) {
    const totalLabel = formatTime(duration || track.duration || 0)
    return (
      <div className={`bg-transparent text-white ${className}`}>
        <audio
          ref={audioRef}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || Number(track.duration) || 0)}
          onEnded={playNext}
          onError={() => setError('Audio failed to load')}
        />
        <div className="mx-auto max-w-3xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-4">
          <ShareDockWaveformScrubber
            file={track.file}
            trackId={track.id}
            audioFileId={track.audioFileId}
            progress={progress}
            duration={duration || track.duration || 0}
            currentTime={currentTime}
            onSeek={seek}
          />
          <div className="mt-1 mb-3 flex justify-between tabular-nums text-[11px] leading-none text-zinc-500">
            <span>{formatTime(currentTime)}</span>
            <span>{totalLabel}</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold sm:text-base">{displayTitle}</p>
              <p className="truncate text-xs text-zinc-400 sm:text-sm">
                {track.artist}
                {subtitle ? ` · ${subtitle}` : ''}
                {tracks.length > 1 ? ` · ${index + 1}/${tracks.length}` : ''}
              </p>
            </div>
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              {tracks.length > 1 && (
                <button
                  type="button"
                  onClick={playPrev}
                  className="rounded-full p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
                  aria-label="Previous"
                >
                  ‹‹
                </button>
              )}
              <button
                type="button"
                onClick={toggle}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                <span className="text-sm leading-none">{playing ? '❚❚' : '▶'}</span>
              </button>
              {tracks.length > 1 && (
                <button
                  type="button"
                  onClick={playNext}
                  className="rounded-full p-2 text-zinc-300 hover:bg-white/10 hover:text-white"
                  aria-label="Next"
                >
                  ››
                </button>
              )}
            </div>
            <div aria-hidden className="min-w-0" />
          </div>
          {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-white shadow-lg ${
        compact ? 'p-3' : 'p-4 sm:p-5'
      } ${className}`}
    >
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || Number(track.duration) || 0)}
        onEnded={playNext}
        onError={() => setError('Audio failed to load')}
      />
      <div className={`flex ${compact ? 'gap-3' : 'gap-4'} items-center`}>
        <div
          className={`relative shrink-0 overflow-hidden rounded-lg bg-zinc-900 ${
            compact ? 'h-14 w-14' : 'h-20 w-20 sm:h-24 sm:w-24'
          }`}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">SERGIK</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>{displayTitle}</p>
          <p className={`truncate text-zinc-400 ${compact ? 'text-xs' : 'text-sm'}`}>
            {track.artist}
            {subtitle ? ` · ${subtitle}` : ''}
          </p>
          {tracks.length > 1 && (
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              {index + 1}/{tracks.length} · {title}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {tracks.length > 1 && (
              <button
                type="button"
                onClick={playPrev}
                className="rounded-md px-1.5 py-1 text-zinc-300 hover:bg-zinc-800"
                aria-label="Previous"
              >
                ‹
              </button>
            )}
            <button
              type="button"
              onClick={toggle}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            {tracks.length > 1 && (
              <button
                type="button"
                onClick={playNext}
                className="rounded-md px-1.5 py-1 text-zinc-300 hover:bg-zinc-800"
                aria-label="Next"
              >
                ›
              </button>
            )}
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              className="min-w-0 flex-1 accent-white"
              aria-label="Seek"
            />
            <span className="shrink-0 tabular-nums text-[11px] text-zinc-500">
              {formatTime(currentTime)} / {formatTime(duration || track.duration || 0)}
            </span>
          </div>
          {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}
