export type Rgb = { r: number; g: number; b: number }

/** Printful ghost templates bake an opaque backdrop and leave the garment translucent. */
export type BackdropKind = 'cutout' | 'ghost'

const OPAQUE = 240
const BACKDROP_DISTANCE = 12

export function hexToRgb(hex: string | null | undefined): Rgb | null {
  if (!hex) return null
  const raw = hex.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

export function channelLuma(color: Rgb): number {
  return Math.round(color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722)
}

function cornerIndex(width: number, height: number, corner: number): number {
  if (corner === 0) return 0
  if (corner === 1) return width - 1
  if (corner === 2) return (height - 1) * width
  return height * width - 1
}

export function backdropKind(data: Uint8ClampedArray, width: number, height: number): BackdropKind {
  if (width < 1 || height < 1) return 'cutout'
  let alpha = 0
  for (let corner = 0; corner < 4; corner += 1) {
    alpha += data[cornerIndex(width, height, corner) * 4 + 3]
  }
  return alpha / 4 >= OPAQUE ? 'ghost' : 'cutout'
}

function backdropColor(data: Uint8ClampedArray, width: number, height: number): Rgb {
  let r = 0
  let g = 0
  let b = 0
  for (let corner = 0; corner < 4; corner += 1) {
    const index = cornerIndex(width, height, corner) * 4
    r += data[index]
    g += data[index + 1]
    b += data[index + 2]
  }
  return { r: r / 4, g: g / 4, b: b / 4 }
}

function nearBackdrop(r: number, g: number, b: number, backdrop: Rgb): boolean {
  return (
    Math.abs(r - backdrop.r) <= BACKDROP_DISTANCE &&
    Math.abs(g - backdrop.g) <= BACKDROP_DISTANCE &&
    Math.abs(b - backdrop.b) <= BACKDROP_DISTANCE
  )
}

/**
 * Recolor only the baked backdrop. Translucent garment pixels stay composited
 * on the product color, so the hat or shirt fabric does not pick up the mat.
 */
export function paintGarmentBackdrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mat: Rgb,
  garment: Rgb,
): Uint8ClampedArray {
  const kind = backdropKind(data, width, height)
  if (kind === 'cutout') return data
  const backdrop = backdropColor(data, width, height)
  const out = new Uint8ClampedArray(data.length)
  for (let index = 0; index < data.length; index += 4) {
    const sourceR = data[index]
    const sourceG = data[index + 1]
    const sourceB = data[index + 2]
    const sourceA = data[index + 3]
    if (sourceA >= OPAQUE && nearBackdrop(sourceR, sourceG, sourceB, backdrop)) {
      out[index] = mat.r
      out[index + 1] = mat.g
      out[index + 2] = mat.b
      out[index + 3] = 255
      continue
    }
    const cover = sourceA / 255
    out[index] = Math.round(sourceR * cover + garment.r * (1 - cover))
    out[index + 1] = Math.round(sourceG * cover + garment.g * (1 - cover))
    out[index + 2] = Math.round(sourceB * cover + garment.b * (1 - cover))
    out[index + 3] = 255
  }
  return out
}

/**
 * A front photo pasted into a back silhouette shows the collar opening and brand tag.
 * Repaint that narrow neck from the fabric just below it. The shirt outline stays put,
 * so Printful's print box still lands on the same pixels.
 */
export function coverFrontNeck(
  pattern: Uint8ClampedArray,
  silhouette: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (width < 8 || height < 8 || pattern.length !== silhouette.length || pattern.length !== width * height * 4) {
    return pattern
  }
  const spans: Array<[number, number] | null> = new Array(height)
  let maxSpan = 1
  for (let y = 0; y < height; y += 1) {
    let left = -1
    let right = -1
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      if (silhouette[(row + x) * 4 + 3] < 128) {
        if (left < 0) left = x
        right = x
      }
    }
    if (left >= 0) {
      spans[y] = [left, right]
      maxSpan = Math.max(maxSpan, right - left)
    }
  }
  const neck: number[] = []
  let started = false
  for (let y = 0; y < height; y += 1) {
    const span = spans[y]
    if (!span) {
      if (started) break
      continue
    }
    started = true
    if (span[1] - span[0] <= maxSpan * 0.5) neck.push(y)
    else if (neck.length > 0) break
  }
  const count = neck.length
  if (count < 6 || count > height * 0.22) return pattern
  const sourceStart = neck[count - 1] + 1
  if (sourceStart >= height) return pattern
  const sourceHeight = Math.min(count, height - sourceStart)
  if (sourceHeight < 1) return pattern
  const out = new Uint8ClampedArray(pattern)
  for (let i = 0; i < count; i += 1) {
    const y = neck[i]
    const span = spans[y]
    if (!span) continue
    const fromEnd = count > 1 ? (count - 1 - i) / (count - 1) : 0
    const sampleY = Math.min(height - 1, sourceStart + Math.round(fromEnd * (sourceHeight - 1)))
    const sampleSpan = spans[sampleY]
    for (let x = span[0]; x <= span[1]; x += 1) {
      const sx = sampleSpan ? Math.min(Math.max(x, sampleSpan[0]), sampleSpan[1]) : x
      const src = (sampleY * width + sx) * 4
      const dst = (y * width + x) * 4
      out[dst] = pattern[src]
      out[dst + 1] = pattern[src + 1]
      out[dst + 2] = pattern[src + 2]
      out[dst + 3] = pattern[src + 3]
    }
  }
  return out
}

/**
 * Printful positioning ghosts leave the garment transparent and the backdrop opaque.
 * Paint the color photo through the hole so a patterned shirt is not a flat swatch.
 */
export function fillSilhouetteWithPattern(
  silhouette: Uint8ClampedArray,
  pattern: Uint8ClampedArray,
  mat: Rgb | null,
): Uint8ClampedArray {
  if (silhouette.length !== pattern.length || silhouette.length % 4 !== 0) return silhouette
  const out = new Uint8ClampedArray(silhouette.length)
  for (let index = 0; index < silhouette.length; index += 4) {
    const hole = 1 - silhouette[index + 3] / 255
    const backdropR = mat ? mat.r : silhouette[index]
    const backdropG = mat ? mat.g : silhouette[index + 1]
    const backdropB = mat ? mat.b : silhouette[index + 2]
    out[index] = Math.round(pattern[index] * hole + backdropR * (1 - hole))
    out[index + 1] = Math.round(pattern[index + 1] * hole + backdropG * (1 - hole))
    out[index + 2] = Math.round(pattern[index + 2] * hole + backdropB * (1 - hole))
    out[index + 3] = 255
  }
  return out
}
