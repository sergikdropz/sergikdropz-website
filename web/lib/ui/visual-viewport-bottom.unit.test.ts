import { describe, expect, it } from 'vitest'
import { visualViewportBottomOffset } from '@/hooks/useVisualViewportBottomOffset'

describe('visualViewportBottomOffset', () => {
  it('is zero when visual viewport fills the layout viewport', () => {
    expect(visualViewportBottomOffset(800, 800, 0)).toBe(0)
  })

  it('accounts for URL-bar / keyboard shrink without offsetTop', () => {
    expect(visualViewportBottomOffset(800, 700, 0)).toBe(100)
  })

  it('accounts for visual viewport scrolled within the layout viewport', () => {
    expect(visualViewportBottomOffset(800, 740, 40)).toBe(20)
  })

  it('never returns a negative inset', () => {
    expect(visualViewportBottomOffset(700, 800, 0)).toBe(0)
  })
})
