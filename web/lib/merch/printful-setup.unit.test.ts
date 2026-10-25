import { describe, expect, it } from 'vitest'
import { parsePrintfulStoreId } from '@/lib/merch/printful-setup'

describe('parsePrintfulStoreId', () => {
  it('parses numeric store id', () => {
    expect(parsePrintfulStoreId('12345678')).toBe(12345678)
  })

  it('rejects empty and invalid', () => {
    expect(parsePrintfulStoreId('')).toBeNull()
    expect(parsePrintfulStoreId('abc')).toBeNull()
    expect(parsePrintfulStoreId(undefined)).toBeNull()
  })
})
