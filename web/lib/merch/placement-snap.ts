import { artBox, type ArtPlacement } from '@/lib/merch/design'
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

/** Snap art inside the print area to a 25% grid; returns guides for lines that aligned. */
export function snapArtInPrintArea(
  placement: ArtPlacement,
  area: BlankPlacement,
  proposed: { x: number; y: number },
  options?: { threshold?: number; grid?: readonly number[] }
): { x: number; y: number; guides: SnapGuides } {
  const threshold = options?.threshold ?? PLACEMENT_SNAP_THRESHOLD
  const grid = options?.grid ?? PLACEMENT_SNAP_GRID

  let x = proposed.x
  let y = proposed.y

  let box = artBox({ ...placement, x, y }, area)
  const xSnap = snapOneAxis(box.x, box.x + box.w / 2, box.x + box.w, grid, threshold)
  x += xSnap.delta

  box = artBox({ ...placement, x, y }, area)
  const ySnap = snapOneAxis(box.y, box.y + box.h / 2, box.y + box.h, grid, threshold)
  y += ySnap.delta

  return {
    x,
    y,
    guides: { vertical: xSnap.activeLines, horizontal: ySnap.activeLines },
  }
}
