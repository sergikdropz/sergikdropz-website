/**
 * SoundCloud-style Instagram Story export: 15s vertical video with
 * cover art + baked-in audio snippet (canvas + MediaRecorder).
 *
 * `layout: 'vinyl'` renders a spinning 33⅓ RPM disc + CTA for IG Link stickers.
 */

import { loadArtworkForCanvas } from '@/lib/media/canvas-artwork-load'
import { clipFileShareFields, type ReadyClipFile } from '@/lib/shares/clip-share'
import { ensureStoryMp4 } from '@/lib/shares/ensure-mp4'
import { VINYL_DEG_PER_SEC } from '@/lib/shares/vinyl-spin-clock'
import { paintStoryLookStill } from '@/lib/studio/story-look-paint'
import { loadServiceIcons } from '@/lib/studio/promo-card-render'
import { normalizeStoryLook, storyLookSlug, type StoryLook } from '@/lib/studio/story-look'

export const STORY_SNIPPET_DURATION_SEC = 15

/** Clip lengths in 15s steps, plus the whole track. */
export const STORY_CLIP_LENGTHS = [15, 30, 45, 60] as const
export type StoryClipLengthChoice = (typeof STORY_CLIP_LENGTHS)[number] | 'full'

/** Steps that fit in the track, then the full song. Unknown length keeps every step. */
export function storyClipLengthChoices(trackDurationSec?: number | null): StoryClipLengthChoice[] {
  const dur =
    typeof trackDurationSec === 'number' && Number.isFinite(trackDurationSec) && trackDurationSec > 0
      ? trackDurationSec
      : null
  const steps = STORY_CLIP_LENGTHS.filter((sec) => dur == null || sec < dur - 0.5)
  return [...steps, 'full']
}

export function storyClipLengthLabel(choice: StoryClipLengthChoice): string {
  if (choice === 'full') return 'Full'
  if (choice === 60) return '1:00'
  return `${choice}s`
}

/** Seconds to play. Full uses the track; until the duration is known it stays 15s. */
export function resolveStoryClipDuration(
  choice: StoryClipLengthChoice,
  trackDurationSec?: number | null,
): number {
  const dur =
    typeof trackDurationSec === 'number' && Number.isFinite(trackDurationSec) && trackDurationSec > 0.5
      ? trackDurationSec
      : null
  if (choice === 'full') return dur ?? STORY_SNIPPET_DURATION_SEC
  if (dur != null && choice > dur) return dur
  return choice
}
export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920
export const STORY_FPS = 30

/** Prefer MPEG-4 for Instagram; WebM is Chromium fallback (transcoded after). */
const RECORDER_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.42001E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export type StorySnippetLayout = 'cover' | 'vinyl'

export type StorySnippetInput = {
  artworkUrl?: string | null
  title: string
  artist: string
  audioUrl: string
  durationSec?: number
  startSec?: number
  width?: number
  height?: number
  fps?: number
  brand?: string
  /** Default `vinyl` — spinning disc trailer for Instagram Stories/Reels. */
  layout?: StorySnippetLayout
  /** Format, aesthetic, background, and accent. When set, this replaces `layout`. */
  look?: StoryLook
  /** Overlay under the disc (vinyl layout). */
  cta?: string
  badge?: string
  /** Full-track peaks for the 8-bar traveling tape. */
  peaks?: number[] | null
  trackDurationSec?: number | null
  bpm?: number | null
  onProgress?: (phase: string, ratio?: number) => void
}

/** Clockwise platter degrees for a given audio/story elapsed time. */
export function vinylStoryRotationDeg(elapsedSec: number): number {
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0
  return t * VINYL_DEG_PER_SEC
}

export type StorySnippetResult = {
  blob: Blob
  mimeType: string
  filename: string
  durationSec: number
  startSec: number
}

export function clampSnippetWindow(opts: {
  startSec?: number
  durationSec?: number
  trackDurationSec?: number
}): { startSec: number; durationSec: number } {
  const trackDur =
    typeof opts.trackDurationSec === 'number' && Number.isFinite(opts.trackDurationSec)
      ? Math.max(0, opts.trackDurationSec)
      : null
  let start = Math.max(0, Number(opts.startSec) || 0)
  let duration = Math.max(0.5, Number(opts.durationSec) || STORY_SNIPPET_DURATION_SEC)
  if (trackDur != null && trackDur > 0) {
    duration = Math.min(duration, trackDur)
    if (start + duration > trackDur) {
      start = Math.max(0, trackDur - duration)
    }
    duration = Math.min(duration, Math.max(0.5, trackDur - start))
  }
  return { startSec: start, durationSec: duration }
}

export function sanitizeStoryFilenamePart(value: string, maxLen = 40): string {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, maxLen)
    .replace(/^-|-$/g, '')
  return cleaned || 'track'
}

export function storySnippetFilename(
  title: string,
  artist: string,
  mimeType?: string,
  style?: string
): string {
  const ext = mimeType?.includes('mp4') ? 'mp4' : 'webm'
  const stylePart = style ? `-${sanitizeStoryFilenamePart(style, 64)}` : ''
  const base = `${sanitizeStoryFilenamePart(artist)}-${sanitizeStoryFilenamePart(title)}-story${stylePart}`
  return `${base}.${ext}`
}

export function pickRecorderMimeType(
  isTypeSupported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime),
): string | null {
  for (const mime of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(mime)) return mime
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Same-origin artwork URL so canvas draws stay untainted. */
export function proxiedArtworkUrl(artworkUrl: string, pageOrigin?: string): string {
  const raw = String(artworkUrl || '').trim()
  if (!raw) return ''
  if (raw.startsWith('/api/shares/artwork-proxy')) return raw
  // Relative site paths are already same-origin — proxying re-encodes `%20` → `%2520`
  // and is unnecessary for canvas/img draws.
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const origin =
      pageOrigin ||
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      ''
    if (origin && raw.startsWith(origin)) {
      return raw
    }
  } catch {
    /* ignore */
  }
  return `/api/shares/artwork-proxy?src=${encodeURIComponent(raw)}`
}

function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let current = words[0]!
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = words[i]!
      if (lines.length >= maxLines) break
    }
  }
  if (lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines && words.length > 1) {
    const last = lines[maxLines - 1]!
    if (ctx.measureText(last).width > maxWidth || words.join(' ') !== lines.join(' ')) {
      let truncated = last
      while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
        truncated = truncated.slice(0, -1)
      }
      lines[maxLines - 1] = `${truncated}…`
    }
  }
  return lines
}

function paintBlurredBackdrop(
  ctx: CanvasRenderingContext2D,
  artwork: HTMLImageElement | null,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, width, height)
  if (!artwork) return
  ctx.save()
  ctx.filter = 'blur(48px) brightness(0.45) saturate(1.2)'
  drawCoverFit(ctx, artwork, -width * 0.1, -height * 0.05, width * 1.2, height * 1.1)
  ctx.restore()
}

function paintProgressBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  yRatio: number,
) {
  const barW = width * 0.7
  const barH = Math.max(4, height * 0.004)
  const barX = (width - barW) / 2
  const barY = height * yRatio
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(barX, barY, barW * Math.min(1, Math.max(0, progress)), barH)
}

function paintVinylDisc(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number
    cy: number
    radius: number
    artwork: HTMLImageElement | null
    rotationDeg: number
  },
) {
  const { cx, cy, radius, artwork, rotationDeg } = opts
  const labelR = radius * 0.34
  const holeR = radius * 0.035

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotationDeg * Math.PI) / 180)

  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = '#0c0c0c'
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = radius * 0.18
  ctx.shadowOffsetY = radius * 0.06
  ctx.fill()
  ctx.shadowColor = 'transparent'

  // Groove rings
  ctx.strokeStyle = 'rgba(255,255,255,0.055)'
  ctx.lineWidth = Math.max(1, radius * 0.004)
  for (let i = 0; i < 28; i++) {
    const r = labelR + ((radius - labelR - holeR) * (i + 1)) / 29
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Outer rim highlight
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.985, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = Math.max(2, radius * 0.012)
  ctx.stroke()

  // Center label
  ctx.beginPath()
  ctx.arc(0, 0, labelR, 0, Math.PI * 2)
  ctx.fillStyle = '#1a1a1a'
  ctx.fill()
  if (artwork) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, labelR * 0.96, 0, Math.PI * 2)
    ctx.clip()
    drawCoverFit(ctx, artwork, -labelR, -labelR, labelR * 2, labelR * 2)
    ctx.restore()
  }

  // Spindle hole
  ctx.beginPath()
  ctx.arc(0, 0, holeR, 0, Math.PI * 2)
  ctx.fillStyle = '#050505'
  ctx.fill()

  ctx.restore()

  // Fixed sheen (does not spin — reads like studio light)
  ctx.save()
  ctx.translate(cx, cy)
  const sheen = ctx.createLinearGradient(-radius, -radius, radius, radius)
  sheen.addColorStop(0, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.42, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.1)')
  sheen.addColorStop(0.58, 'rgba(255,255,255,0)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = sheen
  ctx.fill()
  ctx.restore()
}

function paintCoverFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    artwork: HTMLImageElement | null
    title: string
    artist: string
    brand: string
    progress: number
  },
) {
  const { width, height, artwork, title, artist, brand, progress } = opts
  paintBlurredBackdrop(ctx, artwork, width, height)

  if (artwork) {
    const artSize = Math.min(width * 0.72, height * 0.38)
    const artX = (width - artSize) / 2
    const artY = height * 0.22
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 48
    ctx.shadowOffsetY = 18
    const r = Math.max(12, artSize * 0.04)
    ctx.beginPath()
    ctx.moveTo(artX + r, artY)
    ctx.arcTo(artX + artSize, artY, artX + artSize, artY + artSize, r)
    ctx.arcTo(artX + artSize, artY + artSize, artX, artY + artSize, r)
    ctx.arcTo(artX, artY + artSize, artX, artY, r)
    ctx.arcTo(artX, artY, artX + artSize, artY, r)
    ctx.closePath()
    ctx.clip()
    drawCoverFit(ctx, artwork, artX, artY, artSize, artSize)
    ctx.restore()
  } else {
    ctx.fillStyle = '#1a1a1a'
    const artSize = Math.min(width * 0.72, height * 0.38)
    const artX = (width - artSize) / 2
    const artY = height * 0.22
    ctx.fillRect(artX, artY, artSize, artSize)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `600 ${Math.round(width * 0.035)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(brand, width / 2, height * 0.14)

  const textMax = width * 0.82
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(width * 0.055)}px system-ui, -apple-system, sans-serif`
  const titleLines = wrapText(ctx, title, textMax, 2)
  let textY = height * 0.68
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, textY)
    textY += width * 0.07
  }

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `500 ${Math.round(width * 0.038)}px system-ui, -apple-system, sans-serif`
  const artistLines = wrapText(ctx, artist, textMax, 1)
  for (const line of artistLines) {
    ctx.fillText(line, width / 2, textY + width * 0.02)
  }

  paintProgressBar(ctx, width, height, progress, 0.88)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = `500 ${Math.round(width * 0.028)}px system-ui, -apple-system, sans-serif`
  ctx.fillText('sergikdropz.com', width / 2, height * 0.94)
}

function paintVinylFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    artwork: HTMLImageElement | null
    title: string
    artist: string
    brand: string
    progress: number
    elapsedSec: number
    cta: string
  },
) {
  const { width, height, artwork, title, artist, brand, progress, elapsedSec, cta } = opts
  paintBlurredBackdrop(ctx, artwork, width, height)

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `600 ${Math.round(width * 0.035)}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(brand, width / 2, height * 0.11)

  const discR = Math.min(width * 0.38, height * 0.22)
  const discCy = height * 0.38
  paintVinylDisc(ctx, {
    cx: width / 2,
    cy: discCy,
    radius: discR,
    artwork,
    rotationDeg: vinylStoryRotationDeg(elapsedSec),
  })

  const textMax = width * 0.82
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(width * 0.055)}px system-ui, -apple-system, sans-serif`
  const titleLines = wrapText(ctx, title, textMax, 2)
  let textY = height * 0.62
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, textY)
    textY += width * 0.07
  }

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `500 ${Math.round(width * 0.038)}px system-ui, -apple-system, sans-serif`
  const artistLines = wrapText(ctx, artist, textMax, 1)
  for (const line of artistLines) {
    ctx.fillText(line, width / 2, textY + width * 0.015)
  }

  const ctaY = height * 0.78
  const ctaPadY = height * 0.014
  ctx.font = `600 ${Math.round(width * 0.032)}px system-ui, -apple-system, sans-serif`
  const ctaLines = wrapText(ctx, cta, width * 0.7, 2)
  const lineH = width * 0.042
  const boxH = ctaPadY * 2 + ctaLines.length * lineH
  const boxW = width * 0.78
  const boxX = (width - boxW) / 2
  const boxY = ctaY - ctaPadY - lineH * 0.35
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.beginPath()
  const rr = Math.max(10, width * 0.02)
  ctx.moveTo(boxX + rr, boxY)
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, rr)
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, rr)
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, rr)
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, rr)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  let cy = ctaY
  for (const line of ctaLines) {
    ctx.fillText(line, width / 2, cy)
    cy += lineH
  }

  paintProgressBar(ctx, width, height, progress, 0.88)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = `500 ${Math.round(width * 0.028)}px system-ui, -apple-system, sans-serif`
  ctx.fillText('sergikdropz.com · open link to scrub', width / 2, height * 0.94)
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    artwork: HTMLImageElement | null
    title: string
    artist: string
    brand: string
    progress: number
    elapsedSec: number
    layout: StorySnippetLayout
    cta: string
  },
) {
  if (opts.layout === 'vinyl') {
    paintVinylFrame(ctx, opts)
    return
  }
  paintCoverFrame(ctx, opts)
}

async function waitForAudioReady(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= 2) return
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Failed to load audio for story snippet'))
    }
    const cleanup = () => {
      audio.removeEventListener('canplay', onReady)
      audio.removeEventListener('loadeddata', onReady)
      audio.removeEventListener('error', onError)
    }
    audio.addEventListener('canplay', onReady)
    audio.addEventListener('loadeddata', onReady)
    audio.addEventListener('error', onError)
  })
}

/**
 * Render a vertical story video with a short audio snippet.
 * Must run in the browser (needs canvas + MediaRecorder + Audio).
 */
export async function renderStorySnippet(input: StorySnippetInput): Promise<StorySnippetResult> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('Story snippet rendering requires a browser')
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser')
  }
  if (!input.audioUrl) {
    throw new Error('Missing audio URL for story snippet')
  }

  const width = input.width || STORY_WIDTH
  const height = input.height || STORY_HEIGHT
  const fps = input.fps || STORY_FPS
  const brand = input.brand || 'SERGIK'
  const look = input.look ? normalizeStoryLook(input.look) : null
  const layout: StorySnippetLayout = input.layout === 'cover' ? 'cover' : 'vinyl'
  const cta =
    input.cta?.trim() ||
    (layout === 'vinyl'
      ? 'Add Link sticker · open to spin & scrub'
      : '')
  const onProgress = input.onProgress

  onProgress?.('loading', 0)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  const artwork = input.artworkUrl ? await loadArtworkForCanvas(input.artworkUrl) : null
  if (look?.storesOn) {
    await Promise.all([loadServiceIcons('#fafafa'), loadServiceIcons('#18181b')])
  }

  const audio = new Audio()
  audio.crossOrigin = 'anonymous'
  audio.preload = 'auto'
  audio.src = input.audioUrl
  await waitForAudioReady(audio)

  const trackDuration = Number.isFinite(audio.duration) ? audio.duration : undefined
  const { startSec, durationSec } = clampSnippetWindow({
    startSec: input.startSec,
    durationSec: input.durationSec ?? STORY_SNIPPET_DURATION_SEC,
    trackDurationSec: trackDuration,
  })

  const mimeType = pickRecorderMimeType() || 'video/webm'
  const filename = storySnippetFilename(
    input.title,
    input.artist,
    mimeType,
    look ? storyLookSlug(look) : undefined
  )

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) throw new Error('Web Audio is not supported in this browser')

  const audioCtx = new AudioCtx()
  const mediaDest = audioCtx.createMediaStreamDestination()
  const source = audioCtx.createMediaElementSource(audio)
  source.connect(mediaDest)
  // Keep silent in speakers while recording (destination still gets audio).
  const silentGain = audioCtx.createGain()
  silentGain.gain.value = 0
  source.connect(silentGain)
  silentGain.connect(audioCtx.destination)

  const canvasStream = canvas.captureStream(fps)
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...mediaDest.stream.getAudioTracks(),
  ])

  const chunks: BlobPart[] = []
  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 192_000,
  }
  if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
    recorderOptions.mimeType = mimeType
  }
  const recorder = new MediaRecorder(combined, recorderOptions)

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data)
  }

  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Story recording failed'))
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }))
    }
  })

  onProgress?.('recording', 0)
  if (audioCtx.state === 'suspended') await audioCtx.resume()

  audio.currentTime = startSec
  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      audio.removeEventListener('seeked', onSeeked)
      resolve()
    }
    audio.addEventListener('seeked', onSeeked)
    // Some browsers fire seeked synchronously; also resolve on next frame.
    window.setTimeout(() => resolve(), 120)
  })

  const paint = (progress: number, elapsedSec: number) => {
    if (look) {
      paintStoryLookStill(ctx, {
        width,
        height,
        artwork,
        title: input.title,
        artist: input.artist,
        brand,
        cta,
        badge: input.badge,
        look,
        progress,
        elapsedSec,
        peaks: input.peaks,
        trackDurationSec: input.trackDurationSec,
        bpm: input.bpm,
        timeOriginSec: input.startSec,
        motionDurationSec: durationSec,
      })
      return
    }
    paintFrame(ctx, {
      width,
      height,
      artwork,
      title: input.title,
      artist: input.artist,
      brand,
      progress,
      elapsedSec,
      layout,
      cta,
    })
  }

  paint(0, 0)

  recorder.start(250)
  try {
    await audio.play()
  } catch (err) {
    recorder.stop()
    await audioCtx.close().catch(() => undefined)
    throw err instanceof Error ? err : new Error('Audio playback blocked — interact with the page and retry')
  }

  const startedAt = performance.now()
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000
      const progress = Math.min(1, elapsed / durationSec)
      paint(progress, elapsed)
      onProgress?.('recording', progress)
      if (elapsed >= durationSec || audio.ended) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  audio.pause()
  if (recorder.state !== 'inactive') recorder.stop()
  let blob = await recorded

  canvasStream.getTracks().forEach((t) => t.stop())
  mediaDest.stream.getTracks().forEach((t) => t.stop())
  source.disconnect()
  silentGain.disconnect()
  await audioCtx.close().catch(() => undefined)

  let outMime = blob.type || mimeType
  let outFilename = filename
  try {
    onProgress?.('encoding', 0)
    const mp4 = await ensureStoryMp4(blob, {
      filename,
      mimeType: outMime,
      onProgress,
    })
    blob = mp4.blob
    outMime = mp4.mimeType
    outFilename = mp4.filename
  } catch (err) {
    // Chromium WebM still downloads if transcode fails — caller surfaces the mime.
    if (typeof console !== 'undefined') {
      console.warn('[story-snippet] MP4 convert failed; keeping recorder output', err)
    }
  }

  onProgress?.('done', 1)

  return {
    blob,
    mimeType: outMime,
    filename: outFilename,
    durationSec,
    startSec,
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

function shareErrorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) return String((err as { name?: string }).name || '')
  return ''
}

/**
 * Hand a rendered clip to the device share sheet so Instagram, TikTok, or
 * YouTube can take the file. Never saves it to the device.
 * Instagram must be files-only — a caption URL opens the feed instead of a Story.
 */
export async function handoffClipFile(opts: {
  blob: Blob
  filename: string
  title: string
  text?: string
  filesOnly?: boolean
}): Promise<'shared' | 'cancelled' | 'needs_gesture' | 'unsupported'> {
  const file = new File([opts.blob], opts.filename, {
    type: opts.blob.type || 'video/mp4',
  })
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const canShareFiles =
    !!nav &&
    typeof nav.share === 'function' &&
    (typeof nav.canShare !== 'function' || nav.canShare({ files: [file] }))
  if (!canShareFiles || !nav) return 'unsupported'
  try {
    await nav.share({
      files: [file],
      ...clipFileShareFields({
        filesOnly: opts.filesOnly,
        title: opts.title,
        text: opts.text,
      }),
    })
    return 'shared'
  } catch (err: unknown) {
    const name = shareErrorName(err)
    if (name === 'AbortError') return 'cancelled'
    if (name === 'NotAllowedError') return 'needs_gesture'
    return 'unsupported'
  }
}

/**
 * Send a clip that was rendered on an earlier tap.
 * Call this from the follow-up button so the browser still has a user gesture.
 */
export async function presentReadyClip(clip: ReadyClipFile): Promise<'shared' | 'cancelled' | 'saved' | 'needs_gesture'> {
  if (clip.mode === 'sheet') {
    const handoff = await handoffClipFile({
      blob: clip.blob,
      filename: clip.filename,
      title: clip.title,
      text: clip.text,
      filesOnly: clip.platform === 'instagram',
    })
    if (handoff === 'shared') return 'shared'
    if (handoff === 'cancelled') return 'cancelled'
    if (handoff === 'needs_gesture') return 'needs_gesture'
  }
  downloadBlob(clip.blob, clip.filename)
  if (clip.moment && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(clip.moment).catch(() => undefined)
  }
  return 'saved'
}

export async function shareOrDownloadBlob(opts: {
  blob: Blob
  filename: string
  title: string
  text?: string
}): Promise<'shared' | 'downloaded'> {
  const file = new File([opts.blob], opts.filename, {
    type: opts.blob.type || 'video/webm',
  })
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const canShareFiles =
    !!nav &&
    typeof nav.share === 'function' &&
    (typeof nav.canShare !== 'function' || nav.canShare({ files: [file] }))

  if (canShareFiles) {
    try {
      await nav!.share({
        files: [file],
        title: opts.title,
        text: opts.text,
      })
      return 'shared'
    } catch (err: any) {
      // User cancel — still offer download.
      if (err?.name === 'AbortError') {
        downloadBlob(opts.blob, opts.filename)
        return 'downloaded'
      }
    }
  }

  downloadBlob(opts.blob, opts.filename)
  return 'downloaded'
}
