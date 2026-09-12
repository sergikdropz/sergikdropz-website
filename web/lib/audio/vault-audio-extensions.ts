/** Common vault playback extensions, in probe order (cloud masters are usually mp3 or m4a). */
export const VAULT_PLAYBACK_EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac'] as const

export function vaultPathStem(relative: string): string | null {
  const match = relative.match(/^(.*)\.(mp3|m4a|wav|aac|ogg|oga|opus|flac|aiff?|webm)$/i)
  return match ? match[1] : null
}

export function currentVaultExtension(relative: string): string | null {
  const match = relative.match(/\.(mp3|m4a|wav|aac|ogg|oga|opus|flac|aiff?|webm)$/i)
  return match ? match[1].toLowerCase() : null
}

/** Same basename with sibling extensions — used when catalog points at .mp3 but R2 only has .m4a. */
export function alternateVaultRelativePaths(relative: string): string[] {
  const stem = vaultPathStem(relative)
  if (!stem) return []
  const current = currentVaultExtension(relative)
  return VAULT_PLAYBACK_EXTENSIONS.filter((ext) => ext !== current).map((ext) => `${stem}.${ext}`)
}

/** All playback extension variants for one vault asset (requested path first). */
export function vaultRelativePathCandidates(relative: string): string[] {
  const stem = vaultPathStem(relative)
  if (!stem) return [relative]
  const current = currentVaultExtension(relative)
  const ordered = current
    ? [relative, ...VAULT_PLAYBACK_EXTENSIONS.filter((ext) => ext !== current).map((ext) => `${stem}.${ext}`)]
    : VAULT_PLAYBACK_EXTENSIONS.map((ext) => `${stem}.${ext}`)
  return [...new Set(ordered)]
}

/** Same song on disk even when catalog says .mp3 and the element plays .m4a. */
export function vaultAssetPathsMatch(a: string, b: string): boolean {
  const stemA = vaultPathStem(a.replace(/^\/+/, '').split('?')[0])
  const stemB = vaultPathStem(b.replace(/^\/+/, '').split('?')[0])
  if (!stemA || !stemB) return false
  return stemA === stemB
}
