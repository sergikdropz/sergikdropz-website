import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHOP_BACKDROP,
  activeShopBackdrop,
  parseShopBackdrop,
  shopBackdropCss,
  shopBackdropIsOriginal,
} from '@/lib/merch/shop-backdrop'

describe('shop backdrop', () => {
  it('keeps the original white field when nothing is saved', () => {
    expect(parseShopBackdrop(null)).toEqual(DEFAULT_SHOP_BACKDROP)
    expect(activeShopBackdrop(DEFAULT_SHOP_BACKDROP)).toBeNull()
    expect(shopBackdropIsOriginal(DEFAULT_SHOP_BACKDROP)).toBe(true)
  })

  it('normalizes a public color and opacity', () => {
    const backdrop = parseShopBackdrop({ color: '#ABC', opacity: 0.4 })
    expect(backdrop).toEqual({ color: '#aabbcc', opacity: 0.4 })
    expect(shopBackdropCss(backdrop)).toBe('rgba(170, 187, 204, 0.4)')
    expect(activeShopBackdrop(backdrop)).toEqual(backdrop)
  })
})
