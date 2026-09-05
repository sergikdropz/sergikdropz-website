'use client'

import Image from 'next/image'
import Link from 'next/link'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { isSafeNextImageSrc, shouldUnoptimizeImage } from '@/utils/imageOptimization'

interface ProductCardProps {
  id: string
  title: string
  slug?: string
  description: string
  price: number
  artwork?: string
  category?: string
  productType?: string
  licensingEnabled?: boolean
}

export default function ProductCard({
  id,
  title,
  slug,
  description,
  price,
  artwork,
  category,
  productType,
  licensingEnabled,
}: ProductCardProps) {
  const href = slug ? `/shop/${slug}` : `/shop/${id}`

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)

  const cover = artwork ? resolveImageUrl(artwork) : ''

  return (
    <Link href={href} className="group block">
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden transition-all duration-300 hover:border-gray-600 hover:bg-gray-900/70">
        {isSafeNextImageSrc(cover) && (
          <div className="relative aspect-square overflow-hidden">
            <Image
              src={cover}
              alt={title}
              fill
              unoptimized={shouldUnoptimizeImage(cover)}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
            {licensingEnabled && (
              <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-semibold px-2 py-1 rounded">
                Licensable
              </div>
            )}
          </div>
        )}
        <div className="p-4">
          <h3 className="text-white font-semibold text-sm truncate group-hover:text-gray-200">
            {title}
          </h3>
          <p className="text-gray-400 text-xs mt-1 line-clamp-2">{description}</p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-white font-bold">
              {licensingEnabled ? `From ${formattedPrice}` : formattedPrice}
            </span>
            {category && (
              <span className="text-gray-500 text-xs uppercase tracking-wide">
                {category}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
