import { describe, expect, it } from 'vitest'
import {
  findMerchDiscount,
  parseMerchDiscounts,
  quoteMerchDiscount,
  type MerchDiscount,
} from './discount'

const save20: MerchDiscount = {
  code: 'SAVE20',
  label: '20% off',
  type: 'percent',
  value: 20,
  active: true,
  expiresAt: null,
}

describe('merch discount codes', () => {
  it('normalizes and keeps the first copy of a code', () => {
    const codes = parseMerchDiscounts({
      codes: [
        { code: ' save20 ', type: 'percent', value: 20 },
        { code: 'SAVE20', type: 'percent', value: 10 },
        { code: 'X', type: 'percent', value: 10 },
        { code: 'FIVE', type: 'amount', value: 5 },
      ],
    })
    expect(codes.map((code) => code.code)).toEqual(['SAVE20', 'FIVE'])
    expect(codes[0]?.label).toBe('20% off')
    expect(findMerchDiscount(codes, 'save20')?.value).toBe(20)
  })

  it('takes 20% off a $40 piece', () => {
    expect(quoteMerchDiscount([40], save20)).toEqual({
      code: 'SAVE20',
      label: '20% off',
      type: 'percent',
      value: 20,
      amountOff: 8,
      total: 32,
    })
  })

  it('rounds a percent off on each line', () => {
    const quote = quoteMerchDiscount([10.05, 10.05], { ...save20, value: 10, label: '10% off' })
    expect(quote).toMatchObject({ amountOff: 2.02, total: 18.08 })
  })

  it('caps a dollar amount at the basket', () => {
    const quote = quoteMerchDiscount([40], {
      code: 'FIFTY',
      label: '$50 off',
      type: 'amount',
      value: 50,
      active: true,
      expiresAt: null,
    })
    expect(quote).toMatchObject({ amountOff: 40, total: 0 })
  })

  it('rejects an expired or inactive code', () => {
    expect(quoteMerchDiscount([40], { ...save20, active: false })).toEqual({
      error: "That code doesn't apply.",
    })
    expect(quoteMerchDiscount([40], { ...save20, expiresAt: '2020-01-01' }, Date.parse('2026-01-01'))).toEqual({
      error: 'That code has expired.',
    })
  })
})
