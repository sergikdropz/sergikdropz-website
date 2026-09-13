import { describe, expect, it } from 'vitest'
import { encodeImagePath, resolveImageUrl } from '@/utils/resolveImageUrl'
import { isSafeNextImageSrc, shouldUnoptimizeImage } from '@/utils/imageOptimization'

describe('resolveImageUrl', () => {
  it('maps home-server gallery-images hosts onto shipped /images/audio files', () => {
    const src =
      'https://storage.local.invalid/storage/v1/object/public/gallery-images/audio/unreleased/eps/SERGIK%20-%20Are%20We%20Awake/64804719-FCBB-4F62-B570-DC695D1DC699.PNG'
    expect(resolveImageUrl(src)).toBe(
      '/images/audio/unreleased/eps/SERGIK%20-%20Are%20We%20Awake/64804719-FCBB-4F62-B570-DC695D1DC699.PNG',
    )
  })

  it('maps dead gallery-images EP artwork onto shipped /images/audio files', () => {
    const src =
      'https://utgwlgcejflqxyalnlze.supabase.co/storage/v1/object/public/gallery-images/audio/unreleased/eps/SERGIK%20-%20The%20Chan%20Suk%20Legend/the-chan-suk-legend.png'
    expect(resolveImageUrl(src)).toBe(
      '/images/audio/unreleased/eps/SERGIK%20-%20The%20Chan%20Suk%20Legend/the-chan-suk-legend.png',
    )
  })

  it('maps gallery-images photos onto /images/gallery', () => {
    const src =
      'https://example.supabase.co/storage/v1/object/public/gallery-images/logo.png'
    expect(resolveImageUrl(src)).toBe('/images/gallery/logo.png')
  })

  it('encodes local EP paths for next/image', () => {
    expect(
      resolveImageUrl('/images/audio/unreleased/eps/SERGIK - Vice & Virtues/cover.jpeg'),
    ).toBe('/images/audio/unreleased/eps/SERGIK%20-%20Vice%20%26%20Virtues/cover.jpeg')
  })

  it('rewrites the Staying A Vibe legacy UUID onto the current cover file', () => {
    expect(
      resolveImageUrl(
        'https://utgwlgcejflqxyalnlze.supabase.co/storage/v1/object/public/gallery-images/audio/unreleased/eps/SERGIK%20-%20Staying%20A%20Vibe/CD9B1141-992E-405C-B73D-CF3D2A6BF02E.jpeg',
      ),
    ).toBe(
      '/images/audio/unreleased/eps/SERGIK%20-%20Staying%20A%20Vibe/staying-a-vibe-cover.jpg',
    )
  })

  it('keeps artwork cache-bust query so overwritten covers refresh', () => {
    expect(resolveImageUrl('/images/audio/artwork/folder-1787772055352.jpg?v=99')).toBe(
      '/images/audio/artwork/folder-1787772055352.jpg?v=99',
    )
  })

  it('does not double-encode', () => {
    const once = resolveImageUrl('/images/audio/unreleased/eps/SERGIK - Daze/a.PNG')
    expect(resolveImageUrl(once)).toBe(once)
  })
})

describe('encodeImagePath', () => {
  it('is idempotent', () => {
    const p = encodeImagePath('/images/audio/SERGIK - FTP/a.jpeg')
    expect(encodeImagePath(p)).toBe(p)
  })
})

describe('shouldUnoptimizeImage', () => {
  it('skips the optimizer for vault cover files', () => {
    expect(
      shouldUnoptimizeImage(
        '/images/audio/unreleased/eps/SERGIK%20-%20The%20Chan%20Suk%20Legend/the-chan-suk-legend.png',
      ),
    ).toBe(true)
  })

  it('skips the optimizer for supabase storage hosts', () => {
    expect(
      shouldUnoptimizeImage(
        'https://utgwlgcejflqxyalnlze.supabase.co/storage/v1/object/public/audio-files/artwork/x.jpg',
      ),
    ).toBe(true)
  })

  it('never sends placeholder storage hosts to next/image', () => {
    const dead =
      'https://storage.local.invalid/storage/v1/object/public/gallery-images/audio/x.png'
    expect(isSafeNextImageSrc(dead)).toBe(false)
    expect(isSafeNextImageSrc(resolveImageUrl(dead))).toBe(true)
  })
})
