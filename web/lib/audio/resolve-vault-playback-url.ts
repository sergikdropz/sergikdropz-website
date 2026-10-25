import { resolveVaultObjectPath } from '@/lib/audio/vault-object-resolver'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'
import { isProductionMediaHost, playbackPresignSeconds } from '@/lib/audio/playback-grant'
import {
  getR2MediaConfig,
  presignR2ObjectUrl,
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
 * Private R2: signed URL, short for vault and longer for tracks we sell.
 * Production does not fall back to the Vercel proxy, local disk, or a tunnel.
 * Dev still returns the proxy when R2 has no object, so localhost playback works.
 */
export async function resolveVaultPlaybackUrl(
  filePath: string,
): Promise<VaultPlaybackResolution | null> {
  const rel = extractVaultRelativePath(filePath)
  if (!rel) return null

  const resolvedRel = (await resolveVaultObjectPath(rel)) || null
  const production = isProductionMediaHost()
  const r2 = Boolean(getR2MediaConfig())

  if (!resolvedRel) {
    if (production && r2) return null
    const fallbackUrl = proxyUrlFor(rel)
    return { url: fallbackUrl, fallbackUrl, source: 'proxy' }
  }

  if (r2) {
    const expiresIn = playbackPresignSeconds(resolvedRel)
    const signed = await presignR2ObjectUrl(resolvedRel, expiresIn)
    if (signed) {
      const fallbackUrl = production ? signed : proxyUrlFor(resolvedRel)
      return { url: signed, fallbackUrl, source: 'presigned', expiresIn }
    }
    if (production) return null
  }

  const fallbackUrl = proxyUrlFor(resolvedRel)
  return { url: fallbackUrl, fallbackUrl, source: 'proxy' }
}
