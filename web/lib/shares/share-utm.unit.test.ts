import { describe, expect, it } from 'vitest'
import { listenUrlWithUtm, releaseCampaignSlug } from '@/lib/shares/share-utm'

describe('share-utm', () => {
  it('slugifies release titles', () => {
    expect(releaseCampaignSlug('In The Streets EP')).toBe('in-the-streets-ep')
  })

  it('appends utm params to listen URLs', () => {
    const out = listenUrlWithUtm('https://sergikdropz.com/s/abc', 'instagram', 'Electrify')
    const url = new URL(out)
    expect(url.searchParams.get('utm_source')).toBe('instagram')
    expect(url.searchParams.get('utm_medium')).toBe('social')
    expect(url.searchParams.get('utm_campaign')).toBe('electrify')
  })
})
