import { describe, expect, it } from 'vitest'
import { artworkSrcForCanvas, pickSocialPromoArtworkUrl } from '@/lib/media/canvas-artwork-load'

describe('canvas artwork load', () => {
  it('maps Staying A Vibe gallery legacy URLs to shipped local cover', () => {
    const src = artworkSrcForCanvas(
      'https://xxx.supabase.co/storage/v1/object/public/gallery-images/audio/unreleased/eps/SERGIK%20-%20Staying%20A%20Vibe/CD9B1141-992E-405C-B73D-CF3D2A6BF02E.jpeg'
    )
    expect(src).toContain('/images/audio/unreleased/eps/')
    expect(src).toContain('staying-a-vibe-cover.jpg')
  })

  it('proxies unknown remote hosts', () => {
    expect(artworkSrcForCanvas('https://cdn.example.com/cover.jpg')).toMatch(
      /^\/api\/shares\/artwork-proxy\?src=/
    )
  })

  it('pickSocialPromoArtworkUrl prefers first resolvable field', () => {
    expect(
      pickSocialPromoArtworkUrl(null, '', 'https://xxx.supabase.co/storage/v1/object/public/gallery-images/audio/foo/bar.jpg')
    ).toContain('/images/audio/foo/bar.jpg')
  })
})
