import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeVaultDistributionMetadata } from '@/lib/studio/vault-import'
import { bumpMusicLibraryPublishVersion } from '@/lib/music-library-publish'

export type VaultWritebackResult = {
  updated: number
  skipped: number
  errors: string[]
}

export type PushDistributionToVaultOpts = {
  releaseId: string
  /** Set vault `date` / `year` from the release (go-live). ISRC-only writes leave dates alone unless missing. */
  writeDates?: boolean
  bumpCatalog?: boolean
  /** Limit to these distribution_tracks.id values. */
  trackIds?: string[]
}

/**
 * Stamp ISRC / UPC / release id onto linked vault tracks (`metadata.distribution`).
 * Never throws — callers should log `errors`.
 */
export async function pushDistributionToVault(
  supabase: SupabaseClient,
  opts: PushDistributionToVaultOpts,
): Promise<VaultWritebackResult> {
  const result: VaultWritebackResult = { updated: 0, skipped: 0, errors: [] }

  try {
    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('id, title, upc, release_date, distributor_status')
      .eq('id', opts.releaseId)
      .single()

    if (releaseError || !release) {
      result.errors.push(releaseError?.message || 'Release not found')
      return result
    }

    let query = supabase
      .from('distribution_tracks')
      .select('id, music_library_track_id, isrc_full')
      .eq('release_id', opts.releaseId)

    if (opts.trackIds?.length) {
      query = query.in('id', opts.trackIds)
    }

    const { data: distTracks, error: tracksError } = await query
    if (tracksError) {
      result.errors.push(tracksError.message)
      return result
    }

    const linked = (distTracks || []).filter((t) => t.music_library_track_id)
    if (!linked.length) {
      result.skipped = (distTracks || []).length
      return result
    }

    const releaseDate = String(release.release_date || '').slice(0, 10) || null
    const year = releaseDate && /^\d{4}/.test(releaseDate) ? Number(releaseDate.slice(0, 4)) : null
    const folderIds = new Set<string>()

    for (const track of linked) {
      const vaultId = track.music_library_track_id as string
      const { data: vault, error: vaultError } = await supabase
        .from('music_library_tracks')
        .select('id, date, year, folder_id, metadata')
        .eq('id', vaultId)
        .maybeSingle()

      if (vaultError || !vault) {
        result.errors.push(vaultError?.message || `Vault track ${vaultId} not found`)
        result.skipped += 1
        continue
      }

      const stamp = {
        releaseId: String(release.id),
        releaseTitle: String(release.title || ''),
        status: String(release.distributor_status || 'draft'),
        isrc: (track.isrc_full as string | null) || null,
        upc: (release.upc as string | null) || null,
        releaseDate: opts.writeDates || !vault.date ? releaseDate : null,
      }

      const updates: Record<string, unknown> = {
        metadata: mergeVaultDistributionMetadata(vault.metadata, stamp),
      }

      if (opts.writeDates && releaseDate) {
        updates.date = releaseDate
        if ((!vault.year || vault.year < 1900) && year && year > 1900) {
          updates.year = year
        }
      } else if (!vault.date && releaseDate) {
        updates.date = releaseDate
      }

      const { error: updateError } = await supabase
        .from('music_library_tracks')
        .update(updates)
        .eq('id', vault.id)

      if (updateError) {
        result.errors.push(updateError.message)
        continue
      }

      result.updated += 1
      if (vault.folder_id) folderIds.add(String(vault.folder_id))
    }

    if (opts.writeDates && year && year > 1900) {
      for (const folderId of folderIds) {
        const { data: folder } = await supabase
          .from('music_library_folders')
          .select('id, year')
          .eq('id', folderId)
          .maybeSingle()
        if (folder && !folder.year) {
          const { error: folderError } = await supabase
            .from('music_library_folders')
            .update({ year })
            .eq('id', folderId)
          if (folderError) result.errors.push(folderError.message)
        }
      }
    }

    if (opts.bumpCatalog && result.updated > 0) {
      try {
        await bumpMusicLibraryPublishVersion()
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : 'Failed to bump catalog version')
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Vault write-back failed')
  }

  return result
}
