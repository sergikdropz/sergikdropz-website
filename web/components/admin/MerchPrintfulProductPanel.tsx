'use client'

import type { CatalogProductDetail } from '@/lib/merch/printful-catalog-types'
import { printfulProductUrl } from '@/lib/merch/catalog-studio'

type Props = {
  detail: CatalogProductDetail
  technique: string
  onTechnique: (key: string) => void
  previewSize: string
  onPreviewSize: (size: string) => void
  previewColorName: string
}

export default function MerchPrintfulProductPanel({
  detail,
  technique,
  onTechnique,
  previewSize,
  onPreviewSize,
  previewColorName,
}: Props) {
  const { product, techniques, printFiles, minWholesale } = detail

  return (
    <div className="border-b border-white/10 px-5 py-3 space-y-3 bg-black/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Printful product</p>
          <p className="text-sm font-medium text-white leading-snug truncate">{product.title}</p>
          <p className="text-[11px] text-white/45 mt-0.5">
            {product.typeName}
            {minWholesale != null ? ` · from $${minWholesale.toFixed(2)}` : ''}
          </p>
        </div>
        <a
          href={printfulProductUrl(product.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-white/80 hover:bg-white/10"
        >
          Design maker ↗
        </a>
      </div>

      {techniques.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Technique</p>
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

      <div className="flex flex-wrap gap-4">
        <div className="min-w-[120px]">
          <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Preview color</p>
          <p className="text-xs text-white/80">{previewColorName || '—'}</p>
        </div>
        {detail.sizes.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Preview size</p>
            <div className="flex flex-wrap gap-1">
              {detail.sizes.slice(0, 8).map((size) => (
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

      {printFiles.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1">File placements</p>
          <ul className="flex flex-wrap gap-1.5">
            {printFiles.slice(0, 10).map((file) => (
              <li
                key={file.type}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/65"
                title={file.type}
              >
                {file.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
