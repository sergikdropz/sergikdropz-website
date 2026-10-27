export const STAGE_ZOOM_MIN = 1
export const STAGE_ZOOM_MAX = 8

export function clampStageZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return STAGE_ZOOM_MIN
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, zoom))
}

/** Keeps the image point under `anchor` (stage-center coordinates) when the zoom changes. */
export function panForZoom(
  pan: { x: number; y: number },
  zoom: number,
  nextZoom: number,
  anchorX: number,
  anchorY: number,
) {
  const safe = zoom || 1
  return {
    x: anchorX - ((anchorX - pan.x) / safe) * nextZoom,
    y: anchorY - ((anchorY - pan.y) / safe) * nextZoom,
  }
}

/** Keeps a fitted image fully on screen, and a zoomed image from leaving the frame. */
export function clampStagePan(
  pan: { x: number; y: number },
  zoom: number,
  art: { width: number; height: number },
  stage?: { width: number; height: number },
) {
  const maxX = stage ? Math.max(0, (art.width * zoom - stage.width) / 2) : Math.max(80, (art.width * zoom) / 2)
  const maxY = stage ? Math.max(0, (art.height * zoom - stage.height) / 2) : Math.max(80, (art.height * zoom) / 2)
  const within = (value: number, max: number) => {
    const next = Math.min(max, Math.max(-max, value))
    return next === 0 ? 0 : next
  }
  return { x: within(pan.x, maxX), y: within(pan.y, maxY) }
}
