import type { Metadata } from 'next'
import { headers } from 'next/headers'
import ShareListenClient from '@/components/shares/ShareListenClient'
import { resolveShareByToken } from '@/lib/shares/share-service'
import { resolvePublicOrigin } from '@/lib/shares/types'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  const origin = resolvePublicOrigin(await headers())

  try {
    const payload = await resolveShareByToken(token, {
      includePlaybackUrls: false,
      origin,
    })
    if (!payload) {
      return { title: 'Share unavailable — SERGIK', robots: { index: false, follow: false } }
    }
    const title = `${payload.share.title} — SERGIK`
    const description =
      payload.share.kind === 'folder'
        ? `${payload.collection?.artist || 'SERGIK'} · ${payload.tracks.length} tracks`
        : `${payload.tracks[0]?.artist || 'SERGIK'}`
    const url = `${origin}/s/${encodeURIComponent(token)}`
    // Dedicated share OG image (cover art card) — never the homepage /og hero.
    const ogImage = `${origin}/s/${encodeURIComponent(token)}/opengraph-image`

    return {
      metadataBase: new URL(origin),
      title,
      description,
      robots: {
        index: payload.share.visibility === 'public',
        follow: payload.share.visibility === 'public',
      },
      openGraph: {
        title,
        description,
        url,
        siteName: 'SERGIK',
        type: 'website',
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: title,
            type: 'image/png',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage],
      },
    }
  } catch {
    return { title: 'SERGIK', robots: { index: false, follow: false } }
  }
}

export default async function ShareListenPage({ params }: Props) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  return <ShareListenClient token={token} />
}
