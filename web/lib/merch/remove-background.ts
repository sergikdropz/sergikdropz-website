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

/** Perceptual-ish squared RGB distance (cheap, good enough for flat backgrounds). */
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
  // Weighted to human luminance sensitivity.
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db)
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
