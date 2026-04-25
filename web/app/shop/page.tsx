'use client'

import { useEffect, useState } from 'react'
import ShopGrid from '@/components/shop/ShopGrid'
import TipJar from '@/components/shop/TipJar'
import FreeDownloadTrack from '@/components/shop/FreeDownloadTrack'
import BundleCard from '@/components/shop/BundleCard'
import MembershipPlans from '@/components/shop/MembershipPlans'
import FreeFanMembershipCallout from '@/components/shop/FreeFanMembershipCallout'
import MerchGrid from '@/components/shop/MerchGrid'

interface ShopData {
  products: any[]
  tracks: any[]
  licenseTiers: any[]
  categories: any[]
}

export default function ShopPage() {
  const [data, setData] = useState<ShopData | null>(null)
  const [bundles, setBundles] = useState<any[]>([])
  const [membershipPlans, setMembershipPlans] = useState<any[]>([])
  const [merchProducts, setMerchProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadShop() {
      try {
        const [catalogRes, bundlesRes, plansRes, merchRes] = await Promise.allSettled([
          fetch('/api/shop/products'),
          fetch('/api/shop/bundles'),
          fetch('/api/shop/membership-plans'),
          fetch('/api/merch/products'),
        ])

        if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
          setData(await catalogRes.value.json())
        }
        if (bundlesRes.status === 'fulfilled' && bundlesRes.value.ok) {
          const b = await bundlesRes.value.json()
          setBundles(b.bundles || [])
        }
        if (plansRes.status === 'fulfilled' && plansRes.value.ok) {
          const p = await plansRes.value.json()
          setMembershipPlans(p.plans || [])
        }
        if (merchRes.status === 'fulfilled' && merchRes.value.ok) {
          const m = await merchRes.value.json()
          setMerchProducts(m.products || [])
        }
      } catch (err) {
        console.error('Error loading shop:', err)
      } finally {
        setLoading(false)
      }
    }
    loadShop()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-10 w-48 bg-gray-800 rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-gray-800 rounded-lg h-80" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 text-center">
        <p className="text-gray-400">Failed to load shop.</p>
      </div>
    )
  }

  const allProducts = [
    ...data.products,
    ...data.tracks.filter((t: any) => !t.freeDownload),
  ]
  const freeDownloadTracks = data.tracks.filter((t: any) => t.freeDownload)
  const licensableTracks = data.tracks.filter((t: any) => t.licensingEnabled)

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-7xl mx-auto space-y-16">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white font-six-caps tracking-wide">
            SHOP
          </h1>
          <p className="text-gray-400 mt-2 max-w-lg mx-auto">
            Beats, EPs, merch, and more. Support independent music directly.
          </p>
        </div>

        {/* Main Product Grid */}
        <section>
          <ShopGrid products={allProducts} categories={data.categories} />
        </section>

        {/* Bundles */}
        {bundles.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6">Bundle Deals</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bundles.map((bundle: any) => (
                <BundleCard key={bundle.id} bundle={bundle} />
              ))}
            </div>
          </section>
        )}

        {/* Featured Merch */}
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

        {/* Free fan membership (always) + optional paid plans */}
        <section className="space-y-8">
          <FreeFanMembershipCallout returnPath="/music-library" />
          {membershipPlans.length > 0 && (
            <MembershipPlans plans={membershipPlans} returnPath="/music-library" />
          )}
        </section>

        {/* Free Downloads */}
        {freeDownloadTracks.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-6">Free Downloads</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {freeDownloadTracks.map((track: any) => (
                <FreeDownloadTrack key={track.id} track={track} />
              ))}
            </div>
          </section>
        )}

        {/* Tip Jar */}
        <section>
          <TipJar />
        </section>
      </div>
    </div>
  )
}
