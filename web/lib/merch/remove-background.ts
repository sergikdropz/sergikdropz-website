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
