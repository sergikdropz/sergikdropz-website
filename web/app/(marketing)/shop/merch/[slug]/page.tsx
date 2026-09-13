'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import MerchProductDetail from '@/components/shop/MerchProductDetail'

export default function MerchProductPage() {
  const params = useParams()
  const slug = params.slug as string
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/merch/products')
        if (res.ok) {
          const data = await res.json()
          const found = data.products.find((p: any) => p.slug === slug || p.id === slug)
          setProduct(found || null)
        }
      } catch (err) {
        console.error('Error loading product:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto animate-pulse">
          <div className="h-8 w-32 bg-gray-800 rounded mb-8" />
          <div className="grid md:grid-cols-2 gap-8">
            <div className="aspect-square bg-gray-800 rounded-lg" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 bg-gray-800 rounded" />
              <div className="h-6 w-1/3 bg-gray-800 rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Product Not Found</h1>
        <Link href="/shop/merch" className="text-gray-400 hover:text-white transition-colors">
          Back to Merch
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <nav className="mb-8">
          <Link href="/shop/merch" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to Merch
          </Link>
        </nav>

        <MerchProductDetail product={product} />
      </div>
    </div>
  )
}
