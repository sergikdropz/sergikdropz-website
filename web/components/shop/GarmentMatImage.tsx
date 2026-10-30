'use client'

import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react'
import {
  backdropKind,
  coverFrontNeck,
  fillSilhouetteWithPattern,
  hexToRgb,
  paintGarmentBackdrop,
  paintGarmentTexture,
  type BackdropKind,
} from '@/lib/merch/product-mat'

type Props = {
  src: string
  /** Custom studio mat. Omit it to keep the product's original backdrop. */
  matColor?: string | null
  /** Backdrop strength from 0 to 1. Omit it for a solid mat. */
  matOpacity?: number | null
  /** Printful garment fill. Ghost templates show this through the fabric. */
  garmentColor?: string | null
  /** Color photo drawn through a transparent positioning silhouette. */
  patternUrl?: string | null
  /** Heather or patterned fabric drawn behind a ghost template. */
  garmentTexture?: string | null
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

function matAlpha(opacity: number | null | undefined): number {
  if (opacity == null || !Number.isFinite(opacity)) return 255
  return Math.max(0, Math.min(255, Math.round(opacity * 255)))
}

function compositePattern(
  src: string,
  patternUrl: string,
  matColor: string | null | undefined,
  opacity?: number | null,
): Promise<string | null> {
  const alpha = matAlpha(opacity)
  const key = `${src}|${patternUrl}|${matColor || ''}|${alpha}`
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
        const filled = fillSilhouetteWithPattern(silhouetteFrame.data, covered, hexToRgb(matColor), alpha)
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

function paintUrl(
  src: string,
  matColor: string,
  garmentColor: string | null | undefined,
  opacity?: number | null,
): Promise<PaintResult | null> {
  const alpha = matAlpha(opacity)
  const key = `${src}|${matColor}|${garmentColor || ''}|${alpha}`
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
        frame.data.set(paintGarmentBackdrop(frame.data, canvas.width, canvas.height, mat, garment, alpha))
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

function paintUrlWithTexture(
  src: string,
  matColor: string,
  textureUrl: string,
  opacity?: number | null,
): Promise<PaintResult | null> {
  const mat = hexToRgb(matColor)
  const alpha = matAlpha(opacity)
  if (!mat) return Promise.resolve(null)
  return new Promise((resolve) => {
    const template = new Image()
    const texture = new Image()
    template.crossOrigin = 'anonymous'
    texture.crossOrigin = 'anonymous'
    let pending = 2
    let failed = false
    const finish = () => {
      pending -= 1
      if (pending > 0 || failed) return
      try {
        const width = template.naturalWidth
        const height = template.naturalHeight
        if (width < 1 || height < 1) {
          resolve(null)
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(template, 0, 0)
        const frame = ctx.getImageData(0, 0, width, height)
        ctx.clearRect(0, 0, width, height)
        const scale = Math.max(width / texture.naturalWidth, height / texture.naturalHeight)
        const drawW = texture.naturalWidth * scale
        const drawH = texture.naturalHeight * scale
        ctx.drawImage(texture, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH)
        const fabric = ctx.getImageData(0, 0, width, height)
        frame.data.set(paintGarmentTexture(frame.data, width, height, mat, fabric.data, alpha))
        ctx.putImageData(frame, 0, 0)
        resolve({ kind: 'ghost', url: canvas.toDataURL('image/png') })
      } catch {
        resolve(null)
      }
    }
    const fail = () => {
      if (failed) return
      failed = true
      resolve(null)
    }
    template.onload = finish
    texture.onload = finish
    template.onerror = fail
    texture.onerror = fail
    template.src = src
    texture.src = textureUrl
  })
}

function backdropFill(color: string, opacity: number | null | undefined): string {
  const alpha = matAlpha(opacity)
  if (alpha >= 255) return color
  const rgb = hexToRgb(color)
  if (!rgb) return color
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha / 255})`
}

export default function GarmentMatImage({
  src,
  matColor,
  matOpacity = null,
  garmentColor,
  patternUrl,
  garmentTexture = null,
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
    const key = `${src}|${patternUrl}|${matColor || ''}|${matAlpha(matOpacity)}`
    const cached = patternCache.get(key) ?? null
    setPatterned(cached)
    if (cached) return
    let cancelled = false
    void compositePattern(src, patternUrl, matColor, matOpacity).then((result) => {
      if (!cancelled) setPatterned(result)
    })
    return () => {
      cancelled = true
    }
  }, [src, patternUrl, matColor, matOpacity])

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
    if (patternUrl || garmentTexture || !matColor) {
      if (!garmentTexture) setPainted(null)
      return
    }
    const key = `${src}|${matColor}|${garmentColor || ''}|${matAlpha(matOpacity)}`
    const cached = paintedCache.get(key) ?? null
    setPainted(cached)
    if (cached) return
    let cancelled = false
    void paintUrl(src, matColor, garmentColor, matOpacity).then((result) => {
      if (!cancelled) setPainted(result)
    })
    return () => {
      cancelled = true
    }
  }, [src, matColor, matOpacity, garmentColor, patternUrl, garmentTexture])

  useEffect(() => {
    if (patternUrl || !garmentTexture || !matColor) return
    const key = `${src}|${garmentTexture}|${matColor}|${matAlpha(matOpacity)}`
    const cached = paintedCache.get(key) ?? null
    setPainted(cached)
    if (cached) return
    let cancelled = false
    void paintUrlWithTexture(src, matColor, garmentTexture, matOpacity).then((result) => {
      if (!cancelled && result) {
        paintedCache.set(key, result)
        setPainted(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [src, matColor, matOpacity, patternUrl, garmentTexture])

  const ghostUrl = painted?.kind === 'ghost' ? painted.url : null
  // A positioning hole uses the color photo. Until that composite is ready, show
  // the photo itself so the flat swatch never flashes through the shirt.
  const imageSrc = patterned || (patternUrl ? patternUrl : ghostUrl || src)
  // Catalog photos and transparent flats sit on white from the first paint.
  // Only a confirmed ghost template lets the fabric color through, and a studio
  // mat still replaces that white field.
  const showTexture = Boolean(garmentTexture) && !patternUrl && !ghostUrl
  const backgroundColor = patternUrl
    ? undefined
    : kind === 'ghost'
      ? ghostUrl
        ? undefined
        : garmentColor || undefined
      : matColor
        ? backdropFill(matColor, matOpacity)
        : CATALOG_BACKDROP

  return (
    <span
      className={className}
      style={{
        backgroundColor,
        backgroundImage: showTexture ? `url(${garmentTexture})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
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
