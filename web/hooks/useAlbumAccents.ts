'use client'

import { useEffect, useState } from 'react'
import {
  FALLBACK_ACCENTS,
  extractAlbumAccents,
  type AlbumAccentPalette,
} from '@/lib/shares/album-accents'

/** Extract album accent colors for share listen backgrounds (non-blocking). */
export function useAlbumAccents(artwork?: string | null): AlbumAccentPalette {
  const [palette, setPalette] = useState<AlbumAccentPalette>(FALLBACK_ACCENTS)

  useEffect(() => {
    let cancelled = false
    if (!artwork) {
      setPalette(FALLBACK_ACCENTS)
      return
    }

    // Don't compete with cover LCP — sample accents when the browser is idle.
    const run = () => {
      void extractAlbumAccents(artwork).then((next) => {
        if (!cancelled) setPalette(next || FALLBACK_ACCENTS)
      })
    }

    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1200 })
    } else {
      timeoutId = setTimeout(run, 200)
    }

    return () => {
      cancelled = true
      if (idleId != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }, [artwork])

  return palette
}
