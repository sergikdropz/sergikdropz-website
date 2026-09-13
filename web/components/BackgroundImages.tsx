'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import galleryData from '@/data/gallery.json'
import { useEffect, useState, useMemo, useSyncExternalStore } from 'react'
import {
  collectEpCoverTiles,
  collectReleaseCoverTiles,
  mosaicVariantForPath,
  type BackgroundTile,
} from '@/lib/ep-cover-art'
import {
  buildMosaicGrid,
  mosaicGridCols,
  swapMosaicCells,
} from '@/lib/background-mosaic'
import { isSafariOrIOSWebKit } from '@/lib/browser'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'
import {
  EMPTY_LIVE_MOSAIC_COVERS,
  getLiveMosaicCovers,
  hydrateLiveMosaicCovers,
  mergeMosaicTiles,
  subscribeLiveMosaicCovers,
} from '@/lib/catalog-sync/live-mosaic-covers'

const EP_COVER_TILES = collectEpCoverTiles()
const RELEASE_COVER_TILES = collectReleaseCoverTiles()
const MOTION_VARIANT_COUNT = 8

function subscribeNoop() {
  return () => {}
}

function getMobileSnapshot() {
  return typeof window !== 'undefined' && window.innerWidth < 768
}

function subscribeResize(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange)
  return () => window.removeEventListener('resize', onStoreChange)
}

function subscribeLiveCovers(onStoreChange: () => void) {
  return subscribeLiveMosaicCovers(onStoreChange)
}

export default function BackgroundImages() {
  const pathname = usePathname()
  const variant = mosaicVariantForPath(pathname)
  const galleryImages = galleryData.images
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [hasHydrated, setHasHydrated] = useState(false)

  const isWebKit = useSyncExternalStore(subscribeNoop, isSafariOrIOSWebKit, () => false)
  const isMobile = useSyncExternalStore(subscribeResize, getMobileSnapshot, () => false)
  const liveCovers = useSyncExternalStore(
    subscribeLiveCovers,
    getLiveMosaicCovers,
    () => EMPTY_LIVE_MOSAIC_COVERS,
  )

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setHasHydrated(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (variant === 'gallery') return
    let cancelled = false
    const run = () => {
      if (!cancelled) void hydrateLiveMosaicCovers()
    }
    // Defer mosaic API until idle so it doesn't contend with vault/audio cold path
    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 4000 })
    } else {
      timeoutId = setTimeout(run, 1500)
    }
    return () => {
      cancelled = true
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }, [variant])

  useEffect(() => {
    setImageErrors(new Set())
  }, [variant])

  const sourceImages = useMemo((): BackgroundTile[] => {
    if (variant === 'vault') return mergeMosaicTiles(EP_COVER_TILES, liveCovers)
    if (variant === 'music') return mergeMosaicTiles(RELEASE_COVER_TILES, liveCovers)
    return galleryImages.map((img) => ({
      id: img.id,
      src: img.src,
      alt: img.alt,
    }))
  }, [variant, galleryImages, liveCovers])

  const availableImages = useMemo(
    () => sourceImages.filter((img) => !imageErrors.has(img.id)),
    [sourceImages, imageErrors],
  )

  const gridCols = mosaicGridCols(isMobile)
  const gridColsClass = isMobile ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3 grid-rows-2'
  // Safari/iOS: fewer tiles + lower quality — no staged ramp after hydration
  const gridImageCount = isWebKit ? (isMobile ? 2 : 4) : isMobile ? 4 : 6
  const coverMosaic = variant !== 'gallery'
  const enableTileMotion = hasHydrated && !isWebKit && !isMobile
  const enableTileSwap = hasHydrated && !isWebKit

  const [gridImageIndices, setGridImageIndices] = useState<number[]>([])

  useEffect(() => {
    if (availableImages.length === 0) {
      setGridImageIndices([])
      return
    }
    setGridImageIndices(buildMosaicGrid(availableImages.length, gridImageCount, gridCols))
  }, [availableImages.length, gridImageCount, gridCols, variant, liveCovers.length])

  useEffect(() => {
    if (!enableTileSwap) return
    if (gridImageIndices.length === 0 || availableImages.length === 0) return

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    let visible = document.visibilityState === 'visible'
    const onVisibility = () => {
      visible = document.visibilityState === 'visible'
    }
    document.addEventListener('visibilitychange', onVisibility)

    const interval = setInterval(() => {
      if (!visible) return
      const poolSize = availableImages.length
      const cols = gridCols
      setGridImageIndices((prev) => {
        if (prev.length === 0 || poolSize === 0) return prev
        const cellsToChange = Math.min(prev.length, Math.floor(Math.random() * 2) + 1)
        return swapMosaicCells(prev, poolSize, cols, cellsToChange)
      })
    }, 5500 + Math.random() * 2500)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enableTileSwap, gridImageIndices.length, availableImages.length, variant, gridCols])

  // When a new cover is ingested, inject it into at least one visible mosaic cell.
  useEffect(() => {
    if (variant === 'gallery') return
    if (!liveCovers.length || !availableImages.length) return
    const liveIds = new Set(liveCovers.map((t) => t.id))
    const liveIndexes = availableImages
      .map((tile, index) => (liveIds.has(tile.id) ? index : -1))
      .filter((index) => index >= 0)
    if (!liveIndexes.length) return
    setGridImageIndices((prev) => {
      if (!prev.length) return prev
      const newest = liveIndexes[0]
      if (prev.includes(newest)) return prev
      const next = [...prev]
      next[0] = newest
      return next
    })
  }, [liveCovers, availableImages, variant])

  // First mosaic tile is often LCP on vault/music routes — opt it into next/image priority.
  const priorityCount = coverMosaic ? 1 : 0
  const imageQuality = isWebKit
    ? isMobile
      ? 60
      : 65
    : isMobile
      ? coverMosaic
        ? 75
        : 70
      : coverMosaic
        ? 72
        : 75
  const imageSizes = isWebKit ? (isMobile ? '50vw' : '40vw') : isMobile ? '50vw' : '33vw'

  return (
    <div className="site-background-mosaic fixed inset-0 z-0 pointer-events-none [contain:strict] bg-black">
      <div className={`absolute inset-0 grid gap-0 ${gridColsClass}`}>
        {gridImageIndices.map((imageIndex, index) => {
          const img = availableImages[imageIndex]
          if (!img) return null

          const imageUrl = resolveImageUrl(img.src)
          const eager = index < priorityCount
          const motionVariant = index % MOTION_VARIANT_COUNT
          const motionClass = enableTileMotion
            ? `mosaic-tile-motion mosaic-tile-motion-${motionVariant}`
            : ''
          const revealClass = isWebKit ? '' : 'animate-fade-in'

          return (
            <div
              key={`grid-${variant}-${index}`}
              className="relative overflow-hidden"
            >
              <div key={`${img.id}-${imageUrl}`} className={`absolute inset-0 ${revealClass}`}>
                <Image
                  src={imageUrl}
                  alt={img.alt}
                  fill
                  className={`object-cover blur-none opacity-60 ${motionClass}`}
                  style={
                    enableTileMotion
                      ? { animationDelay: `${-((index * 3.7) % 16)}s` }
                      : undefined
                  }
                  quality={imageQuality}
                  sizes={imageSizes}
                  unoptimized={shouldUnoptimizeImage(imageUrl)}
                  priority={eager}
                  fetchPriority={index === 0 ? 'high' : eager ? 'high' : 'auto'}
                  loading={eager ? 'eager' : 'lazy'}
                  onError={() => setImageErrors((prev) => new Set(prev).add(img.id))}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/75" />

      {!isMobile && !isWebKit && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent animate-pulse-glow" />
      )}
    </div>
  )
}
