'use client'

import Image from 'next/image'
import Link from 'next/link'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { isSafeNextImageSrc, shouldUnoptimizeImage } from '@/utils/imageOptimization'

/** Site logo when a release has no cover art yet */
const SHOP_COVER_PLACEHOLDER = '/images/logo.png'

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
  formatPrices?: { MP3: number; WAV: number }
  fanFree?: boolean
  href?: string
}

function releaseTypeLabel(category: string): string {
  if (category === 'ep') return 'EP'
  if (category === 'album') return 'Album'
  if (category === 'single') return 'Single'
  return category
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
  formatPrices,
  fanFree,
  href: hrefOverride,
}: ProductCardProps) {
  const href = hrefOverride || (slug ? `/shop/${slug}` : `/shop/${id}`)

  const money = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  const formattedPrice = money(price)

  const cover = artwork ? resolveImageUrl(artwork) : ''

  return (
    <Link href={href} className="group block">
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden transition-all duration-300 hover:border-gray-600 hover:bg-gray-900/70">
        <div className="relative aspect-square overflow-hidden bg-gray-800/80">
          {isSafeNextImageSrc(cover) ? (
            <Image
              src={cover}
              alt={title}
              fill
              unoptimized={shouldUnoptimizeImage(cover)}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          ) : isSafeNextImageSrc(SHOP_COVER_PLACEHOLDER) ? (
            <Image
              src={SHOP_COVER_PLACEHOLDER}
              alt="SERGIK"
              fill
              unoptimized={shouldUnoptimizeImage(SHOP_COVER_PLACEHOLDER)}
              className="object-contain p-10 opacity-90 transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-wider text-gray-600">
              SERGIK
            </div>
          )}
          {licensingEnabled && (
            <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs font-semibold px-2 py-1 rounded">
              Licensable
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="text-white font-semibold text-sm truncate group-hover:text-gray-200">
            {title}
          </h3>
          <p className="text-gray-400 text-xs mt-1 line-clamp-2">{description}</p>
          <div className="flex items-end justify-between mt-3 gap-3">
            {fanFree ? (
              <span className="text-sm font-semibold text-emerald-300">Free · fan account</span>
            ) : formatPrices ? (
              <div className="text-sm leading-snug">
                <p className="text-white font-bold">MP3 {money(formatPrices.MP3)}</p>
                <p className="text-gray-300">WAV {money(formatPrices.WAV)}</p>
              </div>
            ) : (
              <span className="text-white font-bold">
                {licensingEnabled ? `From ${formattedPrice}` : formattedPrice}
              </span>
            )}
            {category && (
              <span className="text-gray-500 text-xs uppercase tracking-wide">
                {fanFree ? releaseTypeLabel(category) : category}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
