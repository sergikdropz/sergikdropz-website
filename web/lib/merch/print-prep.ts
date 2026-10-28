import type { ImageDataLike } from '@/lib/merch/remove-background'

const MAX_EDGE = 8192

function copyImage(image: ImageDataLike): ImageDataLike {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height }
}

function lanczos(distance: number): number {
  const x = Math.abs(distance)
  if (x < 1e-6) return 1
  if (x >= 3) return 0
  const pix = Math.PI * x
  return (3 * Math.sin(pix) * Math.sin(pix / 3)) / (pix * pix)
}

/**
 * 2× resize with a Lanczos filter and a light edge sharpen.
 * This keeps detail that is already in the file. It does not invent texture.
 */
export function lanczosUpscale(image: ImageDataLike, factor = 2): ImageDataLike {
  const scale = factor === 4 ? 4 : 2
  const width = image.width * scale
  const height = image.height * scale
  if (width > MAX_EDGE || height > MAX_EDGE) {
    throw new Error('This file is already large enough to print')
  }
  const { data, width: sw, height: sh } = image
  const horizontal = new Float32Array(width * sh * 4)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = (x + 0.5) / scale - 0.5
      const start = Math.floor(sourceX) - 2
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let weight = 0
      for (let i = start; i <= start + 5; i++) {
        const w = lanczos(sourceX - i)
        if (w === 0) continue
        const sx = Math.min(sw - 1, Math.max(0, i))
        const si = (y * sw + sx) * 4
        const a = data[si + 3] / 255
        red += data[si] * a * w
        green += data[si + 1] * a * w
        blue += data[si + 2] * a * w
        alpha += a * w
        weight += w
      }
      const di = (y * width + x) * 4
      const scaleW = weight || 1
      horizontal[di] = red / scaleW
      horizontal[di + 1] = green / scaleW
      horizontal[di + 2] = blue / scaleW
      horizontal[di + 3] = alpha / scaleW
    }
  }

  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceY = (y + 0.5) / scale - 0.5
    const start = Math.floor(sourceY) - 2
    for (let x = 0; x < width; x++) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0
      let weight = 0
      for (let i = start; i <= start + 5; i++) {
        const w = lanczos(sourceY - i)
        if (w === 0) continue
        const sy = Math.min(sh - 1, Math.max(0, i))
        const si = (sy * width + x) * 4
        red += horizontal[si] * w
        green += horizontal[si + 1] * w
        blue += horizontal[si + 2] * w
        alpha += horizontal[si + 3] * w
        weight += w
      }
      const scaleW = weight || 1
      const a = alpha / scaleW
      const di = (y * width + x) * 4
      const cover = a > 1e-4 ? 1 / a : 0
      out[di] = clampByte(red / scaleW * cover)
      out[di + 1] = clampByte(green / scaleW * cover)
      out[di + 2] = clampByte(blue / scaleW * cover)
      out[di + 3] = clampByte(a * 255)
    }
  }
  return unsharpRgb({ data: out, width, height }, 0.4)
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function unsharpRgb(image: ImageDataLike, amount: number): ImageDataLike {
  const { width, height, data } = image
  const blur = new Uint8ClampedArray(data)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) sum += data[((y + dy) * width + x + dx) * 4 + c]
        }
        blur[i + c] = sum / 9
      }
    }
  }
  const out = new Uint8ClampedArray(data)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    out[i] = clampByte(data[i] + (data[i] - blur[i]) * amount)
    out[i + 1] = clampByte(data[i + 1] + (data[i + 1] - blur[i + 1]) * amount)
    out[i + 2] = clampByte(data[i + 2] + (data[i + 2] - blur[i + 2]) * amount)
  }
  return { data: out, width, height }
}

/** Copy edge pixels outward so a print file has color past the trim. */
export function extendBleed(image: ImageDataLike, margin = 32): ImageDataLike {
  const pad = Math.max(1, Math.min(128, Math.round(margin)))
  const width = image.width + pad * 2
  const height = image.height + pad * 2
  if (width > MAX_EDGE || height > MAX_EDGE) {
    throw new Error('This file is already large enough to print')
  }
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.max(0, y - pad))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.max(0, x - pad))
      const si = (sy * image.width + sx) * 4
      const di = (y * width + x) * 4
      out[di] = image.data[si]
      out[di + 1] = image.data[si + 1]
      out[di + 2] = image.data[si + 2]
      out[di + 3] = image.data[si + 3]
    }
  }
  return { data: out, width, height }
}

function nearestCentroid(r: number, g: number, b: number, centroids: Array<[number, number, number]>): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < centroids.length; i++) {
    const [cr, cg, cb] = centroids[i]
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function posterize(image: ImageDataLike, colorCount: number): ImageDataLike {
  const { data, width, height } = image
  const samples: number[] = []
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] >= 16) samples.push(i)
  }
  if (samples.length === 0) return copyImage(image)
  const k = Math.max(2, Math.min(colorCount, samples.length))
  const centroids: Array<[number, number, number]> = []
  for (let i = 0; i < k; i++) {
    const index = samples[Math.floor((i * samples.length) / k)]
    centroids.push([data[index], data[index + 1], data[index + 2]])
  }
  for (let iter = 0; iter < 6; iter++) {
    const sum = new Float64Array(k * 3)
    const count = new Uint32Array(k)
    for (const index of samples) {
      const slot = nearestCentroid(data[index], data[index + 1], data[index + 2], centroids)
      sum[slot * 3] += data[index]
      sum[slot * 3 + 1] += data[index + 1]
      sum[slot * 3 + 2] += data[index + 2]
      count[slot]++
    }
    for (let slot = 0; slot < k; slot++) {
      if (!count[slot]) continue
      centroids[slot] = [sum[slot * 3] / count[slot], sum[slot * 3 + 1] / count[slot], sum[slot * 3 + 2] / count[slot]]
    }
  }
  const out = copyImage(image)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) {
      out.data[i + 3] = 0
      continue
    }
    const [r, g, b] = centroids[nearestCentroid(data[i], data[i + 1], data[i + 2], centroids)]
    out.data[i] = clampByte(r)
    out.data[i + 1] = clampByte(g)
    out.data[i + 2] = clampByte(b)
    out.data[i + 3] = 255
  }
  return { data: out.data, width, height }
}

function dropSpecks(image: ImageDataLike): ImageDataLike {
  const { width, height, data } = image
  const out = copyImage(image)
  const same = (i: number, j: number) =>
    Math.abs(data[i] - data[j]) < 8 && Math.abs(data[i + 1] - data[j + 1]) < 8 && Math.abs(data[i + 2] - data[j + 2]) < 8
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 16) continue
      let matches = 0
      let bestIndex = i
      let bestCount = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const j = ((y + dy) * width + x + dx) * 4
          if (same(i, j)) matches++
        }
      }
      if (matches >= 2) continue
      const counts = new Map<number, number>()
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const j = ((y + dy) * width + x + dx) * 4
          const key = (data[j] << 16) | (data[j + 1] << 8) | data[j + 2]
          const next = (counts.get(key) || 0) + 1
          counts.set(key, next)
          if (next > bestCount) {
            bestCount = next
            bestIndex = j
          }
        }
      }
      out.data[i] = data[bestIndex]
      out.data[i + 1] = data[bestIndex + 1]
      out.data[i + 2] = data[bestIndex + 2]
      out.data[i + 3] = data[bestIndex + 3]
    }
  }
  return out
}

function nearestScale(image: ImageDataLike, factor: number): ImageDataLike {
  const width = image.width * factor
  const height = image.height * factor
  if (width > MAX_EDGE || height > MAX_EDGE) {
    throw new Error('This file is already large enough to print')
  }
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / factor))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / factor))
      const si = (sy * image.width + sx) * 4
      const di = (y * width + x) * 4
      out[di] = image.data[si]
      out[di + 1] = image.data[si + 1]
      out[di + 2] = image.data[si + 2]
      out[di + 3] = image.data[si + 3]
    }
  }
  return { data: out, width, height }
}

/** Flatten a logo to solid colors and redraw it at 2× with hard edges. */
export function cleanTrace(image: ImageDataLike, colorCount = 6): ImageDataLike {
  return nearestScale(dropSpecks(posterize(image, colorCount)), 2)
}
