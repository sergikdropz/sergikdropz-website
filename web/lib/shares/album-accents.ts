/**
 * Sample album artwork into a small accent palette for share-page backgrounds.
 */

export type Rgb = { r: number; g: number; b: number }

export type AlbumAccentPalette = {
  primary: Rgb
  secondary: Rgb
  muted: Rgb
  css: {
    primary: string
    secondary: string
    muted: string
    glow: string
    wash: string
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function rgbToCss(c: Rgb, alpha = 1): string {
  if (alpha >= 1) return `rgb(${c.r}, ${c.g}, ${c.b})`
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
}

function relativeLuminance(c: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

function saturation(c: Rgb): number {
  const max = Math.max(c.r, c.g, c.b) / 255
  const min = Math.min(c.r, c.g, c.b) / 255
  if (max === min) return 0
  const l = (max + min) / 2
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: clampByte(a.r + (b.r - a.r) * t),
    g: clampByte(a.g + (b.g - a.g) * t),
    b: clampByte(a.b + (b.b - a.b) * t),
  }
}

function darken(c: Rgb, amount: number): Rgb {
  return mix(c, { r: 0, g: 0, b: 0 }, amount)
}

function quantize(c: Rgb, step = 24): string {
  const q = (n: number) => Math.round(n / step) * step
  return `${q(c.r)},${q(c.g)},${q(c.b)}`
}

/** Build a usable palette from raw ImageData pixels. */
export function paletteFromImageData(data: ImageData): AlbumAccentPalette | null {
  const { data: pixels, width, height } = data
  if (!width || !height) return null

  const buckets = new Map<string, { sum: Rgb; count: number; sat: number }>()
  // Skip near-black / near-white / low-alpha — they don't make good accents.
  for (let i = 0; i < pixels.length; i += 16) {
    const r = pixels[i]!
    const g = pixels[i + 1]!
    const b = pixels[i + 2]!
    const a = pixels[i + 3]!
    if (a < 200) continue
    const c = { r, g, b }
    const lum = relativeLuminance(c)
    if (lum < 0.04 || lum > 0.92) continue
    const sat = saturation(c)
    if (sat < 0.08 && lum > 0.15 && lum < 0.85) continue
    const key = quantize(c)
    const prev = buckets.get(key)
    if (prev) {
      prev.sum.r += r
      prev.sum.g += g
      prev.sum.b += b
      prev.count += 1
      prev.sat += sat
    } else {
      buckets.set(key, { sum: { r, g, b }, count: 1, sat })
    }
  }

  if (buckets.size === 0) return null

  const scored = [...buckets.values()]
    .map((bucket) => {
      const avg: Rgb = {
        r: bucket.sum.r / bucket.count,
        g: bucket.sum.g / bucket.count,
        b: bucket.sum.b / bucket.count,
      }
      const sat = bucket.sat / bucket.count
      const lum = relativeLuminance(avg)
      // Prefer vivid midtones that show up on a black stage.
      const score = bucket.count * (0.45 + sat * 1.8) * (1 - Math.abs(lum - 0.42))
      return { avg, sat, lum, score, count: bucket.count }
    })
    .sort((a, b) => b.score - a.score)

  const primary = scored[0]!.avg
  let secondary = scored.find((c) => colorDistance(c.avg, primary) > 55)?.avg
  if (!secondary) secondary = mix(primary, { r: 255, g: 255, b: 255 }, 0.18)
  const muted = darken(primary, 0.55)

  return {
    primary,
    secondary,
    muted,
    css: {
      primary: rgbToCss(primary),
      secondary: rgbToCss(secondary),
      muted: rgbToCss(muted),
      glow: rgbToCss(primary, 0.45),
      wash: rgbToCss(darken(primary, 0.25), 0.55),
    },
  }
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

export const FALLBACK_ACCENTS: AlbumAccentPalette = {
  primary: { r: 40, g: 40, b: 44 },
  secondary: { r: 70, g: 70, b: 78 },
  muted: { r: 18, g: 18, b: 20 },
  css: {
    primary: 'rgb(40, 40, 44)',
    secondary: 'rgb(70, 70, 78)',
    muted: 'rgb(18, 18, 20)',
    glow: 'rgba(40, 40, 44, 0.45)',
    wash: 'rgba(30, 30, 34, 0.55)',
  },
}

function proxyAccentUrl(src: string): string {
  if (
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.includes('/api/shares/artwork-proxy')
  ) {
    return src
  }
  return `/api/shares/artwork-proxy?src=${encodeURIComponent(src)}`
}

async function extractFromUrl(src: string): Promise<AlbumAccentPalette | null> {
  const img = new Image()
  img.decoding = 'async'
  img.crossOrigin = 'anonymous'

  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
  })

  img.src = src

  try {
    const image = await loaded
    const size = 48
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size)
    return paletteFromImageData(data)
  } catch {
    return null
  }
}

/**
 * Load an image URL and extract accent colors.
 * Tries the direct CDN URL first (fast); falls back to same-origin proxy for CORS.
 */
export async function extractAlbumAccents(src: string): Promise<AlbumAccentPalette | null> {
  if (!src || typeof window === 'undefined') return null

  const direct = await extractFromUrl(src)
  if (direct) return direct

  const proxied = proxyAccentUrl(src)
  if (proxied === src) return null
  return extractFromUrl(proxied)
}
