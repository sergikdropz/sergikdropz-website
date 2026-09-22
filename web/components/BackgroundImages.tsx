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
/** Keep in sync with `.mosaic-tile-crossfade-*` duration in globals.css */
const MOSAIC_CROSSFADE_MS = 3200
const MOSAIC_SWAP_INTERVAL_MS = 9000

type MosaicLayer = {
  key: string
  id: string
  src: string
  alt: string
  role: 'stable' | 'incoming' | 'outgoing'
}

type MosaicCellProps = {
  tile: BackgroundTile
  imageUrl: string
  enableCrossfade: boolean
  enableTileMotion: boolean
  motionVariant: number
  motionDelay?: string
  imageQuality: number
  imageSizes: string
  priority: boolean
  fetchPriority: 'high' | 'auto'
  loading: 'eager' | 'lazy'
  onError: (id: string) => void
}

function MosaicCrossfadeCell({
  tile,
  imageUrl,
  enableCrossfade,
  enableTileMotion,
  motionVariant,
  motionDelay,
  imageQuality,
  imageSizes,
  priority,
  fetchPriority,
  loading,
  onError,
}: MosaicCellProps) {
  const layerKey = `${tile.id}-${imageUrl}`
  const [layers, setLayers] = useState<MosaicLayer[]>(() => [
    {
      key: layerKey,
      id: tile.id,
      src: imageUrl,
      alt: tile.alt,
      role: 'stable',
    },
  ])

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1]
      if (top?.key === layerKey) return prev

      if (!enableCrossfade || !top) {
        return [
          {
            key: layerKey,
            id: tile.id,
            src: imageUrl,
            alt: tile.alt,
            role: 'stable',
          },
        ]
      }

      const outgoing = prev.find((layer) => layer.role !== 'incoming') ?? top
      return [
        { ...outgoing, role: 'outgoing' },
        {
          key: layerKey,
          id: tile.id,
          src: imageUrl,
          alt: tile.alt,
          role: 'incoming',
        },
      ]
    })
  }, [layerKey, tile.id, tile.alt, imageUrl, enableCrossfade])

  const finishCrossfade = (finishedKey: string) => {
    setLayers((prev) => {
      const incoming = prev.find((layer) => layer.key === finishedKey && layer.role === 'incoming')
      if (!incoming) return prev
      return [{ ...incoming, role: 'stable' }]
    })
  }

  // Safety net if animationend is skipped (tab backgrounded, CSS override).
  useEffect(() => {
    const fading = layers.find((layer) => layer.role === 'incoming')
    if (!fading) return
    const timeoutId = window.setTimeout(
      () => finishCrossfade(fading.key),
      MOSAIC_CROSSFADE_MS + 200,
    )
    return () => window.clearTimeout(timeoutId)
  }, [layers])

  const motionClass = enableTileMotion
    ? `mosaic-tile-motion mosaic-tile-motion-${motionVariant}`
    : ''

  return (
    <div className="relative overflow-hidden">
      {layers.map((layer) => {
        const fadeClass =
          layer.role === 'incoming'
            ? 'mosaic-tile-crossfade-in'
            : layer.role === 'outgoing'
              ? 'mosaic-tile-crossfade-out'
              : ''
        return (
          <div
            key={layer.key}
            className={`absolute inset-0 ${fadeClass}`}
            onAnimationEnd={
              layer.role === 'incoming'
                ? (event) => {
                    if (event.target !== event.currentTarget) return
                    finishCrossfade(layer.key)
                  }
                : undefined
            }
          >
            <Image
              src={layer.src}
              alt={layer.alt}
              fill
              className={`object-cover blur-none opacity-60 ${motionClass}`}
              style={enableTileMotion ? { animationDelay: motionDelay } : undefined}
              quality={imageQuality}
              sizes={imageSizes}
              unoptimized={shouldUnoptimizeImage(layer.src)}
              priority={priority && layer.key === layerKey}
              fetchPriority={layer.key === layerKey ? fetchPriority : 'auto'}
              loading={layer.key === layerKey ? loading : 'lazy'}
              onError={() => onError(layer.id)}
            />
          </div>
        )
      })}
    </div>
  )
}

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

function getReducedMotionSnapshot() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onStoreChange)
  return () => mq.removeEventListener('change', onStoreChange)
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
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  )
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
  const enableCrossfade = enableTileSwap && !prefersReducedMotion

  const [gridImageIndices, setGridImageIndices] = useState<number[]>([])

  useEffect(() => {
    if (availableImages.length === 0) {
      setGridImageIndices([])
      return
    }
    setGridImageIndices(buildMosaicGrid(availableImages.length, gridImageCount, gridCols))
  }, [availableImages.length, gridImageCount, gridCols, variant, liveCovers.length])

  useEffect(() => {
    if (!enableTileSwap || prefersReducedMotion) return
    if (gridImageIndices.length === 0 || availableImages.length === 0) return

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
        return swapMosaicCells(prev, poolSize, cols, 1)
      })
    }, MOSAIC_SWAP_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [
    enableTileSwap,
    prefersReducedMotion,
    gridImageIndices.length,
    availableImages.length,
    variant,
    gridCols,
  ])

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

          return (
            <MosaicCrossfadeCell
              key={`grid-${variant}-${index}`}
              tile={img}
              imageUrl={imageUrl}
              enableCrossfade={enableCrossfade}
              enableTileMotion={enableTileMotion}
              motionVariant={motionVariant}
              motionDelay={`${-((index * 3.7) % 16)}s`}
              imageQuality={imageQuality}
              imageSizes={imageSizes}
              priority={eager}
              fetchPriority={index === 0 ? 'high' : eager ? 'high' : 'auto'}
              loading={eager ? 'eager' : 'lazy'}
              onError={(id) => setImageErrors((prev) => new Set(prev).add(id))}
            />
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
