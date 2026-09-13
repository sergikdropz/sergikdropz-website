import { ImageResponse } from 'next/og'
import { resolveShareByToken } from '@/lib/shares/share-service'
import { DEFAULT_PUBLIC_SITE_ORIGIN, siteOrigin } from '@/lib/shares/types'

export const runtime = 'nodejs'
export const alt = 'SERGIK'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

async function loadSixCapsFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Six+Caps&text=SERGIK',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
        next: { revalidate: 86400 },
      },
    ).then((res) => res.text())
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/)
    if (!match?.[1]) return null
    const fontRes = await fetch(match[1], { next: { revalidate: 86400 } })
    if (!fontRes.ok) return null
    return fontRes.arrayBuffer()
  } catch {
    return null
  }
}

async function fetchCoverBytes(artworkUrl: string | null | undefined): Promise<ArrayBuffer | null> {
  const raw = String(artworkUrl || '').trim()
  if (!raw) return null

  let absolute = raw
  if (raw.startsWith('/')) {
    absolute = `${siteOrigin()}${raw}`
  } else if (raw.startsWith('//')) {
    absolute = `https:${raw}`
  }

  try {
    const res = await fetch(absolute, {
      headers: { Accept: 'image/*,*/*;q=0.8' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (type && !type.startsWith('image/')) return null
    return await res.arrayBuffer()
  } catch {
    // Local relative art may only exist on this host — try public origin last.
    if (raw.startsWith('/') && siteOrigin() !== DEFAULT_PUBLIC_SITE_ORIGIN) {
      try {
        const res = await fetch(`${DEFAULT_PUBLIC_SITE_ORIGIN}${raw}`, {
          headers: { Accept: 'image/*,*/*;q=0.8' },
          next: { revalidate: 3600 },
        })
        if (res.ok) return await res.arrayBuffer()
      } catch {
        /* ignore */
      }
    }
    return null
  }
}

export default async function ShareOpenGraphImage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()

  let title = 'SERGIK'
  let subtitle = 'Listen on sergikdropz.com'
  let cover: ArrayBuffer | null = null

  try {
    const payload = await resolveShareByToken(token, { includePlaybackUrls: false })
    if (payload) {
      title = payload.share.title || title
      subtitle =
        payload.share.kind === 'folder'
          ? `${payload.collection?.artist || 'SERGIK'} · ${payload.tracks.length} tracks`
          : `${payload.tracks[0]?.artist || 'SERGIK'}`
      const art = payload.collection?.artwork || payload.tracks[0]?.artwork || null
      cover = await fetchCoverBytes(art)
    }
  } catch {
    /* branded fallback card */
  }

  const titleDisplay = title.length > 42 ? `${title.slice(0, 40)}…` : title
  const subtitleDisplay = subtitle.length > 48 ? `${subtitle.slice(0, 46)}…` : subtitle
  const sixCaps = await loadSixCapsFont()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: '#050505',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {cover ? (
          <img
            // next/og accepts ArrayBuffer sources
            src={cover as unknown as string}
            alt=""
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(36px) brightness(0.35) saturate(1.15)',
              transform: 'scale(1.15)',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(135deg, rgba(30,30,30,1) 0%, rgba(10,10,10,1) 55%, rgba(20,20,40,1) 100%)',
            }}
          />
        )}

        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.55) 100%)',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 56,
            padding: '56px 64px',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 420,
              height: 420,
              borderRadius: 28,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#111',
              boxShadow: '0 28px 80px rgba(0,0,0,0.55)',
              flexShrink: 0,
            }}
          >
            {cover ? (
              <img
                src={cover as unknown as string}
                alt=""
                width={420}
                height={420}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  color: '#fff',
                  fontSize: 72,
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  fontFamily: sixCaps ? 'Six Caps' : 'system-ui, sans-serif',
                  textTransform: 'uppercase',
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
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                color: 'rgba(255,255,255,0.55)',
                fontSize: sixCaps ? 40 : 28,
                fontWeight: 400,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 18,
                fontFamily: sixCaps ? 'Six Caps' : 'system-ui, sans-serif',
              }}
            >
              SERGIK
            </div>
            <div
              style={{
                display: 'flex',
                color: '#fff',
                fontSize: 64,
                fontWeight: 750,
                lineHeight: 1.1,
                marginBottom: 16,
              }}
            >
              {titleDisplay}
            </div>
            <div
              style={{
                display: 'flex',
                color: 'rgba(255,255,255,0.72)',
                fontSize: 30,
                fontWeight: 500,
                marginBottom: 28,
              }}
            >
              {subtitleDisplay}
            </div>
            <div
              style={{
                display: 'flex',
                color: 'rgba(255,255,255,0.45)',
                fontSize: 24,
                fontWeight: 500,
              }}
            >
              sergikdropz.com
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: sixCaps
        ? [{ name: 'Six Caps', data: sixCaps, style: 'normal', weight: 400 }]
        : undefined,
    },
  )
}
