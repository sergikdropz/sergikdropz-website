import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import SmartLinkLandingView from '@/components/smartlinks/SmartLinkLanding'
import { loadSmartLinkLanding } from '@/lib/smartlinks/load-landing'
import { createSupabaseServerClient } from '@/lib/supabase'

const getSmartLinkLanding = cache(async (slug: string) => {
  try {
    return await loadSmartLinkLanding(createSupabaseServerClient(), slug)
  } catch (error) {
    console.error('[smartlink landing]', error)
    return null
  }
})

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeURIComponent(params.slug || '').trim()
  const landing = await getSmartLinkLanding(slug)
  if (!landing) {
    return { title: 'Link unavailable — SERGIK', robots: { index: false, follow: false } }
  }
  const title = `${landing.title} — SERGIK`
  const description = landing.description || `Listen to ${landing.title} by ${landing.artist}.`
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: 'SERGIK',
      images: landing.artworkUrl ? [{ url: landing.artworkUrl, alt: landing.title }] : undefined,
    },
  }
}

export default async function SmartLinkPage({ params, searchParams }: Props) {
  const slug = decodeURIComponent(params.slug || '').trim()
  const landing = await getSmartLinkLanding(slug)
  if (!landing || landing.destinations.length === 0) notFound()
  return <SmartLinkLandingView landing={landing} search={searchParams} />
}
