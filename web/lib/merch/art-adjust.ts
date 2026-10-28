import {
  applyMaskToMatte,
  applySampleDabs,
  defringeRimColor,
  DEFAULT_REFINE,
  inpaintStamps,
  polygonMask,
  refineCutoutEdge,
  type InpaintStamp,
  type NormPoint,
  type RefineEdge,
  type SampleDab,
} from '@/lib/merch/cutout-tools'
import {
  applyMagicWand,
  cleanCutoutFringe,
  colorRangeMask,
  crispCutoutEdge,
  edgeSubjectCutout,
  fillCutoutHoles,
  invertCutoutAlpha,
  magicWandMask,
  morphCutoutAlpha,
  polishCutoutMatte,
  removeSolidBackground,
  shaveCutout,
  type ImageDataLike,
} from '@/lib/merch/remove-background'

export type CurvePoint = { x: number; y: number }

export type ArtTone = {
  brightness: number
  contrast: number
  saturation: number
  highlights: number
  shadows: number
  temperature: number
  hue: number
  clarity: number
  /** Blur radius as a fraction of the shorter side. 0 is sharp. */
  blur: number
}

export type ArtCurves = {
  rgb: CurvePoint[]
  r: CurvePoint[]
  g: CurvePoint[]
  b: CurvePoint[]
}

export type CropRect = { x: number; y: number; w: number; h: number }

export type FitMode = 'original' | 'square' | 'portrait'

export type EdgeStroke = {
  /** 0–1 across the source image, before rotate. */
  x: number
  y: number
  /** Radius as a fraction of the source width. */
  radius: number
  restore: boolean
}

export type WandFill = {
  x: number
  y: number
  /** 0–72 perceptual colour distance from seed. */
  tolerance: number
  /** 0–100 blocks bleed across edges (higher = tighter). */
  edgeGuard: number
  restore: boolean
}

export type RangeFill = {
  x: number
  y: number
  tolerance: number
  contiguous: boolean
  restore: boolean
}

export type LassoRegion = {
  points: NormPoint[]
  restore: boolean
}

export type { InpaintStamp, RefineEdge, SampleDab }

export type Rgb = [number, number, number]

export type ArtEdit = {
  tone: ArtTone
  curves: ArtCurves
  flipX: boolean
  flipY: boolean
  rotate: number
  crop: CropRect
  fit: FitMode
  padColor: Rgb
  /** Frame thickness as a fraction of the shorter side. */
  border: number
  borderColor: Rgb
  cutout: boolean
  /** 0–100. Clears leftover background colour along the cutout edge. */
  edgeClean: number
  /** 0–100. 100 peels about six pixels, one fraction of a pixel per step. */
  shave: number
  /** 0–100. Snaps a soft edge and pulls background colour out of the rim. */
  crisp: number
  /** Edge-aware border cut. Keeps strokes that a loose colour flood would eat. */
  subjectCutout: boolean
  strokes: EdgeStroke[]
  wandFills: WandFill[]
  rangeFills: RangeFill[]
  lassos: LassoRegion[]
  sampleDabs: SampleDab[]
  inpaints: InpaintStamp[]
  refine: RefineEdge
  defringe: 'off' | 'white' | 'black'
  defringeAmount: number
  invertMask: boolean
  fillHoles: boolean
  /** Net morphological expand (+) / contract (−) on the matte, in pixels. */
  maskExpand: number
}

export const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
]

export const RESET_TONE: ArtTone = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  hue: 0,
  clarity: 0,
  blur: 0,
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 }

export function identityCurves(): ArtCurves {
  return {
    rgb: IDENTITY_CURVE.map((point) => ({ ...point })),
    r: IDENTITY_CURVE.map((point) => ({ ...point })),
    g: IDENTITY_CURVE.map((point) => ({ ...point })),
    b: IDENTITY_CURVE.map((point) => ({ ...point })),
  }
}

export function cloneArtEdit(edit: ArtEdit): ArtEdit {
  return {
    ...edit,
    tone: { ...edit.tone },
    curves: {
      rgb: edit.curves.rgb.map((point) => ({ ...point })),
      r: edit.curves.r.map((point) => ({ ...point })),
      g: edit.curves.g.map((point) => ({ ...point })),
      b: edit.curves.b.map((point) => ({ ...point })),
    },
    crop: { ...edit.crop },
    padColor: [...edit.padColor],
    borderColor: [...edit.borderColor],
    strokes: edit.strokes.map((stroke) => ({ ...stroke })),
    wandFills: edit.wandFills.map((fill) => ({ ...fill })),
    rangeFills: edit.rangeFills.map((fill) => ({ ...fill })),
    lassos: edit.lassos.map((region) => ({
      restore: region.restore,
      points: region.points.map((point) => ({ ...point })),
    })),
    sampleDabs: edit.sampleDabs.map((dab) => ({ ...dab })),
    inpaints: edit.inpaints.map((stamp) => ({ ...stamp })),
    refine: { ...edit.refine },
  }
}

export function defaultArtEdit(): ArtEdit {
  return {
    tone: { ...RESET_TONE },
    curves: identityCurves(),
    flipX: false,
    flipY: false,
    rotate: 0,
    crop: { ...FULL_CROP },
    fit: 'original',
    padColor: [255, 255, 255],
    border: 0,
    borderColor: [0, 0, 0],
    cutout: false,
    edgeClean: 0,
    shave: 0,
    crisp: 0,
    subjectCutout: false,
    strokes: [],
    wandFills: [],
    rangeFills: [],
    lassos: [],
    sampleDabs: [],
    inpaints: [],
    refine: { ...DEFAULT_REFINE },
    defringe: 'off',
    defringeAmount: 60,
    invertMask: false,
    fillHoles: false,
    maskExpand: 0,
  }
}

export type ArtView = 'final' | 'crop' | 'cutout'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampByte(value: number) {
  return clamp(Math.round(value), 0, 255)
}

export function curveLut(points: CurvePoint[]): Uint8Array {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const lut = new Uint8Array(256)
  if (sorted.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i
    return lut
  }
  for (let i = 0; i < 256; i++) {
    let left = sorted[0]
    let right = sorted[sorted.length - 1]
    for (let p = 0; p < sorted.length - 1; p++) {
      if (i >= sorted[p].x && i <= sorted[p + 1].x) {
        left = sorted[p]
        right = sorted[p + 1]
        break
      }
    }
    if (i <= sorted[0].x) {
      lut[i] = clampByte(sorted[0].y)
      continue
    }
    if (i >= sorted[sorted.length - 1].x) {
      lut[i] = clampByte(sorted[sorted.length - 1].y)
      continue
    }
    const span = right.x - left.x || 1
    const t = (i - left.x) / span
    lut[i] = clampByte(left.y + (right.y - left.y) * t)
  }
  return lut
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function hueRotate(r: number, g: number, b: number, degrees: number): [number, number, number] {
  if (!degrees) return [r, g, b]
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return [
    r * (0.213 + cos * 0.787 - sin * 0.213) + g * (0.715 - cos * 0.715 - sin * 0.715) + b * (0.072 - cos * 0.072 + sin * 0.928),
    r * (0.213 - cos * 0.213 + sin * 0.143) + g * (0.715 + cos * 0.285 + sin * 0.14) + b * (0.072 - cos * 0.072 - sin * 0.283),
    r * (0.213 - cos * 0.213 - sin * 0.787) + g * (0.715 - cos * 0.715 + sin * 0.715) + b * (0.072 + cos * 0.928 + sin * 0.072),
  ]
}

function tonePixel(r: number, g: number, b: number, tone: ArtTone): [number, number, number] {
  const brightness = tone.brightness / 100
  const contrast = tone.contrast / 100
  let rr = r * brightness
  let gg = g * brightness
  let bb = b * brightness
  rr = (rr - 128) * contrast + 128
  gg = (gg - 128) * contrast + 128
  bb = (bb - 128) * contrast + 128

  const gray = luma(rr, gg, bb)
  const saturation = tone.saturation / 100
  rr = gray + (rr - gray) * saturation
  gg = gray + (gg - gray) * saturation
  bb = gray + (bb - gray) * saturation

  const warm = (tone.temperature / 100) * 36
  rr += warm
  bb -= warm

  ;[rr, gg, bb] = hueRotate(rr, gg, bb, tone.hue)

  const y = clamp(luma(rr, gg, bb) / 255, 0, 1)
  if (tone.highlights) {
    const amount = (tone.highlights / 100) * y * y
    if (amount >= 0) {
      rr += (255 - rr) * amount
      gg += (255 - gg) * amount
      bb += (255 - bb) * amount
    } else {
      rr += rr * amount
      gg += gg * amount
      bb += bb * amount
    }
  }
  if (tone.shadows) {
    const amount = (tone.shadows / 100) * (1 - y) * (1 - y)
    if (amount >= 0) {
      rr += (255 - rr) * amount
      gg += (255 - gg) * amount
      bb += (255 - bb) * amount
    } else {
      rr += rr * amount
      gg += gg * amount
      bb += bb * amount
    }
  }
  if (tone.clarity) {
    const mid = Math.sin(clamp(luma(rr, gg, bb) / 255, 0, 1) * Math.PI)
    const k = 1 + (tone.clarity / 100) * mid
    rr = (rr - 128) * k + 128
    gg = (gg - 128) * k + 128
    bb = (bb - 128) * k + 128
  }
  return [rr, gg, bb]
}

function applyToneAndCurves(image: ImageDataLike, tone: ArtTone, curves: ArtCurves): ImageDataLike {
  const rgb = curveLut(curves.rgb)
  const red = curveLut(curves.r)
  const green = curveLut(curves.g)
  const blue = curveLut(curves.b)
  const src = image.data
  const out = new Uint8ClampedArray(src.length)
  for (let i = 0; i < src.length; i += 4) {
    const [r, g, b] = tonePixel(src[i], src[i + 1], src[i + 2], tone)
    out[i] = rgb[red[clampByte(r)]]
    out[i + 1] = rgb[green[clampByte(g)]]
    out[i + 2] = rgb[blue[clampByte(b)]]
    out[i + 3] = src[i + 3]
  }
  return { data: out, width: image.width, height: image.height }
}

function boxBlur(image: ImageDataLike, radius: number): ImageDataLike {
  if (radius < 1) return image
  const { width, height, data } = image
  const horizontal = new Float32Array(data.length)
  const out = new Uint8ClampedArray(data.length)

  for (let y = 0; y < height; y++) {
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0
      let count = 0
      for (let k = 0; k <= radius && k < width; k++) {
        sum += data[(y * width + k) * 4 + channel]
        count++
      }
      for (let x = 0; x < width; x++) {
        horizontal[(y * width + x) * 4 + channel] = sum / count
        const remove = x - radius
        if (remove >= 0) {
          sum -= data[(y * width + remove) * 4 + channel]
          count--
        }
        const add = x + radius + 1
        if (add < width) {
          sum += data[(y * width + add) * 4 + channel]
          count++
        }
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0
      let count = 0
      for (let k = 0; k <= radius && k < height; k++) {
        sum += horizontal[(k * width + x) * 4 + channel]
        count++
      }
      for (let y = 0; y < height; y++) {
        out[(y * width + x) * 4 + channel] = Math.round(sum / count)
        const remove = y - radius
        if (remove >= 0) {
          sum -= horizontal[(remove * width + x) * 4 + channel]
          count--
        }
        const add = y + radius + 1
        if (add < height) {
          sum += horizontal[(add * width + x) * 4 + channel]
          count++
        }
      }
    }
  }

  return { data: out, width, height }
}

const cutoutCache = new WeakMap<Uint8ClampedArray | number[], ImageDataLike>()
const subjectCache = new WeakMap<Uint8ClampedArray | number[], ImageDataLike>()

function cachedCutout(image: ImageDataLike, subject: boolean): ImageDataLike {
  const cache = subject ? subjectCache : cutoutCache
  const hit = cache.get(image.data)
  if (hit && hit.width === image.width && hit.height === image.height) return hit
  const next = subject ? edgeSubjectCutout(image) : removeSolidBackground(image)
  cache.set(image.data, next)
  return next
}

function applyStrokes(original: ImageDataLike, current: ImageDataLike, strokes: EdgeStroke[]): ImageDataLike {
  if (strokes.length === 0) return current
  const { width, height } = current
  const out = new Uint8ClampedArray(current.data)
  for (const stroke of strokes) {
    const cx = stroke.x * width
    const cy = stroke.y * height
    const rad = Math.max(1, stroke.radius * width)
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
        const i = (y * width + x) * 4
        if (stroke.restore) {
          out[i] = original.data[i]
          out[i + 1] = original.data[i + 1]
          out[i + 2] = original.data[i + 2]
          out[i + 3] = original.data[i + 3]
        } else {
          out[i + 3] = 0
        }
      }
    }
  }
  return { data: out, width, height }
}

function applyWandFills(original: ImageDataLike, current: ImageDataLike, fills: WandFill[]): ImageDataLike {
  let out = current
  for (const fill of fills) {
    const sx = fill.x * current.width
    const sy = fill.y * current.height
    out = applyMagicWand(out, original, sx, sy, fill.tolerance, fill.restore, {
      edgeGuard: fill.edgeGuard ?? 62,
    })
  }
  return out
}

function applyRangeFills(original: ImageDataLike, current: ImageDataLike, fills: RangeFill[]): ImageDataLike {
  let out = current
  for (const fill of fills) {
    const mask = colorRangeMask(out, fill.x * out.width, fill.y * out.height, fill.tolerance, fill.contiguous, 62)
    out = applyMaskToMatte(out, original, mask, fill.restore)
  }
  return out
}

function applyLassos(original: ImageDataLike, current: ImageDataLike, regions: LassoRegion[]): ImageDataLike {
  let out = current
  for (const region of regions) {
    const mask = polygonMask(out.width, out.height, region.points)
    out = applyMaskToMatte(out, original, mask, region.restore)
  }
  return out
}

function flip(image: ImageDataLike, flipX: boolean, flipY: boolean): ImageDataLike {
  if (!flipX && !flipY) return image
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = flipX ? width - 1 - x : x
      const ny = flipY ? height - 1 - y : y
      const si = (y * width + x) * 4
      const di = (ny * width + nx) * 4
      out[di] = data[si]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si + 2]
      out[di + 3] = data[si + 3]
    }
  }
  return { data: out, width, height }
}

function rotate90(image: ImageDataLike): ImageDataLike {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = height - 1 - y
      const ny = x
      const si = (y * width + x) * 4
      const di = (ny * height + nx) * 4
      out[di] = data[si]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si + 2]
      out[di + 3] = data[si + 3]
    }
  }
  return { data: out, width: height, height: width }
}

function orient(image: ImageDataLike, flipX: boolean, flipY: boolean, rotate: number): ImageDataLike {
  let current = flip(image, flipX, flipY)
  const steps = Math.round((((rotate % 360) + 360) % 360) / 90) % 4
  for (let i = 0; i < steps; i++) current = rotate90(current)
  return current
}

function snap(value: number) {
  return Math.round(value * 10000) / 10000
}

export function clampCrop(crop: CropRect): CropRect {
  const w = snap(clamp(crop.w, 0.05, 1))
  const h = snap(clamp(crop.h, 0.05, 1))
  return {
    x: snap(clamp(crop.x, 0, 1 - w)),
    y: snap(clamp(crop.y, 0, 1 - h)),
    w,
    h,
  }
}

function pixelsOf(data: Uint8ClampedArray | number[]): Uint8ClampedArray {
  return data instanceof Uint8ClampedArray ? data : Uint8ClampedArray.from(data)
}

function cropImage(image: ImageDataLike, crop: CropRect): ImageDataLike {
  const next = clampCrop(crop)
  if (next.x === 0 && next.y === 0 && next.w === 1 && next.h === 1) return image
  const { width, height, data } = image
  const x0 = clamp(Math.round(next.x * width), 0, width - 1)
  const y0 = clamp(Math.round(next.y * height), 0, height - 1)
  const cw = clamp(Math.round(next.w * width), 1, width - x0)
  const ch = clamp(Math.round(next.h * height), 1, height - y0)
  const out = new Uint8ClampedArray(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    const si = ((y0 + y) * width + x0) * 4
    out.set(pixelsOf(data).subarray(si, si + cw * 4), y * cw * 4)
  }
  return { data: out, width: cw, height: ch }
}

function blitFit(image: ImageDataLike, mode: FitMode, color: Rgb): ImageDataLike {
  if (mode === 'original') return image
  const { width, height, data } = image
  let cw = width
  let ch = height
  if (mode === 'square') {
    const side = Math.max(width, height)
    cw = side
    ch = side
  } else {
    const target = 4 / 5
    if (width / height > target) {
      cw = width
      ch = Math.max(height, Math.round(width / target))
    } else {
      ch = height
      cw = Math.max(width, Math.round(height * target))
    }
  }
  if (cw === width && ch === height) return image
  const out = new Uint8ClampedArray(cw * ch * 4)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = color[0]
    out[i + 1] = color[1]
    out[i + 2] = color[2]
    out[i + 3] = 255
  }
  const ox = Math.floor((cw - width) / 2)
  const oy = Math.floor((ch - height) / 2)
  for (let y = 0; y < height; y++) {
    const si = y * width * 4
    const di = ((oy + y) * cw + ox) * 4
    out.set(pixelsOf(data).subarray(si, si + width * 4), di)
  }
  return { data: out, width: cw, height: ch }
}

function addBorder(image: ImageDataLike, fraction: number, color: Rgb): ImageDataLike {
  const px = Math.round(fraction * Math.min(image.width, image.height))
  if (px <= 0) return image
  const cw = image.width + px * 2
  const ch = image.height + px * 2
  const out = new Uint8ClampedArray(cw * ch * 4)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = color[0]
    out[i + 1] = color[1]
    out[i + 2] = color[2]
    out[i + 3] = 255
  }
  for (let y = 0; y < image.height; y++) {
    const si = y * image.width * 4
    const di = ((y + px) * cw + px) * 4
    out.set(pixelsOf(image.data).subarray(si, si + image.width * 4), di)
  }
  return { data: out, width: cw, height: ch }
}

export function scaleImageData(image: ImageDataLike, maxEdge: number): ImageDataLike {
  const edge = Math.max(image.width, image.height)
  if (edge <= maxEdge) return image
  const scale = maxEdge / edge
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y / height) * image.height))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x / width) * image.width))
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

export function displayToSource(
  x: number,
  y: number,
  flipX: boolean,
  flipY: boolean,
  rotate: number,
): { x: number; y: number } {
  const steps = Math.round((((rotate % 360) + 360) % 360) / 90) % 4
  let sx = x
  let sy = y
  if (steps === 1) {
    sx = y
    sy = 1 - x
  } else if (steps === 2) {
    sx = 1 - x
    sy = 1 - y
  } else if (steps === 3) {
    sx = 1 - y
    sy = x
  }
  return {
    x: clamp(flipX ? 1 - sx : sx, 0, 1),
    y: clamp(flipY ? 1 - sy : sy, 0, 1),
  }
}

export function sourceToDisplay(
  x: number,
  y: number,
  flipX: boolean,
  flipY: boolean,
  rotate: number,
): { x: number; y: number } {
  let sx = flipX ? 1 - x : x
  let sy = flipY ? 1 - y : y
  const steps = Math.round((((rotate % 360) + 360) % 360) / 90) % 4
  if (steps === 1) return { x: clamp(1 - sy, 0, 1), y: clamp(sx, 0, 1) }
  if (steps === 2) return { x: clamp(1 - sx, 0, 1), y: clamp(1 - sy, 0, 1) }
  if (steps === 3) return { x: clamp(sy, 0, 1), y: clamp(1 - sx, 0, 1) }
  return { x: clamp(sx, 0, 1), y: clamp(sy, 0, 1) }
}

export function autoTone(image: ImageDataLike): Pick<ArtTone, 'brightness' | 'contrast'> {
  const { data } = image
  const hist = new Uint32Array(256)
  let count = 0
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 16) continue
    hist[clampByte(luma(data[i], data[i + 1], data[i + 2]))]++
    count++
  }
  if (count < 8) return { brightness: 100, contrast: 100 }
  const at = (ratio: number) => {
    const target = count * ratio
    let seen = 0
    for (let i = 0; i < 256; i++) {
      seen += hist[i]
      if (seen >= target) return i
    }
    return 255
  }
  const low = at(0.05)
  const high = at(0.95)
  const mid = (low + high) / 2
  const span = Math.max(1, high - low)
  if (span < 12) {
    return { brightness: clamp(Math.round(100 + (128 - mid) * 0.8), 40, 180), contrast: 100 }
  }
  return {
    brightness: clamp(Math.round(100 + (128 - mid) * 0.35), 40, 180),
    contrast: clamp(Math.round((150 / span) * 100), 70, 180),
  }
}

const FILM_CURVE: CurvePoint[] = [
  { x: 0, y: 8 },
  { x: 64, y: 52 },
  { x: 192, y: 206 },
  { x: 255, y: 246 },
]

export function applyEffect(edit: ArtEdit, effect: 'none' | 'bw' | 'film' | 'blur'): ArtEdit {
  if (effect === 'none') {
    return { ...edit, tone: { ...RESET_TONE }, curves: identityCurves() }
  }
  if (effect === 'bw') {
    return {
      ...edit,
      tone: { ...RESET_TONE, contrast: 112, saturation: 0 },
      curves: identityCurves(),
    }
  }
  if (effect === 'film') {
    return {
      ...edit,
      tone: { ...RESET_TONE, contrast: 114, saturation: 82, temperature: 22, highlights: -12, shadows: 16 },
      curves: { ...identityCurves(), rgb: FILM_CURVE.map((point) => ({ ...point })) },
    }
  }
  return { ...edit, tone: { ...edit.tone, blur: 0.012 } }
}

/** Matte used for brush / magic-wand sampling (source space, before orient). */
export function cutoutMatteForLocalEdits(image: ImageDataLike, edit: ArtEdit, forceCutout = false): ImageDataLike | null {
  if (!edit.cutout && !forceCutout) return null
  const cached = cachedCutout(image, edit.subjectCutout)
  const matte = { data: new Uint8ClampedArray(cached.data), width: cached.width, height: cached.height }
  let current = cleanCutoutFringe(matte, image, edit.edgeClean)
  current = shaveCutout(current, ((edit.shave ?? 0) / 100) * 6)
  current = crispCutoutEdge(current, edit.crisp ?? 0)
  current = applyStrokes(image, current, edit.strokes)
  current = applyWandFills(image, current, edit.wandFills)
  current = applyRangeFills(image, current, edit.rangeFills)
  current = applyLassos(image, current, edit.lassos)
  const hasLocalErase =
    edit.strokes.some((stroke) => !stroke.restore) ||
    edit.wandFills.some((fill) => !fill.restore) ||
    edit.rangeFills.some((fill) => !fill.restore) ||
    edit.lassos.some((region) => !region.restore)
  if (hasLocalErase) current = polishCutoutMatte(current)
  if (edit.defringe !== 'off') current = defringeRimColor(current, edit.defringe, edit.defringeAmount)
  current = refineCutoutEdge(current, edit.refine)
  current = applySampleDabs(current, edit.sampleDabs)
  current = inpaintStamps(current, edit.inpaints)
  return current
}

/** Map each oriented preview pixel to a source matte pixel index. */
export function orientedPixelSourceIndexes(
  sourceWidth: number,
  sourceHeight: number,
  orientedWidth: number,
  orientedHeight: number,
  flipX: boolean,
  flipY: boolean,
  rotate: number,
): Int32Array {
  const map = new Int32Array(orientedWidth * orientedHeight)
  for (let oy = 0; oy < orientedHeight; oy++) {
    for (let ox = 0; ox < orientedWidth; ox++) {
      const { x, y } = displayToSource((ox + 0.5) / orientedWidth, (oy + 0.5) / orientedHeight, flipX, flipY, rotate)
      const sx = Math.min(sourceWidth - 1, Math.max(0, Math.floor(x * sourceWidth)))
      const sy = Math.min(sourceHeight - 1, Math.max(0, Math.floor(y * sourceHeight)))
      map[oy * orientedWidth + ox] = sy * sourceWidth + sx
    }
  }
  return map
}

export function previewMagicWandMask(
  image: ImageDataLike,
  edit: ArtEdit,
  normX: number,
  normY: number,
  tolerance: number,
  edgeGuard: number,
  forceCutout = false,
): Uint8Array | null {
  const matte = cutoutMatteForLocalEdits(image, edit, forceCutout)
  if (!matte) return null
  const sx = clamp(normX, 0, 1) * matte.width
  const sy = clamp(normY, 0, 1) * matte.height
  return magicWandMask(matte, sx, sy, { tolerance, edgeGuard })
}

export function previewColorRangeMask(
  image: ImageDataLike,
  edit: ArtEdit,
  normX: number,
  normY: number,
  tolerance: number,
  contiguous: boolean,
  forceCutout = false,
): Uint8Array | null {
  const matte = cutoutMatteForLocalEdits(image, edit, forceCutout)
  if (!matte) return null
  const sx = clamp(normX, 0, 1) * matte.width
  const sy = clamp(normY, 0, 1) * matte.height
  return colorRangeMask(matte, sx, sy, tolerance, contiguous, 62)
}

export function applyArtEdit(image: ImageDataLike, edit: ArtEdit, view: ArtView = 'final'): ImageDataLike {
  let current: ImageDataLike = image
  if (edit.cutout) {
    const matte = cutoutMatteForLocalEdits(image, edit)
    current = matte ?? image
    if (edit.fillHoles) current = fillCutoutHoles(current)
    if (edit.maskExpand) current = morphCutoutAlpha(current, edit.maskExpand)
    if (edit.invertMask) current = invertCutoutAlpha(current)
  } else if (edit.sampleDabs.length || edit.inpaints.length) {
    current = applySampleDabs(current, edit.sampleDabs)
    current = inpaintStamps(current, edit.inpaints)
  }
  current = applyToneAndCurves(current, edit.tone, edit.curves)
  const radius = Math.round(edit.tone.blur * Math.min(current.width, current.height))
  current = boxBlur(current, radius)
  if (view === 'cutout') return current

  current = orient(current, edit.flipX, edit.flipY, edit.rotate)
  if (view === 'crop') return current

  current = cropImage(current, edit.crop)
  current = blitFit(current, edit.fit, edit.padColor)
  return addBorder(current, edit.border, edit.borderColor)
}
