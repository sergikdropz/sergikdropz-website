#!/usr/bin/env node
/**
 * Remove DistroKid — * release folders from the Music Library sidebar.
 * Tracks stay in the Distrokid Exports playlist; folders are archived (not hard-deleted).
 *
 * Usage: cd web && npx tsx scripts/archive-distrokid-sidebar-folders.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { MUSIC_LIBRARY_PUBLISH_VERSION_KEY } from '../lib/site-settings-keys'
import { playlistIdForFolder } from '../lib/catalog-sync/ids'

config({ path: '.env.local' })

const DISTROKID_EXPORTS_PLAYLIST = 'playlist-1789691284218'
const DISTROKID_EXPORTS_FOLDER = '1789691284218'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: folders, error } = await supabase
    .from('music_library_folders')
    .select('id, name, type, is_archived')
    .or('id.like.folder-distrokid-%,name.ilike.DistroKid —%')

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const targets = (folders || []).filter(
    (f) =>
      String(f.id).startsWith('folder-distrokid-') ||
      /^DistroKid\s*[—–-]/.test(String(f.name || '')),
  )

  if (!targets.length) {
    console.log('No DistroKid sidebar folders found.')
    return
  }

  console.log(`Archiving ${targets.length} DistroKid folder(s)…`)
  const now = new Date().toISOString()
  const folderIds = targets.map((f) => f.id)

  // Keep vault tracks reachable under Distrokid Exports folder when possible.
  const { data: playlist } = await supabase
    .from('music_library_playlists')
    .select('id, track_ids')
    .eq('id', DISTROKID_EXPORTS_PLAYLIST)
    .maybeSingle()
  const exportTrackIds = new Set<string>(
    Array.isArray(playlist?.track_ids) ? playlist!.track_ids.map(String) : [],
  )

  const { error: trackMoveErr } = await supabase
    .from('music_library_tracks')
    .update({ folder_id: DISTROKID_EXPORTS_FOLDER })
    .in('folder_id', folderIds)

  if (trackMoveErr) {
    console.warn('Track folder reassign warning:', trackMoveErr.message)
  } else {
    console.log(`Moved tracks from DistroKid folders → Distrokid Exports folder`)
  }

  // Ensure Distrokid Exports playlist still lists every moved track.
  const { data: moved } = await supabase
    .from('music_library_tracks')
    .select('id')
    .eq('folder_id', DISTROKID_EXPORTS_FOLDER)
    .or('is_archived.is.null,is_archived.eq.false')

  for (const row of moved || []) {
    exportTrackIds.add(String(row.id))
  }
  if (playlist?.id) {
    await supabase
      .from('music_library_playlists')
      .update({
        track_ids: [...exportTrackIds],
        updated_at: now,
      })
      .eq('id', playlist.id)
  }

  const { error: archiveErr } = await supabase
    .from('music_library_folders')
    .update({
      is_archived: true,
      archived_at: now,
      hidden: true,
    })
    .in('id', folderIds)

  if (archiveErr) {
    console.error(archiveErr.message)
    process.exit(1)
  }

  // Archive companion playlists for those folders (if any).
  const companionIds = folderIds.map((id) => playlistIdForFolder(id))
  await supabase
    .from('music_library_playlists')
    .update({ is_archived: true, archived_at: now })
    .in('id', companionIds)

  for (const f of targets) {
    console.log(`archived  ${f.name} (${f.id})`)
  }

  const version = Date.now()
  await supabase.from('settings').upsert(
    { key: MUSIC_LIBRARY_PUBLISH_VERSION_KEY, value: { version } },
    { onConflict: 'key' },
  )
  console.log(`\nDone. Publish version → ${version}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
