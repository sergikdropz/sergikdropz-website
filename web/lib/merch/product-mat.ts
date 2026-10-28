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
