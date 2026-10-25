import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { NotificationProvider } from '@/contexts/NotificationContext'
import SocialPromoPanel from '@/components/studio/SocialPromoPanel'
import { createSupabaseServerClient } from '@/lib/supabase'
import { loadPromoSharePreview, promoSharePreviewDescription } from '@/lib/studio/promo-share-server'
import { PROMO_SHARE_OG_LABEL } from '@/lib/studio/social-promo'
import { resolvePublicOrigin } from '@/lib/shares/types'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  const origin = resolvePublicOrigin(await headers())
  const url = `${origin}/promo/${encodeURIComponent(token)}`
  const image = `${url}/opengraph-image`
  let description = 'SERGIK'
  try {
    const preview = await loadPromoSharePreview(createSupabaseServerClient(), token)
    if (preview) description = promoSharePreviewDescription(preview)
  } catch {
    /* keep the labeled preview even if the release row is unavailable */
  }
  return {
    title: PROMO_SHARE_OG_LABEL,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: PROMO_SHARE_OG_LABEL,
      description,
      url,
      siteName: 'SERGIK',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${PROMO_SHARE_OG_LABEL}. ${description}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: PROMO_SHARE_OG_LABEL,
      description,
      images: [image],
    },
  }
}

export default async function PromoSharePage({ params }: Props) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw || '').trim()
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <NotificationProvider>
          <SocialPromoPanel shareToken={token} title="" />
        </NotificationProvider>
      </div>
    </div>
  )
}
