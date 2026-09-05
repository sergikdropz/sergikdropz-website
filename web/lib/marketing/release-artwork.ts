import { isUploadedFolderArtwork } from '@/lib/catalog-sync/artwork'

/** Stable key so "SERGIK - Daze", "Daze EP", and collection folder ids match. */
export function releaseArtworkKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/collection-unreleased-eps-?/g, '')
    .replace(/sergik/g, '')
    .replace(/\b(ep|digital download)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function applyLibraryArtwork<T extends { title?: string; release_id?: string; artwork?: string }>(
  items: T[],
  liveByKey: Map<string, string>,
): T[] {
  if (!liveByKey.size) return items
  return items.map((item) => {
    const keys = [item.release_id, item.title].filter(Boolean).map((value) => releaseArtworkKey(String(value)))
    for (const key of keys) {
      const live = liveByKey.get(key)
      if (live && isUploadedFolderArtwork(live)) return { ...item, artwork: live }
    }
    return item
  })
}
