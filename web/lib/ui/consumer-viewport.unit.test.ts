import { describe, expect, it } from 'vitest'
import { classifyConsumerViewport } from '@/lib/ui/consumer-viewport'

describe('classifyConsumerViewport', () => {
  it('treats a narrow visual viewport as a phone even when the pointer is fine', () => {
    const snap = classifyConsumerViewport({
      width: 390,
      height: 700,
      coarsePointer: false,
    })
    expect(snap.device).toBe('phone')
    expect(snap.pointer).toBe('fine')
    expect(snap.orientation).toBe('portrait')
    expect(snap.text).toBe('comfortable')
  })

  it('marks pinch-zoom and large root text as large type', () => {
    expect(
      classifyConsumerViewport({ width: 1200, height: 800, scale: 1.5, coarsePointer: false }).text,
    ).toBe('large')
    expect(
      classifyConsumerViewport({ width: 1200, height: 800, rootFontPx: 20, coarsePointer: false }).text,
    ).toBe('large')
  })

  it('uses a tablet band between phone and desktop widths', () => {
    const snap = classifyConsumerViewport({
      width: 768,
      height: 1024,
      coarsePointer: true,
    })
    expect(snap.device).toBe('tablet')
    expect(snap.pointer).toBe('coarse')
    expect(snap.orientation).toBe('portrait')
  })

  it('detects landscape phones from the visible width', () => {
    const snap = classifyConsumerViewport({
      width: 700,
      height: 320,
      coarsePointer: true,
    })
    expect(snap.device).toBe('tablet')
    expect(snap.orientation).toBe('landscape')
  })
})
