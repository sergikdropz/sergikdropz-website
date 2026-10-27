import productsData from '@/data/products.json'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import {
  evaluateReleaseStoreCoverage,
  parseTargetStores,
  type ShopStoreScanMode,
} from '@/lib/shop/sync-purchasable-from-distribution'
import { asDspVerificationStatus, isReleaseLiveOnStore } from '@/lib/studio/dsp-verify'

export type ShopFanReleaseCatalogItem = {
  id: string
  title: string
  slug: string
  description: string
  price: number
  artwork?: string
  category: string
  productType: 'fan-release'
  fanFree: true
  href: string
  status: 'active'
  trackCount?: number
  releaseDate?: string | null
}

const FAN_CATALOG_CATEGORIES = [
  { id: 'ep', label: 'EPs' },
  { id: 'album', label: 'Albums' },
  { id: 'single', label: 'Singles' },
]

type ReleaseRow = {
  id: string
  title: string
  type: string
  release_date: string | null
  artwork_url: string | null
  description: string | null
  target_stores: unknown
}

type LinkRow = {
  release_id: string
  store: string
  url: string
  verification_status?: string | null
}

function normalizeReleaseType(raw: string): string {
  const t = String(raw || 'single').toLowerCase()
  if (t === 'ep' || t.startsWith('ep')) return 'ep'
  if (t === 'album') return 'album'
  return 'single'
}

/** Public shop catalog only after calendar release day (UTC). */
export function releaseDateIsPublic(
  releaseDate: string | null | undefined,
  todayIso = new Date().toISOString().slice(0, 10),
): boolean {
  const day = String(releaseDate || '').slice(0, 10)
  if (!day) return false
  return day <= todayIso
}

/** Core DSP URLs that passed live/reachable verification — not seed or artist-only rows. */
export function verifiedStoreLinkMap(rows: LinkRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) {
    const store = String(row.store || '').trim()
    const url = String(row.url || '').trim()
    if (!store || !url) continue
    if (!isReleaseLiveOnStore(asDspVerificationStatus(row.verification_status))) continue
    map.set(store, url)
  }
  return map
}

function productArtworkForRelease(releaseId: string, title: string): string | undefined {
  const idHay = releaseId.toLowerCase()
  const titleHay = title.toLowerCase()
  const product = productsData.products.find((p) => {
    const key = String(p.release_id || '').toLowerCase()
    if (!key) return false
    return idHay.includes(key) || titleHay.includes(key.replace(/-/g, ' '))
  })
  return product?.artwork ? resolveImageUrl(product.artwork) : undefined
}

function fanReleaseDescription(title: string, trackCount?: number): string {
  const tracks =
    typeof trackCount === 'number' && trackCount > 0
      ? `${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}. `
      : ''
  return `${tracks}${title} — verified live on major streaming platforms. Listen in the vault with a free fan account.`
}

export function buildFanReleaseCatalogItem(input: {
  id: string
  title: string
  type: string
  release_date?: string | null
  artwork_url?: string | null
  trackCount?: number
}): ShopFanReleaseCatalogItem {
  const category = normalizeReleaseType(input.type)
  const artwork =
    (input.artwork_url ? resolveImageUrl(String(input.artwork_url)) : undefined) ||
    productArtworkForRelease(input.id, input.title)

  return {
    id: input.id,
    title: String(input.title || 'Untitled').trim(),
    slug: input.id,
    description: fanReleaseDescription(input.title, input.trackCount),
    price: 0,
    artwork,
    category,
    productType: 'fan-release',
    fanFree: true,
    href: `/music/${encodeURIComponent(input.id)}`,
    status: 'active',
    trackCount: input.trackCount,
    releaseDate: input.release_date ? String(input.release_date).slice(0, 10) : null,
  }
}

export function categoriesForFanReleases(items: ShopFanReleaseCatalogItem[]) {
  const present = new Set(items.map((i) => i.category))
  return FAN_CATALOG_CATEGORIES.filter((c) => present.has(c.id))
}

export async function loadShopFanReleaseCatalog(
  mode: ShopStoreScanMode = 'core',
): Promise<ShopFanReleaseCatalogItem[]> {
  try {
    if (!(await supabaseIsReachable())) {
      return []
    }

    const supabase = createSupabaseServerClient()
    const { data: releases, error: relError } = await supabase
      .from('distribution_releases')
      .select('id, title, type, release_date, artwork_url, description, target_stores')
      .eq('distributor_status', 'live')

    if (relError || !releases?.length) {
      return []
    }

    const releaseIds = releases.map((r) => r.id)
    const [{ data: trackRows, error: trackError }, { data: linkRows, error: linkError }] =
      await Promise.all([
        supabase.from('distribution_tracks').select('release_id').in('release_id', releaseIds),
        supabase
          .from('distribution_store_links')
          .select('release_id, store, url, verification_status')
          .in('release_id', releaseIds),
      ])

    if (trackError || linkError) {
      return []
    }

    const trackCountByRelease = new Map<string, number>()
    for (const row of trackRows || []) {
      const id = String(row.release_id || '')
      if (!id) continue
      trackCountByRelease.set(id, (trackCountByRelease.get(id) || 0) + 1)
    }

    const linksForRelease = new Map<string, LinkRow[]>()
    for (const link of (linkRows || []) as LinkRow[]) {
      const bucket = linksForRelease.get(link.release_id) || []
      bucket.push(link)
      linksForRelease.set(link.release_id, bucket)
    }

    const items: ShopFanReleaseCatalogItem[] = []
    for (const release of releases as ReleaseRow[]) {
      if (!releaseDateIsPublic(release.release_date)) continue

      const targetStores = parseTargetStores(release.target_stores)
      const linkMap = verifiedStoreLinkMap(linksForRelease.get(release.id) || [])
      const coverage = evaluateReleaseStoreCoverage(mode, targetStores, linkMap)
      if (!coverage.eligible) continue

      const trackCount = trackCountByRelease.get(release.id) || 0
      if (trackCount < 1) continue

      items.push(
        buildFanReleaseCatalogItem({
          id: release.id,
          title: release.title,
          type: release.type,
          release_date: release.release_date,
          artwork_url: release.artwork_url,
          trackCount,
        }),
      )
    }

    items.sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
    return items
  } catch {
    return []
  }
}
