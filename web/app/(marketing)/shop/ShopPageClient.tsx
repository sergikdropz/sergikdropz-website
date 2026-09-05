'use client'

import ShopGrid from '@/components/shop/ShopGrid'
import TipJar from '@/components/shop/TipJar'
import FreeDownloadTrack from '@/components/shop/FreeDownloadTrack'
import BundleCard from '@/components/shop/BundleCard'
import MembershipPlans from '@/components/shop/MembershipPlans'
import FreeFanMembershipCallout from '@/components/shop/FreeFanMembershipCallout'
import MerchGrid from '@/components/shop/MerchGrid'
import type { ShopCatalogPayload } from '@/lib/marketing/shop-catalog'

type ShopPageClientProps = ShopCatalogPayload

export default function ShopPageClient({
  data,
  bundles,
  membershipPlans,
  merchProducts,
}: ShopPageClientProps) {
  const allProducts = [
    ...data.products,
    ...data.tracks.filter((t: { freeDownload?: boolean }) => !t.freeDownload),
  ]
  const freeDownloadTracks = data.tracks.filter((t: { freeDownload?: boolean }) => t.freeDownload)

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-7xl mx-auto space-y-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white font-six-caps tracking-wide">
            SHOP
          </h1>
          <p className="text-gray-400 mt-2 max-w-lg mx-auto">
            Beats, EPs, merch, and more. Support independent music directly.
          </p>
        </div>

        <section>
          <ShopGrid products={allProducts} categories={data.categories} />
        </section>

        {bundles.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6">Bundle Deals</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bundles.map((bundle) => (
                <BundleCard key={bundle.id} bundle={bundle} />
              ))}
            </div>
          </section>
        )}

        {merchProducts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Merch</h2>
              <a href="/shop/merch" className="text-gray-400 hover:text-white text-sm transition-colors">
                View All →
              </a>
            </div>
            <MerchGrid products={merchProducts.slice(0, 4)} compact />
          </section>
        )}

        <section className="space-y-8">
          <FreeFanMembershipCallout returnPath="/music-library" />
          {membershipPlans.length > 0 && (
            <MembershipPlans plans={membershipPlans} returnPath="/music-library" />
          )}
        </section>

        {freeDownloadTracks.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6">Free Downloads</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {freeDownloadTracks.map((track) => (
                <FreeDownloadTrack key={track.id} track={track} />
              ))}
            </div>
          </section>
        )}

        <section>
          <TipJar />
        </section>
      </div>
    </div>
  )
}
