/**
 * Per-instance in-memory catalog snapshots keyed by publish version.
 * Vault JSON stays auth-gated (private); this warms serverless instances across
 * concurrent vault sessions until the next publish bump.
 */

export type CatalogSnapshotKind = 'bootstrap' | 'sync'

type SnapshotEntry = {
  version: number
  kind: CatalogSnapshotKind
  body: string
  etag: string
  builtAt: number
}

const snapshots = new Map<string, SnapshotEntry>()
const MAX_ENTRIES = 4

function cacheKey(kind: CatalogSnapshotKind, version: number, variant: string): string {
  return `${kind}:${version}:${variant}`
}

export function catalogSnapshotEtag(version: number, kind: CatalogSnapshotKind): string {
  return `"${kind}-v${version}"`
}

export function getCatalogSnapshot(
  kind: CatalogSnapshotKind,
  version: number,
  variant: string,
): SnapshotEntry | null {
  if (!version) return null
  return snapshots.get(cacheKey(kind, version, variant)) || null
}

export function setCatalogSnapshot(
  kind: CatalogSnapshotKind,
  version: number,
  variant: string,
  payload: unknown,
): SnapshotEntry {
  const body = JSON.stringify(payload)
  const etag = catalogSnapshotEtag(version, kind)
  const entry: SnapshotEntry = {
    version,
    kind,
    body,
    etag,
    builtAt: Date.now(),
  }
  snapshots.set(cacheKey(kind, version, variant), entry)
  // Evict oldest when over cap
  if (snapshots.size > MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [k, v] of snapshots) {
      if (v.builtAt < oldestAt) {
        oldestAt = v.builtAt
        oldestKey = k
      }
    }
    if (oldestKey) snapshots.delete(oldestKey)
  }
  return entry
}

export function invalidateCatalogSnapshots(version?: number): void {
  if (version == null) {
    snapshots.clear()
    return
  }
  for (const key of [...snapshots.keys()]) {
    if (key.includes(`:${version}:`)) snapshots.delete(key)
  }
}

export function matchCatalogEtag(requestEtag: string | null, etag: string): boolean {
  if (!requestEtag) return false
  const parts = requestEtag.split(',').map((p) => p.trim())
  return parts.includes(etag) || parts.includes(`W/${etag}`)
}
