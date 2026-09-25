'use client'

import { useEffect, useRef } from 'react'

/**
 * Optional Screen Wake Lock while audio is playing (user opt-in).
 */
export function usePlaybackWakeLock(enabled: boolean, isPlaying: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    const release = async () => {
      try {
        await sentinelRef.current?.release()
      } catch {
        /* ignore */
      }
      sentinelRef.current = null
    }

    if (!enabled || !isPlaying) {
      void release()
      return
    }

    let cancelled = false
    const acquire = async () => {
      try {
        if (cancelled || sentinelRef.current) return
        sentinelRef.current = await navigator.wakeLock!.request('screen')
        sentinelRef.current.addEventListener('release', () => {
          sentinelRef.current = null
        })
      } catch {
        /* denied or unsupported mid-session */
      }
    }

    void acquire()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && enabled && isPlaying) {
        void acquire()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void release()
    }
  }, [enabled, isPlaying])
}
