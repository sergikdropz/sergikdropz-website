import productsData from '@/data/products.json'
import purchasableTracks from '@/data/purchasable-tracks.json'
import licenseTiers from '@/data/license-tiers.json'
import bundlesData from '@/data/bundles.json'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'
import { releaseArtworkKey, applyLibraryArtwork } from '@/lib/marketing/release-artwork'

function withLocalArtwork<T extends { artwork?: string }>(item: T): T {
  if (!item.artwork) return item
  return { ...item, artwork: resolveImageUrl(item.artwork) }
}

export type ShopCatalogPayload = {
  data: {
    products: typeof productsData.products
    tracks: typeof purchasableTracks.tracks
    licenseTiers: typeof licenseTiers.tiers
    categories: typeof productsData.categories
  }
  bundles: typeof bundlesData.bundles
  membershipPlans: { id: string; name: string; price: number; interval?: string }[]
  merchProducts: { id: string; name: string; slug: string; price: number; image?: string }[]
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
  const tracks = applyLibraryArtwork(purchasableTracks.tracks, liveArtwork).map((t) => ({
    ...withLocalArtwork(t),
    productType: 'track' as const,
  }))

  return {
    data: {
      products,
      tracks,
      licenseTiers: licenseTiers.tiers,
      categories: productsData.categories,
    },
    bundles: bundlesData.bundles
      .filter((b) => b.status === 'active')
      .map(withLocalArtwork),
    membershipPlans: [],
    merchProducts: [],
  }
}
