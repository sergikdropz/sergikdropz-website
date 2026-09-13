/** Keep a fixed-position menu fully inside the viewport (with scroll when taller than the screen). */

export type FixedMenuSize = { width: number; height: number }

export type ClampedFixedMenuStyle = {
  left: number
  top: number
  /** Cap so tall menus scroll instead of spilling past the bottom edge. */
  maxHeight: number
  /** Stacking order — newer / focused menus get a higher value. */
  zIndex: number
}

/** Above player chrome (~10050) and admin dock menus (~11100). */
let nextPopupMenuZIndex = 12000

export function allocatePopupMenuZIndex(): number {
  nextPopupMenuZIndex += 1
  return nextPopupMenuZIndex
}

export function clampFixedMenuStyle(
  x: number,
  y: number,
  size: FixedMenuSize,
  pad = 8,
  zIndex = 12000,
): ClampedFixedMenuStyle {
  if (typeof window === 'undefined') {
    return { left: x, top: y, maxHeight: Math.max(80, size.height), zIndex }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxHeight = Math.max(80, vh - pad * 2)
  const width = Math.min(Math.max(size.width, 1), vw - pad * 2)
  const height = Math.min(Math.max(size.height, 1), maxHeight)

  return {
    left: Math.max(pad, Math.min(x, vw - width - pad)),
    top: Math.max(pad, Math.min(y, vh - height - pad)),
    maxHeight,
    zIndex,
  }
}
