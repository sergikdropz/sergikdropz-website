import type { PeakData } from '@/utils/audioWorkerClient'

const MAX_ENTRIES = 48
const MAX_IDB_ENTRIES = 64
const DB_NAME = 'sergik-waveform-peaks'
const DB_VERSION = 1
const STORE = 'peaks'

const cache = new Map<string, PeakData>()

type StoredPeak = {
  key: string
  data: PeakData
  updatedAt: number
}

function cacheKey(resolvedUrl: string): string {
  return resolvedUrl.split('?')[0]
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => resolve(null)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' })
          store.createIndex('updatedAt', 'updatedAt')
        }
      }
      req.onsuccess = () => resolve(req.result)
    } catch {
      resolve(null)
    }
  })
}

async function idbGet(key: string): Promise<PeakData | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const row = req.result as StoredPeak | undefined
        resolve(row?.data?.data?.length ? row.data : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbPut(key: string, data: PeakData): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      store.put({ key, data, updatedAt: Date.now() } satisfies StoredPeak)
      tx.oncomplete = () => {
        void trimIdb(db).finally(() => resolve())
      }
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function idbDelete(key?: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      if (key) store.delete(key)
      else store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function trimIdb(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const index = store.index('updatedAt')
      const req = index.openCursor()
      const keys: string[] = []
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          keys.push(String((cursor.value as StoredPeak).key))
          cursor.continue()
          return
        }
        const overflow = keys.length - MAX_IDB_ENTRIES
        if (overflow > 0) {
          for (let i = 0; i < overflow; i++) store.delete(keys[i]!)
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export function getPlaybackWaveformCache(resolvedUrl: string): PeakData | null {
  return cache.get(cacheKey(resolvedUrl)) ?? null
}

/** Memory first, then IndexedDB (hydrates memory for subsequent sync hits). */
export async function loadPlaybackWaveformCache(resolvedUrl: string): Promise<PeakData | null> {
  const key = cacheKey(resolvedUrl)
  const mem = cache.get(key)
  if (mem?.data?.length) return mem
  const stored = await idbGet(key)
  if (stored?.data?.length) {
    setPlaybackWaveformCacheMemory(key, stored)
    return stored
  }
  return null
}

function setPlaybackWaveformCacheMemory(key: string, data: PeakData): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, data)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function setPlaybackWaveformCache(resolvedUrl: string, data: PeakData): void {
  const key = cacheKey(resolvedUrl)
  setPlaybackWaveformCacheMemory(key, data)
  void idbPut(key, data)
}

export function clearPlaybackWaveformCache(resolvedUrl?: string): void {
  if (!resolvedUrl) {
    cache.clear()
    void idbDelete()
    return
  }
  const key = cacheKey(resolvedUrl)
  cache.delete(key)
  void idbDelete(key)
}
