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
import NavigationButtons from '@/components/NavigationButtons'
import ShopMemberBenefitsBar from '@/components/shop/ShopMemberBenefitsBar'
import ShopMemberVaultSection from '@/components/shop/ShopMemberVaultSection'
import ShopExclusiveSection from '@/components/shop/ShopExclusiveSection'
import { type ShopCatalogPayload } from '@/lib/marketing/shop-catalog'
import type { MemberCatalogItem } from '@/lib/shop/member-catalog'

type MusicShopPageClientProps = ShopCatalogPayload & {
  memberIncluded: MemberCatalogItem[]
  exclusiveCatalog: MemberCatalogItem[]
}

export default function MusicShopPageClient({
  data,
  bundles,
  membershipPlans,
  memberIncluded,
  exclusiveCatalog,
}: MusicShopPageClientProps) {
  const catalogProducts = data.storeCatalog

  const freeDownloadTracks = useMemo(
    () => data.tracks.filter((t) => t.freeDownload),
    [data.tracks],
  )

  const sections = useMemo(() => {
    const items: { id: string; label: string }[] = [{ id: 'catalog', label: 'Catalog' }]
    if (memberIncluded.length > 0) items.push({ id: 'member-vault', label: 'Member picks' })
    if (exclusiveCatalog.length > 0) items.push({ id: 'exclusive', label: 'Exclusive' })
    if (membershipPlans.length > 0) items.push({ id: 'membership', label: 'Membership' })
    if (freeDownloadTracks.length > 0) items.push({ id: 'free', label: 'Free' })
    items.push({ id: 'support', label: 'Support' })
    if (bundles.length > 0) items.push({ id: 'bundles', label: 'Bundles' })
    return items
  }, [
    bundles.length,
    membershipPlans.length,
    freeDownloadTracks.length,
    memberIncluded.length,
    exclusiveCatalog.length,
  ])

  return (
    <div className="relative min-h-screen pt-20">
      <div className="container relative z-10 mx-auto px-4 py-12 sm:py-16">
        <div className="mx-auto mb-6 max-w-4xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-purple-400/90">Music Shop</p>
          <h1 className="font-six-caps mb-4 text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl md:text-7xl">
            Music
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
            EP downloads, beats, and bundles—direct from SERGIK. MP3 is $1.29 per track. Lossless WAV is $1.99 per
            track. Members earn shop credits on billing (digital only) and get monthly vault picks; Inner Circle
            unlocks exclusives.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link
              href="/shop/membership"
              className="rounded-lg border border-gray-700 px-4 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-gray-900/60"
            >
              Membership details
            </Link>
            <Link
              href="/fan/register?next=%2Fshop%2Fmusic"
              className="rounded-lg bg-white px-4 py-2 font-semibold text-black transition hover:bg-gray-200"
            >
              Create free fan account
            </Link>
          </div>
          <Link href="/shop" className="mt-4 inline-block text-sm text-gray-500 transition hover:text-gray-300">
            ← All shops
          </Link>
        </div>

        <ShopSectionNav sections={sections} />

        <ShopMemberBenefitsBar />

        <section id="catalog" className="scroll-mt-28">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-white">Catalog</h2>
            <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-400">
              {catalogProducts.length} {catalogProducts.length === 1 ? 'release' : 'releases'} on streaming
              platforms — direct downloads priced per song ($1.29 MP3, $1.99 lossless WAV).
            </p>
          </div>
          <ShopGrid
            products={catalogProducts}
            categories={data.storeCatalogCategories}
            searchPlaceholder="Search releases…"
            emptyMessage="No Apple Music releases in the shop catalog yet."
            sortByReleaseDateOnly
          />
        </section>

        <ShopMemberVaultSection items={memberIncluded} />
        <ShopExclusiveSection items={exclusiveCatalog} />

        <section id="membership" className="mt-16 scroll-mt-28 space-y-8">
          <FreeFanMembershipCallout returnPath="/shop/music" />
          {membershipPlans.length > 0 ? (
            <MembershipPlans plans={membershipPlans} returnPath="/shop/music" />
          ) : (
            <p className="text-center text-sm text-gray-500">
              Paid membership tiers are being configured.{' '}
              <Link href="/shop/membership" className="text-gray-300 underline hover:text-white">
                Learn more
              </Link>
            </p>
          )}
        </section>

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

        {bundles.length > 0 && (
          <section id="bundles" className="mt-16 scroll-mt-28">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">Bundles</h2>
              <p className="mt-1 text-sm text-gray-400">
                EP collections in MP3 and lossless WAV — save vs buying tracks individually.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {bundles.map((bundle) => (
                <BundleCard key={bundle.id} bundle={bundle} />
              ))}
            </div>
          </section>
        )}

        <NavigationButtons />
      </div>
    </div>
  )
}
