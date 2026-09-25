import { describe, expect, it } from 'vitest'
import { clearResolveImageUrlCache, encodeImagePath, resolveImageUrl } from '@/utils/resolveImageUrl'
import {
  isSafeNextImageSrc,
  shouldUnoptimizeHeroCover,
  shouldUnoptimizeImage,
} from '@/utils/imageOptimization'

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

  it('keeps remote gallery photo URLs (uploads live only in Storage)', () => {
    const src =
      'https://example.supabase.co/storage/v1/object/public/gallery-images/logo.png'
    expect(resolveImageUrl(src)).toBe(src)
  })

  it('maps relative gallery-images photo paths onto /images/gallery', () => {
    // Rare non-absolute storage paths — local fallback only when not a full URL.
    expect(resolveImageUrl('/object/public/gallery-images/logo.png')).toBe(
      '/images/gallery/logo.png',
    )
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

  it('rewrites normalized folder cover png/webp masters onto .jpg', () => {
    clearResolveImageUrlCache()
    expect(resolveImageUrl('/images/audio/artwork/folder-1789905818849.png?v=1')).toBe(
      '/images/audio/artwork/folder-1789905818849.jpg?v=1',
    )
  })

  it('maps remote Storage folder png covers onto local JPEG masters', () => {
    clearResolveImageUrlCache()
    expect(
      resolveImageUrl(
        'https://bjzevrsruixsbypybyiy.supabase.co/storage/v1/object/public/audio-files/artwork/folder-collection-unreleased-eps-sergik---staying-a-vibe.png',
      ),
    ).toBe('/images/audio/artwork/folder-collection-unreleased-eps-sergik---staying-a-vibe.jpg')
    expect(
      resolveImageUrl(
        'https://bjzevrsruixsbypybyiy.supabase.co/storage/v1/object/public/audio-files/artwork/folder-collection-unreleased-eps-sergik---in-the-streets-.png',
      ),
    ).toBe('/images/audio/artwork/folder-collection-unreleased-eps-sergik---in-the-streets.jpg')
  })

  it('strips trailing-dash typos on local folder JPEG masters', () => {
    clearResolveImageUrlCache()
    expect(
      resolveImageUrl('/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze-.jpg'),
    ).toBe('/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg')
  })

  it('rewrites the retired Daze astronaut cover onto the current folder art', () => {
    clearResolveImageUrlCache()
    expect(
      resolveImageUrl(
        '/images/audio/unreleased/eps/SERGIK%20-%20Daze/89D09194-956E-422F-A040-8A9DEC10C3DD.PNG',
      ),
    ).toBe('/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg')
  })

  it('forces Happy Camper onto the current jpg even when a stale png URL is cached', () => {
    clearResolveImageUrlCache()
    expect(
      resolveImageUrl(
        'https://example.supabase.co/storage/v1/object/public/audio-files/artwork/folder-1787720929879.png',
      ),
    ).toBe('/images/audio/artwork/folder-1787720929879.jpg')
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
  it('skips the optimizer for heavy unreleased EP masters', () => {
    expect(
      shouldUnoptimizeImage(
        '/images/audio/unreleased/eps/SERGIK%20-%20The%20Chan%20Suk%20Legend/the-chan-suk-legend.png',
      ),
    ).toBe(true)
  })

  it('serves local folder artwork natively (next/image rejects ?v= bust URLs)', () => {
    expect(shouldUnoptimizeImage('/images/audio/artwork/folder-daze.jpg?v=1')).toBe(true)
    expect(
      shouldUnoptimizeImage(
        'https://utgwlgcejflqxyalnlze.supabase.co/storage/v1/object/public/audio-files/artwork/folder-x.jpg',
      ),
    ).toBe(false)
  })

  it('never sends placeholder storage hosts to next/image', () => {
    const dead =
      'https://storage.local.invalid/storage/v1/object/public/gallery-images/audio/x.png'
    expect(isSafeNextImageSrc(dead)).toBe(false)
    expect(isSafeNextImageSrc(resolveImageUrl(dead))).toBe(true)
  })
})

describe('shouldUnoptimizeHeroCover', () => {
  it('serves folder JPEG masters without optimizer re-encode', () => {
    expect(shouldUnoptimizeHeroCover('/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg')).toBe(
      true,
    )
  })

  it('still uses native masters for unreleased EP paths', () => {
    expect(
      shouldUnoptimizeHeroCover(
        '/images/audio/unreleased/eps/SERGIK%20-%20The%20Chan%20Suk%20Legend/the-chan-suk-legend.png',
      ),
    ).toBe(true)
  })
})
