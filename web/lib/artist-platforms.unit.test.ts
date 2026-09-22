import { describe, expect, it } from 'vitest'
import { artistAlreadyOnStoreCards, artistDspProfileLinks, artistPlatformUrl } from '@/lib/artist-platforms'

describe('artist follow-page DSP profiles', () => {
  it('exposes Beatport, Amazon, Tidal, iHeart, and TikTok from artist.json', () => {
    const stores = artistDspProfileLinks().map((link) => link.store)
    expect(stores).toEqual(
      expect.arrayContaining([
        'beatport',
        'amazon',
        'tidal',
        'tiktok',
        'youtube_music',
        'shazam',
        'pandora',
        'iheart',
      ])
    )
    expect(artistPlatformUrl('pandora')).toContain('pandora.com/artist/sergik')
    expect(artistPlatformUrl('beatport')).toBe('https://www.beatport.com/artist/sergik/1002796')
    expect(artistPlatformUrl('tiktok')).toBe('https://www.tiktok.com/@sergikdropz')
    expect(artistPlatformUrl('iheart')).toContain('iheart.com/artist/id-36587473')
  })

  it('builds DistroKid-style already-on-store cards from artist.json', () => {
    const cards = artistAlreadyOnStoreCards()
    const byId = Object.fromEntries(cards.map((card) => [card.id, card]))
    expect(byId.spotify?.value).toBe('7MnvMhWoSe4wYXuiI6iQ8H')
    expect(byId.apple?.value).toBeTruthy()
    expect(byId.youtube?.value).toBe('UCBWcROfNv8PeY6KdrnNM_pw')
    expect(byId.instagram?.value).toBe('sergikdropz')
    expect(byId.facebook?.value).toBe('sergikdropz')
  })
})
