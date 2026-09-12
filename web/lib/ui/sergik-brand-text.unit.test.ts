import { describe, expect, it } from 'vitest'
import { splitSergikBrandText } from '@/lib/ui/sergik-brand-text'

describe('splitSergikBrandText', () => {
  it('isolates SERGIK letters in EP titles', () => {
    expect(splitSergikBrandText('Are We Awake')).toEqual([
      { text: 'A', brand: false },
      { text: 're', brand: true },
      { text: ' W', brand: false },
      { text: 'e', brand: true },
      { text: ' Awa', brand: false },
      { text: 'ke', brand: true },
    ])
  })

  it('marks full SERGIK runs', () => {
    expect(splitSergikBrandText('SERGIK')).toEqual([{ text: 'SERGIK', brand: true }])
  })

  it('returns a single non-brand chunk when no letters match', () => {
    expect(splitSergikBrandText('FTP')).toEqual([{ text: 'FTP', brand: false }])
  })

  it('returns empty for blank input', () => {
    expect(splitSergikBrandText('')).toEqual([])
  })
})
