'use client'

import Image from 'next/image'
import Link from 'next/link'

interface MerchCardProps {
  product: {
    id: string
    name: string
    slug: string
    thumbnail: string
    category: string
    variants: Array<{
      id: number
      retail_price: number
    }>
  }
}

export default function MerchCard({ product }: MerchCardProps) {
  const minPrice = Math.min(...product.variants.map((v) => v.retail_price))

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(minPrice)

  return (
    <Link href={`/shop/merch/${product.slug}`} className="group block">
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden transition-all duration-300 hover:border-gray-600">
        <div className="relative aspect-square overflow-hidden bg-gray-800">
          {product.thumbnail && (
            <Image
              src={product.thumbnail}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          )}
        </div>
        <div className="p-4">
          <h3 className="text-white font-semibold text-sm truncate">{product.name}</h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-white font-bold">
              {product.variants.length > 1 ? `From ${formattedPrice}` : formattedPrice}
            </span>
            <span className="text-gray-500 text-xs uppercase tracking-wide">
              {product.category}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
