'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import LicenseTierSelector from '@/components/shop/LicenseTierSelector'
import BuyButton from '@/components/BuyButton'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { isSafeNextImageSrc, shouldUnoptimizeImage } from '@/utils/imageOptimization'

export default function ProductDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const [product, setProduct] = useState<any>(null)
  const [licenseTiers, setLicenseTiers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/shop/products')
        if (!res.ok) return
        const data = await res.json()

        // Search in products and tracks by slug or id
        const found =
          data.products.find((p: any) => p.slug === slug || p.id === slug) ||
          data.tracks.find((t: any) => t.slug === slug || t.id === slug)

        setProduct(found || null)
        setLicenseTiers(data.licenseTiers || [])
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
              <div className="h-4 w-full bg-gray-800 rounded" />
              <div className="h-4 w-2/3 bg-gray-800 rounded" />
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
        <Link href="/shop" className="text-gray-400 hover:text-white transition-colors">
          Back to Shop
        </Link>
      </div>
    )
  }

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(product.price)
  const cover = product.artwork ? resolveImageUrl(product.artwork) : ''

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-8">
          <Link href="/shop" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to Shop
          </Link>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Artwork */}
          {isSafeNextImageSrc(cover) && (
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-900">
              <Image
                src={cover}
                alt={product.title}
                fill
                unoptimized={shouldUnoptimizeImage(cover)}
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            </div>
          )}

          {/* Details */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-white">{product.title}</h1>
              <p className="text-gray-400 mt-2">{product.description}</p>
            </div>

            {/* Formats available */}
            {product.formats && (
              <div>
                <p className="text-sm text-gray-400 mb-2">Available formats:</p>
                <div className="flex gap-2 flex-wrap">
                  {product.formats.map((f: any) => {
                    const label = typeof f === 'string' ? f : f.type
                    return (
                      <span
                        key={label}
                        className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded"
                      >
                        {label}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Price + Buy (for non-licensable products) */}
            {!product.licensingEnabled && (
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold text-white">{formattedPrice}</span>
                <BuyButton
                  title={product.title}
                  price={product.price}
                  checkout_method="stripe"
                  stripe_track_id={product.id}
                  stripe_format={product.formats?.[0]?.type || product.formats?.[0] || 'WAV'}
                  productId={product.id}
                  productType={product.productType || 'track'}
                />
              </div>
            )}
          </div>
        </div>

        {/* License Tier Selector (for licensable tracks) */}
        {product.licensingEnabled && (
          <div className="mt-12">
            <LicenseTierSelector
              tiers={licenseTiers}
              trackId={product.id}
              trackTitle={product.title}
              availableTiers={product.availableTiers}
            />
          </div>
        )}
      </div>
    </div>
  )
}
