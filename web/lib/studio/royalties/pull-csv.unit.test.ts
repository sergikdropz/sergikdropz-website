import { describe, expect, it } from 'vitest'
import { adAccountPath } from '@/lib/meta/earnings-pull'
import { INSTAGRAM_EARNINGS_UNAVAILABLE_NOTE, creatorEarningAmount, creatorEarningsToCsv, majorUnitsToCents } from '@/lib/studio/royalties/pull-csv'

describe('meta pull csv', () => {
  it('rejects a value that is too large to be a daily currency amount', () => {
    expect(majorUnitsToCents(12.5)).toBe(1250)
    expect(majorUnitsToCents(1_000_000)).toBeNull()
  })

  it('reads Meta micro-units as dollars and keeps Instagram on its own store', () => {
    expect(creatorEarningAmount({ currency: 'USD', microAmount: 1_500_000 })).toBe(1.5)
    const result = creatorEarningsToCsv({
      pageId: 'ig',
      currency: 'USD',
      store: 'Instagram',
      points: [
        { endTime: '2026-10-11T07:00:00+0000', amount: 1.5 },
        { endTime: '2026-10-10T07:00:00+0000', amount: 0 },
      ],
    })
    expect(result.windowCents).toBe(150)
    expect(result.dayCount).toBe(2)
    expect(result.csv).toContain('Instagram')
    expect(result.csv).toContain('1.50')
    expect(result.csv).not.toContain(',0.00,')
  })

  it('states that Instagram account insights have no earnings metric', () => {
    expect(INSTAGRAM_EARNINGS_UNAVAILABLE_NOTE).toContain('nothing was written')
  })

  it('skips creator rows that are not currency units', () => {
    const result = creatorEarningsToCsv({
      pageId: '99',
      currency: 'USD',
      points: [
        { endTime: '2026-10-11T07:00:00+0000', amount: 4.5 },
        { endTime: '2026-10-10T07:00:00+0000', amount: null },
      ],
    })
    expect(result.skipped).toBe(1)
    expect(result.csv).toContain('4.50')
    expect(result.csv).not.toContain('null')
  })

  it('accepts an ad account id with or without the act prefix', () => {
    expect(adAccountPath('123')).toBe('/act_123/insights')
    expect(adAccountPath('act_123')).toBe('/act_123/insights')
    expect(adAccountPath('not-an-account')).toBeNull()
  })
})
