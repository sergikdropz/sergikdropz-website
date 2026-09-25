'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import ShopGrid from '@/components/shop/ShopGrid'
import ShopSectionNav from '@/components/shop/ShopSectionNav'
import TipJar from '@/components/shop/TipJar'
import FreeDownloadTrack from '@/components/shop/FreeDownloadTrack'
import BundleCard from '@/components/shop/BundleCard'
import MembershipPlans from '@/components/shop/MembershipPlans'
import FreeFanMembershipCallout from '@/components/shop/FreeFanMembershipCallout'
import MerchGrid from '@/components/shop/MerchGrid'
import NavigationButtons from '@/components/NavigationButtons'
import { isPurchasableCatalogTrack, type ShopCatalogPayload } from '@/lib/marketing/shop-catalog'

type ShopPageClientProps = ShopCatalogPayload

export default function ShopPageClient({
  data,
  bundles,
  membershipPlans,
  merchProducts,
}: ShopPageClientProps) {
  const paidTracks = useMemo(
    () => data.tracks.filter((t) => !t.freeDownload && isPurchasableCatalogTrack(t)),
    [data.tracks],
  )

  const allProducts = useMemo(() => [...data.products, ...paidTracks], [data.products, paidTracks])

  const freeDownloadTracks = useMemo(
    () => data.tracks.filter((t) => t.freeDownload),
    [data.tracks],
  )

  const featuredBundle = bundles[0]

  const sections = useMemo(() => {
    const items: { id: string; label: string }[] = [{ id: 'catalog', label: 'Catalog' }]
    if (bundles.length > 0) items.push({ id: 'bundles', label: 'Bundles' })
    if (membershipPlans.length > 0) items.push({ id: 'membership', label: 'Membership' })
    if (merchProducts.length > 0) items.push({ id: 'merch', label: 'Merch' })
    if (freeDownloadTracks.length > 0) items.push({ id: 'free', label: 'Free' })
    items.push({ id: 'support', label: 'Support' })
    return items
  }, [bundles.length, membershipPlans.length, merchProducts.length, freeDownloadTracks.length])

  return (
    <div className="relative min-h-screen pt-20">
      <div className="container relative z-10 mx-auto px-4 py-12 sm:py-16">
        <div className="mx-auto mb-6 max-w-4xl text-center">
          <h1 className="font-six-caps mb-4 text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl md:text-7xl">
            Shop
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
            EP downloads, beats, and tools—direct from SERGIK. Secure Stripe checkout; fan account required for
            purchases and downloads.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link
              href="/shop/membership"
              className="rounded-lg border border-gray-700 px-4 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-gray-900/60"
            >
              Membership details
            </Link>
            <Link
              href="/fan/register?next=%2Fshop"
              className="rounded-lg bg-white px-4 py-2 font-semibold text-black transition hover:bg-gray-200"
            >
              Create free fan account
            </Link>
          </div>
        </div>

        <ShopSectionNav sections={sections} />

        {featuredBundle && (
          <section className="mb-14">
            <div className="rounded-xl border border-green-600/30 bg-gradient-to-br from-green-950/40 to-gray-950/80 p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-green-400">Featured bundle</p>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{featuredBundle.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-gray-300">{featuredBundle.description}</p>
              <div className="mt-6 max-w-md">
                <BundleCard bundle={featuredBundle} />
              </div>
            </div>
          </section>
        )}

        <section id="catalog" className="scroll-mt-28">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Catalog</h2>
              <p className="mt-1 text-sm text-gray-400">
                {allProducts.length} {allProducts.length === 1 ? 'item' : 'items'} — WAV &amp; MP3 where noted
              </p>
            </div>
          </div>
          <ShopGrid products={allProducts} categories={data.categories} />
        </section>

        {bundles.length > (featuredBundle ? 1 : 0) && (
          <section id="bundles" className="mt-16 scroll-mt-28">
            <h2 className="text-2xl font-bold text-white mb-6">More bundle deals</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bundles.slice(featuredBundle ? 1 : 0).map((bundle) => (
                <BundleCard key={bundle.id} bundle={bundle} />
              ))}
            </div>
          </section>
        )}

        <section id="membership" className="mt-16 scroll-mt-28 space-y-8">
          <FreeFanMembershipCallout returnPath="/shop" />
          {membershipPlans.length > 0 ? (
            <MembershipPlans plans={membershipPlans} returnPath="/shop" />
          ) : (
            <p className="text-center text-sm text-gray-500">
              Paid membership tiers are being configured.{' '}
              <Link href="/shop/membership" className="text-gray-300 underline hover:text-white">
                Learn more
              </Link>
            </p>
          )}
        </section>

        {merchProducts.length > 0 && (
          <section id="merch" className="mt-16 scroll-mt-28">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Merch</h2>
              <Link href="/shop/merch" className="text-gray-400 hover:text-white text-sm transition-colors">
                View all →
              </Link>
            </div>
            <MerchGrid products={merchProducts.slice(0, 4)} compact />
          </section>
        )}

        {freeDownloadTracks.length > 0 && (
          <section id="free" className="mt-16 scroll-mt-28">
            <h2 className="text-2xl font-bold text-white mb-6">Free downloads</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {freeDownloadTracks.map((track) => (
                <FreeDownloadTrack key={track.id} track={track} />
              ))}
            </div>
          </section>
        )}

        <section id="support" className="mt-16 scroll-mt-28">
          <TipJar />
        </section>

        <NavigationButtons />
      </div>
    </div>
  )
}
