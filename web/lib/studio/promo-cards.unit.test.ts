import { describe, expect, it } from 'vitest'
import { serviceIconSvg } from '@/lib/studio/promo-card-render'
import {
  PROMO_CARD_AVAILABLE_LABEL,
  PROMO_CARD_LAYOUTS,
  PROMO_CARD_SERVICES,
  PROMO_CARD_SITE_HOST,
  defaultPromoCardMode,
  promoCardCopy,
  promoCardFilename,
  promoCardPixelSize,
} from '@/lib/studio/promo-cards'

describe('promo card pack', () => {
  it('ships a fixed design set with unique ids', () => {
    const ids = PROMO_CARD_LAYOUTS.map((layout) => layout.id)
    expect(ids).toEqual([
      'bleed',
      'frame',
      'light',
      'poster',
      'band',
      'polaroid',
      'stamp',
      'ticket',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses pre-save copy before the street date and out-now copy after', () => {
    expect(defaultPromoCardMode('2026-10-20', new Date(2026, 9, 8))).toBe('presave')
    expect(defaultPromoCardMode('2026-10-08', new Date(2026, 9, 8))).toBe('outnow')
    expect(defaultPromoCardMode('2026-10-01', new Date(2026, 9, 8))).toBe('outnow')
    expect(defaultPromoCardMode(null)).toBe('outnow')
    expect(promoCardCopy('presave').badge).toBe('PRE-SAVE')
    expect(promoCardCopy('outnow').badge).toBe('OUT NOW')
    expect(promoCardCopy('coming', '2026-10-30').badge).toBe('COMING SOON · OCT 30')
    expect(promoCardCopy('coming').badge).toBe('COMING SOON')
  })

  it('sizes square and 9:16 story exports', () => {
    expect(promoCardPixelSize('square', 1080)).toEqual({ width: 1080, height: 1080 })
    expect(promoCardPixelSize('story', 1080)).toEqual({ width: 1080, height: 1920 })
  })

  it('lists main streaming services and the sergikdropz site', () => {
    expect(PROMO_CARD_AVAILABLE_LABEL).toBe('Available on')
    expect(PROMO_CARD_SITE_HOST).toBe('sergikdropz.com')
    expect(PROMO_CARD_SERVICES.map((service) => service.id)).toEqual([
      'spotify',
      'apple_music',
      'youtube_music',
      'amazon',
      'tidal',
      'deezer',
      'soundcloud',
    ])
    for (const service of PROMO_CARD_SERVICES) {
      const svg = serviceIconSvg(service.id, '#fafafa')
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
      expect(svg).toContain('<path')
    }
  })

  it('names downloads from the release title', () => {
    expect(promoCardFilename('Staying A Vibe', 'bleed', 'square')).toBe(
      'Staying-A-Vibe-bleed-square.png'
    )
  })
})
