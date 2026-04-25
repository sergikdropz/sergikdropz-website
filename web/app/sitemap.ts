import { MetadataRoute } from 'next'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import productsData from '@/data/products.json'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com'

  // Static pages
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
      url: `${siteUrl}/music-library`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]

  // Release pages from releases.json
  const releasePages: MetadataRoute.Sitemap = releasesData.releases.map((release: any) => ({
    url: `${siteUrl}/music/${release.id}`,
    lastModified: release.release_date ? new Date(release.release_date) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // Scheduled release pages
  const scheduledPages: MetadataRoute.Sitemap = releaseSchedule.schedule
    .filter((r) => {
      // Don't duplicate IDs already in releases.json
      return !releasesData.releases.some((existing: any) => existing.id === r.id)
    })
    .map((release) => ({
      url: `${siteUrl}/music/${release.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  // Product pages
  const productPages: MetadataRoute.Sitemap = productsData.products.map((product: any) => ({
    url: `${siteUrl}/shop/${product.id}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...releasePages, ...scheduledPages, ...productPages]
}
