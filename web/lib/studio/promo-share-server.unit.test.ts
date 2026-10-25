import { describe, expect, it } from 'vitest'
import {
  pickPromoReleaseId,
  promoReleaseTypeLabel,
  promoShareArtistNames,
  promoSharePreviewDescription,
} from '@/lib/studio/promo-share-server'

describe('pickPromoReleaseId', () => {
  it('prefers the release that already has a promo link', () => {
    expect(
      pickPromoReleaseId([
        { id: 'newer', updatedAt: '2026-10-02', score: 100 },
        { id: 'linked', updatedAt: '2026-09-01', shareToken: 'abc', score: 1 },
      ]),
    ).toBe('linked')
  })

  it('prefers the vault folder match over a weaker track overlap', () => {
    expect(
      pickPromoReleaseId([
        { id: 'overlap', updatedAt: '2026-10-02', score: 3 },
        { id: 'vault', updatedAt: '2026-09-01', score: 100 },
      ]),
    ).toBe('vault')
  })

  it('returns null when nothing matches', () => {
    expect(pickPromoReleaseId([])).toBeNull()
  })
})

describe('promo share preview copy', () => {
  it('keeps every billed artist once, album credit first', () => {
    expect(
      promoShareArtistNames([
        'SERGIK x OG Coconut',
        'SERGIK feat. Janis',
        'og coconut x SERGIK',
        'Janis',
      ]),
    ).toEqual(['SERGIK', 'OG Coconut', 'Janis'])
  })

  it('labels the release type and puts the EP name ahead of the artists', () => {
    expect(promoReleaseTypeLabel('ep')).toBe('EP')
    expect(promoReleaseTypeLabel('single')).toBe('Single')
    expect(promoReleaseTypeLabel('')).toBe('')
    expect(
      promoSharePreviewDescription({
        title: 'Night Room',
        artists: ['SERGIK', 'OG Coconut', 'Janis'],
      }),
    ).toBe('Night Room · SERGIK, OG Coconut, Janis')
  })
})
