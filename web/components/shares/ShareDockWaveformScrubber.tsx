'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import {
  shareDockWaveformCssHeight,
  shareWaveformLayoutChanged,
  targetBarCount,
} from '@/lib/shares/share-dock-waveform-layout'
import { coercePeaks, downsamplePeaks, normalizePeaks } from '@/lib/shares/share-waveform-peaks'

type ShareDockWaveformScrubberProps = {
  file?: string
  trackId?: string
  audioFileId?: string
  /** Live progress 0–1 — updated without React re-renders during playback. */
  progressRef: MutableRefObject<number>
  duration: number
  currentTime: number
  onSeek: (seconds: number) => void
}

/**
 * Compact mirrored waveform used as the dock seek bar on share listen pages.
 */
export default function ShareDockWaveformScrubber({
  file,
  trackId,
  audioFileId,
  progressRef,
  duration,
  currentTime,
  onSeek,
}: ShareDockWaveformScrubberProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const peaksRef = useRef<number[] | null>(null)
  const barsRef = useRef<number[]>([])
  const layoutRef = useRef({ cssW: 0, cssH: 0, dpr: 1, canvasW: 0, canvasH: 0 })
  const [ready, setReady] = useState(false)

  const rebuildBars = useCallback((cssW: number) => {
    const peaks = peaksRef.current
    if (!peaks?.length) {
      barsRef.current = []
      return
    }
    barsRef.current = normalizePeaks(downsamplePeaks(peaks, targetBarCount(cssW)))
  }, [])

  const syncCanvasSize = useCallback((cssW: number, cssH: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr =
      typeof window !== 'undefined'
        ? Math.min(2, Math.max(1, window.devicePixelRatio || 1))
        : 1
    const w = Math.max(1, Math.floor(cssW * dpr))
    const h = Math.max(1, Math.floor(cssH * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    layoutRef.current = { cssW, cssH, dpr, canvasW: w, canvasH: h }
  }, [])

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = wrap.getBoundingClientRect()
    const cssW = Math.max(1, Math.floor(rect.width))
    const cssH = shareDockWaveformCssHeight()
    if (cssW < 8) return

    const layout = layoutRef.current
    if (shareWaveformLayoutChanged(layout.cssW, layout.cssH, cssW, cssH)) {
      syncCanvasSize(cssW, cssH)
      rebuildBars(cssW)
    }

    const { canvasW: w, canvasH: h, dpr } = layoutRef.current
    if (w <= 0 || h <= 0) return

    ctx.clearRect(0, 0, w, h)
    const mid = h / 2
    const prog = Math.min(1, Math.max(0, progressRef.current))
    const bars = barsRef.current

    if (!bars.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fillRect(0, mid - 1.5 * dpr, w, 3 * dpr)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillRect(0, mid - 1.5 * dpr, w * prog, 3 * dpr)
      ctx.beginPath()
      ctx.arc(Math.min(w, Math.max(0, w * prog)), mid, 4 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      return
    }

    const slot = w / bars.length
    const barW = Math.max(dpr, slot * 0.72)
    const playX = w * prog

    for (let i = 0; i < bars.length; i++) {
      const amp = bars[i]!
      const bh = Math.max(3 * dpr, amp * (h * 0.48))
      const x = i * slot + (slot - barW) / 2
      const played = x + barW * 0.5 <= playX
      ctx.fillStyle = played ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.32)'
      ctx.fillRect(x, mid - bh, barW, bh)
      ctx.fillRect(x, mid, barW, bh)
    }

    ctx.fillStyle = '#fff'
    ctx.fillRect(Math.max(0, Math.min(w - 2 * dpr, playX - dpr)), dpr, 2 * dpr, h - 2 * dpr)
  }, [progressRef, rebuildBars, syncCanvasSize])

  useEffect(() => {
    let cancelled = false
    peaksRef.current = null
    barsRef.current = []
    layoutRef.current = { cssW: 0, cssH: 0, dpr: 1, canvasW: 0, canvasH: 0 }
    setReady(false)
    paint()

    const params = new URLSearchParams()
    if (audioFileId) params.set('trackId', audioFileId)
    else if (trackId) params.set('trackId', trackId)
    if (file) {
      try {
        params.set('path', decodeURIComponent(file))
      } catch {
        params.set('path', file)
      }
    }
    if (!params.toString()) return

    ;(async () => {
      try {
        const res = await fetch(`/api/audio/waveform?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        const next = coercePeaks(json?.waveform_data)
        peaksRef.current = next
        setReady(!!next?.length)
        const wrap = wrapRef.current
        if (wrap) {
          const rect = wrap.getBoundingClientRect()
          const cssH = shareDockWaveformCssHeight()
          syncCanvasSize(Math.max(1, Math.floor(rect.width)), cssH)
          rebuildBars(Math.max(1, Math.floor(rect.width)))
        }
        paint()
      } catch {
        if (!cancelled) {
          peaksRef.current = null
          barsRef.current = []
          setReady(false)
          paint()
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file, trackId, audioFileId, paint, rebuildBars, syncCanvasSize])

  // Paint on rAF — avoids React re-renders every `timeupdate` (Android fires aggressively).
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 32) return
      last = t
      paint()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paint, ready])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => paint())
    })
    ro.observe(wrap)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [paint])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 640px)')
    const onChange = () => {
      layoutRef.current = { cssW: 0, cssH: 0, dpr: 1, canvasW: 0, canvasH: 0 }
      paint()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [paint])

  return (
    <div
      ref={wrapRef}
      className="relative h-11 min-h-11 max-h-11 w-full shrink-0 sm:h-12 sm:min-h-12 sm:max-h-12"
      style={{ contain: 'layout size style' }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden
      />
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.05}
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 touch-none"
        aria-label="Seek"
      />
    </div>
  )
}
