import { hexToRgb } from '@/lib/merch/product-mat'

/** Flat embroidery threads Printful stocks. Names match their catalog labels. */
export const EMBROIDERY_THREADS = [
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#000000', name: 'Black' },
  { hex: '#96A1A8', name: 'Grey' },
  { hex: '#A67843', name: 'Old Gold' },
  { hex: '#FFCC00', name: 'Gold' },
  { hex: '#E25C27', name: 'Orange' },
  { hex: '#CC3366', name: 'Flamingo' },
  { hex: '#CC3333', name: 'Red' },
  { hex: '#660000', name: 'Maroon' },
  { hex: '#333366', name: 'Navy' },
  { hex: '#005397', name: 'Royal' },
  { hex: '#3399FF', name: 'Aqua' },
  { hex: '#6B5294', name: 'Purple' },
  { hex: '#01784E', name: 'Kelly Green' },
  { hex: '#7BA35A', name: 'Kiwi Green' },
] as const

const THREAD_HEX = new Set<string>(EMBROIDERY_THREADS.map((thread) => thread.hex))

/** Printful standard embroidery accepts up to six thread colors on one placement. */
export const MAX_EMBROIDERY_THREADS = 6

export function normalizeThreadHex(value: unknown): string | null {
  const hex = String(value || '').trim().toUpperCase()
  return THREAD_HEX.has(hex) ? hex : null
}

/** Add a thread, or remove it when it is already selected. The last color stays on. */
export function toggleEmbroideryThread(selected: string[], hex: string): string[] {
  const normalized = normalizeThreadHex(hex)
  const current = selected
    .map((item) => normalizeThreadHex(item))
    .filter((item): item is string => Boolean(item))
  if (!normalized) return current
  if (current.includes(normalized)) {
    return current.length === 1 ? current : current.filter((item) => item !== normalized)
  }
  if (current.length >= MAX_EMBROIDERY_THREADS) return current
  return [...current, normalized]
}

export function embroideryThreadByHex(hex: string | null | undefined) {
  const normalized = normalizeThreadHex(hex)
  return EMBROIDERY_THREADS.find((thread) => thread.hex === normalized) || EMBROIDERY_THREADS[1]
}

/**
 * Thread that matches the garment. Prefer the color name (Black, Navy, Heather Grey)
 * so a near-black hex does not land on navy.
 */
export function matchingEmbroideryThread(garmentHex: string | null | undefined, garmentName?: string | null) {
  const name = (garmentName || '').trim().toLowerCase()
  const head = name.split(/[/,&]/)[0]?.trim() || name
  if (head) {
    const ranked = [...EMBROIDERY_THREADS].sort((a, b) => b.name.length - a.name.length)
    const named = ranked.find((thread) => head.includes(thread.name.toLowerCase()))
    if (named) return named
    if (head.includes('gray') || head.includes('grey')) {
      return EMBROIDERY_THREADS.find((thread) => thread.hex === '#96A1A8') || EMBROIDERY_THREADS[2]
    }
  }
  return closestEmbroideryThread(garmentHex)
}

/** Share of the artwork a thread must cover before it counts as a stitch color. */
const THREAD_SHARE_MIN = 0.12

/** A color this far from every stock thread is outside the standard palette. */
const THREAD_FAR_DISTANCE_SQ = 80 * 80 * 3

export type ArtworkThreadMatch = {
  threads: string[]
  /** More than six real colors, or a color the standard palette cannot match. */
  needsUnlimited: boolean
}

/**
 * Map opaque artwork colors onto Printful's stock threads.
 * Fringe under 12% is ignored. More than six real colors, or a color far from
 * every stock thread, needs unlimited color.
 */
export function threadsFromColorSamples(
  samples: Array<{ r: number; g: number; b: number }>,
): ArtworkThreadMatch {
  if (samples.length === 0) return { threads: [], needsUnlimited: false }
  const buckets = new Map<string, { count: number; distance: number }>()
  for (const sample of samples) {
    let best: (typeof EMBROIDERY_THREADS)[number] = EMBROIDERY_THREADS[1]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const thread of EMBROIDERY_THREADS) {
      const color = hexToRgb(thread.hex)
      if (!color) continue
      const distance = (color.r - sample.r) ** 2 + (color.g - sample.g) ** 2 + (color.b - sample.b) ** 2
      if (distance < bestDistance) {
        best = thread
        bestDistance = distance
      }
    }
    const row = buckets.get(best.hex) || { count: 0, distance: 0 }
    row.count += 1
    row.distance += bestDistance
    buckets.set(best.hex, row)
  }
  const ranked = [...buckets.entries()]
    .map(([hex, row]) => ({
      hex,
      count: row.count,
      share: row.count / samples.length,
      mean: row.distance / row.count,
    }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
  const significant = ranked.filter((row) => row.share >= THREAD_SHARE_MIN)
  const kept = significant.length > 0 ? significant : ranked.slice(0, 1)
  const far = kept.some((row) => row.share >= 0.08 && row.mean > THREAD_FAR_DISTANCE_SQ)
  return {
    threads: kept.slice(0, MAX_EMBROIDERY_THREADS).map((row) => row.hex),
    needsUnlimited: kept.length > MAX_EMBROIDERY_THREADS || far,
  }
}

/** Read the artwork and return the stock threads it needs. Transparent pixels are skipped. */
export async function sampleArtworkThreadColors(url: string): Promise<ArtworkThreadMatch> {
  if (typeof document === 'undefined') return { threads: [], needsUnlimited: false }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('Could not read the design colors'))
    element.src = url
  })
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { threads: [], needsUnlimited: false }
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)
  context.drawImage(image, 0, 0, size, size)
  const data = context.getImageData(0, 0, size, size).data
  const samples: Array<{ r: number; g: number; b: number }> = []
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 16) continue
    samples.push({ r: data[index], g: data[index + 1], b: data[index + 2] })
  }
  return threadsFromColorSamples(samples)
}

export function embroideryThreadNames(hexes: string[]): string {
  return hexes.map((hex) => embroideryThreadByHex(hex).name).join(', ')
}

/** The sentence under Standard or Unlimited after the artwork colors are read. */
export function embroideryThreadMatchNote(matched: ArtworkThreadMatch, unlimited: boolean): string {
  const names = embroideryThreadNames(matched.threads)
  if (unlimited) return 'Unlimited color stitches every color in this design.'
  if (matched.needsUnlimited) {
    return `This design needs more than six threads. Standard keeps the six strongest: ${names}. Unlimited color stitches the rest.`
  }
  return `Matched from this design: ${names}. Tap a color to add or remove it. Up to 6.`
}

/** Map artwork pixels onto the selected threads. Unlimited color does not use this. */
export function quantizeImageData(pixels: Uint8ClampedArray, threadHexes: string[]): void {
  const palette = threadHexes
    .map((hex) => hexToRgb(hex))
    .filter((color): color is NonNullable<ReturnType<typeof hexToRgb>> => Boolean(color))
  if (palette.length === 0) return
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 16) continue
    let best = palette[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const color of palette) {
      const distance =
        (color.r - pixels[index]) ** 2 + (color.g - pixels[index + 1]) ** 2 + (color.b - pixels[index + 2]) ** 2
      if (distance < bestDistance) {
        best = color
        bestDistance = distance
      }
    }
    pixels[index] = best.r
    pixels[index + 1] = best.g
    pixels[index + 2] = best.b
  }
}

/** Thread hexes drawn on a template. Unlimited color keeps the original art. */
export function previewStitchThreads(
  unlimited: boolean | null | undefined,
  threads: Record<string, string[]> | null | undefined,
): string[] | null {
  if (unlimited) return null
  const hexes = [
    ...new Set(
      Object.values(threads || {})
        .flat()
        .map((hex) => normalizeThreadHex(hex))
        .filter((hex): hex is string => Boolean(hex)),
    ),
  ]
  return hexes.length > 0 ? hexes : null
}

/** Nearest stock thread to a garment color. */
export function closestEmbroideryThread(garmentHex: string | null | undefined) {
  const garment = hexToRgb(garmentHex)
  if (!garment) return EMBROIDERY_THREADS[1]
  let best: (typeof EMBROIDERY_THREADS)[number] = EMBROIDERY_THREADS[1]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const thread of EMBROIDERY_THREADS) {
    const color = hexToRgb(thread.hex)
    if (!color) continue
    const distance =
      (color.r - garment.r) ** 2 + (color.g - garment.g) ** 2 + (color.b - garment.b) ** 2
    if (distance < bestDistance) {
      best = thread
      bestDistance = distance
    }
  }
  return best
}

function flatThreadOptionIds(optionIds: string[]): string[] {
  return optionIds.filter(
    (id) => id.startsWith('thread_colors') && !id.includes('_3d') && !id.startsWith('addon_'),
  )
}

/**
 * Printful product-option id for a placement.
 * `embroidery_front_large` → `thread_colors_front_large`.
 * Small front is often just `thread_colors`.
 */
export function threadOptionIdForFile(fileType: string, optionIds: string[] = []): string | null {
  const type = fileType.trim().toLowerCase()
  if (!type.includes('embroidery')) return null

  if (type.startsWith('addon_embroidery_')) {
    const rest = type.slice('addon_embroidery_'.length)
    const exact = `addon_thread_colors_${rest}`
    const addon = optionIds.filter((id) => id.startsWith('addon_thread_colors') && !id.includes('_3d'))
    if (optionIds.length === 0) return exact
    return addon.find((id) => id === exact) || null
  }

  const rest = type.startsWith('embroidery_') ? type.slice('embroidery_'.length) : type
  const exact = rest === 'front' ? 'thread_colors' : `thread_colors_${rest}`
  if (optionIds.length === 0) return exact

  const flat = flatThreadOptionIds(optionIds)
  if (rest === 'front') {
    if (flat.includes('thread_colors')) return 'thread_colors'
    if (flat.includes('thread_colors_front')) return 'thread_colors_front'
    return null
  }
  if (flat.includes(exact)) return exact
  return flat.find((id) => id.endsWith(`_${rest}`)) || null
}

export function normalizeEmbroideryThreads(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string[]> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^(thread_colors(_[a-z0-9]+)*|addon_thread_colors(_[a-z0-9]+)+)$/i.test(key)) continue
    if (!Array.isArray(raw)) continue
    const colors = [...new Set(raw.map((item) => normalizeThreadHex(item)).filter((item): item is string => Boolean(item)))]
    if (colors.length > 0) out[key] = colors.slice(0, 6)
  }
  return out
}

/** Thread colors to send for the placements that actually have art. */
export function resolveEmbroideryThreads(
  fileTypes: string[],
  stored: Record<string, string[]> | undefined,
  garmentHex: string | null | undefined,
  optionIds: string[] = [],
  garmentName?: string | null,
): Record<string, string[]> {
  const next = normalizeEmbroideryThreads(stored)
  const fallback = matchingEmbroideryThread(garmentHex, garmentName).hex
  for (const fileType of fileTypes) {
    const id = threadOptionIdForFile(fileType, optionIds)
    if (!id || next[id]?.length) continue
    next[id] = [fallback]
  }
  return next
}

export function embroideryVariantOptions(
  fileTypes: string[],
  input: {
    embroideryUnlimitedColor?: boolean
    embroideryThreads?: Record<string, string[]>
    previewColor?: string | null
    previewColorName?: string | null
  },
  optionIds: string[] = [],
  /** Placements that accept unlimited color. Other embroidery placements still need threads. */
  fullColorFileTypes: string[] = [],
): Array<{ id: string; value: string[] }> {
  const unlimited = new Set(input.embroideryUnlimitedColor ? fullColorFileTypes : [])
  const needingThreads = fileTypes.filter((fileType) => !unlimited.has(fileType))
  if (needingThreads.length === 0) return []
  const resolved = resolveEmbroideryThreads(
    needingThreads,
    input.embroideryThreads,
    input.previewColor,
    optionIds,
    input.previewColorName,
  )
  const ids = needingThreads
    .map((fileType) => threadOptionIdForFile(fileType, optionIds))
    .filter((id): id is string => Boolean(id))
  return [...new Set(ids)].map((id) => ({ id, value: resolved[id] }))
}
