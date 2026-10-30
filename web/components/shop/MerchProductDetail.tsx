'use client'

import { useEffect, useRef, useState } from 'react'
import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'
import Image from 'next/image'
import SizeGuide from './SizeGuide'
import MerchShippingEstimate from '@/components/shop/MerchShippingEstimate'
import MerchGarmentPreview, {
  loadMerchCatalogDetail,
  type MerchGarmentPreviewDesign,
} from '@/components/shop/MerchGarmentPreview'
import type { BlankColor } from '@/lib/merch/blanks'
import {
  catalogAngleViews,
  designPreviewColorName,
  mockupPhotosForColor,
  mockupTitlesForColor,
  sameColorKey,
  shopFrontPhotoIndex,
  type CatalogAngleView,
} from '@/lib/merch/catalog-studio'

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
    fulfillmentReady?: boolean
    designPreview?: MerchGarmentPreviewDesign
  }
}

export default function MerchProductDetail({ product }: MerchProductDetailProps) {
  const [selectedVariant, setSelectedVariant] = useState<Variant>(product.variants[0])
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSizeGuide, setShowSizeGuide] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [colorReady, setColorReady] = useState(!product.designPreview?.catalogProductId)
  const [catalogColors, setCatalogColors] = useState<BlankColor[]>([])
  const [angleViews, setAngleViews] = useState<CatalogAngleView[]>([])
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const [viewFileType, setViewFileType] = useState<string | null>(null)
  const colorTouched = useRef(false)

  useEffect(() => {
    colorTouched.current = false
    setPickedColor(null)
    setViewFileType(null)
    setCatalogColors([])
    setAngleViews([])
    setSelectedVariant(product.variants[0])
    setActiveImage(product.designPreview ? shopFrontPhotoIndex(product.designPreview) : 0)
    const design = product.designPreview
    if (!design?.catalogProductId) {
      setColorReady(true)
      return
    }
    setColorReady(false)
    let cancelled = false
    void loadMerchCatalogDetail(design.catalogProductId).then((detail) => {
      if (cancelled) return
      if (detail) {
        setCatalogColors(detail.colors || [])
        setAngleViews(catalogAngleViews(detail.printFiles || []))
      }
      if (!colorTouched.current && detail) {
        const name = designPreviewColorName(detail.colors || [], design.previewColor, design.colors)
        const match = product.variants.find(
          (variant) => variant.color?.trim().toLowerCase() === name.trim().toLowerCase(),
        )
        if (match) {
          setSelectedVariant(match)
          setActiveImage(shopFrontPhotoIndex(design, match.color))
        }
      }
      setColorReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [product])

  const savedColorName = product.designPreview?.previewColorName || null
  const requestedColor = colorReady ? selectedVariant?.color : savedColorName
  const activeColorName = pickedColor || requestedColor || null
  const allImages = product.designPreview
    ? mockupPhotosForColor(
        product.designPreview.mockupUrls,
        product.designPreview.mockupUrlsByColor,
        activeColorName,
        savedColorName,
      )
    : [product.thumbnail, ...(product.images || [])].filter(Boolean)
  const photoTitles = product.designPreview
    ? mockupTitlesForColor(
        product.designPreview.mockupAngleTitlesByColor,
        activeColorName,
        savedColorName,
      )
    : []
  const usingPhotos = Boolean(product.designPreview) && allImages.length > 0
  const designPreview = product.designPreview
  const activeAngleId = viewFileType || angleViews[0]?.id || null
  const colorListed = product.variants.some(
    (variant) => !activeColorName || sameColorKey(variant.color, activeColorName),
  )
  const productReady =
    product.fulfillmentReady !== false && product.variants.some((variant) => variant.printful_variant_id > 0)
  const shippable = colorListed && productReady && Boolean(selectedVariant?.printful_variant_id)
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

  const chooseColor = (name: string) => {
    colorTouched.current = true
    setColorReady(true)
    setPickedColor(name)
    setViewFileType(null)
    const variant =
      product.variants.find(
        (row) => sameColorKey(row.color, name) && (!selectedVariant.size || row.size === selectedVariant.size),
      ) || product.variants.find((row) => sameColorKey(row.color, name))
    if (variant) setSelectedVariant(variant)
    if (product.designPreview) setActiveImage(shopFrontPhotoIndex(product.designPreview, name))
  }

  return (
    <>
      <div className="grid md:grid-cols-2 gap-8">
        {/* Images */}
        <div className="space-y-3">
          <div
            className={`relative aspect-square overflow-hidden rounded-lg ${
              usingPhotos || !product.designPreview ? 'bg-gray-900' : 'bg-white'
            }`}
          >
            {product.designPreview ? (
              <MerchGarmentPreview
                design={product.designPreview}
                colorName={colorReady ? activeColorName : null}
                photoIndex={activeImage}
                viewFileType={viewFileType || (usingPhotos ? null : activeAngleId)}
              />
            ) : allImages[activeImage] &&
              (allImages[activeImage].startsWith('/api/') ? (
                <img
                  src={allImages[activeImage]}
                  alt={product.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <Image
                  src={allImages[activeImage]}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              ))}
          </div>
          {designPreview && angleViews.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {angleViews.map((view) => {
                const selected = (viewFileType || (usingPhotos ? null : activeAngleId)) === view.id
                return (
                  <button
                    key={view.id}
                    type="button"
                    aria-label={view.label}
                    aria-pressed={selected}
                    onClick={() => setViewFileType(view.id)}
                    className="flex w-20 flex-shrink-0 flex-col gap-1"
                  >
                    <span
                      className={`relative block aspect-square w-full overflow-hidden rounded border-2 bg-white ${
                        selected ? 'border-white' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                    >
                      <MerchGarmentPreview
                        design={designPreview}
                        colorName={colorReady ? activeColorName : null}
                        viewFileType={view.id}
                        className="absolute inset-0"
                      />
                    </span>
                    <span className="truncate text-center text-[10px] text-gray-400">{view.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {allImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {allImages.map((img, i) => (
                <button
                  key={`${img}-${i}`}
                  type="button"
                  onClick={() => {
                    setViewFileType(null)
                    setActiveImage(i)
                  }}
                  aria-pressed={activeImage === i}
                  className="flex w-16 flex-shrink-0 flex-col gap-1"
                >
                  <span
                    className={`relative h-16 w-16 overflow-hidden rounded border-2 transition-all ${
                      activeImage === i ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    {img.startsWith('/api/') ? (
                      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <Image src={img} alt="" fill className="object-cover" sizes="64px" />
                    )}
                  </span>
                  {photoTitles[i] ? (
                    <span className="truncate text-center text-[10px] text-gray-400">{photoTitles[i]}</span>
                  ) : null}
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
                    (v) => v.size === size && (!activeColorName || sameColorKey(v.color, activeColorName)),
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

          {/* Color selection — every Printful swatch, not only the colors saved on the design. */}
          {(catalogColors.length > 0 || colors.length > 1) && (
            <div>
              <p className="text-sm text-gray-400 mb-2">
                Color{activeColorName ? ` · ${activeColorName}` : ''}
              </p>
              {catalogColors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {catalogColors.map((color) => {
                    const selected = sameColorKey(activeColorName, color.name)
                    return (
                      <button
                        key={color.name}
                        type="button"
                        title={color.name}
                        aria-label={color.name}
                        aria-pressed={selected}
                        onClick={() => chooseColor(color.name)}
                        className={`h-8 w-8 rounded-full border ${
                          selected ? 'border-white ring-2 ring-white/70' : 'border-white/25 hover:border-white/60'
                        }`}
                        style={{
                          background: color.hex2
                            ? `linear-gradient(135deg, ${color.hex} 50%, ${color.hex2} 50%)`
                            : color.hex,
                        }}
                      />
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => {
                    const selected = sameColorKey(activeColorName, color)
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => chooseColor(color || '')}
                        className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                          selected ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {color}
                      </button>
                    )
                  })}
                </div>
              )}
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

          {shippable && (
            <MerchShippingEstimate
              variantId={selectedVariant?.printful_variant_id}
              quantity={quantity}
            />
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleBuy}
            disabled={loading || !selectedVariant?.in_stock || !shippable}
            className="w-full py-4 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-bold rounded-lg text-lg transition-all"
          >
            {loading
              ? 'Processing...'
              : !productReady
              ? 'Preview only'
              : !colorListed
              ? 'Not available in this color'
              : !selectedVariant?.in_stock
              ? 'Out of Stock'
              : `Add to Cart — ${formatPrice(selectedVariant.retail_price * quantity)}`}
          </button>

          <p className="text-gray-500 text-xs text-center">
            {shippable
              ? 'Print-on-demand. Ships within 2-5 business days.'
              : 'This piece is on the floor as a preview. Buying opens once the printer has it.'}
          </p>
        </div>
      </div>

      {showSizeGuide && (
        <SizeGuide
          onClose={() => setShowSizeGuide(false)}
          productId={product.designPreview?.catalogProductId}
          sizes={product.variants.map((v) => v.size)}
        />
      )}
    </>
  )
}
