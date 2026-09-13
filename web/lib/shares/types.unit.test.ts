import { describe, expect, it } from 'vitest'
import {
  createShareToken,
  DEFAULT_PUBLIC_SITE_ORIGIN,
  embedHtmlSnippet,
  embedPathForToken,
  embedUrlForToken,
  absoluteShareOgImageUrl,
  isLocalDevOrigin,
  isMissingShareTableError,
  isShareActive,
  listenPathForToken,
  listenUrlForToken,
  originFromHeaders,
  resolvePublicOrigin,
  SHARE_EMBED_HEIGHT,
  shareDisplayArtworkUrl,
  siteOrigin,
} from './types'

describe('share link helpers', () => {
  it('builds listen and embed paths from tokens', () => {
    expect(listenPathForToken('abc_123')).toBe('/s/abc_123')
    expect(embedPathForToken('abc_123')).toBe('/embed/abc_123')
    expect(listenUrlForToken('abc_123', 'https://sergik.example')).toBe(
      'https://sergik.example/s/abc_123',
    )
    expect(embedUrlForToken('abc_123', 'https://sergik.example')).toBe(
      'https://sergik.example/embed/abc_123',
    )
  })

  it('builds an iframe snippet', () => {
    const html = embedHtmlSnippet('tok', 'https://sergik.example', 180)
    expect(html).toContain('src="https://sergik.example/embed/tok"')
    expect(html).toContain('height="180"')
    expect(html).toContain('allow="autoplay; encrypted-media"')
  })

  it('defaults embed height to the share stage formula', () => {
    expect(SHARE_EMBED_HEIGHT).toBeGreaterThanOrEqual(480)
    expect(embedHtmlSnippet('tok', 'https://sergik.example')).toContain(`height="${SHARE_EMBED_HEIGHT}"`)
  })

  it('detects local dev origins', () => {
    expect(isLocalDevOrigin('http://127.0.0.1:3001')).toBe(true)
    expect(isLocalDevOrigin('http://localhost:3001')).toBe(true)
    expect(isLocalDevOrigin('https://sergik.com')).toBe(false)
  })

  it('prefers live request host over a localhost SITE_URL', () => {
    const headers = new Headers({
      host: 'sergik.com',
      'x-forwarded-proto': 'https',
    })
    expect(originFromHeaders(headers)).toBe('https://sergik.com')
    expect(resolvePublicOrigin(headers)).toBe('https://sergik.com')
  })

  it('uses x-forwarded-host when present', () => {
    const headers = new Headers({
      host: '127.0.0.1:3001',
      'x-forwarded-host': 'www.sergik.com',
      'x-forwarded-proto': 'https',
    })
    expect(resolvePublicOrigin(headers)).toBe('https://www.sergik.com')
  })

  it('falls back to the public domain in production when SITE_URL is localhost', () => {
    const prevNode = process.env.NODE_ENV
    const prevSite = process.env.NEXT_PUBLIC_SITE_URL
    const prevVercel = process.env.VERCEL
    const prevVercelUrl = process.env.VERCEL_URL
    const prevProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    try {
      ;(process.env as { NODE_ENV?: string }).NODE_ENV = 'production'
      process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3001'
      delete process.env.VERCEL
      delete process.env.VERCEL_URL
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL
      expect(siteOrigin()).toBe(DEFAULT_PUBLIC_SITE_ORIGIN)
      expect(resolvePublicOrigin(null, 'http://127.0.0.1:3001')).toBe(DEFAULT_PUBLIC_SITE_ORIGIN)
    } finally {
      ;(process.env as { NODE_ENV?: string }).NODE_ENV = prevNode
      process.env.NEXT_PUBLIC_SITE_URL = prevSite
      if (prevVercel === undefined) delete process.env.VERCEL
      else process.env.VERCEL = prevVercel
      if (prevVercelUrl === undefined) delete process.env.VERCEL_URL
      else process.env.VERCEL_URL = prevVercelUrl
      if (prevProdUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
      else process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProdUrl
    }
  })

  it('prefers a non-local browser origin over a localhost SITE_URL', () => {
    const prevSite = process.env.NEXT_PUBLIC_SITE_URL
    try {
      process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3001'
      expect(resolvePublicOrigin(null, 'https://sergikdropz.com')).toBe('https://sergikdropz.com')
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prevSite
    }
  })

  it('builds absolute OG cover URLs for messengers', () => {
    expect(absoluteShareOgImageUrl('/images/audio/cover.jpg', 'https://sergikdropz.com')).toBe(
      'https://sergikdropz.com/images/audio/cover.jpg',
    )
    expect(
      absoluteShareOgImageUrl('https://cdn.example/art.jpg', 'https://sergikdropz.com'),
    ).toBe(
      `https://sergikdropz.com/api/shares/artwork-proxy?src=${encodeURIComponent('https://cdn.example/art.jpg')}`,
    )
    expect(
      absoluteShareOgImageUrl('https://sergikdropz.com/images/a.jpg', 'https://sergikdropz.com'),
    ).toBe('https://sergikdropz.com/images/a.jpg')
    expect(absoluteShareOgImageUrl(null, 'https://sergikdropz.com')).toBeNull()
  })

  it('builds same-origin display artwork URLs', () => {
    // Display prefers the direct CDN URL (no proxy hop).
    expect(shareDisplayArtworkUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg')
    expect(shareDisplayArtworkUrl('/images/a.jpg')).toBe('/images/a.jpg')
    expect(shareDisplayArtworkUrl(undefined)).toBeUndefined()
  })

  it('creates url-safe random tokens', () => {
    const a = createShareToken()
    const b = createShareToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(b).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(20)
  })

  it('detects active vs expired/revoked shares', () => {
    expect(
      isShareActive({ visibility: 'unlisted', revoked_at: null, expires_at: null }),
    ).toBe(true)
    expect(
      isShareActive({
        visibility: 'disabled',
        revoked_at: null,
        expires_at: null,
      }),
    ).toBe(false)
    expect(
      isShareActive({
        visibility: 'public',
        revoked_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      }),
    ).toBe(false)
    expect(
      isShareActive(
        {
          visibility: 'public',
          revoked_at: null,
          expires_at: '2020-01-01T00:00:00.000Z',
        },
        Date.parse('2026-01-01T00:00:00.000Z'),
      ),
    ).toBe(false)
  })

  it('detects missing share table errors', () => {
    expect(isMissingShareTableError({ code: 'PGRST205', message: 'Could not find' })).toBe(true)
    expect(
      isMissingShareTableError({
        code: '42P01',
        message: 'relation "music_share_links" does not exist',
      }),
    ).toBe(true)
    expect(isMissingShareTableError({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
