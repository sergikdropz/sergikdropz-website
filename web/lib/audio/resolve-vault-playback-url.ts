import {
  extractVaultRelativePath,
  normalizeVaultAudioUrl,
} from '@/utils/normalizeVaultAudioUrl'
import {
  getPublicMediaCdnBase,
  getR2MediaConfig,
  presignR2ObjectUrl,
  publicR2MediaUrl,
} from '@/lib/audio/r2Media'

export type VaultPlaybackResolution = {
  url: string
  source: 'cdn' | 'presigned' | 'proxy' | 'normalized'
  expiresIn?: number
}

/**
 * Prefer CDN → R2 presigned URL → same-origin proxy path.
 * Used by /api/audio/resolve so playback bytes skip Vercel when possible.
 */
export async function resolveVaultPlaybackUrl(
  filePath: string,
): Promise<VaultPlaybackResolution | null> {
  const rel = extractVaultRelativePath(filePath)
  if (!rel) return null

  const cdnUrl = publicR2MediaUrl(rel)
  if (cdnUrl) {
    return { url: cdnUrl, source: 'cdn' }
  }

  if (getR2MediaConfig()) {
    const signed = await presignR2ObjectUrl(rel)
    if (signed) {
      return { url: signed, source: 'presigned', expiresIn: 3600 }
    }
  }

  const normalized = normalizeVaultAudioUrl(filePath)
  if (normalized.startsWith('/api/audio/media/')) {
    return { url: normalized, source: 'proxy' }
  }

  return normalized ? { url: normalized, source: 'normalized' } : null
}
