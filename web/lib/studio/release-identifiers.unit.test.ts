import { describe, expect, it } from 'vitest'
import { parseReleaseBarcode, pickReleaseIdentifiers } from '@/lib/studio/release-identifiers'

describe('release identifiers', () => {
  it('keeps a 12-digit DistroKid UPC', () => {
    expect(parseReleaseBarcode('700563968501')).toBe('700563968501')
  })

  it('strips spaces from a 13-digit code', () => {
    expect(parseReleaseBarcode('0199980184428')).toBe('0199980184428')
  })

  it('rejects a short code', () => {
    expect(() => parseReleaseBarcode('12345')).toThrow(/12 or 13 digits/)
  })

  it('lifts upc out of a marketing-copy shaped object', () => {
    expect(pickReleaseIdentifiers({ upc: '700563968501', elevator_pitch: 'hello' })).toEqual({
      upc: '700563968501',
    })
  })
})
