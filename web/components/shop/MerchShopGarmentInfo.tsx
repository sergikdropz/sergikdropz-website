'use client'

import { useEffect, useState } from 'react'
import { FloatingMenuPortal } from '@/components/ui/FloatingMenuPortal'
import type { CatalogProductDetail } from '@/lib/merch/printful-catalog-types'

type Props = {
  detail: CatalogProductDetail | null
  loading?: boolean
}

function GarmentInfoBody({ detail }: { detail: CatalogProductDetail }) {
  const { specs, description } = detail
  const techniques = Array.isArray(detail.techniques) ? detail.techniques : []
  const technique =
    techniques.find((item) => item.isDefault)?.label || techniques[0]?.label || null
  const materials =
    specs?.materials?.filter((m) => m.name && m.percentage > 0).map((m) => `${m.percentage}% ${m.name}`) ||
    []
  const bullets = Array.isArray(specs?.bullets) ? specs.bullets : []
  const styleLines = Array.isArray(specs?.styleLines) ? specs.styleLines : []

  return (
    <div className="space-y-3 text-sm text-gray-300">
      {technique ? (
        <p>
          <span className="text-gray-500">Decoration · </span>
          {technique}
        </p>
      ) : null}
      {materials.length > 0 ? (
        <p>
          <span className="text-gray-500">Fabric · </span>
          {materials.join(', ')}
        </p>
      ) : null}
      {specs?.originCountry ? (
        <p>
          <span className="text-gray-500">Made in · </span>
          {specs.originCountry}
        </p>
      ) : null}
      {description ? <p className="whitespace-pre-line text-gray-400">{description}</p> : null}
      {bullets.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-gray-400">
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {styleLines.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-gray-400">
          {styleLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function hasGarmentInfo(detail: CatalogProductDetail | null): detail is CatalogProductDetail {
  if (!detail?.product) return false
  const { specs, description } = detail
  const techniques = Array.isArray(detail.techniques) ? detail.techniques : []
  const technique =
    techniques.find((item) => item.isDefault)?.label || techniques[0]?.label || null
  const materials = specs?.materials?.filter((m) => m.name && m.percentage > 0) || []
  const bullets = Array.isArray(specs?.bullets) ? specs.bullets : []
  const styleLines = Array.isArray(specs?.styleLines) ? specs.styleLines : []
  return Boolean(technique || description || bullets.length || styleLines.length || materials.length)
}

export default function MerchShopGarmentInfo({ detail, loading }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (loading || !hasGarmentInfo(detail)) return null

  return (
    <>
      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-gray-500 underline transition-colors hover:text-white"
        >
          Garment info
        </button>
      </div>

      {open ? (
        <FloatingMenuPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="garment-info-title"
              className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 id="garment-info-title" className="text-lg font-bold text-white">
                  Garment info
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-gray-400 transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <GarmentInfoBody detail={detail} />
            </div>
          </div>
        </FloatingMenuPortal>
      ) : null}
    </>
  )
}
