'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

function downsamplePeaks(peaks: number[], buckets: number): number[] {
  if (peaks.length <= buckets) return peaks
  const out: number[] = new Array(buckets)
  const step = peaks.length / buckets
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * step)
    const end = Math.max(start + 1, Math.floor((i + 1) * step))
    let max = 0
    for (let j = start; j < end && j < peaks.length; j++) {
      const v = Math.abs(peaks[j]!)
      if (v > max) max = v
    }
    out[i] = max
  }
  return out
}

function normalizePeaks(peaks: number[]): number[] {
  let max = 0
  for (const p of peaks) {
    const v = Math.abs(p)
    if (v > max) max = v
  }
  if (max <= 0) return peaks.map(() => 0.12)
  return peaks.map((p) => Math.max(0.1, Math.abs(p) / max))
}

function coercePeaks(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length < 16) return null
  const peaks: number[] = []
  for (const value of raw) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      peaks.push(value)
      continue
    }
    if (value && typeof value === 'object') {
      const row = value as { positive?: number; rms?: number; negative?: number }
      const n = Number(row.positive ?? row.rms ?? row.negative)
      if (Number.isFinite(n)) peaks.push(n)
    }
  }
  return peaks.length >= 16 ? peaks : null
}

type ShareDockWaveformScrubberProps = {
  file?: string
  trackId?: string
  audioFileId?: string
  progress: number
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
  progress,
  duration,
  currentTime,
  onSeek,
}: ShareDockWaveformScrubberProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const peaksRef = useRef<number[] | null>(null)
  const progressRef = useRef(progress)
  const [ready, setReady] = useState(false)
  progressRef.current = progress

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = wrap.getBoundingClientRect()
    const cssW = Math.max(1, Math.round(rect.width))
    const cssH = Math.max(1, Math.round(rect.height))
    if (cssW < 8) return

    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1
    const w = Math.max(1, Math.floor(cssW * dpr))
    const h = Math.max(1, Math.floor(cssH * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    ctx.clearRect(0, 0, w, h)
    const mid = h / 2
    const prog = Math.min(1, Math.max(0, progressRef.current))
    const peaks = peaksRef.current

    if (!peaks?.length) {
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

    // Exact slot width so bars always span the full scrubber.
    const targetBars = Math.max(80, Math.min(240, Math.floor(cssW / 2.5)))
    const bars = normalizePeaks(downsamplePeaks(peaks, targetBars))
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
  }, [])

  useEffect(() => {
    let cancelled = false
    peaksRef.current = null
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
        // Layout may still be settling — paint twice.
        paint()
        requestAnimationFrame(() => paint())
      } catch {
        if (!cancelled) {
          peaksRef.current = null
          setReady(false)
          paint()
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file, trackId, audioFileId, paint])

  useEffect(() => {
    paint()
  }, [progress, ready, paint])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => paint())
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [paint])

  return (
    <div ref={wrapRef} className="relative h-11 w-full sm:h-12">
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
        className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Seek"
      />
    </div>
  )
}
