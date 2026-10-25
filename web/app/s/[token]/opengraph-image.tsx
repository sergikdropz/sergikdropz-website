import { ImageResponse } from 'next/og'
import { shareClock } from '@/lib/shares/facebook-card'
import { resolveShareByToken } from '@/lib/shares/share-service'
import { DEFAULT_PUBLIC_SITE_ORIGIN, siteOrigin } from '@/lib/shares/types'

export const runtime = 'nodejs'
export const alt = 'SERGIK'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

async function fetchCoverBytes(artworkUrl: string | null | undefined): Promise<ArrayBuffer | null> {
  const raw = String(artworkUrl || '').trim()
  if (!raw) return null

  const candidates: string[] = []
  const push = (url: string | null | undefined) => {
    const v = String(url || '').trim()
    if (v && !candidates.includes(v)) candidates.push(v)
  }

  if (raw.startsWith('/')) {
    // Prefer public CDN for serverless OG (local SITE_URL / cold localhost won't resolve).
    push(`${DEFAULT_PUBLIC_SITE_ORIGIN}${raw}`)
    const origin = siteOrigin()
    if (origin !== DEFAULT_PUBLIC_SITE_ORIGIN) push(`${origin}${raw}`)
    // Some rows store pre-encoded path segments; also try a decoded form.
    try {
      const decoded = raw
        .split('/')
        .map((seg) => {
          if (!seg) return seg
          try {
            return encodeURIComponent(decodeURIComponent(seg))
          } catch {
            return encodeURIComponent(seg)
          }
        })
        .join('/')
      if (decoded !== raw) {
        push(`${DEFAULT_PUBLIC_SITE_ORIGIN}${decoded}`)
        if (origin !== DEFAULT_PUBLIC_SITE_ORIGIN) push(`${origin}${decoded}`)
      }
    } catch {
      /* ignore */
    }
  } else if (raw.startsWith('//')) {
    push(`https:${raw}`)
  } else if (/^https?:\/\//i.test(raw)) {
    push(raw)
    // Same-origin proxy helps when storage CDN blocks server-side bots.
    try {
      const origin = siteOrigin() || DEFAULT_PUBLIC_SITE_ORIGIN
      push(`${origin.replace(/\/$/, '')}/api/shares/artwork-proxy?src=${encodeURIComponent(raw)}`)
      if (origin !== DEFAULT_PUBLIC_SITE_ORIGIN) {
        push(
          `${DEFAULT_PUBLIC_SITE_ORIGIN}/api/shares/artwork-proxy?src=${encodeURIComponent(raw)}`,
        )
      }
    } catch {
      /* ignore */
    }
  } else {
    push(`${DEFAULT_PUBLIC_SITE_ORIGIN}/${raw.replace(/^\/+/, '')}`)
  }

  for (const absolute of candidates) {
    try {
      const res = await fetch(absolute, {
        headers: { Accept: 'image/*,*/*;q=0.8' },
        next: { revalidate: 3600 },
      })
      if (!res.ok) continue
      const type = res.headers.get('content-type') || ''
      if (type && !type.startsWith('image/')) continue
      const buf = await res.arrayBuffer()
      if (buf.byteLength > 0) return buf
    } catch {
      /* try next candidate */
    }
  }
  return null
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
  let trackLines: { num: string; name: string; time: string }[] = []

  try {
    const payload = await resolveShareByToken(token, { includePlaybackUrls: false })
    if (payload) {
      title = payload.share.title || title
      const kindLabel = (payload.collection?.type || 'ep').toUpperCase()
      subtitle =
        payload.share.kind === 'folder'
          ? `${payload.collection?.artist || 'SERGIK'} · ${kindLabel} · ${payload.tracks.length} tracks`
          : `${payload.tracks[0]?.artist || 'SERGIK'}`
      trackLines = payload.tracks.slice(0, 5).map((track, index) => {
        const name = track.title.length > 28 ? `${track.title.slice(0, 26)}…` : track.title
        return { num: String(index + 1), name, time: shareClock(track.duration) }
      })
      const art =
        payload.collection?.artwork ||
        payload.tracks.find((t) => t.artwork)?.artwork ||
        payload.tracks[0]?.artwork ||
        null
      cover = await fetchCoverBytes(art)
    }
  } catch {
    /* branded fallback card */
  }

  const titleDisplay = title.length > 42 ? `${title.slice(0, 40)}…` : title
  const subtitleDisplay = subtitle.length > 48 ? `${subtitle.slice(0, 46)}…` : subtitle

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
                  fontFamily: 'system-ui, sans-serif',
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
                fontSize: 28,
                fontWeight: 400,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 18,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              SERGIK
            </div>
            <div
              style={{
                display: 'flex',
                color: '#fff',
                fontSize: trackLines.length ? 52 : 64,
                fontWeight: 750,
                lineHeight: 1.1,
                marginBottom: 12,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {titleDisplay}
            </div>
            <div
              style={{
                display: 'flex',
                color: 'rgba(255,255,255,0.72)',
                fontSize: 26,
                fontWeight: 500,
                marginBottom: trackLines.length ? 22 : 28,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {subtitleDisplay}
            </div>
            {trackLines.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trackLines.map((line) => (
                  <div
                    key={line.num}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      color: 'rgba(255,255,255,0.88)',
                      fontSize: 24,
                      fontWeight: 500,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    <div style={{ display: 'flex', width: 36, color: 'rgba(255,255,255,0.45)' }}>{line.num}</div>
                    <div style={{ display: 'flex', flex: 1 }}>{line.name}</div>
                    <div style={{ display: 'flex', color: 'rgba(255,255,255,0.5)', marginLeft: 16 }}>
                      {line.time}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
