/**
 * Canvas frames for a story look: vinyl, sleeve, artwork, or card.
 * Used by story/reel video and by the tile previews.
 */

import { VINYL_DEG_PER_SEC } from '@/lib/shares/vinyl-spin-clock'
import { promoCardCopy, promoCardPixelSize } from '@/lib/studio/promo-cards'
import { cachedServiceIcons, paintServiceAvailability, serviceAvailabilityHeight } from '@/lib/studio/promo-card-render'
import {
  albumMotionsPose,
  hexToRgba,
  normalizeStoryLook,
  resolveStoryPaint,
  storyPulsePreviewElapsed,
  storyTapeWindow,
  type StoryLook,
  type StoryPaint,
  type StoryTapeView,
} from '@/lib/studio/story-look'

export type StoryLookFrame = {
  width: number
  height: number
  artwork: HTMLImageElement | null
  title: string
  artist: string
  brand?: string
  cta?: string
  badge?: string
  look: StoryLook
  progress?: number
  elapsedSec?: number
  /** Full-track peak tape. The strip shows 8 bars around the playhead. */
  peaks?: number[] | null
  trackDurationSec?: number | null
  bpm?: number | null
  /** Track time where elapsed 0 begins (clip start). */
  timeOriginSec?: number
  /** Album-art move spans this many seconds. Defaults to the 15s clip. */
  motionDurationSec?: number
}

function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
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
    if (ctx.measureText(next).width <= maxWidth) current = next
    else {
      lines.push(current)
      current = words[i]!
      if (lines.length >= maxLines) break
    }
  }
  if (lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!
    if (ctx.measureText(last).width > maxWidth) {
      let truncated = last
      while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
        truncated = truncated.slice(0, -1)
      }
      lines[maxLines - 1] = `${truncated}…`
    }
  }
  return lines
}

function traceRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawCoverWithPose(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  pose: { tx: number; ty: number; scale: number; rotate?: number; lean?: number }
) {
  if (!img.width || !img.height) return
  const cover = Math.max(width / img.width, height / img.height)
  const dw = img.width * cover * pose.scale
  const dh = img.height * cover * pose.scale
  const dx = (width - dw) / 2 + (pose.tx / 100) * dw
  const dy = (height - dh) / 2 + (pose.ty / 100) * dh
  const rotate = pose.rotate || 0
  const lean = Math.max(-1, Math.min(1, pose.lean || 0))
  ctx.save()
  if (rotate) {
    ctx.translate(width / 2, height / 2)
    ctx.rotate((rotate * Math.PI) / 180)
    ctx.translate(-width / 2, -height / 2)
  }
  if (Math.abs(lean) > 0.02) drawCoverLean(ctx, img, dx, dy, dw, dh, lean)
  else ctx.drawImage(img, dx, dy, dw, dh)
  if (Math.abs(lean) > 0.02) {
    const shade = ctx.createLinearGradient(0, 0, width, 0)
    const far = Math.min(0.34, Math.abs(lean) * 0.28)
    if (lean > 0) {
      shade.addColorStop(0, `rgba(0,0,0,${far})`)
      shade.addColorStop(0.62, 'rgba(0,0,0,0)')
    } else {
      shade.addColorStop(0.38, 'rgba(0,0,0,0)')
      shade.addColorStop(1, `rgba(0,0,0,${far})`)
    }
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
}

/** Yaw the full-bleed cover. Strips widen toward the near edge. */
function drawCoverLean(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  lean: number
) {
  const strips: number = 48
  const weights: number[] = []
  let sum = 0
  for (let i = 0; i < strips; i++) {
    const t = strips === 1 ? 0.5 : i / (strips - 1)
    const weight = Math.max(0.2, 1 + lean * (t * 2 - 1) * 1.15)
    weights.push(weight)
    sum += weight
  }
  const sw = img.width / strips
  let x = dx
  for (let i = 0; i < strips; i++) {
    const destW = ((weights[i] || 0) / sum) * dw
    const t = strips === 1 ? 0.5 : i / (strips - 1)
    const hScale = 1 + lean * (t * 2 - 1) * 0.18
    const stripH = dh * hScale
    ctx.drawImage(img, i * sw, 0, sw + 0.8, img.height, x, dy + (dh - stripH) / 2, destW + 0.8, stripH)
    x += destW
  }
}

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  artwork: HTMLImageElement | null,
  width: number,
  height: number,
  paint: StoryPaint,
  look: StoryLook,
  elapsedSec: number,
  musical?: {
    bpm?: number | null
    timeOriginSec?: number
    peaks?: number[] | null
    trackDurationSec?: number | null
    motionDurationSec?: number
  },
) {
  ctx.save()
  if (paint.background === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, width * 0.15, height)
    grad.addColorStop(0, paint.bg)
    grad.addColorStop(1, paint.bg2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  } else {
    ctx.fillStyle = paint.bg
    ctx.fillRect(0, 0, width, height)
  }

  if (paint.background === 'album' && artwork) {
    drawCoverWithPose(
      ctx,
      artwork,
      width,
      height,
      albumMotionsPose(
        look.motion,
        elapsedSec,
        musical?.motionDurationSec,
        {
          motionSpeed: look.motionSpeed,
          motionDirection: look.motionDirection,
          motionDepth: look.motionDepth,
          bpm: musical?.bpm,
          timeSec: elapsedSec + Math.max(0, musical?.timeOriginSec || 0),
          peaks: musical?.peaks,
          trackDurationSec: musical?.trackDurationSec,
        },
        look.motion2,
        look.motion2
          ? {
              motionSpeed: look.motion2Speed ?? look.motionSpeed,
              motionDirection: look.motion2Direction ?? look.motionDirection,
              motionDepth: look.motion2Depth ?? look.motionDepth,
            }
          : undefined,
      ),
    )
    const scrim = ctx.createLinearGradient(0, height * 0.42, 0, height)
    scrim.addColorStop(0, 'rgba(0,0,0,0)')
    scrim.addColorStop(1, paint.light ? 'rgba(243,238,228,0.84)' : 'rgba(0,0,0,0.74)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = paint.light ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.16)'
    ctx.fillRect(0, 0, width, height)
  } else if (paint.background === 'blur' && artwork) {
    ctx.save()
    ctx.filter = 'blur(42px) brightness(0.55) saturate(1.25)'
    drawCoverFit(ctx, artwork, -width * 0.08, -height * 0.04, width * 1.16, height * 1.08)
    ctx.restore()
    ctx.fillStyle = paint.veil
    ctx.fillRect(0, 0, width, height)
  }

  if (paint.background === 'wash') {
    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.32,
      width * 0.04,
      width * 0.5,
      height * 0.4,
      Math.max(width, height) * 0.75
    )
    glow.addColorStop(0, paint.wash)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)
  } else if (paint.background !== 'album') {
    ctx.fillStyle = paint.accentVeil
    ctx.fillRect(0, 0, width, height)
  }

  if (paint.grain) {
    ctx.fillStyle = paint.light ? 'rgba(90,55,20,0.1)' : 'rgba(0,0,0,0.2)'
    const step = Math.max(3, Math.round(height / 220))
    for (let y = 0; y < height; y += step) ctx.fillRect(0, y, width, 1)
  }
  ctx.restore()
}

function paintDisc(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number
    cy: number
    radius: number
    artwork: HTMLImageElement | null
    rotationDeg: number
    paint: StoryPaint
  }
) {
  const { cx, cy, radius, artwork, rotationDeg, paint } = opts
  const labelR = radius * 0.34
  const holeR = radius * 0.035

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotationDeg * Math.PI) / 180)

  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = paint.disc
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = radius * 0.16
  ctx.shadowOffsetY = radius * 0.05
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  ctx.strokeStyle = paint.groove
  ctx.lineWidth = Math.max(1, radius * 0.004)
  for (let i = 0; i < 26; i++) {
    const r = labelR + ((radius - labelR) * (i + 1)) / 28
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.985, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = Math.max(2, radius * 0.012)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(0, 0, labelR, 0, Math.PI * 2)
  ctx.fillStyle = '#141414'
  ctx.fill()
  if (artwork) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, labelR * 0.94, 0, Math.PI * 2)
    ctx.clip()
    drawCoverFit(ctx, artwork, -labelR, -labelR, labelR * 2, labelR * 2)
    ctx.restore()
  }

  ctx.beginPath()
  ctx.arc(0, 0, holeR, 0, Math.PI * 2)
  ctx.fillStyle = '#050505'
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(cx, cy)
  const sheen = ctx.createLinearGradient(-radius, -radius, radius, radius)
  sheen.addColorStop(0, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.42, 'rgba(255,255,255,0)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  sheen.addColorStop(0.58, 'rgba(255,255,255,0)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = sheen
  ctx.fill()
  ctx.restore()
}

function paintCoverSquare(
  ctx: CanvasRenderingContext2D,
  artwork: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  radius: number,
  fallback: string
) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = Math.max(12, size * 0.06)
  ctx.shadowOffsetY = size * 0.03
  traceRoundRect(ctx, x, y, size, size, radius)
  ctx.fillStyle = fallback
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.clip()
  if (artwork) drawCoverFit(ctx, artwork, x, y, size, size)
  ctx.restore()
}

function tapePeakAt(
  timeSec: number,
  bpm: number,
  peaks?: number[] | null,
  durationSec?: number | null,
): number {
  const dur = typeof durationSec === 'number' && durationSec > 0 ? durationSec : 0
  if (peaks && peaks.length > 1 && dur > 0) {
    const idx = (Math.max(0, Math.min(dur, timeSec)) / dur) * (peaks.length - 1)
    const a = Math.floor(idx)
    const b = Math.min(peaks.length - 1, a + 1)
    const u = idx - a
    const sample = Math.abs((peaks[a] || 0) * (1 - u) + (peaks[b] || 0) * u)
    return Math.max(0, Math.min(1, sample))
  }
  const beat = (Math.max(0, timeSec) * bpm) / 60
  const inBar = ((beat % 4) + 4) % 4
  const beatPhase = beat % 1
  const kick = beatPhase < 0.08 || (Math.floor(inBar) === 2 && beatPhase < 0.06) ? 0.92 : 0
  const snare = Math.floor(inBar) % 2 === 1 && beatPhase < 0.05 ? 0.7 : 0
  const hat = (beat * 2) % 1 < 0.1 ? 0.28 : 0
  const body = 0.16 + 0.2 * Math.abs(Math.sin(beat * 0.37))
  const grit = 0.12 * Math.abs(Math.sin(timeSec * 19.7) * Math.sin(timeSec * 2.6))
  return Math.max(0, Math.min(1, kick + snare + hat + body + grit))
}

function tapeBeatColor(timeSec: number, bpm: number): string {
  const inBar = (((timeSec * bpm) / 60) % 4 + 4) % 4
  const distKick = Math.min(inBar, 4 - inBar)
  const distSnare = Math.abs(inBar - 2)
  const distClap = Math.min(Math.abs(inBar - 1), Math.abs(inBar - 3))
  if (distKick <= distSnare && distKick <= distClap) return '#9ecee6'
  if (distSnare <= distClap) return '#ff8c30'
  return '#73ee47'
}

function paintTapeColumn(
  ctx: CanvasRenderingContext2D,
  opts: {
    view: StoryTapeView
    accent: string
    fill?: string | CanvasGradient
    x: number
    mid: number
    body: number
    fw: number
    timeSec: number
    bpm: number
    glow: boolean
  },
) {
  const { view, accent, x, mid, body, fw } = opts
  if (opts.glow) {
    ctx.shadowColor = view === 'accent' ? accent : 'rgba(255,255,255,0.55)'
    ctx.shadowBlur = Math.max(4, body * 0.45)
  }
  if (view === 'energy') {
    ctx.fillStyle = '#e23f33'
    ctx.fillRect(x, mid - body, fw, body * 2)
    const midAmp = body * 0.62
    ctx.fillStyle = '#f8f072'
    ctx.fillRect(x, mid - midAmp, fw, midAmp * 2)
    const highAmp = body * 0.28
    ctx.fillStyle = '#65dbee'
    ctx.fillRect(x, mid - highAmp, fw, highAmp * 2)
  } else if (view === 'spectrum') {
    const gradient = ctx.createLinearGradient(0, mid - body, 0, mid + body)
    gradient.addColorStop(0, '#7c3aed')
    gradient.addColorStop(0.18, '#fb7185')
    gradient.addColorStop(0.36, '#fbbf24')
    gradient.addColorStop(0.5, '#f8fafc')
    gradient.addColorStop(0.64, '#34d399')
    gradient.addColorStop(0.82, '#22d3ee')
    gradient.addColorStop(1, '#818cf8')
    ctx.fillStyle = gradient
    ctx.fillRect(x, mid - body, fw, body * 2)
  } else if (view === 'drums') {
    ctx.fillStyle = tapeBeatColor(opts.timeSec, opts.bpm)
    ctx.fillRect(x, mid - body, fw, body * 2)
  } else {
    ctx.fillStyle = opts.fill || accent
    ctx.fillRect(x, mid - body, fw, body * 2)
  }
  if (opts.glow) {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }
}

function paintTape(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    slotTop: number
    slotBottom: number
    accent: string
    elapsedSec: number
    peaks?: number[] | null
    durationSec?: number | null
    bpm?: number | null
    timeOriginSec?: number
    tape?: StoryTapeView
    tapeGrid?: boolean
    tapeGlow?: boolean
    tapePlate?: 'clear' | 'ink'
    light?: boolean
    accentEnd?: string | null
  }
) {
  const { width, accent } = opts
  const view = opts.tape || 'accent'
  const plate = opts.tapePlate === 'ink' ? 'ink' : 'clear'
  const time = Math.max(0, opts.elapsedSec) + Math.max(0, opts.timeOriginSec || 0)
  const window = storyTapeWindow(time, opts.bpm, opts.durationSec)
  const top = opts.slotTop
  const bottom = Math.max(top + width * 0.07, opts.slotBottom)
  const tapeW = width * 0.86
  const x0 = (width - tapeW) / 2
  const h = bottom - top
  const radius = Math.max(6, width * 0.012)
  traceRoundRect(ctx, x0, top, tapeW, h, radius)
  ctx.save()
  ctx.clip()
  if (plate === 'ink') {
    ctx.fillStyle = '#050505'
    ctx.fillRect(x0, top, tapeW, h)
  }

  if (opts.tapeGrid !== false) {
    const beatSec = 60 / window.bpm
    const firstBeat = Math.ceil(window.startSec / beatSec) * beatSec
    const grid = opts.light && plate === 'clear' ? '0,0,0' : '255,255,255'
    for (let t = firstBeat; t <= window.endSec + 0.0001; t += beatSec) {
      const beatIndex = Math.round(t / beatSec)
      const x = x0 + ((t - window.startSec) / window.spanSec) * tapeW
      const barLine = beatIndex % 4 === 0
      ctx.fillStyle = barLine ? `rgba(${grid},0.28)` : `rgba(${grid},0.1)`
      ctx.fillRect(x, top, Math.max(1, width * (barLine ? 0.0016 : 0.0008)), h)
    }
  }

  const cols = Math.max(64, Math.floor(tapeW))
  const mid = top + h / 2
  const playX = x0 + ((window.playheadSec - window.startSec) / window.spanSec) * tapeW
  const amp = h * 0.42
  const colW = tapeW / cols
  let accentFill: string | CanvasGradient = accent
  if (view === 'accent' && opts.accentEnd) {
    const gradient = ctx.createLinearGradient(x0, mid, x0 + tapeW, mid)
    gradient.addColorStop(0, accent)
    gradient.addColorStop(1, opts.accentEnd)
    accentFill = gradient
  }
  for (let c = 0; c < cols; c++) {
    const t = window.startSec + ((c + 0.5) / cols) * window.spanSec
    const peak = tapePeakAt(t, window.bpm, opts.peaks, opts.durationSec)
    const x = x0 + c * colW
    const past = x + colW * 0.5 <= playX
    const body = Math.max(0.6, peak * amp)
    ctx.save()
    ctx.globalAlpha = past || plate === 'ink' ? 1 : 0.4
    paintTapeColumn(ctx, {
      view,
      accent,
      fill: accentFill,
      x,
      mid,
      body,
      fw: Math.max(1, Math.ceil(colW)),
      timeSec: t,
      bpm: window.bpm,
      glow: opts.tapeGlow === true,
    })
    ctx.restore()
  }
  if (plate === 'ink' && playX < x0 + tapeW - 0.5) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(playX, top, x0 + tapeW - playX, h)
  }
  const playW = Math.max(1.5, width * 0.003)
  const playInk = opts.light && plate === 'clear' ? '#1c1917' : '#ffffff'
  ctx.fillStyle = hexToRgba(playInk, 0.28)
  ctx.fillRect(playX - playW, top, playW * 2.4, h)
  ctx.fillStyle = playInk
  ctx.fillRect(playX - playW * 0.35, top, playW, h)
  ctx.restore()
  if (plate === 'ink') {
    ctx.beginPath()
    traceRoundRect(ctx, x0, top, tapeW, h, radius)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function paintFooter(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    title: string
    artist: string
    badge: string
    paint: StoryPaint
    look: StoryLook
    textTop: number
    siteLine: string
    elapsedSec: number
    peaks?: number[] | null
    durationSec?: number | null
    bpm?: number | null
    timeOriginSec?: number
  }
) {
  const { width, height, title, artist, badge, paint, look, siteLine, elapsedSec } = opts
  const tall = height / width > 1.25
  const font = 'system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  let y = height * opts.textTop

  if (badge) {
    if (paint.accentEnd) {
      const gradient = ctx.createLinearGradient(width * 0.22, y, width * 0.78, y)
      gradient.addColorStop(0, paint.accent)
      gradient.addColorStop(1, paint.accentEnd)
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = paint.accent
    }
    ctx.font = `600 ${Math.round(width * (tall ? 0.03 : 0.026))}px ${font}`
    ctx.fillText(badge.toUpperCase(), width / 2, y)
    y += width * 0.055
  }

  ctx.fillStyle = paint.ink
  ctx.font = `700 ${Math.round(width * (tall ? 0.052 : 0.042))}px ${font}`
  const titleLines = wrapText(ctx, title, width * 0.82, tall ? 2 : 1)
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y)
    y += width * 0.062
  }

  ctx.fillStyle = paint.muted
  ctx.font = `500 ${Math.round(width * (tall ? 0.034 : 0.028))}px ${font}`
  const artistLines = wrapText(ctx, artist, width * 0.82, 1)
  for (const line of artistLines) {
    ctx.fillText(line, width / 2, y + width * 0.01)
    y += width * 0.05
  }

  const storesInk = look.storesInk === 'light' ? 'light' : look.storesInk === 'dark' ? 'dark' : paint.light ? 'dark' : 'light'
  const storeIcons = look.storesOn ? cachedServiceIcons(storesInk === 'dark' ? '#18181b' : '#fafafa') : null
  const showStores = Boolean(storeIcons?.length)
  const barH = showStores ? serviceAvailabilityHeight(width, look.storesSite) : 0
  const slotBottom = showStores
    ? Math.min(height * (tall ? 0.9 : 0.92), height - barH - width * 0.012)
    : height * (tall ? 0.9 : 0.92)
  if (look.tapeOn !== false && slotBottom > y + width * 0.04) {
    paintTape(ctx, {
      width,
      slotTop: y + width * 0.015,
      slotBottom,
      accent: paint.accent,
      elapsedSec,
      peaks: opts.peaks,
      durationSec: opts.durationSec,
      bpm: opts.bpm,
      timeOriginSec: opts.timeOriginSec,
      tape: look.tape,
      tapeGrid: look.tapeGrid,
      tapeGlow: look.tapeGlow,
      tapePlate: look.tapePlate,
      light: paint.light,
      accentEnd: paint.accentEnd,
    })
  }

  if (showStores && storeIcons) {
    paintServiceAvailability(ctx, width, height, storeIcons, storesInk === 'dark' ? 'light' : 'dark', {
      plate: look.storesPlate,
      site: look.storesSite,
    })
    return
  }

  ctx.fillStyle = paint.muted
  ctx.font = `500 ${Math.round(width * 0.024)}px ${font}`
  ctx.fillText(siteLine, width / 2, height * (tall ? 0.955 : 0.975))
}

/** Saturated color pulled from the cover, used as the artwork accent. */
export function sampleArtworkAccent(img: HTMLImageElement): string | null {
  if (typeof document === 'undefined' || !img.width || !img.height) return null
  const size = 24
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, size, size)
  let pixels: Uint8ClampedArray
  try {
    pixels = ctx.getImageData(0, 0, size, size).data
  } catch {
    return null
  }
  let bestScore = 0
  let best = { r: 167, g: 139, b: 250 }
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] || 0
    const g = pixels[i + 1] || 0
    const b = pixels[i + 2] || 0
    const a = pixels[i + 3] || 0
    if (a < 200) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const lum = (r + g + b) / 3
    if (lum < 28 || lum > 235) continue
    const score = sat + (lum > 50 && lum < 200 ? 0.15 : 0)
    if (score > bestScore) {
      bestScore = score
      best = { r, g, b }
    }
  }
  if (bestScore < 0.18) return null
  const channel = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${channel(best.r)}${channel(best.g)}${channel(best.b)}`
}

type ArtworkRgb = { r: number; g: number; b: number }

function artworkHex(color: ArtworkRgb): string {
  const channel = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

function artworkHue(color: ArtworkRgb): number {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  const delta = max - min
  if (!delta) return 0
  const hue =
    max === color.r
      ? ((color.g - color.b) / delta) % 6
      : max === color.g
        ? (color.b - color.r) / delta + 2
        : (color.r - color.g) / delta + 4
  return (hue * 60 + 360) % 360
}

/** Two cover colors far enough apart to read as a gradient. */
export function sampleArtworkGradient(img: HTMLImageElement): { start: string; end: string } | null {
  if (typeof document === 'undefined' || !img.width || !img.height) return null
  const size = 24
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, size, size)
  let pixels: Uint8ClampedArray
  try {
    pixels = ctx.getImageData(0, 0, size, size).data
  } catch {
    return null
  }
  const buckets: Array<{ score: number; color: ArtworkRgb } | null> = Array.from({ length: 12 }, () => null)
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] || 0
    const g = pixels[i + 1] || 0
    const b = pixels[i + 2] || 0
    const a = pixels[i + 3] || 0
    if (a < 200) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const lum = (r + g + b) / 3
    if (lum < 28 || lum > 235 || sat < 0.18) continue
    const color = { r, g, b }
    const score = sat + (lum > 50 && lum < 200 ? 0.15 : 0)
    const index = Math.min(11, Math.floor(artworkHue(color) / 30))
    const prev = buckets[index]
    if (!prev || score > prev.score) buckets[index] = { score, color }
  }
  const ranked = buckets.filter((bucket): bucket is { score: number; color: ArtworkRgb } => Boolean(bucket))
  ranked.sort((a, b) => b.score - a.score)
  const start = ranked[0]
  if (!start) return null
  const startHue = artworkHue(start.color)
  let end = ranked.slice(1).sort((a, b) => {
    const da = Math.min(Math.abs(artworkHue(a.color) - startHue), 360 - Math.abs(artworkHue(a.color) - startHue))
    const db = Math.min(Math.abs(artworkHue(b.color) - startHue), 360 - Math.abs(artworkHue(b.color) - startHue))
    return db - da
  })[0]
  if (!end) {
    end = {
      score: start.score,
      color: {
        r: Math.min(255, start.color.r + 48),
        g: Math.min(255, start.color.g + 48),
        b: Math.min(255, start.color.b + 48),
      },
    }
  }
  return { start: artworkHex(start.color), end: artworkHex(end.color) }
}

/** Top of a block. With the tape on, keep the existing ratio. With it off, center in the frame above the footer. */
function placeBlockTop(
  height: number,
  block: number,
  tapeOn: boolean,
  fallbackRatio: number,
  footerRatio = 0.2
): number {
  if (tapeOn) return height * fallbackRatio
  const topPad = height * 0.045
  const footer = height * footerRatio
  const room = height - footer - topPad
  const y = topPad + Math.max(0, (room - block) / 2)
  return Math.max(topPad, Math.min(y, height - footer - block))
}

export function paintStoryLookStill(ctx: CanvasRenderingContext2D, frame: StoryLookFrame): void {
  const look = normalizeStoryLook(frame.look)
  const gradient = look.accent === 'gradient' && frame.artwork ? sampleArtworkGradient(frame.artwork) : null
  const paintedLook = gradient ? { ...look, accentHex: gradient.start, accentHex2: gradient.end } : look
  const artworkHex =
    look.accent === 'artwork' && frame.artwork ? sampleArtworkAccent(frame.artwork) : null
  const paint = resolveStoryPaint(paintedLook, artworkHex)
  const { width, height, artwork } = frame
  const tall = height / width > 1.25
  const title = frame.title.trim() || 'New release'
  const artist = frame.artist.trim() || 'SERGIK'
  const badge = frame.badge?.trim() || (paint.subject === 'card' ? 'OUT NOW' : '')
  const rotation = Math.max(0, frame.elapsedSec || 0) * VINYL_DEG_PER_SEC
  const site =
    width >= 720 && (paint.subject === 'vinyl' || paint.subject === 'sleeve')
      ? 'sergikdropz.com · open link to scrub'
      : 'sergikdropz.com'

  const elapsed = Math.max(0, frame.elapsedSec || 0)
  paintBackdrop(ctx, artwork, width, height, paint, look, elapsed, {
    bpm: frame.bpm,
    timeOriginSec: frame.timeOriginSec,
    peaks: frame.peaks,
    trackDurationSec: frame.trackDurationSec,
    motionDurationSec: frame.motionDurationSec,
  })

  if (paint.subject === 'vinyl') {
    const radius = tall ? Math.min(width * 0.36, height * 0.2) : width * 0.26
    const discCy = look.tapeOn
      ? height * (tall ? 0.36 : 0.38)
      : placeBlockTop(height, radius * 2, false, 0, look.storesOn ? 0.32 : 0.2) + radius
    paintDisc(ctx, {
      cx: width / 2,
      cy: discCy,
      radius,
      artwork,
      rotationDeg: rotation,
      paint,
    })
    paintFooter(ctx, {
      width,
      height,
      title,
      artist,
      badge,
      paint,
      look,
      elapsedSec: elapsed,
      peaks: frame.peaks,
      durationSec: frame.trackDurationSec,
      bpm: frame.bpm,
      timeOriginSec: frame.timeOriginSec,
      textTop: Math.min(look.tapeOn ? 0.78 : 0.9, (discCy + radius) / height + 0.05),
      siteLine: site,
    })
    return
  }

  if (paint.subject === 'sleeve') {
    const jacket = tall ? Math.min(width * 0.58, height * 0.32) : width * 0.46
    const discR = jacket * 0.5
    const jx = (width - jacket) / 2 - discR * 0.28
    const jy = placeBlockTop(height, jacket, look.tapeOn, tall ? 0.16 : 0.12, look.storesOn ? 0.32 : 0.2)
    paintDisc(ctx, {
      cx: jx + jacket - discR * 0.02,
      cy: jy + jacket * 0.52,
      radius: discR,
      artwork,
      rotationDeg: rotation,
      paint,
    })
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = jacket * 0.08
    ctx.shadowOffsetY = jacket * 0.04
    traceRoundRect(ctx, jx, jy, jacket, jacket, Math.max(8, jacket * 0.03))
    ctx.fillStyle = paint.mat
    ctx.fill()
    ctx.restore()
    const artPad = jacket * 0.055
    paintCoverSquare(
      ctx,
      artwork,
      jx + artPad,
      jy + artPad,
      jacket - artPad * 2,
      Math.max(6, jacket * 0.02),
      '#222'
    )
    ctx.fillStyle = paint.light ? 'rgba(28,25,23,0.18)' : 'rgba(0,0,0,0.45)'
    ctx.fillRect(jx, jy, Math.max(6, jacket * 0.045), jacket)
    paintFooter(ctx, {
      width,
      height,
      title,
      artist,
      badge,
      paint,
      look,
      elapsedSec: elapsed,
      peaks: frame.peaks,
      durationSec: frame.trackDurationSec,
      bpm: frame.bpm,
      timeOriginSec: frame.timeOriginSec,
      textTop: Math.min(look.tapeOn ? 0.78 : 0.9, (jy + jacket) / height + 0.05),
      siteLine: site,
    })
    return
  }

  if (paint.subject === 'card') {
    const panelW = width * (tall ? 0.72 : 0.68)
    const art = panelW * 0.82
    const pad = panelW * 0.09
    const panelH = art + pad * 2
    const px = (width - panelW) / 2
    const py = placeBlockTop(height, panelH, look.tapeOn, tall ? 0.14 : 0.12, look.storesOn ? 0.32 : 0.2)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = width * 0.04
    ctx.shadowOffsetY = width * 0.015
    traceRoundRect(ctx, px, py, panelW, panelH, Math.max(12, width * 0.03))
    ctx.fillStyle = paint.panel
    ctx.fill()
    ctx.shadowColor = 'transparent'
    if (paint.accentEnd) {
      const gradient = ctx.createLinearGradient(px, py, px + panelW, py)
      gradient.addColorStop(0, paint.accent)
      gradient.addColorStop(1, paint.accentEnd)
      ctx.strokeStyle = gradient
    } else {
      ctx.strokeStyle = paint.accent
    }
    ctx.lineWidth = Math.max(2, width * 0.004)
    ctx.stroke()
    ctx.restore()
    paintCoverSquare(
      ctx,
      artwork,
      px + (panelW - art) / 2,
      py + pad,
      art,
      Math.max(8, art * 0.04),
      paint.light ? '#e7e0d4' : '#222'
    )
    paintFooter(ctx, {
      width,
      height,
      title,
      artist,
      badge,
      paint,
      look,
      elapsedSec: elapsed,
      peaks: frame.peaks,
      durationSec: frame.trackDurationSec,
      bpm: frame.bpm,
      timeOriginSec: frame.timeOriginSec,
      textTop: Math.min(look.tapeOn ? 0.8 : 0.9, (py + panelH) / height + (tall ? 0.055 : 0.04)),
      siteLine: site,
    })
    return
  }

  if (paint.subject === 'background') {
    paintFooter(ctx, {
      width,
      height,
      title,
      artist,
      badge,
      paint,
      look,
      elapsedSec: elapsed,
      peaks: frame.peaks,
      durationSec: frame.trackDurationSec,
      bpm: frame.bpm,
      timeOriginSec: frame.timeOriginSec,
      textTop: look.tapeOn ? (tall ? 0.62 : 0.55) : tall ? 0.78 : 0.7,
      siteLine: site,
    })
    return
  }

  const artSize = tall ? Math.min(width * 0.7, height * 0.36) : width * 0.48
  const artY = placeBlockTop(height, artSize, look.tapeOn, tall ? 0.16 : 0.14, look.storesOn ? 0.32 : 0.2)
  paintCoverSquare(
    ctx,
    artwork,
    (width - artSize) / 2,
    artY,
    artSize,
    Math.max(10, artSize * 0.045),
    paint.light ? '#e7e0d4' : '#222'
  )
  paintFooter(ctx, {
    width,
    height,
    title,
    artist,
    badge,
    paint,
    look,
    elapsedSec: elapsed,
    peaks: frame.peaks,
    durationSec: frame.trackDurationSec,
    bpm: frame.bpm,
    timeOriginSec: frame.timeOriginSec,
    textTop: Math.min(look.tapeOn ? 0.78 : 0.9, (artY + artSize) / height + 0.05),
    siteLine: site,
  })
}

export function renderStoryLookPreviewDataUrl(opts: {
  look: StoryLook
  artwork: HTMLImageElement | null
  title: string
  artist: string
  width?: number
  peaks?: number[] | null
  trackDurationSec?: number | null
  bpm?: number | null
  timeOriginSec?: number
}): string {
  if (typeof document === 'undefined') return ''
  const look = normalizeStoryLook(opts.look)
  const copy = promoCardCopy(look.mode)
  const size = promoCardPixelSize(look.frame, opts.width ?? 180)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  paintStoryLookStill(ctx, {
    width: size.width,
    height: size.height,
    artwork: opts.artwork,
    title: opts.title,
    artist: opts.artist,
    look,
    badge: copy.badge,
    peaks: opts.peaks,
    trackDurationSec: opts.trackDurationSec,
    bpm: opts.bpm,
    timeOriginSec: opts.timeOriginSec,
    elapsedSec:
      look.background === 'album' && look.motion === 'pulse' && !look.motion2
        ? storyPulsePreviewElapsed(opts.bpm, look.motionSpeed, opts.timeOriginSec)
        : look.background === 'album' && look.motion !== 'still'
          ? 7.5
          : storyTapeWindow(opts.timeOriginSec || 0, opts.bpm, opts.trackDurationSec).spanSec / 2,
  })
  return canvas.toDataURL('image/png')
}
