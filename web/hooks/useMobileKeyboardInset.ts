'use client'

import { useEffect, useState } from 'react'
import { prefersCoarseMobilePlayback } from '@/lib/ui/mobile-playback-profile'

/**
 * Extra bottom inset when the software keyboard shrinks the visual viewport (phones).
 */
export function useMobileKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!prefersCoarseMobilePlayback()) return
    const vv = window.visualViewport
    if (!vv) return

    let raf = 0
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const gap = window.innerHeight - vv.height - vv.offsetTop
        setInset(gap > 80 ? Math.round(gap) : 0)
      })
    }

    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  return inset
}
