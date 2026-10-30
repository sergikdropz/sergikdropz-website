import { describe, expect, it } from 'vitest'
import {
  artIdsOnlyUsedBy,
  merchArtIdFromUrl,
  merchArtIdsFromUrls,
  sameMerchArt,
  withArtVersion,
} from './art-url'

const id = 'c9810c9f-af57-4351-961a-9a35c1a7ed62.png'
const remote = `https://example.supabase.co/storage/v1/object/public/gallery-images/merch-designs/${id}`

describe('merch art urls', () => {
  it('reads the library file name from a storage url', () => {
    expect(merchArtIdFromUrl(remote)).toBe(id)
    expect(merchArtIdFromUrl(`/api/merch/art/${id}?v=1`)).toBe(id)
  })

  it('collects library ids from mockup urls', () => {
    expect(
      merchArtIdsFromUrls([
        `/api/merch/art/${id}?v=1`,
        'https://files.cdn.printful.com/not-library.jpg',
        remote,
      ]),
    ).toEqual([id.toLowerCase(), id.toLowerCase()])
  })

  it('deletes a product’s files and keeps artwork another product still uses', () => {
    const shared = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'
    const own = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png'
    const photo = 'cccccccc-cccc-cccc-cccc-cccccccccccc.jpg'
    const product = {
      id: 'one',
      placements: [{ assetUrl: `/api/merch/art/${shared}` }, { assetUrl: `/api/merch/art/${own}` }],
      mockupUrls: [`/api/merch/art/${photo}`],
      printFileUrls: { front: `/api/merch/art/${own}?v=1` },
    }
    const other = {
      id: 'two',
      placements: [{ assetUrl: `/api/merch/art/${shared}?v=2` }],
    }
    expect(artIdsOnlyUsedBy(product, [product, other]).sort()).toEqual([own, photo].sort())
  })

  it('treats a cache-busted url as the same file', () => {
    expect(sameMerchArt(remote, withArtVersion(remote, 12))).toBe(true)
    expect(sameMerchArt(remote, remote.replace(id, '11111111-1111-1111-1111-111111111111.png'))).toBe(false)
  })
})
