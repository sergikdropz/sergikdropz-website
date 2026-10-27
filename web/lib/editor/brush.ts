/**
 * Shared brush sizing for editors.
 *
 * A brush radius is a fraction of the surface width (0.04 is 4% of the width).
 * The painted circle and every preview use the same diameter: twice that radius,
 * in CSS pixels, with a small minimum so the mark stays visible.
 * Future brushes should keep this unit so the cursor, the slider preview, and
 * the stroke all describe the same area.
 */

export type BrushTone = 'restore' | 'erase'

export const BRUSH_MARK_CLASS =
  'rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]'

export const BRUSH_TONE_CLASS: Record<BrushTone, string> = {
  restore: 'bg-white/35',
  erase: 'bg-black/40',
}

export function brushDiameterPx(radius: number, surfaceWidth: number, minDiameter = 8): number {
  if (surfaceWidth <= 0 || radius <= 0) return minDiameter
  return Math.max(minDiameter, radius * surfaceWidth * 2)
}

export function placeBrushCursor(
  element: HTMLElement | null,
  event: { clientX: number; clientY: number; currentTarget: Element },
  diameter: number,
) {
  if (!element) return
  const bounds = event.currentTarget.getBoundingClientRect()
  const target = event.currentTarget as HTMLElement
  if (bounds.width === 0 || bounds.height === 0) return
  const scaleX = bounds.width / (target.offsetWidth || bounds.width)
  const scaleY = bounds.height / (target.offsetHeight || bounds.height)
  element.style.width = `${diameter}px`
  element.style.height = `${diameter}px`
  element.style.left = `${(event.clientX - bounds.left) / scaleX}px`
  element.style.top = `${(event.clientY - bounds.top) / scaleY}px`
  element.style.opacity = '1'
}

export function hideBrushCursor(element: HTMLElement | null) {
  if (element) element.style.opacity = '0'
}

export function resizeBrushCursor(element: HTMLElement | null, diameter: number) {
  if (!element || element.style.opacity !== '1') return
  element.style.width = `${diameter}px`
  element.style.height = `${diameter}px`
}
