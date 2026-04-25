import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import artistData from '@/data/artist.json'
import ReleaseDetailClient from './ReleaseDetailClient'

type Release = {
  id: string
  title: string
  type: string
  year?: number
  release_date?: string
  genre?: string
  description?: string
  artwork?: string | null
  image?: string | null
  status?: string
  platforms?: string[]
  spotify_url?: string
  soundcloud_url?: string
  track_count?: number | null
  presave_date?: string
  smart_link?: string | null
}

function getAllReleases(): Release[] {
  const fromReleases: Release[] = releasesData.releases.map((r: any) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    year: r.year,
    release_date: r.release_date,
    status: r.status || 'released',
    image: r.image,
    platforms: r.platforms,
    spotify_url: r.spotify_url,
    soundcloud_url: r.soundcloud_url,
  }))

  const fromSchedule: Release[] = releaseSchedule.schedule.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    release_date: r.release_date,
    genre: r.genre,
    description: r.description,
    artwork: r.artwork,
    status: r.status,
    track_count: r.track_count,
    presave_date: r.presave_date,
    smart_link: r.smart_link,
  }))

  // Merge: schedule data takes priority (has richer metadata)
  const merged = new Map<string, Release>()
  for (const r of fromReleases) merged.set(r.id, r)
  for (const r of fromSchedule) merged.set(r.id, { ...merged.get(r.id), ...r })
  return Array.from(merged.values())
}

function findRelease(slug: string): Release | undefined {
  return getAllReleases().find((r) => r.id === slug)
}

export async function generateStaticParams() {
  return getAllReleases().map((r) => ({ slug: r.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const release = findRelease(slug)
  if (!release) return { title: 'Release Not Found' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
  const title = `${release.title} — SERGIK`
  const description =
    release.description ||
    `${release.title} by SERGIK — ${release.type} (${release.year || new Date(release.release_date || '').getFullYear()})`
  const ogImage = `${siteUrl}/og?release=${slug}`
  const imageAlt = `${release.title} by SERGIK`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'music.album',
      url: `${siteUrl}/music/${slug}`,
      siteName: 'SERGIK',
      images: [{ url: ogImage, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    alternates: {
      canonical: `${siteUrl}/music/${slug}`,
    },
  }
}

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const release = findRelease(slug)
  if (!release) notFound()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    name: release.title,
    albumProductionType: 'StudioAlbum',
    albumReleaseType:
      release.type === 'EP'
        ? 'EPRelease'
        : release.type === 'Single'
        ? 'SingleRelease'
        : 'AlbumRelease',
    byArtist: {
      '@type': 'MusicGroup',
      name: artistData.artist_name,
      url: siteUrl,
    },
    ...(release.release_date && { datePublished: release.release_date }),
    ...(release.genre && { genre: release.genre }),
    ...(release.description && { description: release.description }),
    ...(release.track_count && { numTracks: release.track_count }),
    image:
      release.artwork || release.image
        ? release.artwork?.startsWith('/')
          ? `${siteUrl}${release.artwork}`
          : release.artwork || release.image
        : undefined,
    url: `${siteUrl}/music/${release.id}`,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReleaseDetailClient release={release} />
    </>
  )
}
