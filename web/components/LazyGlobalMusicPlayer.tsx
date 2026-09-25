'use client'

import dynamic from 'next/dynamic'
import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useMusicPlayer, hasPersistedMusicTrack } from '@/contexts/MusicPlayerContext'
import { importWithChunkRetry, isLikelyChunkLoadError } from '@/lib/chunk-import-retry'

const GlobalMusicPlayer = dynamic(
  () => importWithChunkRetry(() => import('@/components/GlobalMusicPlayer')),
  {
    ssr: false,
    loading: () => null,
  },
)

function subscribeNoop() {
  return () => {}
}

class MusicPlayerChunkBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(error: unknown) {
    if (isLikelyChunkLoadError(error)) return { failed: true }
    return null
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-500/40 bg-gray-950/95 px-4 py-3 text-center text-sm text-amber-100"
          role="status"
        >
          Music player failed to load (stale app bundle).{' '}
          <button
            type="button"
            className="underline font-medium text-white hover:text-amber-50"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Defer the heavy MusicPlayer bundle until idle, first interaction, or a track is queued.
 * Preserves playback: once currentTrack is set (or restored from localStorage), the player mounts immediately.
 */
export default function LazyGlobalMusicPlayer() {
  const { currentTrack, queue } = useMusicPlayer()
  const [ready, setReady] = useState(false)
  const persistedTrack = useSyncExternalStore(
    subscribeNoop,
    hasPersistedMusicTrack,
    () => false,
  )

  useEffect(() => {
    if (ready) return
    if (currentTrack || queue.length > 0 || persistedTrack) {
      setReady(true)
      return
    }

    let cancelled = false
    const enable = () => {
      if (!cancelled) setReady(true)
    }

    const onInteract = () => enable()
    window.addEventListener('pointerdown', onInteract, { once: true, passive: true })
    window.addEventListener('keydown', onInteract, { once: true })
    window.addEventListener('touchstart', onInteract, { once: true, passive: true })

    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(enable, { timeout: 2500 })
    } else {
      timeoutId = setTimeout(enable, 1500)
    }

    return () => {
      cancelled = true
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('keydown', onInteract)
      window.removeEventListener('touchstart', onInteract)
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }, [ready, currentTrack, queue.length, persistedTrack])

  if (!ready && !currentTrack && queue.length === 0 && !persistedTrack) {
    // Reserve space so layout does not jump when the bar mounts
    return (
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40"
        style={{ height: 'var(--global-music-player-height, 0px)' }}
        aria-hidden
      />
    )
  }

  return (
    <MusicPlayerChunkBoundary>
      <GlobalMusicPlayer />
    </MusicPlayerChunkBoundary>
  )
}
