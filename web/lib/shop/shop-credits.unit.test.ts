import { describe, expect, it } from 'vitest'
import { subscriptionCreditGrantCents } from '@/lib/shop/shop-credits'

describe('subscriptionCreditGrantCents', () => {
  it('grants 75% for supporter on pre-tax subtotal', () => {
    expect(subscriptionCreditGrantCents(499, 'supporter')).toBe(374)
  })

  it('grants 90% for inner circle', () => {
    expect(subscriptionCreditGrantCents(1499, 'inner-circle')).toBe(1349)
  })

  it('floors fractional cents', () => {
    expect(subscriptionCreditGrantCents(100, 'supporter')).toBe(75)
  })
})
