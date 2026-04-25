'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MerchGrid from '@/components/shop/MerchGrid'

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
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        <nav className="mb-8">
          <Link href="/shop" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to Shop
          </Link>
        </nav>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white font-six-caps tracking-wide">MERCH</h1>
          <p className="text-gray-400 mt-2">
            Rep the sound. Print-on-demand, shipped worldwide.
          </p>
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
