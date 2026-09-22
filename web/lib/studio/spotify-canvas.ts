/**
 * Spotify Canvas exporter — silent 8s 9:16 loop with cover-art drift/pan/zoom
 * matching the site mosaic / EP release Ken Burns motion (rebound for seamless loop).
 *
 * Specs (Spotify for Artists): 3–8s, vertical 9:16, ~720–1080px tall, MP4 or JPG.
 * Browser MediaRecorder usually yields WebM — convert to H.264 MP4 before upload.
 */

import {
  pickRecorderMimeType,
  proxiedArtworkUrl,
  sanitizeStoryFilenamePart,
} from '@/lib/shares/story-snippet'

export const SPOTIFY_CANVAS_WIDTH = 720
export const SPOTIFY_CANVAS_HEIGHT = 1280
export const SPOTIFY_CANVAS_DURATION_SEC = 8
export const SPOTIFY_CANVAS_FPS = 30

/** Same A↔B transforms as `.mosaic-kb-*` / `.ep-release-cover-drift-*` in globals.css */
export const CANVAS_DRIFT_VARIANTS = [
  { from: { tx: 0, ty: 0, scale: 1.16 }, to: { tx: -6, ty: 5, scale: 1.34 } },
  { from: { tx: 0, ty: 0, scale: 1.2 }, to: { tx: 6, ty: -4, scale: 1.36 } },
  { from: { tx: 0, ty: 0, scale: 1.18 }, to: { tx: -5, ty: -6, scale: 1.32 } },
  { from: { tx: 0, ty: 0, scale: 1.22 }, to: { tx: 5, ty: 6, scale: 1.38 } },
  { from: { tx: -3, ty: 2, scale: 1.28 }, to: { tx: 4, ty: -5, scale: 1.14 } },
  { from: { tx: 4, ty: -3, scale: 1.3 }, to: { tx: -5, ty: 4, scale: 1.15 } },
  { from: { tx: 0, ty: 3, scale: 1.17 }, to: { tx: 6, ty: -2, scale: 1.35 } },
  { from: { tx: -2, ty: -4, scale: 1.24 }, to: { tx: 3, ty: 5, scale: 1.12 } },
] as const

export type CanvasDriftPose = { tx: number; ty: number; scale: number }

export type SpotifyCanvasResult = {
  blob: Blob
  mimeType: string
  filename: string
  durationSec: number
  width: number
  height: number
  variant: number
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

/** Stable 0–7 seed from title (same idea as EP cover drift on the site). */
export function spotifyCanvasDriftSeed(value: string): number {
  const s = clean(value) || 'release'
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % CANVAS_DRIFT_VARIANTS.length
}

/** Match site `cubic-bezier(0.45, 0.05, 0.55, 0.95)` with a smooth ease. */
export function canvasDriftEase(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  // Smoothstep is close enough for Ken Burns; avoids cubic-bezier solver in the hot path.
  return x * x * (3 - 2 * x)
}

/**
 * Rebound (ping-pong) progress for a seamless Spotify Canvas loop:
 * 0→1 over the first half, 1→0 over the second (Spotify “Rebound” style).
 */
export function canvasReboundUnit(elapsedSec: number, durationSec: number): number {
  const dur = Math.max(0.5, durationSec)
  const t = ((elapsedSec % dur) + dur) % dur
  const half = dur / 2
  if (t <= half) return canvasDriftEase(t / half)
  return canvasDriftEase(1 - (t - half) / half)
}

export function lerpCanvasPose(a: CanvasDriftPose, b: CanvasDriftPose, u: number): CanvasDriftPose {
  return {
    tx: a.tx + (b.tx - a.tx) * u,
    ty: a.ty + (b.ty - a.ty) * u,
    scale: a.scale + (b.scale - a.scale) * u,
  }
}

export function canvasPoseAtElapsed(
  variant: number,
  elapsedSec: number,
  durationSec = SPOTIFY_CANVAS_DURATION_SEC
): CanvasDriftPose {
  const idx = ((variant % CANVAS_DRIFT_VARIANTS.length) + CANVAS_DRIFT_VARIANTS.length) %
    CANVAS_DRIFT_VARIANTS.length
  const pair = CANVAS_DRIFT_VARIANTS[idx]!
  const u = canvasReboundUnit(elapsedSec, durationSec)
  return lerpCanvasPose(pair.from, pair.to, u)
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Cover-fit artwork, then apply CSS-like translate(%) + scale from center. */
export function paintCanvasDriftFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    artwork: HTMLImageElement | null
    pose: CanvasDriftPose
  }
) {
  const { width, height, artwork, pose } = opts
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  if (!artwork || !artwork.width || !artwork.height) return

  const cover = Math.max(width / artwork.width, height / artwork.height)
  const baseW = artwork.width * cover
  const baseH = artwork.height * cover
  const dw = baseW * pose.scale
  const dh = baseH * pose.scale
  // CSS translate% is relative to the transformed element’s own box.
  const dx = (width - dw) / 2 + (pose.tx / 100) * dw
  const dy = (height - dh) / 2 + (pose.ty / 100) * dh
  ctx.drawImage(artwork, dx, dy, dw, dh)
}

function pickSilentVideoMime(
  isTypeSupported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)
): string | null {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ]
  for (const mime of candidates) {
    try {
      if (isTypeSupported(mime)) return mime
    } catch {
      /* ignore */
    }
  }
  return pickRecorderMimeType(isTypeSupported)
}

function canvasFilename(title: string, mimeType?: string): string {
  const ext = mimeType?.includes('mp4') ? 'mp4' : 'webm'
  return `${sanitizeStoryFilenamePart(title)}-spotify-canvas-8s.${ext}`
}

export async function renderSpotifyCanvas(input: {
  artworkUrl?: string | null
  title: string
  variant?: number
  durationSec?: number
  width?: number
  height?: number
  fps?: number
  onProgress?: (phase: string, ratio?: number) => void
}): Promise<SpotifyCanvasResult> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('Spotify Canvas rendering requires a browser')
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser')
  }

  const title = clean(input.title) || 'release'
  const width = input.width || SPOTIFY_CANVAS_WIDTH
  const height = input.height || SPOTIFY_CANVAS_HEIGHT
  const fps = input.fps || SPOTIFY_CANVAS_FPS
  const durationSec = Math.min(
    8,
    Math.max(3, input.durationSec ?? SPOTIFY_CANVAS_DURATION_SEC)
  )
  const variant =
    typeof input.variant === 'number' && Number.isFinite(input.variant)
      ? Math.abs(Math.floor(input.variant)) % CANVAS_DRIFT_VARIANTS.length
      : spotifyCanvasDriftSeed(title)
  const onProgress = input.onProgress

  onProgress?.('loading artwork', 0)

  const artUrl = input.artworkUrl ? proxiedArtworkUrl(clean(input.artworkUrl)) : ''
  if (!artUrl) throw new Error('Cover art required for Spotify Canvas')
  const artwork = await loadImage(artUrl)
  if (!artwork) throw new Error('Could not load cover art for Spotify Canvas')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  const mimeType = pickSilentVideoMime() || 'video/webm'
  const filename = canvasFilename(title, mimeType)

  const stream = canvas.captureStream(fps)
  const chunks: BlobPart[] = []
  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: 4_000_000,
  }
  if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
    recorderOptions.mimeType = mimeType
  }
  const recorder = new MediaRecorder(stream, recorderOptions)
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data)
  }

  onProgress?.('recording canvas', 0.05)
  const started = performance.now()
  const totalMs = durationSec * 1000

  await new Promise<void>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Spotify Canvas recording failed'))
    recorder.onstop = () => resolve()
    recorder.start(100)

    const tick = () => {
      const elapsedMs = performance.now() - started
      const elapsedSec = Math.min(durationSec, elapsedMs / 1000)
      const pose = canvasPoseAtElapsed(variant, elapsedSec, durationSec)
      paintCanvasDriftFrame(ctx, { width, height, artwork, pose })
      onProgress?.('recording canvas', 0.05 + (elapsedSec / durationSec) * 0.9)

      if (elapsedMs >= totalMs) {
        // Final frame at end pose for clean cut before rebound would reverse.
        const endPose = canvasPoseAtElapsed(variant, durationSec, durationSec)
        paintCanvasDriftFrame(ctx, { width, height, artwork, pose: endPose })
        try {
          recorder.stop()
        } catch {
          reject(new Error('Failed to stop Canvas recorder'))
        }
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  stream.getTracks().forEach((t) => t.stop())

  const blob = new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' })
  if (!blob.size) throw new Error('Spotify Canvas export produced an empty file')

  onProgress?.('done', 1)
  return {
    blob,
    mimeType: blob.type || mimeType,
    filename,
    durationSec,
    width,
    height,
    variant,
  }
}
