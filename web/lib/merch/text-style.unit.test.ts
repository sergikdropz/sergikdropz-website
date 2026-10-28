import { describe, expect, it } from 'vitest'
import {
  applyTextCase,
  applyTextPreset,
  arcGeometry,
  arcPoint,
  contrastPlate,
  DEFAULT_TEXT_STYLE,
  shadeHex,
  spacedWidth,
} from './text-style'

describe('merch text style', () => {
  it('changes case without touching mixed mode', () => {
    expect(applyTextCase('Sergik', 'upper')).toBe('SERGIK')
    expect(applyTextCase('Sergik', 'lower')).toBe('sergik')
    expect(applyTextCase('Sergik', 'as-typed')).toBe('Sergik')
  })

  it('adds tracking between letters and not after the last one', () => {
    expect(spacedWidth([10, 20, 30], 4)).toBe(68)
    expect(spacedWidth([12], 4)).toBe(12)
    expect(spacedWidth([], 4)).toBe(0)
  })

  it('arches a long line into a semicircle and keeps a short word loose', () => {
    const full = arcGeometry(1000, 100, 40)
    expect(full).not.toBeNull()
    expect(full!.sweep).toBeCloseTo(Math.PI)
    expect(full!.radius).toBeCloseTo(1000 / Math.PI)

    const short = arcGeometry(80, 100, 100)
    expect(short).not.toBeNull()
    expect(short!.radius).toBeGreaterThanOrEqual(90)
    expect(Math.abs(short!.sweep)).toBeLessThan(Math.PI)
    expect(arcGeometry(400, 0, 40)).toBeNull()
  })

  it('puts the middle of an upward bend above the ends', () => {
    const mid = arcPoint(100, 0, true)
    const end = arcPoint(100, Math.PI / 2, true)
    expect(mid.y).toBeLessThan(end.y)
    expect(end.x).toBeCloseTo(100)
  })

  it('swaps effect presets without keeping the previous one', () => {
    const neon = applyTextPreset({ ...DEFAULT_TEXT_STYLE, fill: '#ff2d55' }, 'neon')
    expect(neon.shadowBlur).toBeGreaterThan(0)
    expect(neon.shadowColor).toBe('#ff2d55')
    const plain = applyTextPreset(neon, 'plain')
    expect(plain.shadowBlur).toBe(0)
    expect(plain.strokeWidth).toBe(0)
    expect(plain.echo).toBe(false)
    expect(plain.block).toBe(0)
    expect(plain.fill).toBe('#ff2d55')
    expect(plain.scaleX).toBe(1)
    expect(plain.scaleY).toBe(1)
    const highlight = applyTextPreset({ ...DEFAULT_TEXT_STYLE, fill: '#ffffff' }, 'highlight')
    expect(highlight.background).toBe(true)
    expect(highlight.backgroundColor).toBe('#000000')
  })

  it('picks a light plate behind dark type', () => {
    expect(contrastPlate('#111111')).toBe('#ffffff')
    expect(shadeHex('#ff0000', 0.5)).toBe('#800000')
  })
})
