'use client'

import Image from 'next/image'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { isSafeNextImageSrc, shouldUnoptimizeImage } from '@/utils/imageOptimization'
import MerchGarmentPreview, { type MerchGarmentPreviewDesign } from '@/components/shop/MerchGarmentPreview'
import { activeShopBackdrop, type ShopBackdrop } from '@/lib/merch/shop-backdrop'

export type MerchFolderProduct = {
  id: string
  slug: string
  thumbnail: string
  designPreview?: MerchGarmentPreviewDesign
  previewHex?: string | null
}

function mosaicClass(count: number): string {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  return 'grid-cols-2 grid-rows-2'
}

function FolderCoverCell({
  product,
  backdrop,
}: {
  product: MerchFolderProduct | null
  backdrop?: ShopBackdrop | null
}) {
  const mat = activeShopBackdrop(backdrop)
  if (!product) {
    return <span className="relative min-h-0 overflow-hidden bg-white/[0.04]" />
  }
  const thumbnail = product.thumbnail ? resolveImageUrl(product.thumbnail) : ''
  return (
    <span
      className={`relative block h-full min-h-0 overflow-hidden ${mat ? '' : 'bg-white'}`}
      style={mat ? { backgroundColor: mat.opacity < 1 ? 'transparent' : mat.color } : undefined}
    >
      {product.designPreview ? (
        <MerchGarmentPreview
          design={product.designPreview}
          preferLayout
          matColor={mat?.color}
          matOpacity={mat && mat.opacity < 1 ? mat.opacity : undefined}
        />
      ) : thumbnail.startsWith('/api/') ? (
        <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : isSafeNextImageSrc(thumbnail) ? (
        <Image
          src={thumbnail}
          alt=""
          fill
          unoptimized={shouldUnoptimizeImage(thumbnail)}
          className="object-cover"
          sizes="192px"
        />
      ) : (
        <span className="absolute inset-0" style={{ background: product.previewHex || '#111' }} />
      )}
    </span>
  )
}

export default function MerchShopFolderTile({
  label,
  count,
  covers,
  backdrop = null,
  onOpen,
}: {
  label: string
  count: number
  covers: MerchFolderProduct[]
  backdrop?: ShopBackdrop | null
  onOpen: () => void
}) {
  const cells = covers.length >= 3 ? [...covers, null, null, null, null].slice(0, 4) : covers.length > 0 ? covers : [null]
  const countLabel = count === 1 ? '1 product' : `${count} products`

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}, ${countLabel}`}
      className="group w-[min(100%,24rem)] shrink-0 overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/40 text-center transition hover:border-gray-600"
    >
      <span className="block px-4 pb-2.5 pt-4 text-center">
        <span className="block truncate text-xl font-semibold text-white">{label}</span>
        <span className="mt-1.5 block text-sm uppercase tracking-[0.14em] text-gray-500">{countLabel}</span>
      </span>
      <span className="relative block px-4 pb-4">
        <span
          className="absolute left-1/2 top-0 h-4 w-16 -translate-x-1/2 rounded-t-md border border-b-0 border-gray-700 bg-gray-800 group-hover:bg-gray-700"
          aria-hidden
        />
        <span
          className={`relative mt-3 grid aspect-square gap-px overflow-hidden rounded-lg bg-black ${mosaicClass(covers.length)}`}
        >
          {cells.map((product, index) => (
            <FolderCoverCell key={product?.id ?? `empty-${index}`} product={product} backdrop={backdrop} />
          ))}
        </span>
      </span>
    </button>
  )
}
