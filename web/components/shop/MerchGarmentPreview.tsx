'use client'

import { useEffect, useMemo, useState } from 'react'
import { getBlank, MERCH_BLANKS, type BlankPlacement, type MerchBlank } from '@/lib/merch/blanks'
import MerchMannequin from '@/components/admin/MerchMannequin'
import { artHeightInPrintArea, previewArtPlacement, type ArtPlacement, type MerchDesign } from '@/lib/merch/design'
import type { CatalogProductDetail } from '@/lib/merch/printful-catalog-types'
import {
  coloredTemplate,
  containedImageBox,
  positioningPatternUrl,
  designPreviewColorName,
  hasTemplateStage,
  placementForPrintFile,
  mockupPhotosForColor,
  previewGarmentImage,
  sameColorKey,
} from '@/lib/merch/catalog-studio'
import GarmentMatImage from '@/components/shop/GarmentMatImage'
import { previewStitchThreads, quantizeImageData } from '@/lib/merch/embroidery-threads'

const threadStitchCache = new Map<string, string>()

function ThreadStitchImage({ src, threadColors }: { src: string; threadColors: string[] }) {
  const key = `${src}|${threadColors.join(',')}`
  const [quantized, setQuantized] = useState<string | null>(threadStitchCache.get(key) || null)

  useEffect(() => {
    const cached = threadStitchCache.get(key)
    if (cached) {
      setQuantized(cached)
      return
    }
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      const max = 512
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight, 1))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
      quantizeImageData(frame.data, threadColors)
      ctx.putImageData(frame, 0, 0)
      const next = canvas.toDataURL('image/png')
      threadStitchCache.set(key, next)
      if (!cancelled) setQuantized(next)
    }
    image.src = src
    return () => {
      cancelled = true
    }
  }, [key, src])

  return <img src={quantized || src} alt="" draggable={false} className="h-full w-full object-fill" />
}

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
  | 'activeFileType'
  | 'mockupUrls'
  | 'mockupUrlsByColor'
  | 'mockupAngleTitlesByColor'
  | 'previewColorName'
  | 'printFileUrls'
  | 'embroideryUnlimitedColor'
  | 'embroideryThreads'
>

const catalogDetailCache = new Map<number, Promise<CatalogProductDetail | null>>()

export function loadMerchCatalogDetail(catalogProductId: number): Promise<CatalogProductDetail | null> {
  const existing = catalogDetailCache.get(catalogProductId)
  if (existing) {
    return existing.then((detail) => {
      if (detail && !Array.isArray(detail.colors)) {
        catalogDetailCache.delete(catalogProductId)
        return loadMerchCatalogDetail(catalogProductId)
      }
      return detail
    })
  }
  const request = fetch(`/api/merch/catalog/${catalogProductId}/garment`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (data?.detail as CatalogProductDetail | undefined) ?? null)
    .catch(() => null)
  catalogDetailCache.set(catalogProductId, request)
  return request
}

function primaryPreviewPlacement(design: MerchGarmentPreviewDesign): ArtPlacement | undefined {
  return previewArtPlacement(design.placements, design.activeFileType)
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

export function StitchedColorPreview({
  garmentUrl,
  garmentColor,
  patternUrl,
  matColor,
  stage,
  printUrl,
  threadColors,
  art,
  area,
  className = '',
}: {
  garmentUrl: string
  garmentColor?: string | null
  /** Color photo for a transparent positioning back. */
  patternUrl?: string | null
  matColor?: string | null
  stage: { x: number; y: number; w: number; h: number }
  /** Baked print file. It already contains the stitch, so it fills the print box. */
  printUrl?: string | null
  /** Standard embroidery preview. Omitted for unlimited color and for the file Printful receives. */
  threadColors?: string[] | null
  art?: ArtPlacement | null
  area?: BlankPlacement | null
  className?: string
}) {
  const height = art && area ? artHeightInPrintArea(art, area) : 0
  return (
    <div className={`relative h-full w-full ${className}`}>
      <GarmentMatImage
        src={garmentUrl}
        matColor={matColor}
        garmentColor={patternUrl ? null : garmentColor}
        patternUrl={patternUrl}
        className="absolute inset-0"
        imgClassName="absolute inset-0 h-full w-full object-fill"
      />
      <div
        className="pointer-events-none absolute"
        style={{
          left: `${stage.x * 100}%`,
          top: `${stage.y * 100}%`,
          width: `${stage.w * 100}%`,
          height: `${stage.h * 100}%`,
        }}
      >
        {printUrl ? (
          threadColors && threadColors.length > 0 ? (
            <ThreadStitchImage src={printUrl} threadColors={threadColors} />
          ) : (
            <img src={printUrl} alt="" draggable={false} className="h-full w-full object-fill" />
          )
        ) : art?.assetUrl ? (
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
        ) : null}
      </div>
    </div>
  )
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
  /** Studio mat behind a cut-out product. Leaves the garment image unchanged. */
  matColor?: string
  /** Shopper's color. When it differs from the put-out photo, draw that garment. */
  colorName?: string | null
  /** Angle of the put-out photo, used only while that photo's color is selected. */
  photoIndex?: number
  /** Draw the saved art on the garment instead of a stored photo. */
  preferLayout?: boolean
}

export default function MerchGarmentPreview({
  design,
  className = '',
  matColor,
  colorName: requestedColorName = null,
  photoIndex = 0,
  preferLayout = false,
}: Props) {
  const art = primaryPreviewPlacement(design)
  const blank = getBlank(design.blankId) || MERCH_BLANKS[0]
  const [catalog, setCatalog] = useState<CatalogProductDetail | null>(null)
  const [imageAspect, setImageAspect] = useState<number | null>(null)

  useEffect(() => {
    if (!design.catalogProductId) {
      setCatalog(null)
      return
    }
    if (catalog && Array.isArray(catalog.colors)) return
    let cancelled = false
    void loadMerchCatalogDetail(design.catalogProductId).then((detail) => {
      if (!cancelled) setCatalog(detail)
    })
    return () => {
      cancelled = true
    }
  }, [catalog, design.catalogProductId])

  const savedColorName = designPreviewColorName(catalog?.colors || [], design.previewColor, design.colors)
  const colorName = requestedColorName?.trim() || savedColorName
  const previewSize = design.sizes.includes('M') ? 'M' : design.sizes[0] || 'M'
  const colorPhotos = mockupPhotosForColor(
    design.mockupUrls,
    design.mockupUrlsByColor,
    requestedColorName || design.previewColorName || savedColorName,
    design.previewColorName || savedColorName,
  )
  const mockup = colorPhotos[Math.min(Math.max(photoIndex, 0), Math.max(colorPhotos.length - 1, 0))] || null
  const embroideryArt = Boolean(art?.fileType && /embroidery/i.test(art.fileType))
  const stitchThreads = embroideryArt
    ? previewStitchThreads(design.embroideryUnlimitedColor, design.embroideryThreads)
    : null
  const swatchHex = catalog?.colors.find((color) => sameColorKey(color.name, colorName))?.hex || null

  const printFile = useMemo(() => {
    if (!catalog || !art) return null
    if (art.fileType) return catalog.printFiles.find((file) => file.type === art.fileType) ?? null
    return (
      catalog.printFiles.find(
        (file) => placementForPrintFile(file, blank, { surface: 'photo' }).id === art.placement,
      ) ?? null
    )
  }, [art, blank, catalog])

  // The catalog photo has no print box. When Printful measured one on the flat
  // template, draw that template so the art lands on the front panel.
  const calibrated = printFile && hasTemplateStage(printFile) ? printFile : null
  const templateView = calibrated ? coloredTemplate(catalog, calibrated, colorName, previewSize) : null
  const garmentUrl = templateView?.imageUrl || (catalog ? previewGarmentImage(catalog, colorName, previewSize) : null)
  const patternUrl = positioningPatternUrl(catalog, garmentUrl, colorName, previewSize)
  const area =
    art && blank
      ? calibrated
        ? placementForPrintFile(calibrated, blank)
        : printAreaForPlacement(art, catalog, blank)
      : null
  const placementId = area?.id || 'front'
  const frame = containedImageBox(1, imageAspect ?? 1)

  useEffect(() => {
    setImageAspect(null)
  }, [garmentUrl])

  if (mockup && !preferLayout) {
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
      <span
        className="absolute"
        style={{
          left: `${frame.x * 100}%`,
          top: `${frame.y * 100}%`,
          width: `${frame.w * 100}%`,
          height: `${frame.h * 100}%`,
        }}
      >
        {garmentUrl ? (
          <GarmentMatImage
            src={garmentUrl}
            matColor={matColor}
            garmentColor={patternUrl ? null : templateView?.backgroundColor || swatchHex || design.previewColor}
            patternUrl={patternUrl}
            className="absolute inset-0"
            imgClassName="absolute inset-0 h-full w-full object-fill"
            onLoad={(event) => {
              const image = event.currentTarget
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setImageAspect(image.naturalWidth / image.naturalHeight)
              }
            }}
          />
        ) : (
          <MerchMannequin
            family={design.family}
            color={swatchHex || design.previewColor}
            placement={placementId}
            idPrefix={`shop-preview-${design.id}`}
          />
        )}
        {art.fileType && design.printFileUrls?.[art.fileType] && !preferLayout ? (
          <div
            className="pointer-events-none absolute"
            style={{
              left: `${area.stage.x * 100}%`,
              top: `${area.stage.y * 100}%`,
              width: `${area.stage.w * 100}%`,
              height: `${area.stage.h * 100}%`,
            }}
          >
            {stitchThreads ? (
              <ThreadStitchImage src={design.printFileUrls[art.fileType]} threadColors={stitchThreads} />
            ) : (
              <img
                src={design.printFileUrls[art.fileType]}
                alt=""
                draggable={false}
                className="h-full w-full object-fill"
              />
            )}
          </div>
        ) : (
          <PlacedArtPreview art={art} area={area} />
        )}
      </span>
    </span>
  )
}
