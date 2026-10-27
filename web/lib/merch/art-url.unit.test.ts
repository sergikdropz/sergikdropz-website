import { describe, expect, it } from 'vitest'
import { merchArtIdFromUrl, sameMerchArt, withArtVersion } from './art-url'

const id = 'c9810c9f-af57-4351-961a-9a35c1a7ed62.png'
const remote = `https://example.supabase.co/storage/v1/object/public/gallery-images/merch-designs/${id}`

describe('merch art urls', () => {
  it('reads the library file name from a storage url', () => {
    expect(merchArtIdFromUrl(remote)).toBe(id)
    expect(merchArtIdFromUrl(`/api/merch/art/${id}?v=1`)).toBe(id)
  })

  it('treats a cache-busted url as the same file', () => {
    expect(sameMerchArt(remote, withArtVersion(remote, 12))).toBe(true)
    expect(sameMerchArt(remote, remote.replace(id, '11111111-1111-1111-1111-111111111111.png'))).toBe(false)
  })
})
