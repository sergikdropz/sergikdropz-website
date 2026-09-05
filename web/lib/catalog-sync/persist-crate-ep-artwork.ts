import type { SupabaseClient } from '@supabase/supabase-js'
import { buildEpArtworkIndex, matchEpArtworkForTrack, type EpArtworkHit } from './match-ep-artwork'

export type CrateEpArtworkPersistResult = {
  tracksUpdated: number
  audioFilesUpdated: number
}

/**
 * Copy the matching EP cover onto crate tracks (same song / VIP / instrumental)
 * so crate lists show the release art.
 */
export async function persistEpArtworkOntoCrateTracks(
  supabase: SupabaseClient,
): Promise<CrateEpArtworkPersistResult> {
  const { data: folders, error: folderError } = await supabase
    .from('music_library_folders')
    .select('id, name, type, artwork_url')
  if (folderError) throw new Error(folderError.message || 'Failed to load folders')

  const eps = (folders || []).filter((folder) => folder.type === 'ep')
  const crates = (folders || []).filter((folder) => folder.type === 'album')
  if (!eps.length || !crates.length) return { tracksUpdated: 0, audioFilesUpdated: 0 }

  const { data: epTracks, error: epError } = await supabase
    .from('music_library_tracks')
    .select('title, audio_file_id, artwork_url, folder_id')
    .in('folder_id', eps.map((folder) => folder.id))
  if (epError) throw new Error(epError.message || 'Failed to load EP tracks')

  const tracksByEp = new Map<string, Array<{ title?: string; audioFileId?: string; artwork?: string }>>()
  for (const row of epTracks || []) {
    const folder = eps.find((ep) => ep.id === row.folder_id)
    const list = tracksByEp.get(row.folder_id) || []
    list.push({
      title: row.title,
      audioFileId: row.audio_file_id || undefined,
      artwork: row.artwork_url || folder?.artwork_url || undefined,
    })
    tracksByEp.set(row.folder_id, list)
  }

  const index = buildEpArtworkIndex(
    eps.map((ep) => ({
      id: ep.id,
      name: ep.name,
      artwork: ep.artwork_url,
      tracks: tracksByEp.get(ep.id) || [],
    })),
  )

  const { data: crateTracks, error: crateError } = await supabase
    .from('music_library_tracks')
    .select('id, title, audio_file_id, artwork_url, folder_id')
    .in('folder_id', crates.map((folder) => folder.id))
  if (crateError) throw new Error(crateError.message || 'Failed to load crate tracks')

  const updates = new Map<string, { hit: EpArtworkHit; audioFileId: string | null }>()
  for (const row of crateTracks || []) {
    const hit = matchEpArtworkForTrack(
      { title: row.title, audioFileId: row.audio_file_id, artwork: row.artwork_url },
      index,
    )
    if (!hit) continue
    if (row.artwork_url === hit.artwork) continue
    updates.set(row.id, { hit, audioFileId: row.audio_file_id || null })
  }

  let tracksUpdated = 0
  let audioFilesUpdated = 0
  for (const [id, { hit, audioFileId }] of updates) {
    const { error } = await supabase
      .from('music_library_tracks')
      .update({ artwork_url: hit.artwork })
      .eq('id', id)
    if (error) continue
    tracksUpdated += 1
    if (!audioFileId) continue
    const { error: audioError } = await supabase
      .from('audio_files')
      .update({ artwork_url: hit.artwork })
      .eq('id', audioFileId)
    if (!audioError) audioFilesUpdated += 1
  }

  return { tracksUpdated, audioFilesUpdated }
}
