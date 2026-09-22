import { describe, expect, it } from 'vitest'
import {
  US_ISRC_REGISTRANT,
  buildUsisrcLockerCsv,
  formatDurationMmSs,
  formatISRC,
  formatISRCDisplay,
  parseISRC,
  resolveIsrcPrefix,
  validateISRC,
} from '@/lib/studio/isrc-format'

describe('US ISRC prefix', () => {
  it('uses the allocated QTA53 Rights Owner prefix', () => {
    expect(US_ISRC_REGISTRANT.prefix).toBe('QTA53')
    expect(US_ISRC_REGISTRANT.soundExchangeRegistrantId).toBe('2181363681')
    expect(US_ISRC_REGISTRANT.membership.performer.sxid).toBe('SX1102Q6ZH')
    expect(US_ISRC_REGISTRANT.membership.rightsOwner.sxid).toBe('SX1102Q6ZJ')
    expect(resolveIsrcPrefix('')).toBe('QTA53')
    expect(resolveIsrcPrefix(' qta53 ')).toBe('QTA53')
  })

  it('builds compact and hyphenated codes for 2026', () => {
    const compact = formatISRC('QTA53', 26, 1)
    expect(compact).toBe('QTA532600001')
    expect(validateISRC(compact)).toBe(true)
    expect(formatISRCDisplay(compact)).toBe('QT-A53-26-00001')
    expect(parseISRC('QT-A53-26-00001')).toEqual({
      prefix: 'QTA53',
      year: 26,
      serial: 1,
      isrc_full: 'QTA532600001',
    })
  })

  it('rejects malformed prefixes', () => {
    expect(() => resolveIsrcPrefix('USRC')).toThrow(/Invalid ISRC prefix/)
  })

  it('exports USISRC locker CSV for assigned codes', () => {
    const csv = buildUsisrcLockerCsv(
      [
        {
          isrc: 'QTA532600001',
          title: 'Night Bus',
          version: 'Original',
          explicit: false,
          durationSec: 214,
          yearOfProduction: 2026,
        },
      ],
      { artist: 'SERGIK' }
    )
    expect(formatDurationMmSs(214)).toBe('03:34')
    expect(csv).toContain('QT-A53-26-00001')
    expect(csv).toContain('Jordan Caboga')
    expect(csv).toContain('QTA53')
    expect(csv).toContain('Night Bus')
    expect(csv).toContain('03:34')
  })
})
