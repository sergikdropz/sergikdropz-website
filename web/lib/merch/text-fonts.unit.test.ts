import { describe, expect, it } from 'vitest'
import { MERCH_FONTS, MERCH_FONT_CATEGORIES, merchFontStylesheet, merchFontsIn } from './text-fonts'

describe('merch text fonts', () => {
  it('gives every face a unique id and a real weight', () => {
    const ids = MERCH_FONTS.map((font) => font.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(MERCH_FONTS.every((font) => font.weight === 400 || font.weight === 700)).toBe(true)
  })

  it('fills each category and only requests stylesheets for Google faces', () => {
    for (const category of MERCH_FONT_CATEGORIES) {
      expect(merchFontsIn(category.id).length).toBeGreaterThan(0)
    }
    const bebas = MERCH_FONTS.find((font) => font.family === 'Bebas Neue')
    expect(bebas && merchFontStylesheet(bebas)).toContain('family=Bebas%20Neue')
    const six = MERCH_FONTS.find((font) => font.id === 'six-caps')
    expect(six && merchFontStylesheet(six)).toBeNull()
  })
})