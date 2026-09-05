'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { invalidateMusicLibraryCache } from '@/utils/musicLibraryApi'
import {
  emitCatalogSync,
  subscribeCatalogSync,
  type CatalogSyncEvent,
  type CatalogSyncPatch,
  CATALOG_VERSION_EVENT,
} from '@/lib/catalog-sync'

type CatalogSyncContextValue = {
  publishVersion: number
  lastEvent: CatalogSyncEvent | null
  emit: typeof emitCatalogSync
  /** Soft refresh hook for screens that still full-reload on remote publishes. */
  onRemoteVersionChange: (handler: (version: number) => void) => () => void
}

const CatalogSyncContext = createContext<CatalogSyncContextValue | null>(null)

const POLL_MS = 12_000

function shouldPollCatalogVersion(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname === '/music-library' ||
    pathname.startsWith('/music-library/') ||
    pathname.startsWith('/admin')
  )
}

async function fetchPublishVersion(): Promise<number> {
  try {
    const res = await fetch('/api/music-library/catalog-version', {
      // Allow short shared cache from the route's Cache-Control
      cache: 'default',
    })
    const data = await res.json().catch(() => ({}))
    return Number(data?.version) || 0
  } catch {
    return 0
  }
}

export function CatalogSyncProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const pollActive = shouldPollCatalogVersion(pathname)
  const [publishVersion, setPublishVersion] = useState(0)
  const [lastEvent, setLastEvent] = useState<CatalogSyncEvent | null>(null)
  const seenVersion = useRef(0)
  const remoteHandlers = useRef(new Set<(version: number) => void>())

  const notifyRemote = useCallback((version: number) => {
    for (const handler of remoteHandlers.current) {
      try {
        handler(version)
      } catch (err) {
        console.error('[catalog-sync] remote handler failed', err)
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CATALOG_VERSION_EVENT, { detail: { version } }))
    }
  }, [])

  const refreshVersion = useCallback(
    async (opts?: { forceInvalidate?: boolean }) => {
      const version = await fetchPublishVersion()
      if (!version) return
      const prev = seenVersion.current
      if (prev && version !== prev) {
        invalidateMusicLibraryCache()
        notifyRemote(version)
      }
      if (!prev || version !== prev || opts?.forceInvalidate) {
        seenVersion.current = version
        setPublishVersion(version)
      }
    },
    [notifyRemote],
  )

  useEffect(() => {
    // One-shot version read site-wide; vault/admin use SSE instead of 12s polling.
    void refreshVersion()
    if (!pollActive) return

    let es: EventSource | null = null
    let timer: number | null = null

    try {
      es = new EventSource('/api/music-library/catalog-version/stream')
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data || '{}')
          const version = Number(data?.version) || 0
          if (!version) return
          const prev = seenVersion.current
          if (prev && version !== prev) {
            invalidateMusicLibraryCache()
            notifyRemote(version)
          }
          seenVersion.current = version
          setPublishVersion(version)
        } catch {
          /* ignore malformed */
        }
      }
      es.onerror = () => {
        // Fall back to interval poll if SSE dies
        es?.close()
        es = null
        if (timer == null) {
          timer = window.setInterval(() => void refreshVersion(), POLL_MS)
        }
      }
    } catch {
      timer = window.setInterval(() => void refreshVersion(), POLL_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshVersion()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      es?.close()
      if (timer != null) window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshVersion, pollActive, notifyRemote])

  useEffect(() => {
    return subscribeCatalogSync((event) => {
      setLastEvent(event)
      if (event.publishVersion && event.publishVersion !== seenVersion.current) {
        seenVersion.current = event.publishVersion
        setPublishVersion(event.publishVersion)
      }
      if (event.source === 'remote') {
        invalidateMusicLibraryCache()
      }
    })
  }, [])

  const onRemoteVersionChange = useCallback((handler: (version: number) => void) => {
    remoteHandlers.current.add(handler)
    return () => {
      remoteHandlers.current.delete(handler)
    }
  }, [])

  const value = useMemo<CatalogSyncContextValue>(
    () => ({
      publishVersion,
      lastEvent,
      emit: emitCatalogSync,
      onRemoteVersionChange,
    }),
    [publishVersion, lastEvent, onRemoteVersionChange],
  )

  return <CatalogSyncContext.Provider value={value}>{children}</CatalogSyncContext.Provider>
}

export function useCatalogSync(): CatalogSyncContextValue {
  const ctx = useContext(CatalogSyncContext)
  if (!ctx) {
    // Safe fallback when mounted outside provider (tests / isolated trees)
    return {
      publishVersion: 0,
      lastEvent: null,
      emit: emitCatalogSync,
      onRemoteVersionChange: () => () => {},
    }
  }
  return ctx
}

/** Convenience: emit a folder patch (also updates linked playlist id in the event). */
export function emitFolderCatalogPatch(
  folderId: string,
  patch: CatalogSyncPatch,
  publishVersion?: number | null,
) {
  return emitCatalogSync({
    entity: 'folder',
    entityId: folderId,
    patch,
    publishVersion,
  })
}

/** Convenience: emit a playlist patch (also updates linked folder id in the event). */
export function emitPlaylistCatalogPatch(
  playlistId: string,
  patch: CatalogSyncPatch,
  publishVersion?: number | null,
) {
  return emitCatalogSync({
    entity: 'playlist',
    entityId: playlistId,
    patch,
    publishVersion,
  })
}
