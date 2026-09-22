/** Music Vault browse catalog: Crates, EPs, Singles, Remix. Playlists excluded. */
export const STUDIO_VAULT_LIBRARY_FOLDER_TYPES = ['album', 'ep', 'single', 'remix'] as const

/** Whole-folder import into Release Studio — crates stay in the vault. */
export const STUDIO_VAULT_IMPORT_FOLDER_TYPES = ['ep', 'single', 'remix'] as const

export type StudioVaultLibraryFolderType = (typeof STUDIO_VAULT_LIBRARY_FOLDER_TYPES)[number]
export type StudioVaultImportFolderType = (typeof STUDIO_VAULT_IMPORT_FOLDER_TYPES)[number]

export function isStudioVaultLibraryFolderType(
  type: string | null | undefined,
): type is StudioVaultLibraryFolderType {
  const t = String(type || '').toLowerCase()
  return (STUDIO_VAULT_LIBRARY_FOLDER_TYPES as readonly string[]).includes(t)
}

export function isStudioVaultImportFolderType(
  type: string | null | undefined,
): type is StudioVaultImportFolderType {
  const t = String(type || '').toLowerCase()
  return (STUDIO_VAULT_IMPORT_FOLDER_TYPES as readonly string[]).includes(t)
}

export function isStudioVaultEpFolderType(type: string | null | undefined): boolean {
  const t = String(type || '').toLowerCase()
  return t === 'ep' || t === 'remix'
}

/** EPs are `ep`/`remix` folders. Every other catalog track is a single. */
export function studioVaultCatalogKind(
  type: string | null | undefined,
): 'ep' | 'single' {
  return isStudioVaultEpFolderType(type) ? 'ep' : 'single'
}

export function studioVaultCatalogLabel(type: string | null | undefined): string {
  return studioVaultCatalogKind(type) === 'single' ? 'Single' : 'EP'
}

export type DistVaultLink = {
  vaultId: string
  releaseId: string | null
  releaseTitle?: string | null
}

export type VaultPickerAvailability = 'available' | 'on_this_release' | 'on_other_release'

export function vaultTrackAvailability(
  vaultId: string,
  currentReleaseId: string,
  links: DistVaultLink[],
): VaultPickerAvailability {
  let onOther = false
  for (const link of links) {
    if (link.vaultId !== vaultId) continue
    if (link.releaseId === currentReleaseId) return 'on_this_release'
    if (link.releaseId) onOther = true
  }
  return onOther ? 'on_other_release' : 'available'
}

export function vaultLinkForTrack(
  vaultId: string,
  links: DistVaultLink[],
): DistVaultLink | null {
  for (const link of links) {
    if (link.vaultId === vaultId && link.releaseId) return link
  }
  return null
}

export function indexVaultLinks(
  rows: Array<{
    music_library_track_id?: string | null
    release_id?: string | null
    release_title?: string | null
  }>,
): DistVaultLink[] {
  const out: DistVaultLink[] = []
  for (const row of rows) {
    const vaultId = String(row.music_library_track_id || '').trim()
    if (!vaultId) continue
    out.push({
      vaultId,
      releaseId: row.release_id ? String(row.release_id) : null,
      releaseTitle: row.release_title ? String(row.release_title) : null,
    })
  }
  return out
}
