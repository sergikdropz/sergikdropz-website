import { ImageResponse } from 'next/og'
import { createSupabaseServerClient } from '@/lib/supabase'
import { loadPromoSharePreview } from '@/lib/studio/promo-share-server'
import { PROMO_SHARE_OG_LABEL } from '@/lib/studio/social-promo'
import { absoluteShareOgImageUrl, DEFAULT_PUBLIC_SITE_ORIGIN } from '@/lib/shares/types'

export const runtime = 'nodejs'
export const alt = PROMO_SHARE_OG_LABEL
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 60

async function fetchCoverBytes(artworkUrl: string | null): Promise<ArrayBuffer | null> {
  const raw = String(artworkUrl || '').trim()
  if (!raw) return null
  const candidates: string[] = []
  const push = (url: string | null | undefined) => {
    const value = String(url || '').trim()
    if (!value || candidates.includes(value)) return
    if (/localhost|127\.0\.0\.1/i.test(value)) return
    candidates.push(value)
  }
  if (/^https?:\/\//i.test(raw)) push(raw)
  push(absoluteShareOgImageUrl(raw, DEFAULT_PUBLIC_SITE_ORIGIN))

  for (const absolute of candidates) {
    try {
      const res = await fetch(absolute, {
        headers: { Accept: 'image/*,*/*;q=0.8' },
        next: { revalidate: 60 },
      })
      if (!res.ok) continue
      const type = res.headers.get('content-type') || ''
      if (type && !type.startsWith('image/')) continue
      const buf = await res.arrayBuffer()
      if (buf.byteLength > 0) return buf
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

export default async function PromoOpenGraphImage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  let title = 'SERGIK'
  let typeLabel = ''
  let artists = ['SERGIK']
  let cover: ArrayBuffer | null = null

  try {
    const preview = await loadPromoSharePreview(createSupabaseServerClient(), token)
    if (preview) {
      title = preview.title
      typeLabel = preview.typeLabel
      artists = preview.artists.length ? preview.artists : [preview.artist || 'SERGIK']
      cover = await fetchCoverBytes(preview.artworkUrl)
    }
  } catch {
    /* labeled card without artwork */
  }

  const titleDisplay = title.length > 72 ? `${title.slice(0, 70).trimEnd()}…` : title
  const shownArtists = artists.slice(0, 8)
  const moreArtists = artists.length > shownArtists.length

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#050505',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            width: 630,
            height: 630,
            display: 'flex',
            flexShrink: 0,
            backgroundColor: '#111',
            overflow: 'hidden',
          }}
        >
          {cover ? (
            <img
              src={cover as unknown as string}
              alt=""
              width={630}
              height={630}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 42,
                letterSpacing: '0.18em',
              }}
            >
              SERGIK
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            padding: '48px 56px',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '100%',
              fontSize: 44,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            {PROMO_SHARE_OG_LABEL}
          </div>
          {typeLabel ? (
            <div
              style={{
                display: 'flex',
                marginTop: 26,
                color: 'rgba(196,181,253,0.95)',
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              {typeLabel}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              width: '100%',
              marginTop: typeLabel ? 8 : 28,
              fontSize: 32,
              fontWeight: 600,
              lineHeight: 1.15,
              color: 'rgba(255,255,255,0.96)',
            }}
          >
            {titleDisplay}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              width: '100%',
              marginTop: 16,
            }}
          >
            {shownArtists.map((name, index) => (
              <div
                key={`${name}-${index}`}
                style={{
                  display: 'flex',
                  fontSize: 22,
                  lineHeight: 1.35,
                  color: 'rgba(255,255,255,0.72)',
                  marginRight: 8,
                }}
              >
                {index > 0 ? `· ${name}` : name}
              </div>
            ))}
            {moreArtists ? (
              <div
                style={{
                  display: 'flex',
                  fontSize: 22,
                  lineHeight: 1.35,
                  color: 'rgba(255,255,255,0.72)',
                }}
              >
                · …
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
