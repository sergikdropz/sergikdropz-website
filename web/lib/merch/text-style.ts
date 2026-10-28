/** Print text looks that Picsart exposes as local controls. Nothing here calls an API. */

export type TextCase = 'as-typed' | 'upper' | 'lower'
export type TextAlign = 'left' | 'center' | 'right'
export type TextPreset = 'plain' | 'outline' | 'shadow' | 'neon' | 'echo' | 'block' | 'highlight'

export type MerchTextStyle = {
  fill: string
  /** Second color. Null keeps a solid fill. */
  fillEnd: string | null
  opacity: number
  align: TextAlign
  /** Extra tracking, as a fraction of the font size. Negative tightens. */
  letterSpacing: number
  /** Line box as a multiple of the font size. */
  lineHeight: number
  caseMode: TextCase
  /** Stroke thickness as a fraction of the font size. 0 is off. */
  strokeWidth: number
  strokeColor: string
  /** Soft shadow radius as a fraction of the font size. */
  shadowBlur: number
  /** Shadow travel as a fraction of the font size. */
  shadowDistance: number
  /** Canvas degrees. 0 is right, 90 is down. */
  shadowAngle: number
  shadowColor: string
  shadowOpacity: number
  /** Hard offset copy, using the shadow distance and color. */
  echo: boolean
  /** Extrusion steps. 0 is off. */
  block: number
  background: boolean
  backgroundColor: string
  backgroundOpacity: number
  /** -100 to 100. Positive arches up. */
  bend: number
  /** Horizontal stretch. 1 keeps the font's natural width. */
  scaleX: number
  /** Vertical stretch. 1 keeps the font's natural height. */
  scaleY: number
}

export const TEXT_PRESETS: Array<{ id: TextPreset; label: string }> = [
  { id: 'plain', label: 'Plain' },
  { id: 'outline', label: 'Outline' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'neon', label: 'Neon' },
  { id: 'echo', label: 'Echo' },
  { id: 'block', label: 'Block' },
  { id: 'highlight', label: 'Highlight' },
]

export const DEFAULT_TEXT_STYLE: MerchTextStyle = {
  fill: '#ffffff',
  fillEnd: null,
  opacity: 1,
  align: 'center',
  letterSpacing: 0,
  lineHeight: 1.05,
  caseMode: 'as-typed',
  strokeWidth: 0,
  strokeColor: '#000000',
  shadowBlur: 0,
  shadowDistance: 0,
  shadowAngle: 45,
  shadowColor: '#000000',
  shadowOpacity: 0.85,
  echo: false,
  block: 0,
  background: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.78,
  bend: 0,
  scaleX: 1,
  scaleY: 1,
}

export function applyTextCase(text: string, mode: TextCase): string {
  if (mode === 'upper') return text.toUpperCase()
  if (mode === 'lower') return text.toLowerCase()
  return text
}

export function applyTextPreset(style: MerchTextStyle, preset: TextPreset): MerchTextStyle {
  const cleared: MerchTextStyle = {
    ...style,
    strokeWidth: 0,
    shadowBlur: 0,
    shadowDistance: 0,
    echo: false,
    block: 0,
    background: false,
  }
  switch (preset) {
    case 'outline':
      return { ...cleared, strokeWidth: 0.07, strokeColor: '#000000' }
    case 'shadow':
      return {
        ...cleared,
        shadowBlur: 0.08,
        shadowDistance: 0.06,
        shadowAngle: 45,
        shadowColor: '#000000',
        shadowOpacity: 0.8,
      }
    case 'neon':
      return {
        ...cleared,
        strokeWidth: 0.025,
        strokeColor: '#ffffff',
        shadowBlur: 0.22,
        shadowDistance: 0,
        shadowColor: style.fill,
        shadowOpacity: 1,
      }
    case 'echo':
      return {
        ...cleared,
        echo: true,
        shadowDistance: 0.07,
        shadowAngle: 45,
        shadowColor: '#000000',
        shadowOpacity: 1,
      }
    case 'block':
      return { ...cleared, block: 8, shadowAngle: 45 }
    case 'highlight':
      return {
        ...cleared,
        background: true,
        backgroundColor: contrastPlate(style.fill),
        backgroundOpacity: 0.82,
      }
    default:
      return cleared
  }
}

export function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = match[1]
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

export function shadeHex(hex: string, towardBlack: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const keep = Math.min(1, Math.max(0, 1 - towardBlack))
  const channel = (value: number) => Math.round(value * keep).toString(16).padStart(2, '0')
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
}

/** Dark plate behind light type, light plate behind dark type. */
export function contrastPlate(fill: string): string {
  const rgb = parseHex(fill)
  if (!rgb) return '#000000'
  const luma = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000
  return luma > 160 ? '#000000' : '#ffffff'
}

export function spacedWidth(charWidths: number[], spacingPx: number): number {
  if (charWidths.length === 0) return 0
  const letters = charWidths.reduce((sum, width) => sum + width, 0)
  return letters + spacingPx * Math.max(0, charWidths.length - 1)
}

/**
 * Circular bend. Sweep is signed radians (positive arches up).
 * Short words loosen the radius so the letters stay readable.
 */
export function arcGeometry(
  lineWidth: number,
  bend: number,
  fontPx: number
): { sweep: number; radius: number } | null {
  if (!Number.isFinite(lineWidth) || !Number.isFinite(bend) || Math.abs(bend) < 2) return null
  const width = Math.max(lineWidth, 1)
  let sweep = (Math.max(-100, Math.min(100, bend)) / 100) * Math.PI
  let radius = width / Math.abs(sweep)
  const minRadius = Math.max(fontPx * 0.9, 1)
  if (radius < minRadius) {
    radius = minRadius
    sweep = Math.sign(sweep) * (width / radius)
  }
  return { sweep, radius }
}

/** Point on the arc. `t` is radians from the middle. Y grows downward. */
export function arcPoint(radius: number, t: number, upward: boolean): { x: number; y: number } {
  const x = Math.sin(t) * radius
  const y = upward ? -Math.cos(t) * radius : Math.cos(t) * radius
  return { x, y }
}

export function arcInkBounds(args: {
  radius: number
  sweep: number
  fontPx: number
  extra: number
  upward: boolean
}): { minX: number; minY: number; maxX: number; maxY: number } {
  const half = Math.abs(args.sweep) / 2
  const reach = args.fontPx * 0.85 + Math.max(0, args.extra)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const t of [-half, 0, half]) {
    const point = arcPoint(args.radius, t, args.upward)
    minX = Math.min(minX, point.x - reach)
    maxX = Math.max(maxX, point.x + reach)
    minY = Math.min(minY, point.y - reach)
    maxY = Math.max(maxY, point.y + reach)
  }
  return { minX, minY, maxX, maxY }
}
