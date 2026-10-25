import { describe, expect, it } from 'vitest'
import { orderShopTracksByEp, shopOrderTags, vaultDownloadFileName, type ShopOrderTrack } from '@/lib/shop/order-download'

describe('vault download names', () => {
  it('keeps the vault title as the file name', () => {
    expect(vaultDownloadFileName('Hydrate Feat. Janis and the Planets', 'mp3')).toBe(
      'Hydrate Feat. Janis and the Planets.mp3',
    )
    expect(vaultDownloadFileName('Last Night', 'mp3')).toBe('Last Night.mp3')
  })

  it('writes the vault title into ID3 even when the library tag differs', () => {
    const track: ShopOrderTrack = {
      id: 'track-1',
      title: 'Last Night',
      artist: 'SERGIK',
      album: 'Staying A Vibe',
      year: 2025,
      bpm: 124,
      key: 'A# major',
      genre: 'Soulful House',
      subgenre: null,
      trackNumber: 2,
      energy: 3.2,
      composer: null,
      relativePath: 'unreleased/a.mp3',
      ext: 'mp3',
    }
    const tags = shopOrderTags(
      track,
      5,
      {
        title: 'SERGIK - Last Night',
        artist: 'SERGIK',
        album: 'Staying A Vibe',
        albumArtist: 'SERGIK',
        composer: 'SERGIK',
        genre: 'Soulful House',
        grouping: 'Soulful House',
        year: '2025',
        track: '5',
        disc: '1/1',
        bpm: '124',
        key: '3B',
        comment: 'Sonic DNA',
        description: 'Last Night',
      },
    )
    expect(tags.title).toBe('Last Night')
    expect(tags.track).toBe('2/5')
    expect(tags.bpm).toBe('124')
    expect(tags.album).toBe('Staying A Vibe')
  })

  it('lists vault tracks in release order when vault numbers are alphabetical', () => {
    const sequence = ['Pre Party', 'Tequila Power', 'Hydrate', 'Mind n Body', 'Last Night']
    const vaultOrder = ['Hydrate Feat. Janis and the Planets', 'Last Night', 'Mind n Body', 'Pre Party', 'Tequila Power']
    const tracks = vaultOrder.map((title, index) => ({
      id: String(index),
      title,
      artist: 'SERGIK',
      album: 'Staying A Vibe',
      year: null,
      bpm: null,
      key: null,
      genre: null,
      subgenre: null,
      trackNumber: index + 1,
      energy: null,
      composer: null,
      relativePath: `${title}.mp3`,
      ext: 'mp3' as const,
    }))
    expect(orderShopTracksByEp(tracks, sequence).map((track) => track.title)).toEqual([
      'Pre Party',
      'Tequila Power',
      'Hydrate Feat. Janis and the Planets',
      'Mind n Body',
      'Last Night',
    ])
    expect(orderShopTracksByEp(tracks, sequence).map((track) => track.trackNumber)).toEqual([1, 2, 3, 4, 5])
  })
})
