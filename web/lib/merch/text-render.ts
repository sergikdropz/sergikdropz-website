import {
  applyTextCase,
  arcGeometry,
  arcInkBounds,
  arcPoint,
  hexWithAlpha,
  shadeHex,
  spacedWidth,
  type MerchTextStyle,
} from '@/lib/merch/text-style'

const MAX_EDGE = 4096

type CharBox = { ch: string; w: number }

type LineLayout = {
  chars: CharBox[]
  width: number
  arc: { sweep: number; radius: number } | null
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`
  } catch {
    /* Straight text falls back to the browser default tracking. */
  }
}

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment)
  }
  return Array.from(text)
}

function measureChars(ctx: CanvasRenderingContext2D, line: string): CharBox[] {
  setLetterSpacing(ctx, 0)
  return graphemes(line).map((ch) => ({ ch, w: ctx.measureText(ch).width }))
}

function shadowOffset(style: MerchTextStyle, fontPx: number): { dx: number; dy: number; blur: number } {
  const distance = style.shadowDistance * fontPx
  const radians = (style.shadowAngle * Math.PI) / 180
  return {
    dx: Math.cos(radians) * distance,
    dy: Math.sin(radians) * distance,
    blur: style.shadowBlur * fontPx,
  }
}

function padFor(style: MerchTextStyle, fontPx: number): number {
  const shadow = shadowOffset(style, fontPx)
  const stroke = (style.strokeWidth * fontPx) / 2
  const block = style.block * fontPx * 0.02
  const echo = style.echo ? Math.hypot(shadow.dx, shadow.dy) : 0
  const plate = style.background ? fontPx * 0.35 : 0
  return fontPx * 0.42 + stroke + shadow.blur + Math.abs(shadow.dx) + Math.abs(shadow.dy) + block + echo + plate
}

function layoutLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  style: MerchTextStyle,
  fontPx: number
): LineLayout[] {
  const spacing = style.letterSpacing * fontPx
  return lines.map((line) => {
    const chars = measureChars(ctx, line)
    const width = spacedWidth(
      chars.map((item) => item.w),
      spacing
    )
    return { chars, width, arc: arcGeometry(width, style.bend, fontPx) }
  })
}

function unionBox(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  dx: number,
  dy: number
) {
  return {
    minX: box.minX + dx,
    minY: box.minY + dy,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
  }
}

function paintRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
  ctx.fill()
}

function fillPaint(ctx: CanvasRenderingContext2D, style: MerchTextStyle, x0: number, y0: number, x1: number, y1: number) {
  if (!style.fillEnd || style.fillEnd.toLowerCase() === style.fill.toLowerCase()) {
    ctx.fillStyle = style.fill
    return
  }
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
  gradient.addColorStop(0, style.fill)
  gradient.addColorStop(1, style.fillEnd)
  ctx.fillStyle = gradient
}

function drawStraight(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  style: MerchTextStyle,
  fontPx: number,
  widths: number[],
  originX: number,
  contentWidth: number
) {
  const lineHeight = fontPx * style.lineHeight
  const spacing = style.letterSpacing * fontPx
  setLetterSpacing(ctx, spacing)
  ctx.textBaseline = 'middle'
  lines.forEach((line, index) => {
    const y = lineHeight * (index + 0.5)
    let x = originX + contentWidth / 2
    ctx.textAlign = 'center'
    if (style.align === 'left') {
      ctx.textAlign = 'left'
      x = originX
    } else if (style.align === 'right') {
      ctx.textAlign = 'right'
      x = originX + contentWidth
    }
    if (style.strokeWidth > 0) {
      ctx.lineWidth = style.strokeWidth * fontPx
      ctx.strokeStyle = style.strokeColor
      ctx.strokeText(line, x, y)
    }
    const span = Math.max(widths[index] || fontPx, fontPx)
    fillPaint(ctx, style, x - span / 2, y - fontPx * 0.7, x + span / 2, y + fontPx * 0.7)
    ctx.fillText(line, x, y)
  })
}

function drawArcGlyphs(
  ctx: CanvasRenderingContext2D,
  layouts: LineLayout[],
  style: MerchTextStyle,
  fontPx: number,
  centerX: number,
  centerY: number,
  mode: 'fill' | 'stroke'
) {
  const spacing = style.letterSpacing * fontPx
  const lineHeight = fontPx * style.lineHeight
  setLetterSpacing(ctx, 0)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  layouts.forEach((layout, index) => {
    if (!layout.arc || layout.chars.length === 0) return
    let cursor = -layout.width / 2
    const upward = layout.arc.sweep > 0
    for (const item of layout.chars) {
      const mid = cursor + item.w / 2
      const t = layout.width > 0 ? (mid / layout.width) * layout.arc.sweep : 0
      const point = arcPoint(layout.arc.radius, t, upward)
      ctx.save()
      ctx.translate(centerX + point.x, centerY + index * lineHeight + point.y)
      ctx.rotate(upward ? t : -t)
      if (mode === 'stroke' && style.strokeWidth > 0) {
        ctx.lineWidth = style.strokeWidth * fontPx
        ctx.strokeStyle = style.strokeColor
        ctx.strokeText(item.ch, 0, 0)
      }
      if (mode === 'fill') {
        fillPaint(ctx, style, 0, -fontPx * 0.7, 0, fontPx * 0.7)
        ctx.fillText(item.ch, 0, 0)
      }
      ctx.restore()
      cursor += item.w + spacing
    }
  })
}

function paintPlate(
  ctx: CanvasRenderingContext2D,
  style: MerchTextStyle,
  fontPx: number,
  layouts: LineLayout[],
  bent: boolean,
  metrics: {
    pad: number
    contentWidth: number
    contentHeight: number
    centerX: number
    centerY: number
  }
) {
  if (!style.background) return
  ctx.save()
  ctx.globalAlpha *= style.backgroundOpacity
  ctx.fillStyle = style.backgroundColor
  if (!bent) {
    const x = metrics.pad - fontPx * 0.22
    const y = metrics.pad - fontPx * 0.16
    paintRoundRect(
      ctx,
      x,
      y,
      metrics.contentWidth + fontPx * 0.44,
      metrics.contentHeight + fontPx * 0.32,
      fontPx * 0.18
    )
  } else {
    ctx.strokeStyle = style.backgroundColor
    ctx.lineWidth = fontPx * 1.15
    ctx.lineCap = 'round'
    layouts.forEach((layout, index) => {
      if (!layout.arc) return
      const half = Math.abs(layout.arc.sweep) / 2
      const upward = layout.arc.sweep > 0
      const start = upward ? -Math.PI / 2 - half : Math.PI / 2 - half
      const end = upward ? -Math.PI / 2 + half : Math.PI / 2 + half
      ctx.beginPath()
      ctx.arc(
        metrics.centerX,
        metrics.centerY + index * fontPx * style.lineHeight,
        layout.arc.radius,
        start,
        end
      )
      ctx.stroke()
    })
  }
  ctx.restore()
}

function paintOffsetCopy(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  blur: number,
  color: string,
  draw: () => void
) {
  ctx.save()
  ctx.translate(dx, dy)
  ctx.filter = blur > 0.5 ? `blur(${blur}px)` : 'none'
  ctx.fillStyle = color
  draw()
  ctx.restore()
}

/**
 * Bake styled text into a transparent canvas. Font size shrinks if the bitmap
 * would pass 4096 px on a side.
 */
export function renderMerchText(
  canvas: HTMLCanvasElement,
  options: { text: string; fontStack: string; fontWeight: number; style: MerchTextStyle },
  fontPx: number
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const style = options.style
  const source = applyTextCase(options.text, style.caseMode)
  const lines = source.split('\n')
  let size = Math.max(8, fontPx)

  const measure = (px: number) => {
    ctx.font = `${options.fontWeight} ${px}px ${options.fontStack}`
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    const layouts = layoutLines(ctx, lines, style, px)
    const pad = padFor(style, px)
    const lineHeight = px * style.lineHeight
    const bent = layouts.some((layout) => layout.arc)
    if (!bent) {
      const contentWidth = Math.max(px, ...layouts.map((layout) => layout.width))
      const contentHeight = Math.max(lineHeight, lineHeight * lines.length)
      return {
        layouts,
        pad,
        bent,
        width: Math.ceil(contentWidth + pad * 2),
        height: Math.ceil(contentHeight + pad * 2),
        contentWidth,
        contentHeight,
        centerX: 0,
        centerY: 0,
      }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    layouts.forEach((layout, index) => {
      if (!layout.arc) return
      const box = arcInkBounds({
        radius: layout.arc.radius,
        sweep: layout.arc.sweep,
        fontPx: px,
        extra: pad,
        upward: layout.arc.sweep > 0,
      })
      const shifted = unionBox(box, 0, index * lineHeight)
      minX = Math.min(minX, shifted.minX)
      minY = Math.min(minY, shifted.minY)
      maxX = Math.max(maxX, shifted.maxX)
      maxY = Math.max(maxY, shifted.maxY)
    })
    if (!Number.isFinite(minX)) {
      minX = -px
      minY = -px
      maxX = px
      maxY = px
    }
    return {
      layouts,
      pad,
      bent,
      width: Math.ceil(maxX - minX + 4),
      height: Math.ceil(maxY - minY + 4),
      contentWidth: 0,
      contentHeight: 0,
      centerX: -minX + 2,
      centerY: -minY + 2,
    }
  }

  let metrics = measure(size)
  const edge = Math.max(metrics.width, metrics.height)
  if (edge > MAX_EDGE) {
    size = Math.max(16, size * (MAX_EDGE / edge))
    metrics = measure(size)
  }

  canvas.width = Math.max(1, metrics.width)
  canvas.height = Math.max(1, metrics.height)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `${options.fontWeight} ${size}px ${options.fontStack}`
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.globalAlpha = Math.min(1, Math.max(0.05, style.opacity))

  const layouts = layoutLines(ctx, lines, style, size)
  const pad = padFor(style, size)
  const lineHeight = size * style.lineHeight
  const contentWidth = Math.max(size, ...layouts.map((layout) => layout.width))
  const contentHeight = lineHeight * lines.length
  const shadow = shadowOffset(style, size)
  const shadowColor = hexWithAlpha(style.shadowColor, style.shadowOpacity)

  paintPlate(ctx, style, size, layouts, metrics.bent, {
    pad,
    contentWidth,
    contentHeight,
    centerX: metrics.centerX,
    centerY: metrics.centerY,
  })

  const drawSolid = (color: string) => {
    if (metrics.bent) {
      drawArcGlyphs(
        ctx,
        layouts,
        { ...style, fill: color, fillEnd: null, strokeWidth: 0 },
        size,
        metrics.centerX,
        metrics.centerY,
        'fill'
      )
      return
    }
    ctx.save()
    setLetterSpacing(ctx, style.letterSpacing * size)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    lines.forEach((line, index) => {
      const y = pad + lineHeight * (index + 0.5)
      let x = pad + contentWidth / 2
      ctx.textAlign = 'center'
      if (style.align === 'left') {
        ctx.textAlign = 'left'
        x = pad
      } else if (style.align === 'right') {
        ctx.textAlign = 'right'
        x = pad + contentWidth
      }
      ctx.fillText(line, x, y)
    })
    ctx.restore()
  }

  if (shadow.blur > 0.5 || (style.echo && (Math.abs(shadow.dx) > 0.5 || Math.abs(shadow.dy) > 0.5))) {
    paintOffsetCopy(ctx, shadow.dx, shadow.dy, shadow.blur, shadowColor, () => drawSolid(shadowColor))
  }

  if (style.block > 0) {
    const step = size * 0.018
    const radians = (style.shadowAngle * Math.PI) / 180
    for (let i = style.block; i >= 1; i -= 1) {
      const color = shadeHex(style.fill, 0.12 + 0.55 * (i / style.block))
      ctx.save()
      ctx.translate(Math.cos(radians) * step * i, Math.sin(radians) * step * i)
      drawSolid(color)
      ctx.restore()
    }
  }

  ctx.save()
  if (metrics.bent) {
    if (style.strokeWidth > 0) {
      drawArcGlyphs(ctx, layouts, style, size, metrics.centerX, metrics.centerY, 'stroke')
    }
    drawArcGlyphs(ctx, layouts, style, size, metrics.centerX, metrics.centerY, 'fill')
  } else {
    ctx.translate(pad, pad)
    drawStraight(
      ctx,
      lines,
      style,
      size,
      layouts.map((layout) => layout.width),
      0,
      contentWidth
    )
  }
  ctx.restore()
  stretchCanvas(canvas, style.scaleX, style.scaleY)
}

/** Stretch the finished bitmap. 1 × 1 leaves the font's natural proportions. */
function stretchCanvas(canvas: HTMLCanvasElement, scaleX: number, scaleY: number) {
  const sx = Math.min(2.5, Math.max(0.25, Number.isFinite(scaleX) ? scaleX : 1))
  const sy = Math.min(2.5, Math.max(0.25, Number.isFinite(scaleY) ? scaleY : 1))
  if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return
  const srcW = canvas.width
  const srcH = canvas.height
  if (srcW < 1 || srcH < 1) return
  let dstW = Math.max(1, Math.round(srcW * sx))
  let dstH = Math.max(1, Math.round(srcH * sy))
  const edge = Math.max(dstW, dstH)
  if (edge > MAX_EDGE) {
    const fit = MAX_EDGE / edge
    dstW = Math.max(1, Math.round(dstW * fit))
    dstH = Math.max(1, Math.round(dstH * fit))
  }
  const copy = document.createElement('canvas')
  copy.width = srcW
  copy.height = srcH
  const copyCtx = copy.getContext('2d')
  const ctx = canvas.getContext('2d')
  if (!copyCtx || !ctx) return
  copyCtx.drawImage(canvas, 0, 0)
  canvas.width = dstW
  canvas.height = dstH
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(copy, 0, 0, dstW, dstH)
}
