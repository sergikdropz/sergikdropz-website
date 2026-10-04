'use client'

import { useEffect } from 'react'
import { classifyConsumerViewport } from '@/lib/ui/consumer-viewport'
import { prefersCoarseMobilePlayback } from '@/lib/ui/mobile-playback-profile'

/**
 * Publishes the visible viewport onto <html> so public pages can reflow
 * when the device, orientation, pinch-zoom, or text size changes.
 */
export default function ConsumerViewportFit() {
  useEffect(() => {
    const root = document.documentElement

    const apply = () => {
      const vv = window.visualViewport
      const width = vv?.width ?? window.innerWidth
      const height = vv?.height ?? window.innerHeight
      const coarse =
        window.matchMedia('(pointer: coarse)').matches || prefersCoarseMobilePlayback()
      const rootFontPx = parseFloat(getComputedStyle(root).fontSize) || 16
      const snap = classifyConsumerViewport({
        width,
        height,
        scale: vv?.scale,
        offsetTop: vv?.offsetTop,
        rootFontPx,
        coarsePointer: coarse,
      })

      root.dataset.device = snap.device
      root.dataset.pointer = snap.pointer
      root.dataset.orientation = snap.orientation
      root.dataset.text = snap.text
      if (snap.scale >= 1.05) root.dataset.zoomed = 'true'
      else delete root.dataset.zoomed
      root.style.setProperty('--vvw', `${Math.round(snap.width)}px`)
      root.style.setProperty('--vvh', `${Math.round(snap.height)}px`)
      root.style.setProperty('--vv-offset-top', `${Math.round(snap.offsetTop)}px`)
      root.style.setProperty('--vv-scale', String(Math.round(snap.scale * 100) / 100))
    }

    apply()
    const vv = window.visualViewport
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    const pointerQuery = window.matchMedia('(pointer: coarse)')
    pointerQuery.addEventListener('change', apply)

    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      pointerQuery.removeEventListener('change', apply)
    }
  }, [])

  return null
}
