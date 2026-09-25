import { statSync } from 'fs'
import { join } from 'path'
import { stripArtworkCacheBust } from '@/lib/catalog-sync/artwork'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import {
  preferLocalArtworkMasters,
  rewriteShareArtworkForLiveDisplay,
} from '@/lib/shares/share-artwork-display'

/**
 * Share listen/embed API artwork resolution (server).
 * See {@link rewriteShareArtworkForLiveDisplay} for live vs local rules.
 */
export function resolveShareArtworkUrl(artwork?: string | null): string | undefined {
  const raw = String(artwork || '').trim()
  if (!raw) return undefined

  if (!preferLocalArtworkMasters()) {
    return rewriteShareArtworkForLiveDisplay(raw)
  }

  const resolved = resolveImageUrl(raw)
  const pathOnly = stripArtworkCacheBust(resolved)
  if (!pathOnly.startsWith('/images/audio/artwork/')) {
    return resolved
  }

  try {
    const abs = join(process.cwd(), 'public', pathOnly.replace(/^\//, ''))
    const mtimeSec = Math.floor(statSync(abs).mtimeMs / 1000)
    const existing = raw.match(/[?&]v=(\d+)/)?.[1]
    const existingNum = existing ? Number(existing) : 0
    if (mtimeSec > existingNum) {
      return `${pathOnly}?v=${mtimeSec}`
    }
  } catch {
    /* missing file — keep resolved path */
  }

  return resolved
}
