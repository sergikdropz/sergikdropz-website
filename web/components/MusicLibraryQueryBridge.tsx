'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/api/query-keys'
import { MUSIC_LIBRARY_CACHE_INVALIDATED_EVENT } from '@/utils/musicLibraryApi'

/**
 * Keeps React Query leaf catalog keys aligned with musicLibraryApi invalidation.
 * Avoids dual-cache disagreement without moving the bootstrap/hydration tree onto RQ yet.
 */
export default function MusicLibraryQueryBridge() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const onInvalidate = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.musicLibrary.root() })
    }
    window.addEventListener(MUSIC_LIBRARY_CACHE_INVALIDATED_EVENT, onInvalidate)
    return () => {
      window.removeEventListener(MUSIC_LIBRARY_CACHE_INVALIDATED_EVENT, onInvalidate)
    }
  }, [queryClient])

  return null
}
