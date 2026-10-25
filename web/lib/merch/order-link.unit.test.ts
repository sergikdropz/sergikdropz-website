import { describe, expect, it } from 'vitest'
import { printfulOrderMatch } from '@/lib/merch/order-link'

describe('printful order match', () => {
  it('links a Printful order back to the merch row uuid', () => {
    expect(
      printfulOrderMatch({
        id: 44021,
        external_id: '6a480242-3b08-495e-9b7c-d2fee9f17df8',
      })
    ).toEqual({
      printfulOrderId: '44021',
      merchOrderId: '6a480242-3b08-495e-9b7c-d2fee9f17df8',
    })
  })

  it('ignores a non-uuid external id', () => {
    expect(printfulOrderMatch({ id: '9', external_id: 'shopify-1' })).toEqual({
      printfulOrderId: '9',
      merchOrderId: null,
    })
  })
})
