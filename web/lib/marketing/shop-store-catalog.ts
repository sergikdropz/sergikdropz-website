import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import productsData from '@/data/products.json'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { normalizeReleaseKey } from '@/lib/ep-cover-art'
import { releaseDateIsPublic } from '@/lib/marketing/shop-fan-releases'
import {
  evaluateReleaseStoreCoverage,
  parseTargetStores,
  SHOP_CORE_STREAMING_STORES,
} from '@/lib/shop/sync-purchasable-from-distribution'
import { asDspVerificationStatus, isReleaseLiveOnStore } from '@/lib/studio/dsp-verify'
import type { ShopCatalogProduct } from '@/lib/marketing/shop-catalog'

export type StreamingStoreRef = {
  releaseId: string
  title: string
  sortDate: string
  source: 'distribution' | 'releases-json' | 'release-schedule'
}

const STORE_CATALOG_CATEGORIES = [
  { id: 'ep-bundles', label: 'EPs' },
  { id: 'singles', label: 'Singles' },
  { id: 'albums', label: 'Albums' },
]

function hasStreamingPlatform(platforms: string[] | undefined): boolean {
  if (!platforms?.length) return false
  return platforms.some((p) => {
    const key = String(p).toLowerCase()
    return key.includes('spotify') || key.includes('apple') || key.includes('soundcloud')
  })
}

function refKey(title: string, releaseId?: string): string {
  const idKey = String(releaseId || '').trim().toLowerCase()
  if (idKey) return idKey
  return normalizeReleaseKey(title)
}

function dedupeRefs(refs: StreamingStoreRef[]): StreamingStoreRef[] {
  const byKey = new Map<string, StreamingStoreRef>()
  for (const ref of refs) {
    const key = refKey(ref.title, ref.releaseId)
    const prev = byKey.get(key)
    if (!prev || ref.sortDate > prev.sortDate) {
      byKey.set(key, ref)
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.sortDate.localeCompare(a.sortDate))
}

function productReleaseIdForTitle(title: string): string | null {
  const hay = normalizeReleaseKey(title)
  if (!hay) return null
  for (const product of productsData.products) {
    const productHay = normalizeReleaseKey(product.title)
    const rid = String(product.release_id || '').toLowerCase()
    if (rid && hay.includes(normalizeReleaseKey(rid.replace(/-/g, ' ')))) return product.release_id
    if (productHay.includes(hay) || hay.includes(productHay)) {
      return product.release_id || product.id
    }
  }
  return null
}

/** Map distribution / schedule rows onto products.json `release_id` when possible. */
export function matchProductReleaseId(title: string, distributionId: string): string | null {
  const fromProduct = productReleaseIdForTitle(title)
  if (fromProduct) return fromProduct

  const hayId = distributionId.toLowerCase()
  const slugHints: Array<[RegExp, string]> = [
    [/stay/i, 'staying-a-vibe'],
    [/soul candy/i, 'soul-candy'],
    [/roos/i, 'roos-va'],
    [/hold up/i, 'hold-up'],
    [/good day/i, 'a-good-day'],
    [/ftp/i, 'ftp'],
    [/24\s*\/\s*7|24-7/i, '24-7'],
    [/heartbeat/i, 'heartbeat-devotion'],
    [/dumb/i, 'dumb'],
    [/recouperate/i, 'recouperate'],
    [/get on my vibe/i, 'get-on-my-vibe'],
    [/this is the sound/i, 'this-is-the-sound'],
  ]

  for (const [pattern, releaseId] of slugHints) {
    if (pattern.test(title) || pattern.test(hayId)) return releaseId
  }

  if (hayId.includes('stayi')) return 'staying-a-vibe'
  if (hayId.includes('fcfd5797')) return 'soul-candy'
  return null
}

function scheduleStreamingReleaseId(row: (typeof releaseSchedule.schedule)[number]): string {
  return matchProductReleaseId(row.title, row.id) || row.id
}

/** Curated + schedule streaming releases (fallback when DB is partial). */
export function staticStreamingStoreRefs(todayIso = new Date().toISOString().slice(0, 10)): StreamingStoreRef[] {
  const refs: StreamingStoreRef[] = []

  for (const release of releasesData.releases) {
    if (!hasStreamingPlatform(release.platforms)) continue
    const dated = release as { release_date?: string; year?: number }
    const sortDate =
      (dated.release_date && String(dated.release_date).slice(0, 10)) ||
      `${dated.year || '1970'}-12-31`
    refs.push({
      releaseId: release.id,
      title: release.title,
      sortDate,
      source: 'releases-json',
    })
  }

  for (const row of releaseSchedule.schedule) {
    if (row.status !== 'released') continue
    if (row.distributor_status !== 'live') continue
    if (!releaseDateIsPublic(row.release_date, todayIso)) continue
    refs.push({
      releaseId: scheduleStreamingReleaseId(row),
      title: row.title,
      sortDate: String(row.release_date).slice(0, 10),
      source: 'release-schedule',
    })
  }

  return dedupeRefs(refs)
}

function verifiedStoreLinkMap(
  rows: Array<{ store: string; url: string; verification_status?: string | null }>,
): Map<string, string> {
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

async function distributionStreamingRefs(): Promise<StreamingStoreRef[]> {
  const supabase = createSupabaseServerClient()
  const { data: releases, error } = await supabase
    .from('distribution_releases')
    .select('id, title, release_date, target_stores, distributor_status')
    .eq('distributor_status', 'live')

  if (error || !releases?.length) return []

  const ids = releases.map((r) => r.id)
  const { data: links, error: linkError } = await supabase
    .from('distribution_store_links')
    .select('release_id, store, url, verification_status')
    .in('release_id', ids)

  if (linkError) return []

  const linksForRelease = new Map<string, Array<{ store: string; url: string; verification_status?: string | null }>>()
  for (const row of links || []) {
    const bucket = linksForRelease.get(String(row.release_id)) || []
    bucket.push({
      store: String(row.store || ''),
      url: String(row.url || ''),
      verification_status: row.verification_status,
    })
    linksForRelease.set(String(row.release_id), bucket)
  }

  const refs: StreamingStoreRef[] = []
  for (const release of releases) {
    if (!releaseDateIsPublic(release.release_date)) continue
    const linkMap = verifiedStoreLinkMap(linksForRelease.get(release.id) || [])
    if (!linkMap.size) continue

    const targetStores = parseTargetStores(release.target_stores)
    const coverage = evaluateReleaseStoreCoverage('core', targetStores, linkMap)
    const hasApple = linkMap.has('apple_music')
    const hasSpotify = linkMap.has('spotify')
    if (!coverage.eligible && !hasApple && !hasSpotify) continue

    const title = String(release.title || 'Untitled')
    refs.push({
      releaseId: matchProductReleaseId(title, release.id) || release.id,
      title,
      sortDate: release.release_date ? String(release.release_date).slice(0, 10) : '1970-01-01',
      source: 'distribution',
    })
  }

  return refs
}

/** Union of DB + static so a partial Supabase slice never hides the full discography. */
export async function loadStreamingStoreRefs(): Promise<StreamingStoreRef[]> {
  try {
    const staticRefs = staticStreamingStoreRefs()
    if (!(await supabaseIsReachable())) {
      return staticRefs
    }
    const fromDb = await distributionStreamingRefs()
    return dedupeRefs([...fromDb, ...staticRefs])
  } catch {
    return staticStreamingStoreRefs()
  }
}

/** @deprecated Use loadStreamingStoreRefs */
export const loadAppleMusicStoreRefs = loadStreamingStoreRefs

/** @deprecated Use staticStreamingStoreRefs */
export const staticAppleMusicStoreRefs = staticStreamingStoreRefs

export type AppleMusicStoreRef = StreamingStoreRef

export function productMatchesStoreRef(product: ShopCatalogProduct, ref: StreamingStoreRef): boolean {
  const productReleaseId = String(product.release_id || '').toLowerCase()
  const refId = ref.releaseId.toLowerCase()
  if (productReleaseId && (productReleaseId === refId || refId.includes(productReleaseId))) {
    return true
  }

  const productTitle = normalizeReleaseKey(product.title)
  const refTitle = normalizeReleaseKey(ref.title)
  if (productTitle && refTitle && (productTitle.includes(refTitle) || refTitle.includes(productTitle))) {
    return true
  }

  return false
}

export function streamingCatalogReleaseIds(refs: StreamingStoreRef[]): Set<string> {
  return new Set(refs.map((r) => r.releaseId.toLowerCase()))
}

/** ISO date (YYYY-MM-DD) keyed by release_id and normalized title. */
export function buildReleaseDateIndex(): Map<string, string> {
  const index = new Map<string, string>()

  const put = (key: string, day: string) => {
    const k = key.trim().toLowerCase()
    const d = day.slice(0, 10)
    if (!k || !d) return
    const prev = index.get(k)
    if (!prev || d > prev) index.set(k, d)
  }

  for (const release of releasesData.releases) {
    const dated = release as { id: string; title: string; release_date?: string; year?: number }
    const day =
      (dated.release_date && String(dated.release_date).slice(0, 10)) ||
      `${dated.year || '1970'}-12-31`
    put(dated.id, day)
    put(normalizeReleaseKey(dated.title), day)
  }

  for (const row of releaseSchedule.schedule) {
    if (row.status !== 'released') continue
    const day = String(row.release_date || '').slice(0, 10)
    if (!day) continue
    const rid = scheduleStreamingReleaseId(row)
    put(rid, day)
    put(normalizeReleaseKey(row.title), day)
  }

  return index
}

function mergeReleaseDateIndex(
  index: Map<string, string>,
  refs: StreamingStoreRef[],
): Map<string, string> {
  const merged = new Map(index)
  for (const ref of refs) {
    const day = ref.sortDate.slice(0, 10)
    if (!day) continue
    const keys = [ref.releaseId, normalizeReleaseKey(ref.title)]
    for (const key of keys) {
      const k = key.trim().toLowerCase()
      if (!k) continue
      const prev = merged.get(k)
      if (!prev || day > prev) merged.set(k, day)
    }
  }
  return merged
}

export function resolveCatalogReleaseDate(
  product: ShopCatalogProduct,
  refs: StreamingStoreRef[],
  dateIndex: Map<string, string>,
): string {
  let best = '1970-01-01'

  const consider = (day: string | undefined) => {
    const d = String(day || '').slice(0, 10)
    if (d && d > best) best = d
  }

  const rid = String(product.release_id || '').trim().toLowerCase()
  if (rid) consider(dateIndex.get(rid))

  consider(dateIndex.get(normalizeReleaseKey(product.title)))

  for (const ref of refs) {
    if (!productMatchesStoreRef(product, ref)) continue
    consider(ref.sortDate)
    consider(dateIndex.get(ref.releaseId.toLowerCase()))
    consider(dateIndex.get(normalizeReleaseKey(ref.title)))
  }

  return best
}

/** Newest release date first (descending ISO dates). */
export function compareByReleaseDateNewestFirst(
  a: { catalogSortDate?: string; title?: string },
  b: { catalogSortDate?: string; title?: string },
): number {
  const byDate = String(b.catalogSortDate || '').localeCompare(String(a.catalogSortDate || ''))
  if (byDate !== 0) return byDate
  return String(a.title || '').localeCompare(String(b.title || ''))
}

export type ShopStoreCatalogProduct = ShopCatalogProduct & { catalogSortDate: string }

export function buildStoreCatalogFromProducts(
  products: ShopCatalogProduct[],
  refs: StreamingStoreRef[],
): ShopStoreCatalogProduct[] {
  const matched = new Map<string, ShopCatalogProduct>()
  const streamingIds = streamingCatalogReleaseIds(refs)

  for (const ref of refs) {
    const product = products.find((p) => p.status !== 'inactive' && productMatchesStoreRef(p, ref))
    if (product) matched.set(product.id, product)
  }

  for (const product of products) {
    if (product.status === 'inactive') continue
    if (matched.has(product.id)) continue
    const rid = String(product.release_id || '').toLowerCase()
    if (rid && streamingIds.has(rid)) {
      matched.set(product.id, product)
    }
  }

  const dateIndex = mergeReleaseDateIndex(buildReleaseDateIndex(), refs)

  return Array.from(matched.values())
    .map((product) => ({
      ...product,
      catalogSortDate: resolveCatalogReleaseDate(product, refs, dateIndex),
    }))
    .sort(compareByReleaseDateNewestFirst)
}

export function categoriesForStoreCatalog(items: ShopCatalogProduct[]) {
  const present = new Set(items.map((p) => p.category || 'ep-bundles'))
  return STORE_CATALOG_CATEGORIES.filter((c) => present.has(c.id))
}

/** For tests / diagnostics */
export { SHOP_CORE_STREAMING_STORES }
