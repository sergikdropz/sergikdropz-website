import { describe, expect, it } from 'vitest'
import { isTvBackKey, moveTvFocus } from '@/lib/tv/focus'

describe('moveTvFocus', () => {
  const rows = [4, 2, 6]

  it('stops at the ends of a shelf', () => {
    expect(moveTvFocus({ row: 0, col: 3 }, 'ArrowRight', rows)).toEqual({ row: 0, col: 3 })
    expect(moveTvFocus({ row: 0, col: 0 }, 'ArrowLeft', rows)).toEqual({ row: 0, col: 0 })
  })

  it('keeps the column when the next shelf is shorter', () => {
    expect(moveTvFocus({ row: 0, col: 3 }, 'ArrowDown', rows)).toEqual({ row: 1, col: 1 })
    expect(moveTvFocus({ row: 1, col: 1 }, 'ArrowDown', rows)).toEqual({ row: 2, col: 1 })
  })

  it('stays on the first and last shelves', () => {
    expect(moveTvFocus({ row: 0, col: 1 }, 'ArrowUp', rows)).toEqual({ row: 0, col: 1 })
    expect(moveTvFocus({ row: 2, col: 2 }, 'ArrowDown', rows)).toEqual({ row: 2, col: 2 })
  })

  it('returns the origin when there is nothing to focus', () => {
    expect(moveTvFocus({ row: 3, col: 3 }, 'ArrowRight', [])).toEqual({ row: 0, col: 0 })
  })
})

describe('isTvBackKey', () => {
  it('treats browser and TV remote back keys as back', () => {
    expect(isTvBackKey('Escape')).toBe(true)
    expect(isTvBackKey('Backspace')).toBe(true)
    expect(isTvBackKey('GoBack')).toBe(true)
    expect(isTvBackKey('Unidentified', 461)).toBe(true)
    expect(isTvBackKey('Unidentified', 10009)).toBe(true)
    expect(isTvBackKey('Enter')).toBe(false)
    expect(isTvBackKey('ArrowLeft')).toBe(false)
  })
})
