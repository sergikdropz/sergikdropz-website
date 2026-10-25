import { describe, expect, it } from 'vitest'
import { stripeCheckoutImageUrl, stripeCheckoutImages } from '@/lib/stripe/checkout-image'

describe('stripe checkout images', () => {
  it('encodes spaces in local artwork paths', () => {
    expect(
      stripeCheckoutImageUrl(
        'http://127.0.0.1:3001',
        '/images/audio/unreleased/eps/SERGIK - Staying A Vibe/staying-a-vibe-cover.jpg',
      ),
    ).toBe(
      'http://127.0.0.1:3001/images/audio/unreleased/eps/SERGIK%20-%20Staying%20A%20Vibe/staying-a-vibe-cover.jpg',
    )
  })

  it('does not double-encode paths that are already escaped', () => {
    expect(
      stripeCheckoutImageUrl(
        'http://127.0.0.1:3001',
        '/images/audio/unreleased/eps/SERGIK%20-%20Soul%20Candy/cover.jpeg',
      ),
    ).toBe('http://127.0.0.1:3001/images/audio/unreleased/eps/SERGIK%20-%20Soul%20Candy/cover.jpeg')
  })

  it('omits empty artwork', () => {
    expect(stripeCheckoutImages('http://127.0.0.1:3001', '')).toEqual([])
    expect(stripeCheckoutImageUrl('http://127.0.0.1:3001', null)).toBeNull()
  })
})
