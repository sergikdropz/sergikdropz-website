'use client'

import type { Ref, RefObject } from 'react'
import { MERCH_ART_ACCEPT, useMerchArtDropUpload } from '@/lib/merch/art-upload-drop'
import type { BlankColor } from '@/lib/merch/blanks'
import type { CatalogPrintFile, CatalogProductDetail } from '@/lib/merch/printful-catalog-types'
import type { ArtPlacement, DesignStatus } from '@/lib/merch/design'
import { sameMerchArt } from '@/lib/merch/art-url'
import { printfulProductUrl } from '@/lib/merch/catalog-studio'
import { sortSizes } from '@/lib/merch/sizes'
import MerchProductSpecs from '@/components/admin/MerchProductSpecs'

type ArtUpload = { id: string; label: string; url: string }

type Props = {
  detail: CatalogProductDetail
  technique: string
  onTechnique: (key: string) => void
  printFiles: CatalogPrintFile[]
  activePrintFileType: string
  onPrintFileType: (type: string) => void
  embroideryUnlimitedColor: boolean
  onEmbroideryUnlimitedColor: (value: boolean) => void
  previewSize: string
  onPreviewSize: (size: string) => void
  previewColorName: string
  swatchColors: BlankColor[]
  onPreviewColor: (hex: string, name: string) => void
  uploadInputRef: RefObject<HTMLInputElement | null>
  onUploadFile: (file: File) => void
  uploads: ArtUpload[]
  activeLayer: ArtPlacement | undefined
  onPlaceArt: (url: string) => void
  onUploadContextMenu: (event: React.MouseEvent, upload: ArtUpload) => void
  sizes: string[]
  sizeOptions: string[]
  onToggleSize: (size: string) => void
  name: string
  onName: (value: string) => void
  wholesale: number
  costLive: boolean
  price: number
  onPrice: (value: number) => void
  keep: number
  note: string | null
  busy: string | null
  status: DesignStatus
  designId: string | null
  canPutOut: boolean
  onPutItOut: () => void
  onSaveDraft: () => void
  onVisibility: () => void
  /** When true, placement is switched via stage view tabs — hide priced file-type pills. */
  usePlacementViewTabs?: boolean
}

export default function MerchPrintfulDesignSidebar({
  detail,
  technique,
  onTechnique,
  printFiles,
  activePrintFileType,
  onPrintFileType,
  embroideryUnlimitedColor,
  onEmbroideryUnlimitedColor,
  previewSize,
  onPreviewSize,
  previewColorName,
  swatchColors,
  onPreviewColor,
  uploadInputRef,
  onUploadFile,
  uploads,
  activeLayer,
  onPlaceArt,
  onUploadContextMenu,
  sizes,
  sizeOptions,
  onToggleSize,
  name,
  onName,
  wholesale,
  costLive,
  price,
  onPrice,
  keep,
  note,
  busy,
  status,
  designId,
  canPutOut,
  onPutItOut,
  onSaveDraft,
  onVisibility,
  usePlacementViewTabs = false,
}: Props) {
  const { product, techniques, minWholesale } = detail
  const activeFile = printFiles.find((file) => file.type === activePrintFileType) || printFiles[0]
  const embroideryOption = activeFile?.options.find((option) => option.id === 'full_color')
  const variantLabel =
    product.variantCount > 0 ? `${product.variantCount} variant${product.variantCount === 1 ? '' : 's'}` : null

  const { dragOver, dropHint, dropZoneProps } = useMerchArtDropUpload(onUploadFile)

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-0.5 transition-colors ${
        dragOver ? 'bg-white/[0.06] ring-2 ring-inset ring-white/35' : ''
      }`}
      {...dropZoneProps}
    >
      <div>
        <label
          className={`block w-full cursor-pointer rounded-xl border border-dashed py-3.5 text-center text-sm font-medium text-white transition-colors ${
            dragOver
              ? 'border-white/55 bg-white/10'
              : 'border-white/25 bg-black/25 hover:border-white/40'
          }`}
        >
          <span className="block">Upload design</span>
          <span className="mt-1 block text-[11px] font-normal text-white/50">Click or drop PNG / JPEG</span>
          <input
            ref={uploadInputRef as Ref<HTMLInputElement>}
            type="file"
            accept={MERCH_ART_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onUploadFile(file)
              event.target.value = ''
            }}
          />
        </label>
        {dropHint ? <p className="mt-2 text-[11px] text-amber-300/90">{dropHint}</p> : null}
        {uploads.length > 0 ? (
          <div className="mt-3 grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto">
            {uploads.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPlaceArt(item.url)}
                onContextMenu={(event) => onUploadContextMenu(event, item)}
                title="Click to place on the active file area."
                className={`aspect-square overflow-hidden rounded bg-black/40 hover:ring-1 hover:ring-white/40 ${
                  activeLayer?.assetUrl && sameMerchArt(activeLayer.assetUrl, item.url) ? 'ring-1 ring-white' : ''
                }`}
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-white/45">PNG or JPEG artwork for this placement.</p>
        )}
        <div className="mt-3">
          <MerchProductSpecs detail={detail} printFiles={printFiles} technique={technique} layout="rail" />
        </div>
      </div>

      <div className="space-y-1 border-b border-white/10 pb-3">
        <p className="text-sm font-semibold leading-snug text-white">{product.title}</p>
        <p className="text-[11px] text-white/50">
          {[product.brand, product.model].filter(Boolean).join(' · ') || product.typeName}
          {variantLabel ? ` · ${variantLabel}` : ''}
        </p>
        {minWholesale != null && (
          <p className="text-xs tabular-nums text-white/70">
            from ${minWholesale.toFixed(2)}
            {product.avgFulfillmentDays != null ? (
              <span className="text-white/40"> · ~{product.avgFulfillmentDays} day fulfillment</span>
            ) : null}
          </p>
        )}
        <a
          href={printfulProductUrl(product.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block pt-1 text-[10px] uppercase tracking-wide text-white/55 hover:text-white"
        >
          Open in Printful design maker ↗
        </a>
      </div>

      {techniques.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Technique</p>
          <div className="flex flex-wrap gap-1.5">
            {techniques.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTechnique(item.key)}
                className={`rounded-full px-2.5 py-1 text-[10px] ${
                  technique === item.key ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/15'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {printFiles.length > 0 && !usePlacementViewTabs && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">File placements</p>
          <div className="flex flex-wrap gap-1.5">
            {printFiles.map((file) => {
              const active = file.type === activePrintFileType
              const surcharge =
                file.additionalPrice != null && file.additionalPrice > 0
                  ? ` +$${file.additionalPrice.toFixed(2)}`
                  : ''
              return (
                <button
                  key={file.type}
                  type="button"
                  onClick={() => onPrintFileType(file.type)}
                  className={`rounded-lg border px-2 py-1 text-[10px] leading-snug text-left ${
                    active
                      ? 'border-white bg-white text-black'
                      : 'border-white/15 bg-black/20 text-white/75 hover:border-white/30'
                  }`}
                >
                  {file.title}
                  {surcharge}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {embroideryOption && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Embroidery color option</p>
          <p className="text-[11px] text-white/55">Which embroidery color option to choose?</p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => onEmbroideryUnlimitedColor(false)}
              className={`rounded-lg border px-2.5 py-2 text-left text-[11px] ${
                !embroideryUnlimitedColor
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 text-white/75 hover:border-white/30'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => onEmbroideryUnlimitedColor(true)}
              className={`rounded-lg border px-2.5 py-2 text-left text-[11px] ${
                embroideryUnlimitedColor
                  ? 'border-white bg-white text-black'
                  : 'border-white/15 text-white/75 hover:border-white/30'
              }`}
            >
              {embroideryOption.title}
              {embroideryOption.additionalPrice != null && embroideryOption.additionalPrice > 0
                ? ` (+$${embroideryOption.additionalPrice.toFixed(2)})`
                : ''}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-3">
        <div className="min-w-[100px] flex-1">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/40">Preview color</p>
          <div className="flex flex-wrap gap-1">
            {swatchColors.slice(0, 12).map((color) => (
              <button
                key={color.name}
                type="button"
                title={color.name}
                onClick={() => onPreviewColor(color.hex, color.name)}
                className={`h-6 w-6 rounded-full border ${
                  previewColorName === color.name ? 'border-white ring-1 ring-white/40' : 'border-white/20'
                }`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        </div>
        {detail.sizes.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/40">Preview size</p>
            <div className="flex flex-wrap gap-1">
              {sortSizes(detail.sizes).slice(0, 8).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onPreviewSize(size)}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    previewSize === size ? 'bg-white text-black' : 'bg-white/10 text-white/65'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Sell sizes</p>
        <div className="flex flex-wrap gap-1">
          {sortSizes(sizeOptions).map((size) => {
            const on = sizes.includes(size)
            return (
              <button
                key={size}
                type="button"
                onClick={() => onToggleSize(size)}
                className={`rounded px-2 py-1 text-xs ${
                  on ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/15'
                }`}
              >
                {size}
              </button>
            )
          })}
        </div>
      </div>

      <label className="block text-xs text-white/55">
        Product name
        <input
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder={product.title}
          className="mt-1 w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35"
        />
      </label>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-white/50">
          <span>{costLive ? 'Printful cost' : 'Blank estimate'}</span>
          <span>${wholesale.toFixed(2)}</span>
        </div>
        <label className="flex items-center justify-between text-white">
          Your price
          <input
            type="number"
            min={1}
            step={1}
            value={price}
            onChange={(event) => onPrice(Number(event.target.value))}
            className="w-24 rounded border border-white/10 bg-black/30 px-2 py-1 text-right"
          />
        </label>
        <div className="flex justify-between text-emerald-400/90">
          <span>You keep</span>
          <span>${keep.toFixed(2)}</span>
        </div>
      </div>

      {note && (
        <p className="rounded border border-white/10 bg-black/30 p-2 text-xs text-white/80">{note}</p>
      )}

      <div className="space-y-2 pb-1">
        <button
          type="button"
          onClick={onPutItOut}
          disabled={Boolean(busy) || !canPutOut}
          className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black disabled:bg-white/15 disabled:text-white/40"
        >
          {busy === 'Putting it out' ? 'Putting it out…' : 'Put it out'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={Boolean(busy)}
            className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs text-white hover:bg-white/10"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={onVisibility}
            disabled={Boolean(busy) || !designId || status === 'draft'}
            className="rounded-lg border border-white/15 bg-white/5 py-2 text-xs text-white hover:bg-white/10 disabled:text-white/35"
          >
            {status === 'live' ? 'Hide from shop' : 'Make public'}
          </button>
        </div>
        <p className="text-[11px] text-white/45">
          Put it out sends print files to Printful when the site has a public URL. Make public controls the shop.
        </p>
      </div>
    </div>
  )
}
