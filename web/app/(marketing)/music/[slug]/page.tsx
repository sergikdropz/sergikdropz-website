import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import ReleaseDetailClient from './ReleaseDetailClient'
import { getPublicLiveReleaseById } from '@/lib/marketing/public-releases'
import {
  breadcrumbJsonLd,
  musicAlbumJsonLd,
  seoDescriptionFromCopy,
  siteBaseUrl,
  storeLinkToPlatform,
} from '@/lib/marketing/music-seo'

export const revalidate = 300
export const dynamicParams = true

export type PublicReleaseView = {
  id: string
  title: string
  type: string
  year?: number
  release_date?: string
  genre?: string
  subgenre?: string
  description?: string
  artwork?: string | null
  image?: string | null
  status?: string
  platforms?: string[]
  spotify_url?: string
  soundcloud_url?: string
  track_count?: number | null
  presave_date?: string | null
  smart_link?: string | null
  upc?: string | null
  tracks?: Array<{ title: string; duration?: number | null }>
  storeLinks?: Array<{ store: string; url: string; label: string }>
}

type StaticRelease = {
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
  presave_date?: string | null
  smart_link?: string | null
}

function getStaticReleases(): StaticRelease[] {
  const fromReleases: StaticRelease[] = releasesData.releases.map((r: any) => ({
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

  const fromSchedule: StaticRelease[] = releaseSchedule.schedule.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    release_date: r.release_date,
    genre: r.genre ?? undefined,
    description: r.description ?? undefined,
    artwork: r.artwork,
    status: r.status,
    track_count: r.track_count,
    presave_date: r.presave_date,
    smart_link: r.smart_link,
  }))

  const merged = new Map<string, StaticRelease>()
  for (const r of fromReleases) merged.set(r.id, r)
  for (const r of fromSchedule) merged.set(r.id, { ...merged.get(r.id), ...r })
  return Array.from(merged.values())
}

function findStaticRelease(slug: string): StaticRelease | undefined {
  return getStaticReleases().find((r) => r.id === slug)
}

function viewFromStatic(release: StaticRelease): PublicReleaseView {
  return {
    ...release,
    artwork: release.artwork || release.image || null,
  }
}

function viewFromLive(live: NonNullable<Awaited<ReturnType<typeof getPublicLiveReleaseById>>>): PublicReleaseView {
  const platforms = live.storeLinks.map((l) => storeLinkToPlatform(l.store).label)
  const spotify = live.storeLinks.find((l) => storeLinkToPlatform(l.store).key === 'spotify')
  const soundcloud = live.storeLinks.find((l) => storeLinkToPlatform(l.store).key === 'soundcloud')
  return {
    id: live.id,
    title: live.title,
    type: live.type,
    year: live.release_date ? new Date(live.release_date).getFullYear() : undefined,
    release_date: live.release_date || undefined,
    genre: [live.genre, live.subgenre].filter(Boolean).join(' / ') || undefined,
    subgenre: live.subgenre || undefined,
    description: live.description || undefined,
    artwork: live.artwork_url,
    image: live.artwork_url,
    status: 'released',
    platforms: platforms.length ? platforms : undefined,
    spotify_url: spotify?.url,
    soundcloud_url: soundcloud?.url,
    track_count: live.tracks.length || null,
    upc: live.upc,
    tracks: live.tracks.map((t) => ({ title: t.title, duration: t.duration })),
    storeLinks: live.storeLinks,
  }
}

async function resolveRelease(slug: string): Promise<{
  view: PublicReleaseView
  live: Awaited<ReturnType<typeof getPublicLiveReleaseById>>
} | null> {
  const live = await getPublicLiveReleaseById(slug)
  if (live) return { view: viewFromLive(live), live }
  const staticRelease = findStaticRelease(slug)
  if (staticRelease) return { view: viewFromStatic(staticRelease), live: null }
  return null
}

export async function generateStaticParams() {
  return getStaticReleases().map((r) => ({ slug: r.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const resolved = await resolveRelease(slug)
  if (!resolved) return { title: 'Release Not Found' }

  const { view, live } = resolved
  const siteUrl = siteBaseUrl()
  const title = `${view.title} — SERGIK`
  const description =
    live?.seoDescription ||
    seoDescriptionFromCopy({
      title: view.title,
      type: view.type,
      genre: view.genre,
      description: view.description,
    })
  const ogImage = `${siteUrl}/og?release=${encodeURIComponent(slug)}`
  const imageAlt = `${view.title} by SERGIK`
  const keywords = ['SERGIK', view.title, view.type, view.genre, view.subgenre, 'electronic music', 'Phoenix']
    .filter(Boolean)
    .map(String)

  return {
    title,
    description,
    keywords,
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
  const resolved = await resolveRelease(slug)
  if (!resolved) notFound()

  const { view, live } = resolved
  const siteUrl = siteBaseUrl()
  const jsonLd = musicAlbumJsonLd({
    siteUrl,
    id: view.id,
    title: view.title,
    type: view.type,
    description: live?.description || view.description,
    genre: live?.genre || view.genre,
    subgenre: live?.subgenre,
    releaseDate: view.release_date,
    image: view.artwork || view.image,
    upc: live?.upc || view.upc,
    tracks: live?.tracks || view.tracks,
    storeLinks: live?.storeLinks,
  })
  const crumbs = breadcrumbJsonLd(siteUrl, view.title, view.id)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
      />
      <ReleaseDetailClient release={view} />
    </>
  )
}
