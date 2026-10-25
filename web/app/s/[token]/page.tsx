import type { Metadata } from 'next'
import { headers } from 'next/headers'
import ShareListenClient from '@/components/shares/ShareListenClient'
import { resolveShareByToken } from '@/lib/shares/share-service'
import { sharePageMetadata } from '@/lib/shares/share-page-metadata'
import { facebookCardIsPublished, facebookCardPlayUrl } from '@/lib/shares/facebook-card'
import { resolvePublicOrigin } from '@/lib/shares/types'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  const headerList = await headers()
  const origin = resolvePublicOrigin(headerList)

  try {
    const payload = await resolveShareByToken(token, {
      includePlaybackUrls: false,
      origin,
    })
    if (!payload) {
      return { title: 'Share unavailable — SERGIK', robots: { index: false, follow: false } }
    }
    return sharePageMetadata({
      payload,
      origin,
      token,
      userAgent: headerList.get('user-agent'),
      surface: 'listen',
      videoUrl: (await facebookCardIsPublished(token)) ? facebookCardPlayUrl(origin, token) : null,
    })
  } catch {
    return { title: 'SERGIK', robots: { index: false, follow: false } }
  }
}

export default async function ShareListenPage({ params }: Props) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  return <ShareListenClient token={token} />
}
