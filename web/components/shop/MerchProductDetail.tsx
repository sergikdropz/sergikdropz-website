'use client'

import { useState } from 'react'
import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'
import Image from 'next/image'
import SizeGuide from './SizeGuide'

interface Variant {
  id: number
  name: string
  printful_variant_id: number
  retail_price: number
  size: string | null
  color: string | null
  in_stock: boolean
}

interface MerchProductDetailProps {
  product: {
    id: string
    name: string
    thumbnail: string
    images: string[]
    variants: Variant[]
  }
}

export default function MerchProductDetail({ product }: MerchProductDetailProps) {
  const [selectedVariant, setSelectedVariant] = useState<Variant>(product.variants[0])
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSizeGuide, setShowSizeGuide] = useState(false)
  const [activeImage, setActiveImage] = useState(0)

  const allImages = [product.thumbnail, ...(product.images || [])].filter(Boolean)
  const sizes = Array.from(new Set(product.variants.map((v) => v.size).filter(Boolean)))
  const colors = Array.from(new Set(product.variants.map((v) => v.color).filter(Boolean)))

  const handleBuy = async () => {
    setLoading(true)
    setError(null)

    try {
      const gate = await ensureShopCheckoutAuth({
        returnPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop',
      })
      if (!gate.ok) return
      const res = await fetch('/api/stripe/create-merch-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: [
            {
              name: `${product.name} — ${selectedVariant.name}`,
              price: selectedVariant.retail_price,
              quantity,
              printful_variant_id: selectedVariant.printful_variant_id,
              image: product.thumbnail,
              variant: selectedVariant.name,
            },
          ],
          supabaseUserId: gate.userId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Checkout failed')
      }

      const { url } = await res.json()
      if (url) window.location.href = url
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  return (
    <>
      <div className="grid md:grid-cols-2 gap-8">
        {/* Images */}
        <div className="space-y-3">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-900">
            {allImages[activeImage] && (
              <Image
                src={allImages[activeImage]}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            )}
          </div>
          {allImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`relative w-16 h-16 rounded overflow-hidden flex-shrink-0 border-2 transition-all ${
                    activeImage === i ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <Image src={img} alt="" fill className="object-cover" sizes="64px" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white">{product.name}</h1>
            <p className="text-2xl font-bold text-white mt-2">
              {formatPrice(selectedVariant.retail_price)}
            </p>
          </div>

          {/* Size selection */}
          {sizes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-400">Size</p>
                <button
                  onClick={() => setShowSizeGuide(true)}
                  className="text-xs text-gray-500 hover:text-white transition-colors underline"
                >
                  Size Guide
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => {
                  const variant = product.variants.find(
                    (v) => v.size === size && (!selectedVariant.color || v.color === selectedVariant.color)
                  )
                  const isSelected = selectedVariant.size === size
                  return (
                    <button
                      key={size}
                      onClick={() => variant && setSelectedVariant(variant)}
                      disabled={!variant?.in_stock}
                      className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-white text-black'
                          : variant?.in_stock
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'bg-gray-800/50 text-gray-600 cursor-not-allowed line-through'
                      }`}
                    >
                      {size}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Color selection */}
          {colors.length > 1 && (
            <div>
              <p className="text-sm text-gray-400 mb-2">Color</p>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => {
                  const variant = product.variants.find(
                    (v) => v.color === color && (!selectedVariant.size || v.size === selectedVariant.size)
                  )
                  const isSelected = selectedVariant.color === color
                  return (
                    <button
                      key={color}
                      onClick={() => variant && setSelectedVariant(variant)}
                      className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-white text-black'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {color}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Quantity</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded flex items-center justify-center transition-all"
              >
                -
              </button>
              <span className="text-white font-semibold w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded flex items-center justify-center transition-all"
              >
                +
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleBuy}
            disabled={loading || !selectedVariant.in_stock}
            className="w-full py-4 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-bold rounded-lg text-lg transition-all"
          >
            {loading
              ? 'Processing...'
              : !selectedVariant.in_stock
              ? 'Out of Stock'
              : `Add to Cart — ${formatPrice(selectedVariant.retail_price * quantity)}`}
          </button>

          <p className="text-gray-500 text-xs text-center">
            Print-on-demand. Ships within 2-5 business days.
          </p>
        </div>
      </div>

      {showSizeGuide && <SizeGuide onClose={() => setShowSizeGuide(false)} />}
    </>
  )
}
