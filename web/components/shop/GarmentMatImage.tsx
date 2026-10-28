'use client'

import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { backdropKind, hexToRgb, paintGarmentBackdrop } from '@/lib/merch/product-mat'

type Props = {
  src: string
  /** Custom studio mat. Omit it to keep the product's original backdrop. */
  matColor?: string | null
  /** Printful garment fill. Ghost templates show this through the fabric. */
  garmentColor?: string | null
  className?: string
  imgClassName?: string
  imgStyle?: CSSProperties
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void
}

type PaintResult = { kind: 'cutout' } | { kind: 'ghost'; url: string }

const paintedCache = new Map<string, PaintResult>()

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
  className = '',
  imgClassName = '',
  imgStyle,
  onLoad,
}: Props) {
  const [painted, setPainted] = useState<PaintResult | null>(null)

  useEffect(() => {
    if (!matColor) {
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
  }, [src, matColor, garmentColor])

  const ghostUrl = painted?.kind === 'ghost' ? painted.url : null
  // Until a cut-out is confirmed, keep the garment fill. A ghost file would
  // otherwise take the mat color through the fabric.
  const backgroundColor =
    painted?.kind === 'cutout' && matColor
      ? matColor
      : ghostUrl
        ? undefined
        : garmentColor || undefined

  return (
    <span className={className} style={{ backgroundColor }}>
      <img
        src={ghostUrl || src}
        alt=""
        draggable={false}
        onLoad={onLoad}
        className={imgClassName}
        style={imgStyle}
      />
    </span>
  )
}
