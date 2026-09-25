import productsData from '@/data/products.json'
import purchasableTracks from '@/data/purchasable-tracks.json'
import licenseTiers from '@/data/license-tiers.json'
import bundlesData from '@/data/bundles.json'
import membershipPlansData from '@/data/membership-plans.json'
import merchProductsData from '@/data/merch-products.json'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { releaseArtworkKey, applyLibraryArtwork } from '@/lib/marketing/release-artwork'

function withLocalArtwork<T extends { artwork?: string }>(item: T): T {
  if (!item.artwork) return item
  return { ...item, artwork: resolveImageUrl(item.artwork) }
}

export type ShopCatalogProduct = (typeof productsData.products)[number] & { productType: 'ep-bundle' }

export type ShopCatalogTrack = (typeof purchasableTracks.tracks)[number] & { productType: 'track' }

export type ShopMerchProduct = {
  id: string
  name: string
  slug: string
  status?: string
  thumbnail?: string
  category?: string
  variants?: Array<{ id: number; retail_price: number }>
}

export type ShopCatalogPayload = {
  data: {
    products: ShopCatalogProduct[]
    tracks: ShopCatalogTrack[]
    licenseTiers: typeof licenseTiers.tiers
    categories: typeof productsData.categories
  }
  bundles: typeof bundlesData.bundles
  membershipPlans: (typeof membershipPlansData.plans)[number][]
  merchProducts: ShopMerchProduct[]
}

/** Hide Sonic DNA / seed rows until real Stripe prices and metadata are wired. */
export function isPurchasableCatalogTrack(track: (typeof purchasableTracks.tracks)[number]): boolean {
  if (track.freeDownload) return true
  if (track.id === 'track-1' && track.title === 'Track Name') return false
  if (String(track.stripePriceId || '').startsWith('price_xx')) return false
  return true
}

export function findShopProductBySlug(
  data: ShopCatalogPayload['data'],
  slug: string,
): ShopCatalogProduct | ShopCatalogTrack | null {
  const normalized = slug.trim()
  if (!normalized) return null
  const found =
    data.products.find((p) => p.slug === normalized || p.id === normalized) ||
    data.tracks.find((t) => t.slug === normalized || t.id === normalized)
  return found ?? null
}

export async function getLibraryReleaseArtwork(): Promise<Map<string, string>> {
  const live = new Map<string, string>()
  try {
    if (!(await supabaseIsReachable())) return live
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('music_library_folders')
      .select('id, name, artwork_url')
      .not('artwork_url', 'is', null)
    if (error) return live
    for (const row of data || []) {
      const url = String(row.artwork_url || '').trim()
      if (!url) continue
      for (const raw of [row.id, row.name]) {
        const key = releaseArtworkKey(String(raw || ''))
        if (key) live.set(key, url)
      }
    }
  } catch {
    /* shop still has static artwork */
  }
  return live
}

/** Shop catalog for SSR. Live library covers overlay static products.json when present. */
export async function getShopCatalog(): Promise<ShopCatalogPayload> {
  const liveArtwork = await getLibraryReleaseArtwork()
  const products = applyLibraryArtwork(productsData.products, liveArtwork).map((p) => ({
    ...withLocalArtwork(p),
    productType: 'ep-bundle' as const,
  }))
  const tracks = applyLibraryArtwork(
    purchasableTracks.tracks.filter(isPurchasableCatalogTrack),
    liveArtwork,
  ).map((t) => ({
    ...withLocalArtwork(t),
    productType: 'track' as const,
  }))

  const bundles = bundlesData.bundles.filter((b) => b.status === 'active').map(withLocalArtwork)

  return {
    data: {
      products,
      tracks,
      licenseTiers: licenseTiers.tiers,
      categories: productsData.categories,
    },
    bundles,
    membershipPlans: membershipPlansData.plans ?? [],
    merchProducts: ((merchProductsData.products ?? []) as ShopMerchProduct[]).filter(
      (p) => p.status !== 'inactive' && p.status !== 'draft',
    ),
  }
}
