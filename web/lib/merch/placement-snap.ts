import { artBox, stitchInsets, type ArtPlacement } from '@/lib/merch/design'
import type { BlankPlacement } from '@/lib/merch/blanks'

export const PLACEMENT_SNAP_GRID = [0, 0.25, 0.5, 0.75, 1] as const
export const PLACEMENT_SNAP_THRESHOLD = 0.018

export type SnapGuides = { vertical: number[]; horizontal: number[] }

function snapOneAxis(
  boxMin: number,
  boxMid: number,
  boxMax: number,
  lines: readonly number[],
  threshold: number
): { delta: number; activeLines: number[] } {
  const anchors = [boxMin, boxMid, boxMax]
  let bestDelta = 0
  let bestDist = threshold

  for (const line of lines) {
    for (const anchor of anchors) {
      const dist = Math.abs(anchor - line)
      if (dist < bestDist) {
        bestDist = dist
        bestDelta = line - anchor
      }
    }
  }

  if (bestDist >= threshold) return { delta: 0, activeLines: [] }

  const nMin = boxMin + bestDelta
  const nMid = boxMid + bestDelta
  const nMax = boxMax + bestDelta
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.002
  const activeLines: number[] = []
  for (const line of lines) {
    if (near(nMin, line) || near(nMid, line) || near(nMax, line)) activeLines.push(line)
  }
  return { delta: bestDelta, activeLines }
}

/** Quarter marks of the area Printful will keep. Embroidery starts at the stitch edge, not the file edge. */
export function mitigationSnapLines(inset: number): number[] {
  if (inset <= 0.0001) return [...PLACEMENT_SNAP_GRID]
  const span = 1 - inset * 2
  return [0, 1, 2, 3, 4].map((step) => inset + (span * step) / 4)
}

/** Snap art inside the print area to a 25% grid; returns guides for lines that aligned. */
export function snapArtInPrintArea(
  placement: ArtPlacement,
  area: BlankPlacement,
  proposed: { x: number; y: number },
  options?: { threshold?: number; grid?: readonly number[] }
): { x: number; y: number; guides: SnapGuides } {
  const threshold = options?.threshold ?? PLACEMENT_SNAP_THRESHOLD
  const inset = stitchInsets(area)
  const xLines = options?.grid ?? mitigationSnapLines(inset.x)
  const yLines = options?.grid ?? mitigationSnapLines(inset.y)

  let x = proposed.x
  let y = proposed.y

  let box = artBox({ ...placement, x, y }, area)
  const xSnap = snapOneAxis(box.x, box.x + box.w / 2, box.x + box.w, xLines, threshold)
  x += xSnap.delta

  box = artBox({ ...placement, x, y }, area)
  const ySnap = snapOneAxis(box.y, box.y + box.h / 2, box.y + box.h, yLines, threshold)
  y += ySnap.delta

  return {
    x,
    y,
    guides: { vertical: xSnap.activeLines, horizontal: ySnap.activeLines },
  }
}

/** Degrees the design window treats as straight. 180 and -180 are the same edge. */
export const ROTATION_ALIGN_MARKS = [0, 45, 90, 135, 180, -45, -90, -135, -180] as const
/** Catch a mark inside this many degrees. */
export const ROTATION_ALIGN_ENTER = 4
/** Stay on a mark until the pointer moves this far past it. */
export const ROTATION_ALIGN_EXIT = 8

function normalizeRotation(degrees: number): number {
  let rotation = degrees
  while (rotation > 180) rotation -= 360
  while (rotation < -180) rotation += 360
  return rotation
}

function circularDistance(a: number, b: number): number {
  return Math.abs(normalizeRotation(a - b))
}

export type RotationAlignAxis = 0 | 45 | 90 | 135

/** The guide axis a rotation is sitting on, or null when it is between marks. */
export function rotationAlignAxis(degrees: number): RotationAlignAxis | null {
  const rotation = normalizeRotation(degrees)
  const axes: Array<[number, RotationAlignAxis]> = [
    [0, 0],
    [180, 0],
    [-180, 0],
    [90, 90],
    [-90, 90],
    [45, 45],
    [-135, 45],
    [-45, 135],
    [135, 135],
  ]
  for (const [mark, axis] of axes) {
    if (circularDistance(rotation, mark) < 0.6) return axis
  }
  return null
}

/**
 * Pull a rotation onto the nearest 45° mark while the pointer is close.
 * `held` keeps the last mark until the pointer leaves the wider exit band.
 */
export function snapRotation(
  degrees: number,
  held: number | null = null,
): { rotation: number; held: number | null } {
  const rotation = normalizeRotation(degrees)
  if (held != null && circularDistance(rotation, held) <= ROTATION_ALIGN_EXIT) {
    return { rotation: held, held }
  }
  let best: number | null = null
  let bestDist = ROTATION_ALIGN_ENTER
  for (const mark of ROTATION_ALIGN_MARKS) {
    const dist = circularDistance(rotation, mark)
    if (dist <= bestDist) {
      bestDist = dist
      best = mark
    }
  }
  if (best == null) return { rotation, held: null }
  if (Math.abs(best) === 180) {
    const signed = rotation < 0 ? -180 : 180
    return { rotation: signed, held: signed }
  }
  return { rotation: best, held: best }
}
