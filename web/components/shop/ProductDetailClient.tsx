'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import LicenseTierSelector from '@/components/shop/LicenseTierSelector'
import BuyButton from '@/components/BuyButton'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { isSafeNextImageSrc, shouldUnoptimizeImage } from '@/utils/imageOptimization'
import type { ShopAudioFormat, ShopFormatPrices } from '@/lib/shop/format-prices'

type ProductDetailClientProps = {
  product: Record<string, any>
  licenseTiers: any[]
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

export default function ProductDetailClient({ product, licenseTiers }: ProductDetailClientProps) {
  const formatPrices = product.formatPrices as ShopFormatPrices | undefined
  const [format, setFormat] = useState<ShopAudioFormat>('MP3')
  const selectedPrice = formatPrices ? formatPrices[format] : product.price
  const formattedPrice = money(selectedPrice)
  const cover = product.artwork ? resolveImageUrl(product.artwork) : ''

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <nav className="mb-8">
          <Link href="/shop/music" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Music Shop
          </Link>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-900 border border-gray-800">
            {isSafeNextImageSrc(cover) ? (
              <Image
                src={cover}
                alt={product.title}
                fill
                unoptimized={shouldUnoptimizeImage(cover)}
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
                No artwork
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-white">{product.title}</h1>
              <p className="text-gray-400 mt-2">{product.description}</p>
            </div>

            {formatPrices ? (
              <div>
                <p className="text-sm text-gray-400 mb-2">Format</p>
                <div className="flex flex-wrap gap-2">
                  {(['MP3', 'WAV'] as const).map((option) => {
                    const selected = format === option
                    const label = option === 'WAV' ? 'Lossless WAV' : 'MP3'
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setFormat(option)}
                        className={`rounded-lg border px-4 py-2 text-left text-sm transition ${
                          selected
                            ? 'border-white bg-white text-black'
                            : 'border-gray-700 text-gray-200 hover:border-gray-500'
                        }`}
                      >
                        <span className="block font-semibold">{label}</span>
                        <span className={selected ? 'text-black/70' : 'text-gray-400'}>
                          {money(formatPrices[option])}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              product.formats && (
                <div>
                  <p className="text-sm text-gray-400 mb-2">Available formats:</p>
                  <div className="flex gap-2 flex-wrap">
                    {product.formats.map((f: any) => {
                      const label = typeof f === 'string' ? f : f.type
                      return (
                        <span key={label} className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded">
                          {label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            )}

            {!product.licensingEnabled && (
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-3xl font-bold text-white">{formattedPrice}</span>
                <BuyButton
                  title={product.title}
                  price={selectedPrice}
                  checkout_method="stripe"
                  stripe_track_id={product.id}
                  stripe_format={formatPrices ? format : product.formats?.[0]?.type || product.formats?.[0] || 'WAV'}
                  productId={product.id}
                  productType={product.productType || 'track'}
                />
              </div>
            )}
          </div>
        </div>

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
