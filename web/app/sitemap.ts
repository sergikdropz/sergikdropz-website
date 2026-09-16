import { MetadataRoute } from 'next'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import productsData from '@/data/products.json'
import { getPublicLiveReleases } from '@/lib/marketing/public-releases'
import { siteBaseUrl } from '@/lib/marketing/music-seo'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = siteBaseUrl()

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/music`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/epk`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/book`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]

  const releasePages: MetadataRoute.Sitemap = releasesData.releases.map((release: any) => ({
    url: `${siteUrl}/music/${release.id}`,
    lastModified: release.release_date ? new Date(release.release_date) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  const scheduledPages: MetadataRoute.Sitemap = releaseSchedule.schedule
    .filter((r) => {
      return !releasesData.releases.some((existing: any) => existing.id === r.id)
    })
    .map((release) => ({
      url: `${siteUrl}/music/${release.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  const live = await getPublicLiveReleases()
  const known = new Set([
    ...releasesData.releases.map((r: any) => r.id),
    ...releaseSchedule.schedule.map((r) => r.id),
  ])
  const livePages: MetadataRoute.Sitemap = live
    .filter((r) => !known.has(r.id))
    .map((release) => ({
      url: `${siteUrl}/music/${release.id}`,
      lastModified: release.release_date ? new Date(release.release_date) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    }))

  const productPages: MetadataRoute.Sitemap = productsData.products.map((product: any) => ({
    url: `${siteUrl}/shop/${product.id}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...releasePages, ...scheduledPages, ...livePages, ...productPages]
}
