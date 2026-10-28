import { morphCutoutAlpha, type ImageDataLike } from '@/lib/merch/remove-background'

export type RefineEdge = {
  /** 0–16. Only the band around the current edge is rewritten. */
  radius: number
  /** 0–100. Softens the matte edge. */
  smooth: number
  /** 0–100. Extra falloff past the edge. */
  feather: number
  /** 0–100. Pushes partial alpha toward clear or solid. */
  contrast: number
  /** −8–8 pixels. Negative contracts, positive expands. */
  shift: number
}

export const DEFAULT_REFINE: RefineEdge = {
  radius: 0,
  smooth: 0,
  feather: 0,
  contrast: 0,
  shift: 0,
}

export type NormPoint = { x: number; y: number }

function copyImage(image: ImageDataLike): ImageDataLike {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/** Rasterize a normalized polygon. Fewer than three points selects nothing. */
export function polygonMask(width: number, height: number, points: NormPoint[]): Uint8Array {
  const mask = new Uint8Array(width * height)
  if (points.length < 3 || width < 1 || height < 1) return mask
  const poly = points.map((point) => ({ x: point.x * width, y: point.y * height }))
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (const point of poly) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const x0 = Math.max(0, Math.floor(minX))
  const y0 = Math.max(0, Math.floor(minY))
  const x1 = Math.min(width - 1, Math.ceil(maxX))
  const y1 = Math.min(height - 1, Math.ceil(maxY))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, poly)) mask[y * width + x] = 1
    }
  }
  return mask
}

function pointInPolygon(px: number, py: number, poly: NormPoint[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y
    const yj = poly[j].y
    const xi = poly[i].x
    const xj = poly[j].x
    const crosses = yi > py !== yj > py
    if (!crosses) continue
    const xHit = ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi
    if (px < xHit) inside = !inside
  }
  return inside
}

export function applyMaskToMatte(
  current: ImageDataLike,
  original: ImageDataLike,
  mask: Uint8Array,
  restore: boolean,
): ImageDataLike {
  const out = copyImage(current)
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
  return out
}

function alphaOf(image: ImageDataLike): Float32Array {
  const alpha = new Float32Array(image.width * image.height)
  for (let p = 0; p < alpha.length; p++) alpha[p] = image.data[p * 4 + 3]
  return alpha
}

function blurAlpha(alpha: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return alpha
  const horizontal = new Float32Array(alpha.length)
  const out = new Float32Array(alpha.length)
  for (let y = 0; y < height; y++) {
    let sum = 0
    let count = 0
    for (let k = 0; k <= radius && k < width; k++) {
      sum += alpha[y * width + k]
      count++
    }
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / count
      const remove = x - radius
      if (remove >= 0) {
        sum -= alpha[y * width + remove]
        count--
      }
      const add = x + radius + 1
      if (add < width) {
        sum += alpha[y * width + add]
        count++
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    let count = 0
    for (let k = 0; k <= radius && k < height; k++) {
      sum += horizontal[k * width + x]
      count++
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / count
      const remove = y - radius
      if (remove >= 0) {
        sum -= horizontal[remove * width + x]
        count--
      }
      const add = y + radius + 1
      if (add < height) {
        sum += horizontal[add * width + x]
        count++
      }
    }
  }
  return out
}

function edgeDistance(alpha: Float32Array, width: number, height: number, limit: number): Uint16Array {
  const dist = new Uint16Array(alpha.length)
  dist.fill(limit + 1)
  const stack: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const a = alpha[p]
      let edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      if (!edge && x + 1 < width && Math.abs(alpha[p + 1] - a) > 40) edge = true
      if (!edge && y + 1 < height && Math.abs(alpha[p + width] - a) > 40) edge = true
      if (edge) {
        dist[p] = 0
        stack.push(p)
      }
    }
  }
  let head = 0
  while (head < stack.length) {
    const p = stack[head++]
    const next = dist[p] + 1
    if (next > limit) continue
    const x = p % width
    const y = (p - x) / width
    const neighbors = [
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      y > 0 ? p - width : -1,
      y < height - 1 ? p + width : -1,
    ]
    for (const n of neighbors) {
      if (n < 0 || dist[n] <= next) continue
      dist[n] = next
      stack.push(n)
    }
  }
  return dist
}

/** Smooth, feather, contrast, and shift the matte without rewriting colour. */
export function refineCutoutEdge(image: ImageDataLike, refine: RefineEdge): ImageDataLike {
  const radius = Math.max(0, Math.min(16, Math.round(refine.radius)))
  const smooth = Math.max(0, Math.min(100, refine.smooth))
  const feather = Math.max(0, Math.min(100, refine.feather))
  const contrast = Math.max(0, Math.min(100, refine.contrast))
  const shift = Math.max(-8, Math.min(8, Math.round(refine.shift)))
  if (radius === 0 && smooth === 0 && feather === 0 && contrast === 0 && shift === 0) return image

  let current = shift === 0 ? image : morphCutoutAlpha(image, shift)
  const { width, height } = current
  const original = alphaOf(current)
  const blurRadius = Math.round(smooth / 28 + feather / 18)
  let alpha = blurAlpha(original, width, height, blurRadius)
  if (contrast > 0) {
    const gain = 1 + contrast / 35
    for (let p = 0; p < alpha.length; p++) {
      alpha[p] = Math.max(0, Math.min(255, (alpha[p] - 128) * gain + 128))
    }
  }
  if (radius > 0) {
    const band = edgeDistance(original, width, height, radius)
    const mixed = new Float32Array(alpha.length)
    for (let p = 0; p < alpha.length; p++) {
      mixed[p] = band[p] <= radius ? alpha[p] : original[p]
    }
    alpha = mixed
  }
  const out = copyImage(current)
  for (let p = 0; p < alpha.length; p++) out.data[p * 4 + 3] = clampByte(alpha[p])
  return out
}

/**
 * Pull a white or black fringe colour out of the rim and replace it with nearby art.
 * Alpha stays put, so a stroke is not deleted.
 */
export function defringeRimColor(image: ImageDataLike, target: 'white' | 'black', amount: number): ImageDataLike {
  const strength = Math.max(0, Math.min(100, amount)) / 100
  if (strength <= 0) return image
  const { width, height, data } = image
  const out = copyImage(image)
  const wantLight = target === 'white'
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const i = p * 4
      const alpha = data[i + 3]
      if (alpha < 16) continue
      let open = false
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || data[(ny * width + nx) * 4 + 3] < 12) {
          open = true
          break
        }
      }
      if (!open) continue
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (wantLight ? luma < 185 : luma > 70) continue
      let red = 0
      let green = 0
      let blue = 0
      let found = 0
      for (let dy = -6; dy <= 6 && found === 0; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const j = (ny * width + nx) * 4
          if (data[j + 3] < 200) continue
          const sample = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]
          if (wantLight ? sample > 170 : sample < 80) continue
          red = data[j]
          green = data[j + 1]
          blue = data[j + 2]
          found = 1
          break
        }
      }
      if (!found) continue
      out.data[i] = clampByte(data[i] + (red - data[i]) * strength)
      out.data[i + 1] = clampByte(data[i + 1] + (green - data[i + 1]) * strength)
      out.data[i + 2] = clampByte(data[i + 2] + (blue - data[i + 2]) * strength)
      out.data[i + 3] = alpha
    }
  }
  return out
}

export type SampleDab = {
  x: number
  y: number
  radius: number
  srcX: number
  srcY: number
  heal: boolean
}

/** Heal matches the sampled colour to the destination lightness. Clone copies pixels. */
export function applySampleDabs(image: ImageDataLike, dabs: SampleDab[]): ImageDataLike {
  if (dabs.length === 0) return image
  const { width, height } = image
  const out = copyImage(image)
  for (const dab of dabs) {
    const cx = dab.x * width
    const cy = dab.y * height
    const ox = (dab.srcX - dab.x) * width
    const oy = (dab.srcY - dab.y) * height
    const rad = Math.max(1, dab.radius * width)
    const r2 = rad * rad
    const x0 = Math.max(0, Math.floor(cx - rad))
    const x1 = Math.min(width - 1, Math.ceil(cx + rad))
    const y0 = Math.max(0, Math.floor(cy - rad))
    const y1 = Math.min(height - 1, Math.ceil(cy + rad))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        if (dx * dx + dy * dy > r2) continue
        const sx = Math.min(width - 1, Math.max(0, Math.round(x + ox)))
        const sy = Math.min(height - 1, Math.max(0, Math.round(y + oy)))
        const si = (sy * width + sx) * 4
        const di = (y * width + x) * 4
        if (!dab.heal) {
          out.data[di] = image.data[si]
          out.data[di + 1] = image.data[si + 1]
          out.data[di + 2] = image.data[si + 2]
          out.data[di + 3] = image.data[si + 3]
          continue
        }
        const srcL = 0.2126 * image.data[si] + 0.7152 * image.data[si + 1] + 0.0722 * image.data[si + 2]
        const dstL = 0.2126 * image.data[di] + 0.7152 * image.data[di + 1] + 0.0722 * image.data[di + 2]
        const shift = dstL - srcL
        out.data[di] = clampByte(image.data[si] + shift)
        out.data[di + 1] = clampByte(image.data[si + 1] + shift)
        out.data[di + 2] = clampByte(image.data[si + 2] + shift)
      }
    }
  }
  return out
}

export type InpaintStamp = { x: number; y: number; radius: number }

/** Fill brushed pixels from surrounding colour. The hole stays opaque. */
export function inpaintStamps(image: ImageDataLike, stamps: InpaintStamp[]): ImageDataLike {
  if (stamps.length === 0) return image
  const { width, height } = image
  const mask = new Uint8Array(width * height)
  for (const stamp of stamps) {
    const cx = stamp.x * width
    const cy = stamp.y * height
    const rad = Math.max(1, stamp.radius * width)
    const r2 = rad * rad
    const x0 = Math.max(0, Math.floor(cx - rad))
    const x1 = Math.min(width - 1, Math.ceil(cx + rad))
    const y0 = Math.max(0, Math.floor(cy - rad))
    const y1 = Math.min(height - 1, Math.ceil(cy + rad))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        if (dx * dx + dy * dy <= r2) mask[y * width + x] = 1
      }
    }
  }
  const out = copyImage(image)
  const filled = new Uint8Array(mask.length)
  for (let pass = 0; pass < 12; pass++) {
    const prev = out.data
    const next = new Uint8ClampedArray(prev)
    const grew = new Uint8Array(mask.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (!mask[p] || filled[p]) continue
        let red = 0
        let green = 0
        let blue = 0
        let count = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const n = ny * width + nx
            if (mask[n] && !filled[n]) continue
            const j = n * 4
            red += prev[j]
            green += prev[j + 1]
            blue += prev[j + 2]
            count++
          }
        }
        if (!count) continue
        const i = p * 4
        next[i] = clampByte(red / count)
        next[i + 1] = clampByte(green / count)
        next[i + 2] = clampByte(blue / count)
        next[i + 3] = 255
        grew[p] = 1
      }
    }
    out.data = next
    let any = false
    for (let p = 0; p < filled.length; p++) {
      if (!grew[p]) continue
      filled[p] = 1
      any = true
    }
    if (!any) break
  }
  return { data: out.data, width, height }
}
