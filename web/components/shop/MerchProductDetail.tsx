'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import SizeGuide from './SizeGuide'
import MerchShippingEstimate from '@/components/shop/MerchShippingEstimate'
import MerchShopGarmentInfo from '@/components/shop/MerchShopGarmentInfo'
import Link from 'next/link'
import { addMerchCartLine } from '@/lib/merch/shop-cart'
import { startMerchCheckout } from '@/lib/merch/start-merch-checkout'
import type { CatalogProductDetail } from '@/lib/merch/printful-catalog-types'
import MerchGarmentPreview, {
  loadMerchCatalogDetail,
  type MerchGarmentPreviewDesign,
} from '@/components/shop/MerchGarmentPreview'
import type { BlankColor } from '@/lib/merch/blanks'
import { activeShopBackdrop, type ShopBackdrop } from '@/lib/merch/shop-backdrop'
import {
  catalogShopAngleViews,
  designPreviewColorName,
  mockupPhotosForColor,
  mockupTitlesForColor,
  sameColorKey,
  shopFrontPhotoIndex,
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

const APPAREL_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'ONE SIZE', 'OS']

function sortApparelSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ai = APPAREL_SIZE_ORDER.indexOf(a.toUpperCase())
    const bi = APPAREL_SIZE_ORDER.indexOf(b.toUpperCase())
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
}

interface MerchProductDetailProps {
  product: {
    id: string
    slug?: string
    name: string
    thumbnail: string
    images: string[]
    variants: Variant[]
    fulfillmentReady?: boolean
    designPreview?: MerchGarmentPreviewDesign
  }
}

export default function MerchProductDetail({
  product,
  backdrop = null,
}: MerchProductDetailProps & { backdrop?: ShopBackdrop | null }) {
  const [selectedVariant, setSelectedVariant] = useState<Variant>(product.variants[0])
  const [quantity, setQuantity] = useState(1)
  const [checkoutAction, setCheckoutAction] = useState<'cart' | 'buy' | null>(null)
  const [cartNote, setCartNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [catalogDetail, setCatalogDetail] = useState<CatalogProductDetail | null>(null)
  const [showSizeGuide, setShowSizeGuide] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [colorReady, setColorReady] = useState(!product.designPreview?.catalogProductId)
  const [catalogColors, setCatalogColors] = useState<BlankColor[]>([])
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const [viewFileType, setViewFileType] = useState<string | null>(null)
  const colorTouched = useRef(false)

  useEffect(() => {
    colorTouched.current = false
    setPickedColor(null)
    setViewFileType(null)
    setCatalogColors([])
    setCatalogDetail(null)
    setCartNote(null)
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
        setCatalogDetail(detail)
        setCatalogColors(detail.colors || [])
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
  const angleViews = useMemo(
    () =>
      catalogShopAngleViews(
        catalogDetail?.printFiles || [],
        catalogDetail,
        activeColorName,
        selectedVariant?.size,
      ),
    [catalogDetail, activeColorName, selectedVariant?.size],
  )

  useEffect(() => {
    if (!viewFileType) return
    if (!angleViews.some((view) => view.id === viewFileType)) setViewFileType(null)
  }, [angleViews, viewFileType])

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
  const mat = activeShopBackdrop(backdrop)
  const designPreview = product.designPreview
  const activeAngleId = viewFileType || angleViews[0]?.id || null
  const colorListed = product.variants.some(
    (variant) => !activeColorName || sameColorKey(variant.color, activeColorName),
  )
  const productReady =
    product.fulfillmentReady !== false && product.variants.some((variant) => variant.printful_variant_id > 0)
  const shippable = colorListed && productReady && Boolean(selectedVariant?.printful_variant_id)
  const colors = Array.from(new Set(product.variants.map((v) => v.color).filter(Boolean)))
  const showColorPicker =
    catalogColors.length > 1 || (catalogColors.length === 0 && colors.length > 1)
  const garmentInfoLoading = Boolean(product.designPreview?.catalogProductId) && !colorReady
  const sizeColorKey = activeColorName || selectedVariant?.color || null
  const sizes = useMemo(() => {
    const fromDesign = product.designPreview?.sizes?.filter(Boolean) ?? []
    const fromVariants = product.variants.map((v) => v.size).filter(Boolean) as string[]
    return sortApparelSizes(Array.from(new Set([...fromDesign, ...fromVariants])))
  }, [product.designPreview?.sizes, product.variants])

  const checkoutBlockedReason = !productReady
    ? 'Preview only'
    : !colorListed
      ? 'Not available in this color'
      : !selectedVariant?.in_stock
        ? 'Out of stock'
        : !selectedVariant?.printful_variant_id
          ? 'Not connected to fulfillment yet'
          : null

  const checkoutReady = shippable && !checkoutBlockedReason

  const buildCheckoutItem = () => ({
    name: `${product.name} — ${selectedVariant.name}`,
    price: selectedVariant.retail_price,
    quantity,
    printful_variant_id: selectedVariant.printful_variant_id,
    image: product.thumbnail,
    variant: selectedVariant.name,
  })

  const handleAddToCart = () => {
    setError(null)
    setCartNote(null)
    if (!checkoutReady) return
    addMerchCartLine({
      productSlug: product.slug || product.id,
      productName: product.name,
      variantName: selectedVariant.name,
      printful_variant_id: selectedVariant.printful_variant_id,
      price: selectedVariant.retail_price,
      quantity,
      image: product.thumbnail,
    })
    setCartNote('Added to cart.')
  }

  const handleBuyNow = async () => {
    setCheckoutAction('buy')
    setError(null)
    setCartNote(null)

    try {
      if (!checkoutReady) return
      const item = buildCheckoutItem()
      await startMerchCheckout({
        items: [{ printful_variant_id: item.printful_variant_id, quantity: item.quantity }],
        cancelPath:
          typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop/merch',
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCheckoutAction(null)
    }
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  useEffect(() => {
    if (sizes.length === 0) return
    const currentOk = selectedVariant.size && sizes.includes(selectedVariant.size)
    if (currentOk) return
    const fallback =
      product.variants.find(
        (v) => v.size === sizes[0] && (!sizeColorKey || sameColorKey(v.color, sizeColorKey)),
      ) || product.variants.find((v) => v.size === sizes[0])
    if (fallback) setSelectedVariant(fallback)
  }, [sizes, sizeColorKey, product.variants, selectedVariant.size])

  const variantForSize = (size: string) =>
    product.variants.find(
      (v) => v.size === size && (!sizeColorKey || sameColorKey(v.color, sizeColorKey)),
    ) || product.variants.find((v) => v.size === size)

  const chooseSize = (size: string) => {
    const variant = variantForSize(size)
    if (variant) setSelectedVariant(variant)
  }

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
      <h1 className="mb-6 text-center text-2xl font-bold leading-tight text-white sm:mb-8 sm:text-3xl">
        {product.name}
      </h1>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_min(18rem,26rem)] md:items-start md:gap-10 lg:grid-cols-[minmax(0,1.15fr)_380px]">
        {/* Gallery */}
        <div className="mx-auto flex w-full max-w-lg flex-col items-center space-y-3 md:mx-0 md:max-w-none">
          <div
            className={`relative aspect-square w-full overflow-hidden rounded-lg ${
              mat ? '' : usingPhotos || !product.designPreview ? 'bg-gray-900' : 'bg-white'
            }`}
            style={mat ? { backgroundColor: mat.opacity < 1 ? 'transparent' : mat.color } : undefined}
          >
            {product.designPreview ? (
              <MerchGarmentPreview
                design={product.designPreview}
                colorName={colorReady ? activeColorName : null}
                photoIndex={activeImage}
                viewFileType={viewFileType || (usingPhotos ? null : activeAngleId)}
                matColor={mat?.color}
                matOpacity={mat && mat.opacity < 1 ? mat.opacity : undefined}
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
            <div className="flex w-full justify-center gap-2 overflow-x-auto pb-1">
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
                      className={`relative block aspect-square w-full overflow-hidden rounded border-2 ${
                        mat ? '' : 'bg-white'
                      } ${selected ? 'border-white' : 'border-transparent opacity-80 hover:opacity-100'}`}
                      style={mat ? { backgroundColor: mat.opacity < 1 ? 'transparent' : mat.color } : undefined}
                    >
                      <MerchGarmentPreview
                        design={designPreview}
                        colorName={colorReady ? activeColorName : null}
                        viewFileType={view.id}
                        matColor={mat?.color}
                        matOpacity={mat && mat.opacity < 1 ? mat.opacity : undefined}
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
            <div className="flex w-full justify-center gap-2 overflow-x-auto">
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

        {/* Purchase controls — right column */}
        <aside
          aria-label="Product options"
          className="w-full md:sticky md:top-28 md:self-start"
        >
          <div className="space-y-6 rounded-xl border border-gray-800 bg-gray-900/50 p-5 sm:p-6">
          {showColorPicker && (
            <fieldset className="space-y-2 border-0 p-0">
              <legend className="block w-full text-center text-sm text-gray-400">
                Color{activeColorName ? ` · ${activeColorName}` : ''}
              </legend>
              {catalogColors.length > 0 ? (
                <div className="flex max-h-44 flex-wrap justify-center gap-2 overflow-y-auto overscroll-contain px-1">
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
                <div className="flex flex-wrap justify-center gap-2">
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
              <MerchShopGarmentInfo detail={catalogDetail} loading={garmentInfoLoading} />
            </fieldset>
          )}

          {!showColorPicker ? (
            <MerchShopGarmentInfo detail={catalogDetail} loading={garmentInfoLoading} />
          ) : null}

          {sizes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-400">Size</p>
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(true)}
                  className="text-xs text-gray-500 underline transition-colors hover:text-white"
                >
                  Size Guide
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="group" aria-label="Size">
                {sizes.map((size) => {
                  const variant = variantForSize(size)
                  const isSelected =
                    selectedVariant.size === size &&
                    (!sizeColorKey || sameColorKey(selectedVariant.color, sizeColorKey))
                  const outOfStock = Boolean(variant && !variant.in_stock)
                  return (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => chooseSize(size)}
                      className={`min-w-0 rounded px-2 py-2 text-center text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-white text-black'
                          : outOfStock
                            ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {size}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-3 border-t border-gray-800 pt-4">
            <p className="text-center text-sm text-gray-400">Quantity</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="flex h-10 w-10 items-center justify-center rounded bg-gray-800 text-white transition-all hover:bg-gray-700"
              >
                -
              </button>
              <span className="w-8 text-center font-semibold text-white">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                className="flex h-10 w-10 items-center justify-center rounded bg-gray-800 text-white transition-all hover:bg-gray-700"
              >
                +
              </button>
            </div>
            <p className="text-center text-2xl font-bold tabular-nums text-white">
              {formatPrice(selectedVariant.retail_price * quantity)}
            </p>
            {quantity > 1 ? (
              <p className="text-center text-xs text-gray-500">
                {quantity} × {formatPrice(selectedVariant.retail_price)} each
              </p>
            ) : null}
          </div>

          {shippable && (
            <MerchShippingEstimate
              variantId={selectedVariant?.printful_variant_id}
              quantity={quantity}
            />
          )}

          {cartNote ? (
            <p className="text-center text-sm text-emerald-400/90">
              {cartNote}{' '}
              <Link href="/shop/cart" className="underline underline-offset-2 hover:text-white">
                View cart
              </Link>
            </p>
          ) : null}
          {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!checkoutReady || checkoutAction === 'buy'}
              title={checkoutBlockedReason || undefined}
              className="rounded-lg border border-white/25 py-3.5 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/5 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
              Add to cart
            </button>
            <button
              type="button"
              onClick={() => void handleBuyNow()}
              disabled={!checkoutReady || checkoutAction === 'buy'}
              title={checkoutBlockedReason || undefined}
              className="rounded-lg bg-white py-3.5 text-sm font-bold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
            >
              {checkoutAction === 'buy'
                ? 'Processing…'
                : `Buy now · ${formatPrice(selectedVariant.retail_price * quantity)}`}
            </button>
          </div>

          <p className="text-center text-xs text-gray-500">
            {shippable
              ? 'Print-on-demand. Ships within 2-5 business days.'
              : 'This piece is on the floor as a preview. Buying opens once the printer has it.'}
          </p>
          </div>
        </aside>
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
