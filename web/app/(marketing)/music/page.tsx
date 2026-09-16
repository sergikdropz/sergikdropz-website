import { Metadata } from 'next'
import { getPublicLiveReleases } from '@/lib/marketing/public-releases'
import { musicIndexJsonLd, seoDescriptionFromCopy, siteBaseUrl } from '@/lib/marketing/music-seo'
import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import MusicPageClient from './MusicPageClient'

export const revalidate = 300

const MUSIC_DESCRIPTION = seoDescriptionFromCopy({
  title: 'SERGIK Music',
  type: 'catalog',
  genre: artistData.genres.primary.join(', '),
  description: artistData.bio.short,
  elevator: artistData.bio.short,
})

export const metadata: Metadata = {
  title: 'Music | SERGIK — House, Tech House & Underground Releases',
  description: MUSIC_DESCRIPTION,
  keywords: [
    'SERGIK',
    'electronic music',
    'house music',
    'tech house',
    'Phoenix DJ',
    ...artistData.genres.primary,
  ],
  openGraph: {
    title: 'Music | SERGIK',
    description: MUSIC_DESCRIPTION,
    type: 'website',
    url: `${siteBaseUrl()}/music`,
  },
  alternates: {
    canonical: `${siteBaseUrl()}/music`,
  },
}

export default async function MusicPage() {
  const initialLiveReleases = await getPublicLiveReleases()
  const siteUrl = siteBaseUrl()
  const listItems = [
    ...initialLiveReleases.map((r) => ({ id: r.id, title: r.title })),
    ...releasesData.releases.map((r: { id: string; title: string }) => ({ id: r.id, title: r.title })),
  ]
  const unique = Array.from(new Map(listItems.map((r) => [r.id, r])).values())

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            musicIndexJsonLd({
              siteUrl,
              description: MUSIC_DESCRIPTION,
              releases: unique,
            }),
          ),
        }}
      />
      <MusicPageClient initialLiveReleases={initialLiveReleases} />
    </>
  )
}
