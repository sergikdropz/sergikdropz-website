/**
 * Dependency-free "remove the solid background" for merch art.
 *
 * This is a chroma/flood-fill matte, not an ML subject segmenter: it lifts a
 * uniform background (white/solid) by flood-filling inward from the image edges
 * and clearing pixels within `tolerance` of the sampled background colour. That
 * covers the common cases — logos, line art, and the clean-background art our AI
 * generator is prompted to produce — with no API key. For photographic subjects
 * on busy backgrounds, use a provider-based remover (future enhancement).
 */

export type ImageDataLike = {
  data: Uint8ClampedArray | number[]
  width: number
  height: number
}

export type RemoveBackgroundOptions = {
  /** 0–255 colour distance that still counts as "background". Default 32. */
  tolerance?: number
  /** Override the sampled background colour as [r,g,b]. */
  backgroundColor?: [number, number, number]
  /** Soften the cut edge by fading alpha over this many distance units. Default 24. */
  feather?: number
}

function srgbChannelToLinear(channel: number): number {
  const v = channel / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Fast weighted RGB distance (background flood + fringe). */
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db)
}

/** Stricter perceptual distance for magic-wand matching (sRGB-linear). */
export function colorDistancePerceptual(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const lr1 = srgbChannelToLinear(r1) * 255
  const lg1 = srgbChannelToLinear(g1) * 255
  const lb1 = srgbChannelToLinear(b1) * 255
  const lr2 = srgbChannelToLinear(r2) * 255
  const lg2 = srgbChannelToLinear(g2) * 255
  const lb2 = srgbChannelToLinear(b2) * 255
  const dr = lr1 - lr2
  const dg = lg1 - lg2
  const db = lb1 - lb2
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db)
}

export type MagicWandOptions = {
  /** 0–72 typical; perceptual colour distance from seed. */
  tolerance: number
  /** 0–100 blocks flood across strong local edges (higher = stricter). Default 62. */
  edgeGuard?: number
}

function readRgb(data: Uint8ClampedArray | number[], index: number): [number, number, number] {
  const i = index * 4
  return [data[i], data[i + 1], data[i + 2]]
}

function pixelLuma(data: Uint8ClampedArray | number[], p: number): number {
  const i = p * 4
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
}

function gradientAt(data: Uint8ClampedArray | number[], width: number, height: number, p: number): number {
  const x = p % width
  const y = (p - x) / width
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return 0
  const l = (px: number, py: number) => pixelLuma(data, py * width + px)
  const gx =
    -l(x - 1, y - 1) +
    l(x + 1, y - 1) -
    2 * l(x - 1, y) +
    2 * l(x + 1, y) -
    l(x - 1, y + 1) +
    l(x + 1, y + 1)
  const gy =
    -l(x - 1, y - 1) -
    2 * l(x, y - 1) -
    l(x + 1, y - 1) +
    l(x - 1, y + 1) +
    2 * l(x, y + 1) +
    l(x + 1, y + 1)
  return Math.hypot(gx, gy)
}

function wandThresholds(tolerance: number, edgeGuard: number) {
  const limit = Math.max(0, Math.min(72, tolerance))
  const guard = Math.max(0, Math.min(100, edgeGuard)) / 100
  return {
    deltaLimit: (12 + limit) * (4.2 - guard * 3.6),
    lightWindow: 36 + (1 - guard) * 230,
    gradStop: 24 + (1 - guard) * 1400,
  }
}

function pixelMatchesSeed(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  p: number,
  seedP: number,
  seedRgb: [number, number, number],
  seedLuma: number,
  thresholds: { deltaLimit: number; lightWindow: number; gradStop: number },
  stopOnGradient: boolean,
): boolean {
  const i = p * 4
  if (data[i + 3] < 12) return false
  const dist = colorDistancePerceptual(data[i], data[i + 1], data[i + 2], seedRgb[0], seedRgb[1], seedRgb[2])
  if (dist > thresholds.deltaLimit) return false
  if (Math.abs(pixelLuma(data, p) - seedLuma) > thresholds.lightWindow) return false
  if (stopOnGradient && p !== seedP && gradientAt(data, width, height, p) > thresholds.gradStop && dist > thresholds.deltaLimit * 0.35) {
    return false
  }
  return true
}

/** Estimate the background colour from the four corners (median-ish via average of closest pair). */
export function estimateBackgroundColor(image: ImageDataLike): [number, number, number] {
  const { data, width, height } = image
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
  const corners: Array<[number, number, number]> = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1),
  ]
  const r = Math.round(corners.reduce((s, c) => s + c[0], 0) / corners.length)
  const g = Math.round(corners.reduce((s, c) => s + c[1], 0) / corners.length)
  const b = Math.round(corners.reduce((s, c) => s + c[2], 0) / corners.length)
  return [r, g, b]
}

/**
 * Returns a NEW ImageDataLike with background pixels made transparent.
 * The input is not mutated.
 */
export function removeSolidBackground(
  image: ImageDataLike,
  options: RemoveBackgroundOptions = {},
): ImageDataLike {
  const { width, height } = image
  const src = image.data
  const out = new Uint8ClampedArray(src.length)
  out.set(src)

  const tolerance = options.tolerance ?? 32
  const feather = Math.max(0, options.feather ?? 24)
  const [br, bg, bb] = options.backgroundColor ?? estimateBackgroundColor(image)

  const total = width * height
  const visited = new Uint8Array(total)
  // Explicit stack flood fill from every edge pixel (avoids recursion limits).
  const stack: number[] = []
  const pushIfEdge = (x: number, y: number) => stack.push(y * width + x)
  for (let x = 0; x < width; x++) {
    pushIfEdge(x, 0)
    pushIfEdge(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    pushIfEdge(0, y)
    pushIfEdge(width - 1, y)
  }

  while (stack.length) {
    const p = stack.pop() as number
    if (visited[p]) continue
    visited[p] = 1
    const i = p * 4
    const dist = colorDistance(src[i], src[i + 1], src[i + 2], br, bg, bb)
    if (dist > tolerance + feather) continue // clearly foreground — stop spreading

    // Within the fade band, scale alpha down; inside tolerance, fully clear.
    if (dist <= tolerance) {
      out[i + 3] = 0
    } else if (feather > 0) {
      const t = (dist - tolerance) / feather // 0..1 across the band
      out[i + 3] = Math.round(src[i + 3] * t)
      continue // edge pixel: keep it as a border, don't spread past it
    }

    const x = p % width
    const y = (p - x) / width
    if (x > 0) stack.push(p - 1)
    if (x < width - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - width)
    if (y < height - 1) stack.push(p + width)
  }

  return { data: out, width, height }
}

/** How far each pixel sits from transparency. 0 is already clear. */
function rimDistance(data: Uint8ClampedArray | number[], width: number, height: number, maxDist: number): Uint16Array {
  const total = width * height
  const dist = new Uint16Array(total)
  const queue = new Int32Array(total)
  let tail = 0
  for (let p = 0; p < total; p++) {
    if (data[p * 4 + 3] < 8) {
      dist[p] = 0
      queue[tail++] = p
    } else {
      dist[p] = maxDist + 1
    }
  }
  let head = 0
  while (head < tail) {
    const p = queue[head++]
    const next = dist[p] + 1
    if (next > maxDist) continue
    const x = p % width
    const y = (p - x) / width
    const visit = (n: number) => {
      if (dist[n] <= next) return
      dist[n] = next
      queue[tail++] = n
    }
    if (x > 0) visit(p - 1)
    if (x < width - 1) visit(p + 1)
    if (y > 0) visit(p - width)
    if (y < height - 1) visit(p + width)
  }
  return dist
}

/** 1 on rings fully inside `reach`, a fraction on the ring being entered. */
function rimCoverage(distance: number, reach: number): number {
  if (distance <= 0 || distance > Math.ceil(reach)) return 0
  return Math.min(1, Math.max(0, reach - (distance - 1)))
}

/**
 * Clears leftover background colour that sits on the cut edge.
 * `amount` is 0–100. Each step reaches a fraction of a pixel further and
 * fades matching colour instead of deleting a whole ring at once.
 */
export function cleanCutoutFringe(cutout: ImageDataLike, original: ImageDataLike, amount: number): ImageDataLike {
  const clean = Math.max(0, Math.min(100, amount))
  if (clean <= 0) return cutout
  const { width, height } = cutout
  const reach = (clean / 100) * 5
  const dist = rimDistance(cutout.data, width, height, Math.ceil(reach))
  const limit = 18 + clean * 0.9
  const [br, bg, bb] = estimateBackgroundColor(original)
  const out = new Uint8ClampedArray(cutout.data)
  const orig = original.data
  for (let p = 0; p < dist.length; p++) {
    const coverage = rimCoverage(dist[p], reach)
    if (coverage <= 0) continue
    const i = p * 4
    const alpha = out[i + 3]
    if (alpha === 0) continue
    const colorDist = colorDistance(orig[i], orig[i + 1], orig[i + 2], br, bg, bb)
    const closeness = colorDist <= limit ? 1 : colorDist <= limit + 36 ? 1 - (colorDist - limit) / 36 : 0
    const fade = coverage * closeness
    if (fade <= 0) continue
    out[i + 3] = Math.round(alpha * (1 - fade))
  }
  return { data: out, width, height }
}

/**
 * Peels the cut inward by `pixels`, including fractions. 0.25 fades the outer
 * pixel by a quarter. 1 removes that pixel. The inside of the artwork stays.
 */
export function shaveCutout(cutout: ImageDataLike, pixels: number): ImageDataLike {
  const peel = Math.max(0, Math.min(6, pixels))
  if (peel <= 0) return cutout
  const { width, height } = cutout
  const dist = rimDistance(cutout.data, width, height, Math.ceil(peel))
  const out = new Uint8ClampedArray(cutout.data)
  for (let p = 0; p < dist.length; p++) {
    const coverage = rimCoverage(dist[p], peel)
    if (coverage <= 0) continue
    const i = p * 4
    out[i + 3] = Math.round(out[i + 3] * (1 - coverage))
  }
  return { data: out, width, height }
}

/**
 * Tightens a soft cut a little at a time. Low values nudge the fringe.
 * High values crush it toward clear or solid, and the rim borrows colour
 * from inside the artwork. `amount` is 0–100.
 */
export function crispCutoutEdge(cutout: ImageDataLike, amount: number): ImageDataLike {
  const crisp = Math.max(0, Math.min(100, amount))
  if (crisp <= 0) return cutout
  const { width, height } = cutout
  const src = cutout.data
  const out = new Uint8ClampedArray(src)
  const gain = 1 + (crisp / 100) * 4
  for (let i = 0; i < src.length; i += 4) {
    const alpha = src[i + 3]
    if (alpha === 0 || alpha === 255) continue
    out[i + 3] = Math.max(0, Math.min(255, Math.round((alpha - 128) * gain + 128)))
  }

  const blend = crisp / 100
  const colored = new Uint8ClampedArray(out)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (colored[i + 3] < 8) continue
      let onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      if (!onEdge) {
        onEdge =
          colored[i - 4 + 3] < 8 ||
          colored[i + 4 + 3] < 8 ||
          colored[i - width * 4 + 3] < 8 ||
          colored[i + width * 4 + 3] < 8
      }
      if (!onEdge) continue
      let best = colored[i + 3]
      let red = colored[i]
      let green = colored[i + 1]
      let blue = colored[i + 2]
      let found = false
      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const j = (ny * width + nx) * 4
          if (colored[j + 3] <= best + 24) continue
          best = colored[j + 3]
          red = colored[j]
          green = colored[j + 1]
          blue = colored[j + 2]
          found = true
        }
      }
      if (!found) continue
      out[i] = Math.round(colored[i] + (red - colored[i]) * blend)
      out[i + 1] = Math.round(colored[i + 1] + (green - colored[i + 1]) * blend)
      out[i + 2] = Math.round(colored[i + 2] + (blue - colored[i + 2]) * blend)
    }
  }
  return { data: out, width, height }
}

function copyImage(image: ImageDataLike): ImageDataLike {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height }
}

/** Contiguous flood that stops at a lightness jump or a hard edge. Returns a byte mask (1 = selected). */
export function magicWandMask(
  image: ImageDataLike,
  seedX: number,
  seedY: number,
  toleranceOrOptions: number | MagicWandOptions,
): Uint8Array {
  const options: MagicWandOptions =
    typeof toleranceOrOptions === 'number' ? { tolerance: toleranceOrOptions } : toleranceOrOptions
  const { width, height, data } = image
  const mask = new Uint8Array(width * height)
  if (width === 0 || height === 0) return mask
  const sx = Math.min(width - 1, Math.max(0, Math.round(seedX)))
  const sy = Math.min(height - 1, Math.max(0, Math.round(seedY)))
  const seedP = sy * width + sx
  const seedRgb = readRgb(data, seedP)
  const seedLuma = pixelLuma(data, seedP)
  const matchTransparent = data[seedP * 4 + 3] < 12
  const thresholds = wandThresholds(options.tolerance, options.edgeGuard ?? 62)
  const stack = [seedP]

  while (stack.length) {
    const p = stack.pop() as number
    if (mask[p]) continue
    const i = p * 4
    if (matchTransparent) {
      if (data[i + 3] >= 12) continue
    } else if (!pixelMatchesSeed(data, width, height, p, seedP, seedRgb, seedLuma, thresholds, true)) {
      continue
    }
    mask[p] = 1
    const x = p % width
    const y = (p - x) / width
    if (x > 0) stack.push(p - 1)
    if (x < width - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - width)
    if (y < height - 1) stack.push(p + width)
  }
  return mask
}

/**
 * Select a colour. Contiguous walks only the connected region and stops at edges.
 * Global selects the same colour anywhere, still excluding a lightness jump such as a black stroke.
 */
export function colorRangeMask(
  image: ImageDataLike,
  seedX: number,
  seedY: number,
  tolerance: number,
  contiguous: boolean,
  edgeGuard = 62,
): Uint8Array {
  if (contiguous) return magicWandMask(image, seedX, seedY, { tolerance, edgeGuard })
  const { width, height, data } = image
  const mask = new Uint8Array(width * height)
  if (width === 0 || height === 0) return mask
  const sx = Math.min(width - 1, Math.max(0, Math.round(seedX)))
  const sy = Math.min(height - 1, Math.max(0, Math.round(seedY)))
  const seedP = sy * width + sx
  const seedRgb = readRgb(data, seedP)
  const seedLuma = pixelLuma(data, seedP)
  if (data[seedP * 4 + 3] < 12) return mask
  const thresholds = wandThresholds(tolerance, edgeGuard)
  for (let p = 0; p < mask.length; p++) {
    if (pixelMatchesSeed(data, width, height, p, seedP, seedRgb, seedLuma, thresholds, false)) mask[p] = 1
  }
  return mask
}

/** Border flood that stops at an outline. Logos on a flat field keep their strokes. */
export function edgeSubjectCutout(image: ImageDataLike): ImageDataLike {
  const { width, height, data } = image
  const out = copyImage(image)
  if (width < 2 || height < 2) return out
  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
  let br = 0
  let bg = 0
  let bb = 0
  for (const p of corners) {
    const rgb = readRgb(data, p)
    br += rgb[0]
    bg += rgb[1]
    bb += rgb[2]
  }
  const seedRgb: [number, number, number] = [br / 4, bg / 4, bb / 4]
  const seedLuma = 0.2126 * seedRgb[0] + 0.7152 * seedRgb[1] + 0.0722 * seedRgb[2]
  const thresholds = { deltaLimit: 28, lightWindow: 36, gradStop: 70 }
  const mask = new Uint8Array(width * height)
  const stack: number[] = []
  const consider = (p: number) => {
    if (mask[p]) return
    if (!pixelMatchesSeed(data, width, height, p, -1, seedRgb, seedLuma, thresholds, true)) return
    stack.push(p)
  }
  for (let x = 0; x < width; x++) {
    consider(x)
    consider((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    consider(y * width)
    consider(y * width + width - 1)
  }
  while (stack.length) {
    const p = stack.pop() as number
    if (mask[p]) continue
    if (!pixelMatchesSeed(data, width, height, p, -1, seedRgb, seedLuma, thresholds, true)) continue
    mask[p] = 1
    const x = p % width
    const y = (p - x) / width
    if (x > 0) stack.push(p - 1)
    if (x < width - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - width)
    if (y < height - 1) stack.push(p + width)
  }
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) out.data[p * 4 + 3] = 0
  }
  return out
}

/** Snap soft alpha on the matte rim and drop tiny specks. */
export function polishCutoutMatte(cutout: ImageDataLike): ImageDataLike {
  const { width, height, data } = cutout
  const out = copyImage(cutout)
  const rim = rimDistance(data, width, height, 3)
  for (let p = 0; p < rim.length; p++) {
    const i = p * 4
    const alpha = data[i + 3]
    if (alpha === 0 || alpha === 255) continue
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (luma < 110) continue
    const nearClear = rim[p] <= 2
    if (!nearClear) continue
    if (alpha < 28) out.data[i + 3] = 0
    else if (alpha > 220) out.data[i + 3] = 255
  }
  for (let p = 0; p < rim.length; p++) {
    const i = p * 4
    if (out.data[i + 3] >= 16) continue
    const luma = 0.2126 * out.data[i] + 0.7152 * out.data[i + 1] + 0.0722 * out.data[i + 2]
    if (luma < 110) continue
    let opaqueNeighbors = 0
    const x = p % width
    const y = (p - x) / width
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (out.data[(ny * width + nx) * 4 + 3] > 200) opaqueNeighbors++
      }
    }
    if (opaqueNeighbors <= 1) out.data[i + 3] = 0
  }
  return out
}

function defringeWandSelection(
  image: ImageDataLike,
  mask: Uint8Array,
  seedRgb: [number, number, number],
  fringeLimit: number,
): void {
  const { width, height, data } = image
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    const i = p * 4
    if (data[i + 3] === 0) continue
    const x = p % width
    const y = (p - x) / width
    let touchesOutside = false
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        touchesOutside = true
        break
      }
      if (!mask[ny * width + nx]) {
        touchesOutside = true
        break
      }
    }
    if (!touchesOutside) continue
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    const seedLuma = 0.2126 * seedRgb[0] + 0.7152 * seedRgb[1] + 0.0722 * seedRgb[2]
    if (Math.abs(luma - seedLuma) > 42) continue
    const dist = colorDistancePerceptual(data[i], data[i + 1], data[i + 2], seedRgb[0], seedRgb[1], seedRgb[2])
    if (dist <= fringeLimit) data[i + 3] = 0
  }
}

/** Clear or restore a magic-wand region on the current cutout. */
export function applyMagicWand(
  current: ImageDataLike,
  original: ImageDataLike,
  seedX: number,
  seedY: number,
  tolerance: number,
  restore: boolean,
  wandOptions?: Pick<MagicWandOptions, 'edgeGuard'>,
): ImageDataLike {
  const options: MagicWandOptions = { tolerance, edgeGuard: wandOptions?.edgeGuard }
  const mask = magicWandMask(current, seedX, seedY, options)
  const out = copyImage(current)
  const { width, height } = out
  const sx = Math.min(width - 1, Math.max(0, Math.round(seedX)))
  const sy = Math.min(height - 1, Math.max(0, Math.round(seedY)))
  const seedRgb = readRgb(current.data, sy * width + sx)

  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    const i = p * 4
    if (restore) {
      out.data[i] = original.data[i]
      out.data[i + 1] = original.data[i + 1]
      out.data[i + 2] = original.data[i + 2]
      out.data[i + 3] = original.data[i + 3]
    } else {
      out.data[i + 3] = 0
    }
  }
  if (!restore) {
    defringeWandSelection(out, mask, seedRgb, Math.max(8, tolerance * 0.55))
  }
  return { data: out.data, width, height }
}

/** Swap opaque and transparent areas. */
export function invertCutoutAlpha(image: ImageDataLike): ImageDataLike {
  const out = copyImage(image)
  for (let i = 3; i < out.data.length; i += 4) {
    out.data[i] = out.data[i] > 127 ? 0 : 255
  }
  return out
}

/** Close small transparent holes inside the subject (morphological close on alpha). */
export function fillCutoutHoles(image: ImageDataLike, radius = 2): ImageDataLike {
  const steps = Math.max(1, Math.min(4, Math.round(radius)))
  const dilated = morphCutoutAlpha(image, steps)
  return morphCutoutAlpha(dilated, -steps)
}

/** Positive steps dilate opaque; negative steps erode. */
export function morphCutoutAlpha(image: ImageDataLike, steps: number): ImageDataLike {
  const n = Math.max(-6, Math.min(6, Math.round(steps)))
  if (n === 0) return image
  let current = copyImage(image)
  const { width, height } = current
  const applyStep = (dilate: boolean) => {
    const src = current.data
    const out = new Uint8ClampedArray(src)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        let best = dilate ? 0 : 255
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const a = src[(ny * width + nx) * 4 + 3]
            best = dilate ? Math.max(best, a) : Math.min(best, a)
          }
        }
        out[i + 3] = best
      }
    }
    current = { data: out, width, height }
  }
  for (let s = 0; s < Math.abs(n); s++) applyStep(n > 0)
  return current
}
