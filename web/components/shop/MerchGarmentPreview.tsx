'use client'

import { useEffect, useMemo, useState } from 'react'
import { getBlank, MERCH_BLANKS, type BlankPlacement, type MerchBlank } from '@/lib/merch/blanks'
import MerchMannequin from '@/components/admin/MerchMannequin'
import { artHeightInPrintArea, type ArtPlacement, type MerchDesign } from '@/lib/merch/design'
import type { CatalogProductDetail } from '@/lib/merch/printful-catalog-types'
import { placementForPrintFile, previewGarmentImage } from '@/lib/merch/catalog-studio'

export type MerchGarmentPreviewDesign = Pick<
  MerchDesign,
  | 'id'
  | 'blankId'
  | 'catalogProductId'
  | 'family'
  | 'previewColor'
  | 'colors'
  | 'sizes'
  | 'placements'
  | 'mockupUrls'
>

const catalogDetailCache = new Map<number, Promise<CatalogProductDetail | null>>()

function loadCatalogDetail(catalogProductId: number): Promise<CatalogProductDetail | null> {
  const existing = catalogDetailCache.get(catalogProductId)
  if (existing) return existing
  const request = fetch(`/api/merch/catalog/${catalogProductId}/garment`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data?.detail as CatalogProductDetail | undefined) ?? null)
    .catch(() => null)
  catalogDetailCache.set(catalogProductId, request)
  return request
}

function primaryPreviewPlacement(design: MerchGarmentPreviewDesign): ArtPlacement | undefined {
  for (const id of ['front', 'back'] as const) {
    const match = design.placements.find((row) => row.placement === id && row.assetUrl)
    if (match) return match
  }
  return design.placements.find((row) => row.assetUrl)
}

function printAreaForPlacement(
  art: ArtPlacement,
  catalog: CatalogProductDetail | null,
  template: MerchBlank,
): BlankPlacement {
  const fromBlank = template.placements.find((row) => row.id === art.placement) || template.placements[0]
  if (!catalog) return fromBlank
  if (art.fileType) {
    const file = catalog.printFiles.find((row) => row.type === art.fileType)
    if (file) return placementForPrintFile(file, template, { surface: 'photo' })
  }
  const fileOnSide = catalog.printFiles.find(
    (row) => placementForPrintFile(row, template, { surface: 'photo' }).id === art.placement,
  )
  if (fileOnSide) return placementForPrintFile(fileOnSide, template, { surface: 'photo' })
  return fromBlank
}

function PlacedArtPreview({ art, area }: { art: ArtPlacement; area: BlankPlacement }) {
  const height = artHeightInPrintArea(art, area)
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${area.stage.x * 100}%`,
        top: `${area.stage.y * 100}%`,
        width: `${area.stage.w * 100}%`,
        height: `${area.stage.h * 100}%`,
      }}
    >
      <img
        src={art.assetUrl}
        alt=""
        draggable={false}
        className="absolute touch-none select-none"
        style={{
          left: `${art.x * 100}%`,
          top: `${art.y * 100}%`,
          width: `${art.scale * 100}%`,
          height: `${height * 100}%`,
          transform: `rotate(${art.rotation}deg)`,
          transformOrigin: 'center',
        }}
      />
    </div>
  )
}

type Props = {
  design: MerchGarmentPreviewDesign
  className?: string
}

export default function MerchGarmentPreview({ design, className = '' }: Props) {
  const mockup = design.mockupUrls[0]
  const art = primaryPreviewPlacement(design)
  const blank = getBlank(design.blankId) || MERCH_BLANKS[0]
  const [catalog, setCatalog] = useState<CatalogProductDetail | null>(null)

  useEffect(() => {
    if (!design.catalogProductId) {
      setCatalog(null)
      return
    }
    let cancelled = false
    void loadCatalogDetail(design.catalogProductId).then((detail) => {
      if (!cancelled) setCatalog(detail)
    })
    return () => {
      cancelled = true
    }
  }, [design.catalogProductId])

  const colorName = design.colors[0] || 'Black'
  const previewSize = design.sizes.includes('M') ? 'M' : design.sizes[0] || 'M'

  const garmentUrl = useMemo(
    () => (catalog ? previewGarmentImage(catalog, colorName, previewSize) : null),
    [catalog, colorName, previewSize],
  )

  const area = art && blank ? printAreaForPlacement(art, catalog, blank) : null
  const placementId = area?.id || 'front'

  if (mockup) {
    return <img src={mockup} alt="" className={`h-full w-full object-contain ${className}`} />
  }

  if (!art || !blank || !area) {
    return (
      <span className={`flex h-full items-center justify-center text-xs text-gray-500 ${className}`}>
        Preview unavailable
      </span>
    )
  }

  return (
    <span className={`relative block h-full w-full overflow-hidden ${className}`}>
      {garmentUrl ? (
        <img src={garmentUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <MerchMannequin
          family={design.family}
          color={design.previewColor}
          placement={placementId}
          idPrefix={`shop-preview-${design.id}`}
        />
      )}
      <PlacedArtPreview art={art} area={area} />
    </span>
  )
}
