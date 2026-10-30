import { describe, expect, it } from 'vitest'
import {
  ALL_PRODUCTS_MAT_KEY,
  PRODUCT_MAT_ORIGINAL,
  productMatCss,
  resolveProductMat,
} from '@/lib/merch/studio-session'

describe('resolveProductMat', () => {
  it('uses the all-products tone when a design has no override', () => {
    expect(resolveProductMat({ [ALL_PRODUCTS_MAT_KEY]: 44 }, 'hat-1')).toBe(44)
    expect(productMatCss({ [ALL_PRODUCTS_MAT_KEY]: 44 }, 'hat-1')).toBe('rgb(44, 44, 44)')
  })

  it('keeps a per-product override, including explicit original', () => {
    const map = { [ALL_PRODUCTS_MAT_KEY]: 44, shirt: 210, hat: PRODUCT_MAT_ORIGINAL }
    expect(resolveProductMat(map, 'shirt')).toBe(210)
    expect(resolveProductMat(map, 'hat')).toBeNull()
    expect(resolveProductMat(map, null)).toBe(44)
  })
})
