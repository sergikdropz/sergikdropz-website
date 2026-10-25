import { describe, expect, it } from 'vitest'
import { sortSizes } from '@/lib/merch/sizes'

describe('sortSizes', () => {
  it('orders letter sizes by wear order instead of alphabetically', () => {
    expect(sortSizes(['2XL', '3XL', '4XL', '5XL', 'L', 'M', 'S', 'XL'])).toEqual([
      'S',
      'M',
      'L',
      'XL',
      '2XL',
      '3XL',
      '4XL',
      '5XL',
    ])
  })

  it('handles XS/XXS, XXL aliases, numeric and one-size', () => {
    expect(sortSizes(['XXL', 'XS', 'One size', '32', '30', 'XXS'])).toEqual(['XXS', 'XS', 'XXL', 'One size', '30', '32'])
  })

  it('keeps unknown labels last and does not mutate the input', () => {
    const input = ['Custom', 'M', 'S']
    expect(sortSizes(input)).toEqual(['S', 'M', 'Custom'])
    expect(input).toEqual(['Custom', 'M', 'S'])
  })
})
