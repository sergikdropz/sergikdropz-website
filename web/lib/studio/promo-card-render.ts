/**
 * Browser canvas renderer for the Release Studio promo card pack.
 */

import { zipSync } from 'fflate'
import { loadArtworkForCanvas } from '@/lib/media/canvas-artwork-load'
import { PROMO_CARD_SERVICE_PATHS } from '@/lib/studio/promo-card-service-icons'
import {
  PROMO_CARD_AVAILABLE_LABEL,
  PROMO_CARD_FONT,
  PROMO_CARD_LAYOUTS,
  PROMO_CARD_SERVICES,
  PROMO_CARD_SITE_HOST,
  promoCardCopy,
  promoCardFilename,
  promoCardPixelSize,
  type PromoCardFormat,
  type PromoCardLayoutId,
  type PromoCardMode,
  type PromoCardServiceId,
} from '@/lib/studio/promo-cards'

const FONT = PROMO_CARD_FONT

type DrawInput = {
  layout: PromoCardLayoutId
  format: PromoCardFormat
  width: number
  artwork: HTMLImageElement | null
  title: string
  artist: string
  badge: string
  cta: string
  icons: HTMLImageElement[]
  accent?: string
  accent2?: string
}

function accentFill(input: DrawInput, fallback: string): string {
  return input.accent || fallback
}

export function serviceIconSvg(id: PromoCardServiceId, fill: string): string | null {
  const mark = PROMO_CARD_SERVICE_PATHS[id]
  if (!mark) return null
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="${mark.viewBox}"><path fill="${fill}" d="${mark.d}"/></svg>`
}

const iconCache = new Map<string, Promise<HTMLImageElement[]>>()

function rasterSvg(markup: string): Promise<HTMLImageElement> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Service icon failed to load'))
    img.src = url
  })
}

const iconReady = new Map<string, HTMLImageElement[]>()

export function cachedServiceIcons(fill: string): HTMLImageElement[] | null {
  return iconReady.get(fill) || null
}

export function loadServiceIcons(fill: string): Promise<HTMLImageElement[]> {
  const cached = iconCache.get(fill)
  if (cached) return cached
  const job = Promise.all(
    PROMO_CARD_SERVICES.map(async (service) => {
      const markup = serviceIconSvg(service.id, fill)
      if (!markup) throw new Error(`Missing icon for ${service.label}`)
      return rasterSvg(markup)
    })
  ).then((icons) => {
    iconReady.set(fill, icons)
    return icons
  })
  iconCache.set(fill, job)
  return job
}

function availabilityTone(layout: PromoCardLayoutId): 'light' | 'dark' {
  return layout === 'light' || layout === 'polaroid' ? 'light' : 'dark'
}

const AVAILABILITY = {
  padTop: 26,
  label: 30,
  gapAfterLabel: 14,
  icon: 58,
  gapAfterIcons: 18,
  url: 34,
  padBot: 28,
} as const

function availabilityHeight(u: number, site = true): number {
  const row = AVAILABILITY
  return (
    row.padTop +
    row.label +
    row.gapAfterLabel +
    row.icon +
    (site ? row.gapAfterIcons + row.url : 0) +
    row.padBot
  ) * u
}

function contentLimit(height: number, u: number): number {
  return height - availabilityHeight(u)
}

export type ServiceAvailabilityStyle = {
  /** Solid is opaque. Soft is a scrim. Clear leaves the cover showing. */
  plate?: 'solid' | 'soft' | 'clear'
  /** Draw the site host under the icons. */
  site?: boolean
}

export function serviceAvailabilityHeight(width: number, site = true): number {
  return availabilityHeight(width / 1080, site)
}

export function paintServiceAvailability(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  icons: HTMLImageElement[],
  tone: 'light' | 'dark',
  style?: ServiceAvailabilityStyle
) {
  drawAvailability(ctx, width, height, width / 1080, icons, tone, style)
}

function roundRect(
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

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ir = img.width / img.height
  const r = w / h
  let sx = 0
  let sy = 0
  let sw = img.width
  let sh = img.height
  if (ir > r) {
    sw = img.height * r
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / r
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function paintCover(
  ctx: CanvasRenderingContext2D,
  artwork: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (artwork) {
    drawImageCover(ctx, artwork, x, y, w, h)
    return
  }
  ctx.fillStyle = '#27272a'
  ctx.fillRect(x, y, w, h)
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${Math.max(8, size)}px ${FONT}`
}

function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  weight: number
) {
  let size = start
  while (size > min) {
    setFont(ctx, weight, size)
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 2
  }
  setFont(ctx, weight, min)
  return min
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let next = text
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) next = next.slice(0, -1)
  return `${next.trimEnd()}…`
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let index = 0
  while (index < words.length && lines.length < maxLines) {
    let line = words[index]
    index += 1
    while (index < words.length && ctx.measureText(`${line} ${words[index]}`).width <= maxWidth) {
      line = `${line} ${words[index]}`
      index += 1
    }
    if (lines.length === maxLines - 1 && index < words.length) {
      lines.push(ellipsize(ctx, `${line} ${words.slice(index).join(' ')}`, maxWidth))
      break
    }
    lines.push(ellipsize(ctx, line, maxWidth))
  }
  return lines
}

function fillSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number
) {
  const chars = [...text]
  ctx.save()
  ctx.textAlign = 'left'
  const widths = chars.map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((sum, w) => sum + w, 0) + tracking * Math.max(0, chars.length - 1)
  let cursor = x - total / 2
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], cursor, y)
    cursor += widths[i] + tracking
  }
  ctx.restore()
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  align: CanvasTextAlign
) {
  ctx.textAlign = align
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight)
  })
}

export function renderPromoCard(input: DrawInput): HTMLCanvasElement {
  const { width, height } = promoCardPixelSize(input.format, input.width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const u = width / 1080
  const title = input.title.trim() || 'New release'
  const artist = input.artist.trim() || 'SERGIK'
  const story = input.format === 'story'

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'

  switch (input.layout) {
    case 'bleed':
      drawBleed(ctx, input, width, height, u, title, artist, story)
      break
    case 'frame':
      drawFrame(ctx, input, width, height, u, title, artist, story)
      break
    case 'light':
      drawLight(ctx, input, width, height, u, title, artist, story)
      break
    case 'poster':
      drawPoster(ctx, input, width, height, u, title, artist, story)
      break
    case 'band':
      drawBand(ctx, input, width, height, u, title, artist, story)
      break
    case 'polaroid':
      drawPolaroid(ctx, input, width, height, u, title, artist, story)
      break
    case 'stamp':
      drawStamp(ctx, input, width, height, u, title, artist, story)
      break
    case 'ticket':
      drawTicket(ctx, input, width, height, u, title, artist, story)
      break
    default:
      drawBleed(ctx, input, width, height, u, title, artist, story)
  }

  drawAvailability(ctx, width, height, u, input.icons, availabilityTone(input.layout))
  return canvas
}

function drawAvailability(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  u: number,
  icons: HTMLImageElement[],
  tone: 'light' | 'dark',
  style?: ServiceAvailabilityStyle
) {
  const plate = style?.plate || 'solid'
  const site = style?.site !== false
  const block = availabilityHeight(u, site)
  const top = height - block
  const light = tone === 'light'
  if (plate !== 'clear') {
    const alpha = plate === 'soft' ? 0.58 : 1
    ctx.fillStyle = light ? `rgba(244,244,245,${alpha})` : `rgba(9,9,11,${alpha})`
    ctx.fillRect(0, top, width, block)
    ctx.strokeStyle = light ? `rgba(24,24,27,${plate === 'soft' ? 0.2 : 0.12})` : `rgba(255,255,255,${plate === 'soft' ? 0.22 : 0.12})`
    ctx.lineWidth = Math.max(1, u)
    ctx.beginPath()
    ctx.moveTo(0, top + 0.5)
    ctx.lineTo(width, top + 0.5)
    ctx.stroke()
  }

  const row = AVAILABILITY
  const labelSize = row.label * u
  setFont(ctx, 700, labelSize)
  ctx.fillStyle = light ? '#52525b' : '#d4d4d8'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const labelY = top + (row.padTop + row.label) * u
  fillSpaced(ctx, PROMO_CARD_AVAILABLE_LABEL.toUpperCase(), width / 2, labelY, 3.4 * u)

  const icon = row.icon * u
  const gap = 16 * u
  const rowW = icons.length * icon + Math.max(0, icons.length - 1) * gap
  let x = (width - rowW) / 2
  const iconY = labelY + row.gapAfterLabel * u
  for (const img of icons) {
    ctx.drawImage(img, x, iconY, icon, icon)
    x += icon + gap
  }

  if (!site) return
  setFont(ctx, 600, row.url * u)
  ctx.fillStyle = light ? '#18181b' : '#fafafa'
  ctx.textAlign = 'center'
  ctx.fillText(PROMO_CARD_SITE_HOST, width / 2, top + block - row.padBot * u)
}

function drawBleed(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  paintCover(ctx, input.artwork, 0, 0, width, height)
  const grad = ctx.createLinearGradient(0, height * (story ? 0.42 : 0.38), 0, height)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  const pad = 72 * u
  const limit = contentLimit(height, u)
  const artistSize = story ? 34 * u : 28 * u
  setFont(ctx, 500, artistSize)
  const artistY = limit - (story ? 48 : 36) * u
  ctx.fillStyle = '#d4d4d8'
  ctx.textAlign = 'center'
  ctx.fillText(ellipsize(ctx, artist, width - pad * 2), width / 2, artistY)

  const titleSize = story ? 72 * u : 58 * u
  const titleLine = titleSize * 1.12
  setFont(ctx, 700, titleSize)
  const titleLines = wrapLines(ctx, title, width - pad * 2, 2)
  const titleStart = artistY - 28 * u - titleLines.length * titleLine
  ctx.fillStyle = '#fafafa'
  drawLines(ctx, titleLines, width / 2, titleStart + titleSize, titleLine, 'center')

  const badgeSize = fitSize(ctx, input.badge, width - pad * 2, 32 * u, 16 * u, 700)
  setFont(ctx, 700, badgeSize)
  ctx.fillStyle = accentFill(input, '#e9d5ff')
  fillSpaced(ctx, input.badge, width / 2, titleStart - 18 * u, 6 * u)
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, width, height)
  const limit = contentLimit(height, u)
  const y = story ? height * 0.08 : height * 0.06
  const art = Math.min(
    width * (story ? 0.7 : 0.58),
    height * (story ? 0.42 : 0.56),
    limit - y - (story ? 230 : 180) * u
  )
  const x = (width - art) / 2
  ctx.save()
  roundRect(ctx, x, y, art, art, 28 * u)
  ctx.clip()
  paintCover(ctx, input.artwork, x, y, art, art)
  ctx.restore()
  ctx.strokeStyle = 'rgba(167,139,250,0.7)'
  ctx.lineWidth = 3 * u
  roundRect(ctx, x, y, art, art, 28 * u)
  ctx.stroke()

  const badgeSize = fitSize(ctx, input.badge, width * 0.8, 32 * u, 16 * u, 700)
  setFont(ctx, 700, badgeSize)
  ctx.fillStyle = accentFill(input, '#c4b5fd')
  fillSpaced(ctx, input.badge, width / 2, y + art + (story ? 90 : 64) * u, 5 * u)

  setFont(ctx, 700, story ? 58 * u : 46 * u)
  const lines = wrapLines(ctx, title, width * 0.82, 2)
  ctx.fillStyle = '#fafafa'
  drawLines(ctx, lines, width / 2, y + art + (story ? 160 : 118) * u, (story ? 66 : 54) * u, 'center')

  setFont(ctx, 500, story ? 32 * u : 26 * u)
  ctx.fillStyle = '#a1a1aa'
  ctx.textAlign = 'center'
  ctx.fillText(artist, width / 2, y + art + (story ? 160 : 118) * u + lines.length * (story ? 66 : 54) * u + 8 * u)
}

function drawLight(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  ctx.fillStyle = '#f4f4f5'
  ctx.fillRect(0, 0, width, height)
  const margin = story ? 72 * u : 48 * u
  const typeBlock = story ? 300 * u : 220 * u
  const art = Math.min(width - margin * 2, contentLimit(height, u) - margin - typeBlock)
  const x = (width - art) / 2
  const y = margin
  ctx.save()
  roundRect(ctx, x, y, art, art, 8 * u)
  ctx.clip()
  paintCover(ctx, input.artwork, x, y, art, art)
  ctx.restore()

  const badge = input.badge
  setFont(ctx, 700, 22 * u)
  const badgeW = ctx.measureText(badge).width + 36 * u
  const badgeH = 40 * u
  const badgeX = width / 2 - badgeW / 2
  const badgeY = y + art + (story ? 40 : 28) * u
  ctx.fillStyle = '#18181b'
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2)
  ctx.fill()
  ctx.fillStyle = '#fafafa'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(badge, width / 2, badgeY + badgeH / 2 + 1)
  ctx.textBaseline = 'alphabetic'

  setFont(ctx, 700, story ? 56 * u : 44 * u)
  const lines = wrapLines(ctx, title, width - margin * 2, 2)
  ctx.fillStyle = '#18181b'
  drawLines(ctx, lines, width / 2, badgeY + badgeH + (story ? 70 : 56) * u, (story ? 64 : 52) * u, 'center')

  setFont(ctx, 500, story ? 30 * u : 26 * u)
  ctx.fillStyle = '#52525b'
  ctx.textAlign = 'center'
  ctx.fillText(
    artist,
    width / 2,
    badgeY + badgeH + (story ? 70 : 56) * u + lines.length * (story ? 64 : 52) * u + 6 * u
  )
}

function drawPoster(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  paintCover(ctx, input.artwork, 0, 0, width, height)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, 0, width, height)

  const badgeSize = fitSize(ctx, input.badge, width * 0.88, story ? 150 * u : 120 * u, 48 * u, 800)
  setFont(ctx, 800, badgeSize)
  ctx.fillStyle = '#fafafa'
  ctx.textAlign = 'center'
  ctx.fillText(input.badge, width / 2, height * (story ? 0.46 : 0.48))

  setFont(ctx, 600, story ? 48 * u : 40 * u)
  const lines = wrapLines(ctx, title, width * 0.84, 2)
  ctx.fillStyle = '#e4e4e7'
  drawLines(ctx, lines, width / 2, height * (story ? 0.56 : 0.6), (story ? 58 : 48) * u, 'center')

  setFont(ctx, 500, story ? 32 * u : 28 * u)
  ctx.fillStyle = accentFill(input, '#c4b5fd')
  ctx.fillText(artist, width / 2, contentLimit(height, u) - (story ? 40 : 36) * u)
}

function drawBand(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  const limit = contentLimit(height, u)
  const bandH = Math.min(height * (story ? 0.22 : 0.26), limit * 0.42)
  paintCover(ctx, input.artwork, 0, 0, width, limit - bandH)
  if (input.accent && input.accent2) {
    const grad = ctx.createLinearGradient(0, limit - bandH, width, limit)
    grad.addColorStop(0, input.accent)
    grad.addColorStop(1, input.accent2)
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = accentFill(input, '#6d28d9')
  }
  ctx.fillRect(0, limit - bandH, width, bandH)

  const pad = 56 * u
  setFont(ctx, 700, story ? 28 * u : 24 * u)
  ctx.fillStyle = '#ede9fe'
  ctx.textAlign = 'left'
  ctx.fillText(input.badge, pad, limit - bandH + (story ? 64 : 48) * u)

  setFont(ctx, 700, story ? 52 * u : 42 * u)
  const lines = wrapLines(ctx, title, width - pad * 2, 2)
  ctx.fillStyle = '#fafafa'
  drawLines(
    ctx,
    lines,
    pad,
    limit - bandH + (story ? 120 : 100) * u,
    (story ? 60 : 48) * u,
    'left'
  )

  setFont(ctx, 500, story ? 28 * u : 24 * u)
  ctx.fillStyle = '#ddd6fe'
  ctx.textAlign = 'left'
  ctx.fillText(artist, pad, limit - (story ? 36 : 32) * u)
}

function drawPolaroid(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  ctx.fillStyle = '#d4d4d8'
  ctx.fillRect(0, 0, width, height)
  const limit = contentLimit(height, u)
  const inset = story ? 64 * u : 40 * u
  const caption = story ? 150 * u : 118 * u
  const cardBottom = limit - 12 * u
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.28)'
  ctx.shadowBlur = 28 * u
  ctx.shadowOffsetY = 10 * u
  ctx.fillStyle = '#fafafa'
  ctx.fillRect(inset, inset, width - inset * 2, cardBottom - inset)
  ctx.restore()

  const photoX = inset + 22 * u
  const photoY = inset + 22 * u
  const photoW = width - inset * 2 - 44 * u
  const photoH = cardBottom - inset - caption
  paintCover(ctx, input.artwork, photoX, photoY, photoW, photoH)

  setFont(ctx, 600, story ? 40 * u : 32 * u)
  ctx.fillStyle = '#18181b'
  ctx.textAlign = 'center'
  const captionY = photoY + photoH + (story ? 70 : 52) * u
  const lines = wrapLines(ctx, title, photoW, 1)
  ctx.fillText(lines[0] || title, width / 2, captionY)
  setFont(ctx, 500, story ? 26 * u : 22 * u)
  ctx.fillStyle = '#71717a'
  ctx.fillText(`${artist}  ·  ${input.badge}`, width / 2, captionY + (story ? 42 : 34) * u)
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  paintCover(ctx, input.artwork, 0, 0, width, height)
  const top = ctx.createLinearGradient(0, 0, 0, height * 0.38)
  top.addColorStop(0, 'rgba(0,0,0,0.72)')
  top.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, width, height * 0.4)

  const pad = 64 * u
  setFont(ctx, 700, story ? 64 * u : 52 * u)
  const lines = wrapLines(ctx, title, width * 0.72, 2)
  ctx.fillStyle = '#fafafa'
  ctx.textAlign = 'left'
  drawLines(ctx, lines, pad, (story ? 120 : 96) * u, (story ? 72 : 60) * u, 'left')
  setFont(ctx, 500, story ? 30 * u : 26 * u)
  ctx.fillStyle = '#e4e4e7'
  ctx.fillText(artist, pad, (story ? 120 : 96) * u + lines.length * (story ? 72 : 60) * u + 8 * u)

  const radius = story ? 140 * u : 118 * u
  const cx = width - radius - 48 * u
  const cy = contentLimit(height, u) - radius - 20 * u
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.18)
  ctx.strokeStyle = '#fafafa'
  ctx.lineWidth = 6 * u
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, radius - 12 * u, 0, Math.PI * 2)
  ctx.stroke()
  const stampSize = fitSize(ctx, input.badge, radius * 1.5, 36 * u, 16 * u, 800)
  setFont(ctx, 800, stampSize)
  ctx.fillStyle = '#fafafa'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(input.badge, 0, 0)
  ctx.restore()
}

function drawTicket(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  width: number,
  height: number,
  u: number,
  title: string,
  artist: string,
  story: boolean
) {
  ctx.fillStyle = '#0c0a12'
  ctx.fillRect(0, 0, width, height)
  const limit = contentLimit(height, u)
  const margin = story ? 56 * u : 40 * u
  const cardBottom = limit - 8 * u
  ctx.fillStyle = '#18141f'
  roundRect(ctx, margin, margin, width - margin * 2, cardBottom - margin, 28 * u)
  ctx.fill()

  if (story) {
    const artH = (cardBottom - margin) * 0.5
    ctx.save()
    roundRect(ctx, margin, margin, width - margin * 2, artH, 28 * u)
    ctx.clip()
    paintCover(ctx, input.artwork, margin, margin, width - margin * 2, artH)
    ctx.restore()
    const split = margin + artH
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.setLineDash([10 * u, 10 * u])
    ctx.beginPath()
    ctx.moveTo(margin + 24 * u, split)
    ctx.lineTo(width - margin - 24 * u, split)
    ctx.stroke()
    ctx.setLineDash([])
    const textTop = split + 80 * u
    setFont(ctx, 700, 28 * u)
    ctx.fillStyle = accentFill(input, '#c4b5fd')
    ctx.textAlign = 'center'
    ctx.fillText(input.badge, width / 2, textTop)
    setFont(ctx, 700, 52 * u)
    const lines = wrapLines(ctx, title, width - margin * 4, 2)
    ctx.fillStyle = '#fafafa'
    drawLines(ctx, lines, width / 2, textTop + 70 * u, 60 * u, 'center')
    setFont(ctx, 500, 28 * u)
    ctx.fillStyle = '#a1a1aa'
    ctx.fillText(artist, width / 2, textTop + 70 * u + lines.length * 60 * u + 16 * u)
    return
  }

  const artW = (width - margin * 2) * 0.46
  ctx.save()
  roundRect(ctx, margin, margin, artW, cardBottom - margin, 28 * u)
  ctx.clip()
  paintCover(ctx, input.artwork, margin, margin, artW, cardBottom - margin)
  ctx.restore()
  const split = margin + artW
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.setLineDash([10 * u, 10 * u])
  ctx.beginPath()
  ctx.moveTo(split, margin + 28 * u)
  ctx.lineTo(split, cardBottom - 28 * u)
  ctx.stroke()
  ctx.setLineDash([])

  const textLeft = split + 40 * u
  const textWidth = width - margin - textLeft - 28 * u
  const textX = textLeft + textWidth / 2
  setFont(ctx, 700, 28 * u)
  ctx.fillStyle = accentFill(input, '#c4b5fd')
  ctx.textAlign = 'center'
  ctx.fillText(input.badge, textX, height * 0.34)
  const titleSize = fitSize(ctx, title, textWidth, 52 * u, 28 * u, 700)
  setFont(ctx, 700, titleSize)
  const lines = wrapLines(ctx, title, textWidth, 3)
  ctx.fillStyle = '#fafafa'
  drawLines(ctx, lines, textX, height * 0.34 + 64 * u, titleSize * 1.15, 'center')
  setFont(ctx, 500, 26 * u)
  ctx.fillStyle = '#d4d4d8'
  ctx.textAlign = 'center'
  ctx.fillText(ellipsize(ctx, artist, textWidth), textX, height * 0.34 + 64 * u + lines.length * titleSize * 1.15 + 28 * u)
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png')
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function iconsForLayout(layout: PromoCardLayoutId): Promise<HTMLImageElement[]> {
  const fill = availabilityTone(layout) === 'light' ? '#18181b' : '#fafafa'
  return loadServiceIcons(fill)
}

export async function renderPromoCardPreviewUrl(input: {
  layout: PromoCardLayoutId
  format: PromoCardFormat
  mode: PromoCardMode
  artwork: HTMLImageElement | null
  title: string
  artist: string
  comingDate?: string | null
  accent?: string
  accent2?: string
}): Promise<string> {
  const copy = promoCardCopy(input.mode, input.comingDate)
  const canvas = renderPromoCard({
    layout: input.layout,
    format: input.format,
    width: input.format === 'story' ? 360 : 480,
    artwork: input.artwork,
    title: input.title,
    artist: input.artist,
    badge: copy.badge,
    cta: copy.cta,
    icons: await iconsForLayout(input.layout),
    accent: input.accent,
    accent2: input.accent2,
  })
  const blob = await canvasToPngBlob(canvas)
  return URL.createObjectURL(blob)
}

export async function downloadPromoCard(input: {
  layout: PromoCardLayoutId
  format: PromoCardFormat
  mode: PromoCardMode
  artworkUrl?: string | null
  title: string
  artist: string
  comingDate?: string | null
  accent?: string
  accent2?: string
}): Promise<string> {
  const artwork = await loadArtworkForCanvas(input.artworkUrl)
  const copy = promoCardCopy(input.mode, input.comingDate)
  const canvas = renderPromoCard({
    layout: input.layout,
    format: input.format,
    width: 1080,
    artwork,
    title: input.title,
    artist: input.artist,
    badge: copy.badge,
    cta: copy.cta,
    icons: await iconsForLayout(input.layout),
    accent: input.accent,
    accent2: input.accent2,
  })
  const blob = await canvasToPngBlob(canvas)
  const filename = promoCardFilename(input.title, input.layout, input.format)
  downloadBlob(blob, filename)
  return filename
}

export async function downloadPromoCardPack(input: {
  format: PromoCardFormat
  mode: PromoCardMode
  artworkUrl?: string | null
  title: string
  artist: string
  comingDate?: string | null
  accent?: string
  accent2?: string
}): Promise<string> {
  const artwork = await loadArtworkForCanvas(input.artworkUrl)
  const copy = promoCardCopy(input.mode, input.comingDate)
  const [darkIcons, lightIcons] = await Promise.all([
    loadServiceIcons('#fafafa'),
    loadServiceIcons('#18181b'),
  ])
  const files: Record<string, Uint8Array> = {}
  for (const layout of PROMO_CARD_LAYOUTS) {
    const canvas = renderPromoCard({
      layout: layout.id,
      format: input.format,
      width: 1080,
      artwork,
      title: input.title,
      artist: input.artist,
      badge: copy.badge,
      cta: copy.cta,
      icons: availabilityTone(layout.id) === 'light' ? lightIcons : darkIcons,
      accent: input.accent,
      accent2: input.accent2,
    })
    const blob = await canvasToPngBlob(canvas)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    files[promoCardFilename(input.title, layout.id, input.format)] = bytes
  }
  const zipped = zipSync(files, { level: 6 })
  const slug = promoCardFilename(input.title, 'pack', input.format).replace(/-pack-[a-z]+\.png$/, '')
  const filename = `${slug}-promo-cards-${input.mode}-${input.format}.zip`
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), filename)
  return filename
}

export async function loadPromoCardArtwork(artworkUrl?: string | null) {
  return loadArtworkForCanvas(artworkUrl)
}
