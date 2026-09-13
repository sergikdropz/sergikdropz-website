/**
 * SoundCloud-style Instagram Story export: 15s vertical video with
 * cover art + baked-in audio snippet (canvas + MediaRecorder).
 */

export const STORY_SNIPPET_DURATION_SEC = 15
export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920
export const STORY_FPS = 30

const RECORDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
] as const

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
  onProgress?: (phase: string, ratio?: number) => void
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

export function storySnippetFilename(title: string, artist: string, mimeType?: string): string {
  const ext = mimeType?.includes('mp4') ? 'mp4' : 'webm'
  const base = `${sanitizeStoryFilenamePart(artist)}-${sanitizeStoryFilenamePart(title)}-story`
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
  try {
    const origin =
      pageOrigin ||
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      ''
    if (origin && raw.startsWith(origin)) {
      // Still proxy absolute same-origin paths that might redirect cross-origin.
      if (raw.includes('/api/shares/artwork-proxy')) return raw
    }
  } catch {
    /* ignore */
  }
  return `/api/shares/artwork-proxy?src=${encodeURIComponent(raw)}`
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
  },
) {
  const { width, height, artwork, title, artist, brand, progress } = opts
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, width, height)

  if (artwork) {
    ctx.save()
    ctx.filter = 'blur(48px) brightness(0.45) saturate(1.2)'
    drawCoverFit(ctx, artwork, -width * 0.1, -height * 0.05, width * 1.2, height * 1.1)
    ctx.restore()

    const artSize = Math.min(width * 0.72, height * 0.38)
    const artX = (width - artSize) / 2
    const artY = height * 0.22
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 48
    ctx.shadowOffsetY = 18
    // rounded-ish clip
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

  const barW = width * 0.7
  const barH = Math.max(4, height * 0.004)
  const barX = (width - barW) / 2
  const barY = height * 0.88
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(barX, barY, barW * Math.min(1, Math.max(0, progress)), barH)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = `500 ${Math.round(width * 0.028)}px system-ui, -apple-system, sans-serif`
  ctx.fillText('sergikdropz.com', width / 2, height * 0.94)
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
  const onProgress = input.onProgress

  onProgress?.('loading', 0)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  const artUrl = input.artworkUrl ? proxiedArtworkUrl(input.artworkUrl) : ''
  const artwork = artUrl ? await loadImage(artUrl) : null

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
  const filename = storySnippetFilename(input.title, input.artist, mimeType)

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

  paintFrame(ctx, {
    width,
    height,
    artwork,
    title: input.title,
    artist: input.artist,
    brand,
    progress: 0,
  })

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
      paintFrame(ctx, {
        width,
        height,
        artwork,
        title: input.title,
        artist: input.artist,
        brand,
        progress,
      })
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
  const blob = await recorded

  canvasStream.getTracks().forEach((t) => t.stop())
  mediaDest.stream.getTracks().forEach((t) => t.stop())
  source.disconnect()
  silentGain.disconnect()
  await audioCtx.close().catch(() => undefined)

  onProgress?.('done', 1)

  return {
    blob,
    mimeType: blob.type || mimeType,
    filename,
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
