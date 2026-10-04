/**
 * Classify the visible viewport for listeners, fans, and other public visitors.
 * Width comes from the visual viewport so pinch-zoom and browser chrome count,
 * not just the device user-agent.
 */

export type ConsumerDevice = 'phone' | 'tablet' | 'desktop'
export type ConsumerPointer = 'coarse' | 'fine'
export type ConsumerOrientation = 'portrait' | 'landscape'
export type ConsumerText = 'comfortable' | 'large'

export type ConsumerViewportSnapshot = {
  device: ConsumerDevice
  pointer: ConsumerPointer
  orientation: ConsumerOrientation
  text: ConsumerText
  width: number
  height: number
  scale: number
  offsetTop: number
  rootFontPx: number
}

export function classifyConsumerViewport(input: {
  width: number
  height: number
  scale?: number
  offsetTop?: number
  rootFontPx?: number
  coarsePointer: boolean
}): ConsumerViewportSnapshot {
  const width = Number.isFinite(input.width) ? Math.max(0, input.width) : 0
  const height = Number.isFinite(input.height) ? Math.max(0, input.height) : 0
  const scale = input.scale && input.scale > 0 ? input.scale : 1
  const rootFontPx = input.rootFontPx && input.rootFontPx > 0 ? input.rootFontPx : 16
  const device: ConsumerDevice = width < 480 ? 'phone' : width < 900 ? 'tablet' : 'desktop'
  const text: ConsumerText = rootFontPx >= 19 || scale >= 1.25 ? 'large' : 'comfortable'

  return {
    device,
    pointer: input.coarsePointer ? 'coarse' : 'fine',
    orientation: width >= height ? 'landscape' : 'portrait',
    text,
    width,
    height,
    scale,
    offsetTop: Math.max(0, input.offsetTop ?? 0),
    rootFontPx,
  }
}
