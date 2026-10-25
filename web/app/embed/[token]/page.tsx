import type { Metadata } from 'next'
import { headers } from 'next/headers'
import ShareEmbedClient from '@/components/shares/ShareEmbedClient'
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
      return { title: 'SERGIK Player', robots: { index: false, follow: false } }
    }
    return sharePageMetadata({
      payload,
      origin,
      token,
      userAgent: headerList.get('user-agent'),
      surface: 'embed',
      videoUrl: (await facebookCardIsPublished(token)) ? facebookCardPlayUrl(origin, token) : null,
    })
  } catch {
    return { title: 'SERGIK Player', robots: { index: false, follow: false } }
  }
}

/** Embeds use the same share stage formula as /s/[token] (accents, disc/sleeve, waveform dock). */
export default async function ShareEmbedPage({ params }: Props) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()

  return (
    <main className="h-[100dvh] min-h-[560px] overflow-hidden bg-black text-white">
      <ShareEmbedClient token={token} />
    </main>
  )
}
