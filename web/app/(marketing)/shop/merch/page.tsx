'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MerchGrid from '@/components/shop/MerchGrid'
import ShopSubshopNav from '@/components/shop/ShopSubshopNav'

export default function MerchPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/merch/products')
        if (res.ok) {
          const data = await res.json()
          setProducts(data.products || [])
        }
      } catch (err) {
        console.error('Error loading merch:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen pt-20 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        <ShopSubshopNav active="merch" />

        <div className="text-center mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">Merch Shop</p>
          <h1 className="font-six-caps text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl">Merch</h1>
          <p className="mx-auto mt-3 max-w-xl text-gray-400">
            Rep the sound. Print-on-demand, shipped worldwide.
          </p>
          <Link href="/shop" className="mt-4 inline-block text-sm text-gray-500 transition hover:text-gray-300">
            ← All shops
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-lg aspect-square animate-pulse" />
            ))}
          </div>
        ) : (
          <MerchGrid products={products} />
        )}
      </div>
    </div>
  )
}
