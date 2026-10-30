'use client'

import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react'
import {
  backdropKind,
  coverFrontNeck,
  fillSilhouetteWithPattern,
  hexToRgb,
  paintGarmentBackdrop,
  type BackdropKind,
} from '@/lib/merch/product-mat'

type Props = {
  src: string
  /** Custom studio mat. Omit it to keep the product's original backdrop. */
  matColor?: string | null
  /** Printful garment fill. Ghost templates show this through the fabric. */
  garmentColor?: string | null
  /** Color photo drawn through a transparent positioning silhouette. */
  patternUrl?: string | null
  className?: string
  imgClassName?: string
  imgStyle?: CSSProperties
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void
}

type PaintResult = { kind: 'cutout' } | { kind: 'ghost'; url: string }

const paintedCache = new Map<string, PaintResult>()
const patternCache = new Map<string, string>()
const kindCache = new Map<string, BackdropKind>()

/** Catalog photos sit on white. A transparent Printful flat should too, unless the studio set a mat. */
const CATALOG_BACKDROP = '#ffffff'

function readBackdropKind(src: string): Promise<BackdropKind | null> {
  const cached = kindCache.get(src)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx || canvas.width < 1 || canvas.height < 1) {
          resolve(null)
          return
        }
        ctx.drawImage(image, 0, 0)
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const kind = backdropKind(frame.data, canvas.width, canvas.height)
        kindCache.set(src, kind)
        resolve(kind)
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function compositePattern(
  src: string,
  patternUrl: string,
  matColor: string | null | undefined,
): Promise<string | null> {
  const key = `${src}|${patternUrl}|${matColor || ''}`
  const cached = patternCache.get(key)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const silhouette = new Image()
    const pattern = new Image()
    silhouette.crossOrigin = 'anonymous'
    pattern.crossOrigin = 'anonymous'
    let pending = 2
    let failed = false
    const finish = () => {
      pending -= 1
      if (pending > 0 || failed) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = silhouette.naturalWidth
        canvas.height = silhouette.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx || canvas.width < 1 || canvas.height < 1) {
          resolve(null)
          return
        }
        ctx.drawImage(pattern, 0, 0, canvas.width, canvas.height)
        const patternFrame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(silhouette, 0, 0)
        const silhouetteFrame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const covered = coverFrontNeck(
          patternFrame.data,
          silhouetteFrame.data,
          canvas.width,
          canvas.height,
        )
        const filled = fillSilhouetteWithPattern(silhouetteFrame.data, covered, hexToRgb(matColor))
        silhouetteFrame.data.set(filled)
        ctx.putImageData(silhouetteFrame, 0, 0)
        const url = canvas.toDataURL('image/png')
        patternCache.set(key, url)
        resolve(url)
      } catch {
        resolve(null)
      }
    }
    const fail = () => {
      if (failed) return
      failed = true
      resolve(null)
    }
    silhouette.onload = finish
    pattern.onload = finish
    silhouette.onerror = fail
    pattern.onerror = fail
    silhouette.src = src
    pattern.src = patternUrl
  })
}

function paintUrl(src: string, matColor: string, garmentColor: string | null | undefined): Promise<PaintResult | null> {
  const key = `${src}|${matColor}|${garmentColor || ''}`
  const cached = paintedCache.get(key)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx || canvas.width < 1 || canvas.height < 1) {
          resolve(null)
          return
        }
        ctx.drawImage(image, 0, 0)
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        if (backdropKind(frame.data, canvas.width, canvas.height) === 'cutout') {
          const result: PaintResult = { kind: 'cutout' }
          paintedCache.set(key, result)
          resolve(result)
          return
        }
        const mat = hexToRgb(matColor)
        const garment = hexToRgb(garmentColor) || { r: 255, g: 255, b: 255 }
        if (!mat) {
          resolve(null)
          return
        }
        frame.data.set(paintGarmentBackdrop(frame.data, canvas.width, canvas.height, mat, garment))
        ctx.putImageData(frame, 0, 0)
        const result: PaintResult = { kind: 'ghost', url: canvas.toDataURL('image/png') }
        paintedCache.set(key, result)
        resolve(result)
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = src
  })
}

export default function GarmentMatImage({
  src,
  matColor,
  garmentColor,
  patternUrl,
  className = '',
  imgClassName = '',
  imgStyle,
  onLoad,
}: Props) {
  const [painted, setPainted] = useState<PaintResult | null>(null)
  const [patterned, setPatterned] = useState<string | null>(null)
  const [kind, setKind] = useState<BackdropKind | null>(null)

  useEffect(() => {
    if (!patternUrl) {
      setPatterned(null)
      return
    }
    const key = `${src}|${patternUrl}|${matColor || ''}`
    const cached = patternCache.get(key) ?? null
    setPatterned(cached)
    if (cached) return
    let cancelled = false
    void compositePattern(src, patternUrl, matColor).then((result) => {
      if (!cancelled) setPatterned(result)
    })
    return () => {
      cancelled = true
    }
  }, [src, patternUrl, matColor])

  useEffect(() => {
    if (patternUrl) {
      setKind(null)
      return
    }
    const cached = kindCache.get(src) ?? null
    setKind(cached)
    if (cached) return
    let cancelled = false
    void readBackdropKind(src).then((result) => {
      if (!cancelled) setKind(result)
    })
    return () => {
      cancelled = true
    }
  }, [src, patternUrl])

  useEffect(() => {
    if (patternUrl || !matColor) {
      setPainted(null)
      return
    }
    const key = `${src}|${matColor}|${garmentColor || ''}`
    const cached = paintedCache.get(key) ?? null
    setPainted(cached)
    if (cached) return
    let cancelled = false
    void paintUrl(src, matColor, garmentColor).then((result) => {
      if (!cancelled) setPainted(result)
    })
    return () => {
      cancelled = true
    }
  }, [src, matColor, garmentColor, patternUrl])

  const ghostUrl = painted?.kind === 'ghost' ? painted.url : null
  // A positioning hole uses the color photo. Until that composite is ready, show
  // the photo itself so the flat swatch never flashes through the shirt.
  const imageSrc = patterned || (patternUrl ? patternUrl : ghostUrl || src)
  // Catalog photos and transparent flats sit on white from the first paint.
  // Only a confirmed ghost template lets the fabric color through, and a studio
  // mat still replaces that white field.
  const backgroundColor = patternUrl
    ? undefined
    : kind === 'ghost'
      ? ghostUrl
        ? undefined
        : garmentColor || undefined
      : matColor || CATALOG_BACKDROP

  return (
    <span className={className} style={{ backgroundColor }}>
      <img
        src={imageSrc}
        alt=""
        draggable={false}
        onLoad={onLoad}
        className={imgClassName}
        style={imgStyle}
      />
    </span>
  )
}
