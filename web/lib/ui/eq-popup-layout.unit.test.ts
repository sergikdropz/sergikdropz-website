import { describe, expect, it } from 'vitest'
import {
  EQ_POPUP_GAP,
  EQ_POPUP_HEIGHT,
  EQ_POPUP_WIDTH,
  layoutEqPopupBoxes,
  type EqPopupAnchor,
} from './eq-popup-layout'

function overlapArea(a: { left: number; top: number }, b: { left: number; top: number }) {
  const x = Math.max(
    0,
    Math.min(a.left + EQ_POPUP_WIDTH, b.left + EQ_POPUP_WIDTH) - Math.max(a.left, b.left),
  )
  const y = Math.max(
    0,
    Math.min(a.top + EQ_POPUP_HEIGHT, b.top + EQ_POPUP_HEIGHT) - Math.max(a.top, b.top),
  )
  return x * y
}

function byKey(boxes: { key: string; left: number; top: number }[], key: string) {
  const box = boxes.find((b) => b.key === key)
  if (!box) throw new Error(`missing ${key}`)
  return box
}

describe('layoutEqPopupBoxes', () => {
  it('keeps a single card centered above its knob', () => {
    const [box] = layoutEqPopupBoxes(
      [{ key: 'a-low', deck: 'a', band: 'low', centerX: 200, top: 600 }],
      1200,
    )
    expect(box.left).toBeCloseTo(200 - EQ_POPUP_WIDTH / 2, 5)
    expect(box.top).toBe(600 - EQ_POPUP_HEIGHT - 6)
  })

  it('orders Low → Mid → High even if opened High first', () => {
    const boxes = layoutEqPopupBoxes(
      [
        { key: 'a-high', deck: 'a', band: 'high', centerX: 480, top: 700 },
        { key: 'a-low', deck: 'a', band: 'low', centerX: 400, top: 700 },
        { key: 'a-mid', deck: 'a', band: 'mid', centerX: 440, top: 700 },
      ],
      1400,
    )
    const low = byKey(boxes, 'a-low')
    const mid = byKey(boxes, 'a-mid')
    const high = byKey(boxes, 'a-high')
    expect(low.left).toBeLessThan(mid.left)
    expect(mid.left).toBeLessThan(high.left)
    expect(overlapArea(low, mid)).toBe(0)
    expect(overlapArea(mid, high)).toBe(0)
    expect(mid.left).toBeGreaterThanOrEqual(low.left + EQ_POPUP_WIDTH + EQ_POPUP_GAP)
  })

  it('keeps deck B cards to the right of deck A', () => {
    const anchors: EqPopupAnchor[] = [
      { key: 'b-low', deck: 'b', band: 'low', centerX: 1000, top: 700 },
      { key: 'a-high', deck: 'a', band: 'high', centerX: 480, top: 700 },
      { key: 'a-low', deck: 'a', band: 'low', centerX: 400, top: 700 },
      { key: 'b-high', deck: 'b', band: 'high', centerX: 1080, top: 700 },
    ]
    const boxes = layoutEqPopupBoxes(anchors, 1400)
    const aHigh = byKey(boxes, 'a-high')
    const bLow = byKey(boxes, 'b-low')
    expect(bLow.left).toBeGreaterThanOrEqual(aHigh.left + EQ_POPUP_WIDTH)
    expect(byKey(boxes, 'a-low').left).toBeLessThan(byKey(boxes, 'a-high').left)
    expect(byKey(boxes, 'b-low').left).toBeLessThan(byKey(boxes, 'b-high').left)
  })

  it('never places a card over the crossfader keep-out', () => {
    const xf = { left: 680, right: 720 }
    const boxes = layoutEqPopupBoxes(
      [
        { key: 'a-high', deck: 'a', band: 'high', centerX: 640, top: 700 },
        { key: 'a-mid', deck: 'a', band: 'mid', centerX: 600, top: 700 },
        { key: 'b-low', deck: 'b', band: 'low', centerX: 760, top: 700 },
      ],
      1400,
      xf,
    )
    for (const box of boxes) {
      const overlapsXf = box.left < xf.right && box.left + box.width > xf.left
      expect(overlapsXf).toBe(false)
    }
    expect(byKey(boxes, 'a-high').left + EQ_POPUP_WIDTH).toBeLessThanOrEqual(xf.left)
    expect(byKey(boxes, 'b-low').left).toBeGreaterThanOrEqual(xf.right)
  })

  it('keeps a deck’s cards in one horizontal row, never stacked', () => {
    const xf = { left: 680, right: 720 }
    const boxes = layoutEqPopupBoxes(
      [
        { key: 'a-high', deck: 'a', band: 'high', centerX: 640, top: 700 },
        { key: 'a-low', deck: 'a', band: 'low', centerX: 560, top: 700 },
        { key: 'a-mid', deck: 'a', band: 'mid', centerX: 600, top: 700 },
      ],
      1400,
      xf,
    )
    const tops = new Set(boxes.map((b) => b.top))
    expect(tops.size).toBe(1)
    const low = byKey(boxes, 'a-low')
    const mid = byKey(boxes, 'a-mid')
    const high = byKey(boxes, 'a-high')
    expect(mid.left).toBe(low.left + EQ_POPUP_WIDTH + EQ_POPUP_GAP)
    expect(high.left).toBe(mid.left + EQ_POPUP_WIDTH + EQ_POPUP_GAP)
  })
})
