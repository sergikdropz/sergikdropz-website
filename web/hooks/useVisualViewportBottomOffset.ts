'use client'

import { useEffect, useState } from 'react'
import { usesVisualViewportBottomInset } from '@/lib/browser'

/**
 * How far `position:fixed; bottom:0` sits below the *visible* viewport on mobile WebKit / Android Chrome.
 * The layout viewport can extend under collapsing chrome / rubber-band scroll,
 * so a fixed dock appears to slide unless we offset it.
 */
export function visualViewportBottomOffset(
  innerHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
): number {
  return Math.max(0, Math.round(innerHeight - visualHeight - visualOffsetTop))
}

/**
 * Live bottom inset for fixed footers on iOS WebKit and Android Chrome.
 * Returns 0 on other browsers.
 */
export function useVisualViewportBottomOffset(): number {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!usesVisualViewportBottomInset()) return
    const vv = window.visualViewport
    if (!vv) return

    let raf = 0
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setOffset(
          visualViewportBottomOffset(window.innerHeight, vv.height, vv.offsetTop),
        )
      })
    }

    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    // Capture page scroll — iPad rubber-band updates offsetTop without a vv scroll event.
    window.addEventListener('scroll', sync, true)
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [])

  return offset
}
