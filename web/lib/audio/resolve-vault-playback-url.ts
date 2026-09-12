import { resolveVaultObjectPath } from '@/lib/audio/vault-object-resolver'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'
import { isR2BrowserPlayEnabled } from '@/lib/audio/edge-playback-url'
import {
  getR2MediaConfig,
  presignR2ObjectUrl,
  publicR2MediaUrl,
} from '@/lib/audio/r2Media'

export type VaultPlaybackResolution = {
  url: string
  fallbackUrl: string
  source: 'cdn' | 'presigned' | 'proxy' | 'normalized'
  expiresIn?: number
}

function proxyUrlFor(rel: string): string {
  return `/api/audio/media/${rel.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Prefer CDN → (gated) R2 presigned URL → same-origin proxy.
 * `fallbackUrl` is always the proxy so the player can recover if CORS fails.
 */
export async function resolveVaultPlaybackUrl(
  filePath: string,
): Promise<VaultPlaybackResolution | null> {
  const rel = extractVaultRelativePath(filePath)
  if (!rel) return null

  // Catalog rows say .mp3 for assets stored as .wav/.m4a — point at the real object.
  const resolvedRel = (await resolveVaultObjectPath(rel)) || rel
  const fallbackUrl = proxyUrlFor(resolvedRel)

  const cdnUrl = publicR2MediaUrl(rel)
  if (cdnUrl) {
    return { url: cdnUrl, fallbackUrl, source: 'cdn' }
  }

  if (isR2BrowserPlayEnabled() && getR2MediaConfig()) {
    const signed = await presignR2ObjectUrl(rel)
    if (signed) {
      return { url: signed, fallbackUrl, source: 'presigned', expiresIn: 3600 }
    }
  }

  return { url: fallbackUrl, fallbackUrl, source: 'proxy' }
}
